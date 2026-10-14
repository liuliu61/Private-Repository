import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  AccountStatus,
  PortalUserStatus,
  Prisma,
  PromotionAccountOwnerType,
  PromotionTransactionBusinessType,
  RechargeRequestStatus,
  CustomerWalletTransactionType,
  RefundRequestStatus,
  AgentWalletTransactionType,
  OperationLogType,
  InvoiceTaskStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';

export interface PortalPayload {
  sub: string;
  username: string;
  portal: 'C' | 'B';
  customerId?: string;
  agentUserId?: string;
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: '待处理',
  REVIEWING: '审核中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  COMPLETED: '已完成',
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: '待处理',
  CONFIRMED: '充值成功',
  REJECTED: '已驳回',
};

const AgentWalletTransactionTypeLabel: Record<string, string> = {
  CHARGE_CONFIRM: '充值确认扣款', AGENT_PAYOUT: '代理商打款', REFUND_BACK: '退款冲减',
};
const REFUND_STATUS_LABEL: Record<string, string> = {
  PENDING: '待处理',
  CONFIRMED: '退款成功',
  REJECTED: '已驳回',
};

const OPERATION_LOG_LABEL: Record<string, string> = {
  LOGIN: '登录',
  LOGOUT: '退出登录',
  CONFIRM_RECHARGE: '确认充值',
  REJECT_RECHARGE: '驳回充值',
  APPROVE_REFUND: '通过退款',
  REJECT_REFUND: '驳回退款',
  AGENT_PAYOUT: '代理商打款',
  OTHER: '其他',
};

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  // ==================== 登录 ====================

  async customerLogin(username: string, password: string) {
    const cu = await this.prisma.customerUser.findUnique({
      where: { username },
      include: { customer: { select: { id: true, name: true, fullName: true } } },
    });
    if (!cu || cu.status !== PortalUserStatus.ACTIVE || !(await bcrypt.compare(password, cu.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const accessToken = await this.jwt.signAsync({
      sub: `cust:${cu.id}`,
      username,
      portal: 'C',
      customerId: cu.customerId,
    });
    await this.logOperation(username, OperationLogType.LOGIN, '客户门户', null, `客户登录：${cu.displayName || cu.customer?.name || username}`);
    return {
      accessToken,
      user: {
        id: cu.id,
        username,
        displayName: cu.displayName || cu.customer?.name,
        customerId: cu.customerId,
        customerName: cu.customer?.name || cu.customer?.fullName,
      },
    };
  }

  async agentLogin(username: string, password: string) {
    const au = await this.prisma.agentUser.findUnique({ where: { username } });
    if (!au || au.status !== PortalUserStatus.ACTIVE || !(await bcrypt.compare(password, au.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const accessToken = await this.jwt.signAsync({
      sub: `agent:${au.id}`,
      username,
      portal: 'B',
      agentUserId: au.id,
    });
    await this.logOperation(username, OperationLogType.LOGIN, '代理商门户', null, `代理商登录：${au.displayName || username}`);
    return { accessToken, user: { id: au.id, username, displayName: au.displayName, phone: au.phone } };
  }

  // ==================== 通用工具 ====================

  private assertPortal(payload: PortalPayload, portal: 'C' | 'B') {
    if (payload.portal !== portal) throw new ForbiddenException('无权访问该门户接口');
  }

  private generateNo(prefix: string) {
    return `${prefix}${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  }

  /** 系统操作人：优先超级管理员账号（门户代操作时作为流水 operator） */
  private async getSystemOperatorId(): Promise<string> {
    const op = await this.prisma.user.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!op) throw new BadRequestException('系统暂无操作账号，无法执行充值');
    return op.id;
  }

  private async assertAgentCustomer(agentUserId: string, customerId: string) {
    const binding = await this.prisma.agentCustomer.findUnique({
      where: { agentUserId_customerId: { agentUserId, customerId } },
    });
    if (!binding) throw new ForbiddenException('该客户不在你名下，无权操作');
  }

  // ==================== C 端：客户 ====================

  async cMe(payload: PortalPayload) {
    const customerId = payload.customerId!;
    const cu = await this.prisma.customerUser.findUnique({
      where: { id: payload.sub.replace('cust:', '') },
      include: {
        customer: { include: { wallets: { where: { status: AccountStatus.ACTIVE } } } },
      },
    });
    if (!cu) throw new NotFoundException('客户账号不存在');
    const customer = cu.customer;
    const wallets = (customer?.wallets || []).map((w: any) => this.walletView(w));
    const totalCash = wallets.reduce((s: number, w: any) => s + Number(w.cashBalance), 0);
    return {
      id: cu.id,
      username: cu.username,
      displayName: cu.displayName || customer?.name,
      customerId,
      customerName: customer?.name || customer?.fullName,
      walletSummary: { walletCount: wallets.length, totalCash: totalCash.toFixed(2) },
      wallets,
    };
  }

  async cWallets(payload: PortalPayload) {
    const wallets = await this.prisma.customerWallet.findMany({
      where: { customerId: payload.customerId, status: AccountStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    return wallets.map((w) => this.walletView(w));
  }

  async cWalletTransactions(payload: PortalPayload, walletId: string, query: { page?: number; pageSize?: number }) {
    await this.assertCustomerWallet(payload.customerId!, walletId);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const [total, items] = await Promise.all([
      this.prisma.customerWalletTransaction.count({ where: { walletId } }),
      this.prisma.customerWalletTransaction.findMany({
        where: { walletId },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((t) => ({
        id: t.id,
        transactionNo: t.transactionNo,
        businessType: t.businessType,
        businessTypeLabel: this.walletTxLabel(t.businessType),
        businessNo: t.businessNo,
        changeAmount: moneyToString(t.changeAmount),
        balanceAfter: moneyToString(t.balanceAfter),
        fundType: t.fundType || 'PRIVATE',
        fundTypeLabel: t.fundType === 'PUBLIC' ? '对公' : '对私',
        occurredAt: t.occurredAt,
        remark: t.remark,
      })),
    };
  }

  async cPromotionAccounts(payload: PortalPayload) {
    const rows = await this.prisma.promotionAccount.findMany({
      where: { customerId: payload.customerId, ownerType: PromotionAccountOwnerType.CUSTOMER },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      accountName: r.accountName,
      platform: r.platform,
      platformAccountId: r.platformAccountId,
      channelName: r.channelName,
      accountCategory: r.accountCategory,
      currentBalance: moneyToString(r.currentBalance),
      customerRebatePublic: r.customerRebatePublic ? r.customerRebatePublic.toString() : null,
      customerRebatePrivate: r.customerRebatePrivate ? r.customerRebatePrivate.toString() : null,
      status: r.status,
    }));
  }

  async cPromotionAccountTransactions(payload: PortalPayload, accountId: string, query: { page?: number; pageSize?: number }) {
    const account = await this.prisma.promotionAccount.findUnique({ where: { id: accountId } });
    if (!account || account.customerId !== payload.customerId) throw new NotFoundException('推广账户不存在');
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const [total, items] = await Promise.all([
      this.prisma.promotionTransaction.count({ where: { promotionAccountId: accountId } }),
      this.prisma.promotionTransaction.findMany({
        where: { promotionAccountId: accountId },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((t) => ({
        id: t.id,
        transactionNo: t.transactionNo,
        businessType: t.businessType,
        changeAmount: moneyToString(t.changeAmount),
        balanceAfter: moneyToString(t.balanceAfter),
        customerRebate: t.customerRebate ? moneyToString(t.customerRebate) : null,
        costRebate: t.costRebate ? moneyToString(t.costRebate) : null,
        remitAmount: t.remitAmount ? moneyToString(t.remitAmount) : null,
        occurredAt: t.occurredAt,
        remark: t.remark,
      })),
    };
  }

  async cCreateRechargeRequest(payload: PortalPayload, dto: { promotionAccountId: string; amount: string; fundType?: string; remark?: string }) {
    const customerId = payload.customerId!;
    const amount = toMoney(dto.amount, '充值金额');
    if (amount.lte(0)) throw new BadRequestException('充值金额必须大于 0');
    const fundType = dto.fundType === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
    const account = await this.prisma.promotionAccount.findUnique({ where: { id: dto.promotionAccountId } });
    if (!account || account.customerId !== customerId) throw new BadRequestException('推广账户不存在或不属于当前客户');
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能发起充值');
    const cu = await this.prisma.customerUser.findUnique({ where: { customerId } });
    if (!cu) throw new BadRequestException('客户账号异常');
    // 提交前校验钱包余额：预计扣款 = 到账金额 ÷ (1 + 客户返点%)
    const wallet = await this.prisma.customerWallet.findFirst({
      where: { customerId, status: AccountStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    if (!wallet) throw new BadRequestException('客户未开通钱包，无法充值');
    const rebateRate = fundType === 'PUBLIC'
      ? (account.customerRebatePublic ?? new Prisma.Decimal(0))
      : (account.customerRebatePrivate ?? new Prisma.Decimal(0));
    const deduction = amount.div(new Prisma.Decimal(1).plus(rebateRate.div(100)));
    const fundBalance = fundType === 'PUBLIC'
      ? new Prisma.Decimal(wallet.cashBalancePublic ?? 0)
      : new Prisma.Decimal(wallet.cashBalancePrivate ?? 0);
    if (fundBalance.lt(deduction)) {
      throw new BadRequestException(`钱包${fundType === 'PUBLIC' ? '对公' : '对私'}余额不足（预计扣款 ¥${moneyToString(deduction)}，当前余额 ¥${moneyToString(fundBalance)}），请联系销售充值钱包后再提交充值单`);
    }
    const row = await this.prisma.rechargeRequest.create({
      data: {
        requestNo: this.generateNo('RQ'),
        customerId,
        customerUserId: cu.id,
        promotionAccountId: account.id,
        amount,
        fundType,
        remark: dto.remark || null,
        status: RechargeRequestStatus.PENDING,
      },
    });
    return this.rechargeRequestView(row);
  }

  async cListRechargeRequests(payload: PortalPayload, query: { status?: string; page?: number; pageSize?: number }) {
    const customerId = payload.customerId!;
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const where: Prisma.RechargeRequestWhereInput = { customerId };
    if (query.status && Object.values(RechargeRequestStatus).includes(query.status as RechargeRequestStatus)) {
      where.status = query.status as RechargeRequestStatus;
    }
    const [total, items] = await Promise.all([
      this.prisma.rechargeRequest.count({ where }),
      this.prisma.rechargeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { promotionAccount: { select: { accountName: true } }, port: { select: { name: true } } },
      }),
    ]);
    return { total, page, pageSize, items: items.map((r) => this.rechargeRequestView(r)) };
  }

  async adminUpdateRechargeRequest(id: string, dto: any) {
    const req = await this.prisma.rechargeRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('充值申请不存在');
    const data: any = {};
    if (dto.promotionAccountId !== undefined) {
      const acc = await this.prisma.promotionAccount.findUnique({ where: { id: dto.promotionAccountId } });
      if (!acc) throw new BadRequestException('推广账户不存在');
      data.promotionAccountId = dto.promotionAccountId;
    }
    if (dto.portId !== undefined) {
      if (dto.portId) {
        const ch = await this.prisma.channel.findUnique({ where: { id: dto.portId } });
        if (!ch) throw new BadRequestException('端口不存在');
        data.portId = dto.portId;
      } else data.portId = null;
    }
    if (dto.amount !== undefined) {
      const amount = toMoney(dto.amount, '金额');
      if (amount.lt(0)) throw new BadRequestException('金额不能为负数');
      data.amount = amount;
    }
    if (dto.fundType !== undefined) {
      if (!['PUBLIC', 'PRIVATE'].includes(dto.fundType)) throw new BadRequestException('资金类型不正确');
      data.fundType = dto.fundType;
    }
    if (dto.status !== undefined) {
      if (!Object.values(RechargeRequestStatus).includes(dto.status)) throw new BadRequestException('状态不正确');
      data.status = dto.status;
      if (dto.status === 'CONFIRMED') data.confirmedAt = new Date();
    }
    if (dto.remark !== undefined) data.remark = dto.remark;
    if (dto.rejectReason !== undefined) data.rejectReason = dto.rejectReason;
    if (dto.customerRebate !== undefined) data.customerRebate = dto.customerRebate === null || dto.customerRebate === '' ? null : new Prisma.Decimal(Number(dto.customerRebate));
    if (dto.costRebate !== undefined) data.costRebate = dto.costRebate === null || dto.costRebate === '' ? null : new Prisma.Decimal(Number(dto.costRebate));
    const row = await this.prisma.rechargeRequest.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true } },
        customerUser: { select: { displayName: true, username: true } },
        promotionAccount: { select: { id: true, accountName: true, customerRebatePublic: true, customerRebatePrivate: true } },
        port: { select: { name: true } },
        agentUser: { select: { displayName: true } },
      },
    });
    return this.rechargeRequestView(row);
  }

  async adminListRechargeRequests(query: any) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const where: Prisma.RechargeRequestWhereInput = {};
    if (query.status && Object.values(RechargeRequestStatus).includes(query.status as RechargeRequestStatus)) {
      where.status = query.status as RechargeRequestStatus;
    }
    if (query.customerId) where.customerId = query.customerId;
    if (query.fundType && ['PUBLIC', 'PRIVATE'].includes(query.fundType)) where.fundType = query.fundType as any;
    if (query.requestNo) where.requestNo = { contains: query.requestNo };
    if (query.portId) where.portId = query.portId;
    if (query.promotionAccountId) where.promotionAccountId = query.promotionAccountId;
    if (query.customerName) where.customer = { name: { contains: query.customerName } };
    if (query.accountName) where.promotionAccount = { accountName: { contains: query.accountName } };
    if (query.startDate) {
      const sd = new Date(String(query.startDate));
      if (!isNaN(sd.getTime())) {
        where.createdAt = { ...(where.createdAt as object), gte: sd };
      }
    }
    if (query.endDate) {
      const ed = new Date(String(query.endDate));
      if (!isNaN(ed.getTime())) {
        const end = new Date(ed.getTime() + 24 * 3600 * 1000 - 1);
        where.createdAt = { ...(where.createdAt as object), lte: end };
      }
    }
    const [total, items] = await Promise.all([
      this.prisma.rechargeRequest.count({ where }),
      this.prisma.rechargeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          customerUser: { select: { displayName: true, username: true } },
          promotionAccount: { select: { id: true, accountName: true, customerRebatePublic: true, customerRebatePrivate: true } },
          port: { select: { name: true } },
          agentUser: { select: { displayName: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items: items.map((r) => this.rechargeRequestView(r)) };
  }

  async cInvoices(payload: PortalPayload, query: { page?: number; pageSize?: number }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const [total, items] = await Promise.all([
      this.prisma.invoiceTask.count({ where: { customerId: payload.customerId } }),
      this.prisma.invoiceTask.findMany({
        where: { customerId: payload.customerId },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        titleName: t.titleName,
        taxpayerCode: t.taxpayerCode,
        publicAmount: moneyToString(t.publicAmount),
        invoiceAmount: moneyToString(t.invoiceAmount),
        status: t.status,
        statusLabel: INVOICE_STATUS_LABEL[t.status] || t.status,
        submittedAt: t.submittedAt,
        remark: t.remark,
      })),
    };
  }

  async bChannels() {
    const rows = await this.prisma.channel.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      defaultCostRebatePublic: moneyToString(r.defaultCostRebatePublic),
      defaultCostRebatePrivate: moneyToString(r.defaultCostRebatePrivate),
    }));
  }

  // ==================== B 端：一级代理 ====================

  async bMe(payload: PortalPayload) {
    const agentUserId = payload.agentUserId!;
    const au = await this.prisma.agentUser.findUnique({
      where: { id: agentUserId },
      include: { customerBindings: { include: { customer: { select: { id: true, name: true, fullName: true, contact: true, phone: true } } } } },
    });
    if (!au) throw new NotFoundException('代理账号不存在');
    const customers = au.customerBindings.map((b: any) => b.customer);
    const pendingCount = await this.prisma.rechargeRequest.count({
      where: { status: RechargeRequestStatus.PENDING, customerId: { in: customers.map((c: any) => c.id) } },
    });
    return {
      id: au.id,
      username: au.username,
      displayName: au.displayName,
      phone: au.phone,
      customerCount: customers.length,
      pendingRechargeCount: pendingCount,
    };
  }

  async bCustomers(payload: PortalPayload, query: { keyword?: string; page?: number; pageSize?: number }) {
    const agentUserId = payload.agentUserId!;
    const bindings = await this.prisma.agentCustomer.findMany({
      where: { agentUserId },
      include: { customer: { include: { wallets: { where: { status: AccountStatus.ACTIVE } } } } },
    });
    let customers = bindings.map((b: any) => b.customer);
    if (query.keyword) {
      const kw = query.keyword.trim();
      customers = customers.filter(
        (c: any) => c.name.includes(kw) || (c.fullName || '').includes(kw) || (c.contact || '').includes(kw) || (c.phone || '').includes(kw),
      );
    }
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const total = customers.length;
    const items = customers.slice((page - 1) * pageSize, page * pageSize).map((c: any) => ({
      id: c.id,
      customerCode: c.customerCode,
      name: c.name,
      fullName: c.fullName,
      contact: c.contact,
      phone: c.phone,
      status: c.status,
      walletCount: (c.wallets || []).length,
      cashBalance: (c.wallets || []).reduce((s: number, w: any) => s + Number(w.cashBalance), 0).toFixed(2),
    }));
    return { total, page, pageSize, items };
  }

  async bCustomerDetail(payload: PortalPayload, customerId: string) {
    await this.assertAgentCustomer(payload.agentUserId!, customerId);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        wallets: { where: { status: AccountStatus.ACTIVE }, orderBy: { createdAt: 'asc' } },
        promotionAccounts: {
          where: { ownerType: PromotionAccountOwnerType.CUSTOMER },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    return {
      id: customer.id,
      customerCode: customer.customerCode,
      name: customer.name,
      fullName: customer.fullName,
      contact: customer.contact,
      phone: customer.phone,
      status: customer.status,
      wallets: (customer.wallets || []).map((w: any) => this.walletView(w)),
      promotionAccounts: (customer.promotionAccounts || []).map((a: any) => ({
        id: a.id,
        accountName: a.accountName,
        platform: a.platform,
        channelName: a.channelName,
        currentBalance: moneyToString(a.currentBalance),
        status: a.status,
      })),
    };
  }

  async bListRechargeRequests(payload: PortalPayload, query: { status?: string; page?: number; pageSize?: number }) {
    const agentUserId = payload.agentUserId!;
    const bindings = await this.prisma.agentCustomer.findMany({ where: { agentUserId }, select: { customerId: true } });
    if (bindings.length === 0) return { total: 0, page: 1, pageSize: 15, items: [] };
    const customerIds = bindings.map((b: any) => b.customerId);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const where: Prisma.RechargeRequestWhereInput = { customerId: { in: customerIds } };
    if (query.status && Object.values(RechargeRequestStatus).includes(query.status as RechargeRequestStatus)) {
      where.status = query.status as RechargeRequestStatus;
    }
    const [total, items] = await Promise.all([
      this.prisma.rechargeRequest.count({ where }),
      this.prisma.rechargeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          customerUser: { select: { displayName: true, username: true } },
          promotionAccount: { select: { id: true, accountName: true, channelName: true, platformAccountId: true, customerRebatePublic: true, customerRebatePrivate: true } },
          port: { select: { id: true, name: true } },
          agentUser: { select: { id: true, displayName: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items: items.map((r) => this.rechargeRequestView(r)) };
  }

  async bConfirmRecharge(
    agentUserId: string,
    requestId: string,
    dto: { portId?: string; customerRebate?: string; costRebate?: string; remitAmount?: string; remark?: string },
  ) {
    const req = await this.prisma.rechargeRequest.findUnique({
      where: { id: requestId },
      include: { promotionAccount: true, customer: { select: { id: true, name: true } } },
    });
    if (!req) throw new NotFoundException('充值申请不存在');
    if (req.status !== RechargeRequestStatus.PENDING) throw new BadRequestException('该申请已处理，不能重复确认');
    await this.assertAgentCustomer(agentUserId, req.customerId);

    const amount = toMoney(req.amount, '充值金额');
    const account = req.promotionAccount;
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能充值');
    if (account.customerId !== req.customerId) throw new BadRequestException('推广账户不属于该客户');

    // 默认取该客户第一个启用的钱包
    const wallet = await this.prisma.customerWallet.findFirst({
      where: { customerId: req.customerId, status: AccountStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    if (!wallet) throw new BadRequestException('客户未开通钱包，无法充值');

    const operatorId = await this.getSystemOperatorId();
    const transactionNo = this.generateNo('PA');
    const customerRebate = dto.customerRebate ? new Prisma.Decimal(Number(dto.customerRebate)) : undefined;
    const costRebate = dto.costRebate ? new Prisma.Decimal(Number(dto.costRebate)) : undefined;
    const remitAmount = dto.remitAmount ? new Prisma.Decimal(Number(dto.remitAmount)) : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      // 锁定推广账户
      const locked = await tx.$queryRaw(Prisma.sql`SELECT id FROM promotion_accounts WHERE id = ${account.id} FOR UPDATE`);
      if (!locked || (locked as any[]).length === 0) throw new NotFoundException('推广账户不存在');
      const current = await tx.promotionAccount.findUnique({ where: { id: account.id } });
      const balanceBefore = current!.currentBalance;
      const balanceAfter = balanceBefore.add(amount);

      // 锁定钱包并扣款（按申请资金类型：对公/对私）
      const walletLocked = await tx.$queryRaw(Prisma.sql`SELECT id FROM customer_wallets WHERE id = ${wallet.id} FOR UPDATE`);
      if (!walletLocked || (walletLocked as any[]).length === 0) throw new NotFoundException('客户钱包不存在');
      const walletCurrent: any = await tx.customerWallet.findUnique({ where: { id: wallet.id } });
      // 钱包扣款按客户现金成本（实打金额）扣除：申请金额 ÷ (1 + 客户返点%)；未传时按现金换算兜底
      const rebateForDeduction = dto.customerRebate
        ? new Prisma.Decimal(Number(dto.customerRebate))
        : (req.fundType === 'PUBLIC' ? (account.customerRebatePublic ?? new Prisma.Decimal(0)) : (account.customerRebatePrivate ?? new Prisma.Decimal(0)));
      const walletDeduction = remitAmount ?? amount.div(new Prisma.Decimal(1).plus(rebateForDeduction.div(100)));
      const fundType = req.fundType || 'PRIVATE';
      const fundBefore = fundType === 'PUBLIC'
        ? new Prisma.Decimal(walletCurrent.cashBalancePublic ?? 0)
        : new Prisma.Decimal(walletCurrent.cashBalancePrivate ?? 0);
      if (fundBefore.lt(walletDeduction)) {
        throw new BadRequestException(`客户${fundType === 'PUBLIC' ? '对公' : '对私'}资金余额不足，当前余额：${moneyToString(fundBefore)}`);
      }
      const walletBalanceBefore = new Prisma.Decimal(walletCurrent.cashBalance);
      const walletBalanceAfter = walletBalanceBefore.sub(walletDeduction);
      const fundBalanceAfter = fundBefore.sub(walletDeduction);

      await tx.customerWalletTransaction.create({
        data: {
          transactionNo: this.generateNo('WT'),
          walletId: wallet.id,
          unit: wallet.unit,
          businessType: CustomerWalletTransactionType.PROMOTION_ACCOUNT_CREDIT,
          businessNo: transactionNo,
          changeAmount: walletDeduction.negated(),
          balanceBefore: walletBalanceBefore,
          balanceAfter: walletBalanceAfter,
          fundType,
          operatorId,
          remark: `推广账户充值扣款（${fundType === 'PUBLIC' ? '对公' : '对私'}）：${account.accountName}（由一级代理确认）`,
        },
      });
      if (fundType === 'PUBLIC') {
        await tx.$executeRaw(Prisma.sql`UPDATE customer_wallets SET cash_balance = ${walletBalanceAfter}, cash_balance_public = ${fundBalanceAfter} WHERE id = ${wallet.id}`);
      } else {
        await tx.$executeRaw(Prisma.sql`UPDATE customer_wallets SET cash_balance = ${walletBalanceAfter}, cash_balance_private = ${fundBalanceAfter} WHERE id = ${wallet.id}`);
      }

      // 推广账户交易流水
      await tx.promotionTransaction.create({
        data: {
          transactionNo,
          promotionAccountId: account.id,
          unit: account.unit,
          businessType: PromotionTransactionBusinessType.CUSTOMER_CREDIT,
          businessNo: transactionNo,
          changeAmount: amount,
          balanceBefore,
          balanceAfter,
          operatorId,
          remark: dto.remark || `充值申请确认：${req.requestNo}`,
          customerRebate,
          costRebate,
          remitAmount,
        },
      });
      await tx.promotionAccount.update({ where: { id: account.id }, data: { currentBalance: balanceAfter } });

      // 代理商钱包：确认充值扣现金（欠代理商打款增加）
      await this.agentWalletTxn(tx, agentUserId, walletDeduction.negated(), AgentWalletTransactionType.CHARGE_CONFIRM, req.requestNo, operatorId, `确认充值扣减代理商欠款：${req.requestNo}，客户现金 ¥${moneyToString(walletDeduction)}`);

      // 更新申请状态
      await tx.rechargeRequest.update({
        where: { id: requestId },
        data: {
          status: RechargeRequestStatus.CONFIRMED,
          agentUserId,
          confirmedAt: new Date(),
          portId: dto.portId || null,
          customerRebate,
          costRebate,
          remitAmount,
        },
      });
      return { transactionNo, balanceAfter, walletBalanceAfter, requestNo: req.requestNo, walletDeduction, fundType };
    });

    const agent = await this.prisma.agentUser.findUnique({ where: { id: agentUserId }, select: { username: true, displayName: true } });
    await this.logOperation(agent?.displayName || agent?.username || '代理商', OperationLogType.CONFIRM_RECHARGE, '充值申请', result.requestNo, `确认充值：${account.accountName} ¥${moneyToString(amount)}，客户扣现金 ¥${moneyToString(result.walletDeduction)}（${result.fundType === 'PUBLIC' ? '对公' : '对私'}）`);
    return {
      success: true,
      requestNo: result.requestNo,
      transactionNo: result.transactionNo,
      balanceAfter: moneyToString(result.balanceAfter),
      walletBalanceAfter: moneyToString(result.walletBalanceAfter),
    };
  }

  /** 读取对公/对私充值收款账户（C 端与管理员共用） */
  async cRechargeAccounts() {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT config_type as configType, account_name as accountName, bank_name as bankName,
             account_no as accountNo, remark
      FROM recharge_account_configs
    `;
    const res: any = { public: null, private: null };
    for (const r of rows || []) {
      if (r.configType === 'PUBLIC') res.public = r;
      if (r.configType === 'PRIVATE') res.private = r;
    }
    return res;
  }

  /** 保存对公/对私充值收款账户（管理员） */
  async adminSaveRechargeAccounts(adminPayload: any, dto: { public?: any; private?: any }) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN') && !adminPayload.permissions?.includes('SYSTEM_MANAGE')) {
      throw new ForbiddenException('无权限配置收款账户');
    }
    const rows: { configType: 'PUBLIC' | 'PRIVATE'; accountName?: string; bankName?: string; accountNo?: string; remark?: string }[] = [];
    if (dto.public) rows.push({ configType: 'PUBLIC', ...dto.public });
    if (dto.private) rows.push({ configType: 'PRIVATE', ...dto.private });
    if (rows.length === 0) throw new BadRequestException('请填写至少一个账户');
    for (const r of rows) {
      await this.prisma.$executeRaw`
        INSERT INTO recharge_account_configs (id, config_type, account_name, bank_name, account_no, remark, updated_by, updated_at)
        VALUES (UUID(), ${r.configType}, ${r.accountName ?? null}, ${r.bankName ?? null}, ${r.accountNo ?? null}, ${r.remark ?? null}, ${adminPayload.userId ?? null}, NOW(3))
        ON DUPLICATE KEY UPDATE
          account_name = VALUES(account_name),
          bank_name = VALUES(bank_name),
          account_no = VALUES(account_no),
          remark = VALUES(remark),
          updated_by = VALUES(updated_by),
          updated_at = VALUES(updated_at)
      `;
    }
    return { success: true };
  }


  async bRejectRecharge(agentUserId: string, requestId: string, dto: { reason: string }) {
    const agent = await this.prisma.agentUser.findUnique({ where: { id: agentUserId }, select: { username: true, displayName: true } });
    await this.logOperation(agent?.displayName || agent?.username || '代理商', OperationLogType.REJECT_RECHARGE, '充值申请', requestId, `驳回充值（${dto.reason?.trim() || '无理由'}）`);
    const req = await this.prisma.rechargeRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('充值申请不存在');
    if (req.status !== RechargeRequestStatus.PENDING) throw new BadRequestException('该申请已处理，不能驳回');
    await this.assertAgentCustomer(agentUserId, req.customerId);
    if (!dto.reason || !dto.reason.trim()) throw new BadRequestException('请填写驳回原因');
    const updated = await this.prisma.rechargeRequest.update({
      where: { id: requestId },
      data: { status: RechargeRequestStatus.REJECTED, agentUserId, rejectReason: dto.reason.trim(), confirmedAt: new Date() },
    });
    return { success: true, requestNo: updated.requestNo };
  }

  async bTransactions(payload: PortalPayload, query: { page?: number; pageSize?: number }) {
    const agentUserId = payload.agentUserId!;
    const bindings = await this.prisma.agentCustomer.findMany({ where: { agentUserId }, select: { customerId: true } });
    if (bindings.length === 0) return { total: 0, page: 1, pageSize: 15, items: [] };
    const customerIds = bindings.map((b: any) => b.customerId);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const wallets = await this.prisma.customerWallet.findMany({ where: { customerId: { in: customerIds } }, select: { id: true, customerId: true, walletName: true } });
    if (wallets.length === 0) return { total: 0, page: 1, pageSize: 15, items: [] };
    const walletIds = wallets.map((w: any) => w.id);
    const [total, items] = await Promise.all([
      this.prisma.customerWalletTransaction.count({ where: { walletId: { in: walletIds } } }),
      this.prisma.customerWalletTransaction.findMany({
        where: { walletId: { in: walletIds } },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const walletMap = new Map(wallets.map((w: any) => [w.id, w]));
    const customerNames = await this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } });
    const customerMap = new Map(customerNames.map((c: any) => [c.id, c.name]));
    return {
      total,
      page,
      pageSize,
      items: items.map((t) => {
        const w = walletMap.get(t.walletId);
        return {
          id: t.id,
          transactionNo: t.transactionNo,
          customerId: w?.customerId,
          customerName: w ? customerMap.get(w.customerId) : null,
          walletName: w?.walletName,
          businessType: t.businessType,
          businessTypeLabel: this.walletTxLabel(t.businessType),
          businessNo: t.businessNo,
          changeAmount: moneyToString(t.changeAmount),
          balanceAfter: moneyToString(t.balanceAfter),
          occurredAt: t.occurredAt,
          remark: t.remark,
        };
      }),
    };
  }

  async bInvoices(payload: PortalPayload, query: { page?: number; pageSize?: number }) {
    const agentUserId = payload.agentUserId!;
    const bindings = await this.prisma.agentCustomer.findMany({ where: { agentUserId }, select: { customerId: true } });
    if (bindings.length === 0) return { total: 0, page: 1, pageSize: 15, items: [] };
    const customerIds = bindings.map((b: any) => b.customerId);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const [total, items] = await Promise.all([
      this.prisma.invoiceTask.count({ where: { customerId: { in: customerIds } } }),
      this.prisma.invoiceTask.findMany({
        where: { customerId: { in: customerIds } },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { id: true, name: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        customerId: t.customerId,
        customerName: (t as any).customer?.name,
        titleName: t.titleName,
        taxpayerCode: t.taxpayerCode,
        publicAmount: moneyToString(t.publicAmount),
        invoiceAmount: moneyToString(t.invoiceAmount),
        status: t.status,
        statusLabel: INVOICE_STATUS_LABEL[t.status] || t.status,
        submittedAt: t.submittedAt,
        remark: t.remark,
      })),
    };
  }

  // ==================== 管理端：门户账号维护 ====================

  private assertAdmin(payload: PortalPayload) {
    if (payload.portal !== 'B' && payload.portal !== 'C') return;
    throw new ForbiddenException('无管理员权限');
  }

  /** 开通客户登录账号（管理员） */
  async adminListCustomerUsers(query: { keyword?: string; page?: number; pageSize?: number }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const where: any = {};
    if (query.keyword) {
      where.OR = [
        { username: { contains: query.keyword } },
        { displayName: { contains: query.keyword } },
        { customer: { name: { contains: query.keyword } } },
      ];
    }
    const [total, items] = await Promise.all([
      this.prisma.customerUser.count({ where }),
      this.prisma.customerUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { id: true, name: true, customerCode: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        phone: u.phone,
        status: u.status,
        customer: u.customer,
        createdAt: u.createdAt,
      })),
    };
  }

  async adminCreateCustomerAccount(adminPayload: any, customerId: string, dto: { username: string; password: string; displayName?: string; phone?: string }) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN') && !adminPayload.permissions?.includes('CUSTOMER_MANAGE')) {
      throw new ForbiddenException('无权限开通客户账号');
    }
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('客户不存在');
    if (!dto.username || !dto.password) throw new BadRequestException('请填写账号和密码');
    if (dto.password.length < 6) throw new BadRequestException('密码至少 6 位');
    const exists = await this.prisma.customerUser.findFirst({ where: { OR: [{ username: dto.username }, { customerId }] } });
    if (exists) throw new BadRequestException('该客户已开通账号或用户名已存在');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const row = await this.prisma.customerUser.create({
      data: {
        customerId,
        username: dto.username,
        passwordHash,
        displayName: dto.displayName || customer.name,
        phone: dto.phone || customer.phone || null,
      },
    });
    return { success: true, id: row.id, username: row.username, customerId: row.customerId };
  }

  /** 重置客户账号密码（管理员） */
  async adminResetCustomerPassword(adminPayload: any, customerUserId: string, dto: { password: string }) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN') && !adminPayload.permissions?.includes('CUSTOMER_MANAGE')) {
      throw new ForbiddenException('无权限重置客户账号密码');
    }
    if (!dto.password || dto.password.length < 6) throw new BadRequestException('密码至少 6 位');
    const row = await this.prisma.customerUser.update({
      where: { id: customerUserId },
      data: { passwordHash: await bcrypt.hash(dto.password, 10) },
    });
    return { success: true, username: row.username };
  }

  /** 代理账号列表（管理员） */
  async adminListAgentUsers(query: { keyword?: string; page?: number; pageSize?: number }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const where: Prisma.AgentUserWhereInput = {};
    if (query.keyword) {
      const kw = query.keyword.trim();
      where.OR = [{ username: { contains: kw } }, { displayName: { contains: kw } }];
    }
    const [total, items] = await Promise.all([
      this.prisma.agentUser.count({ where }),
      this.prisma.agentUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customerBindings: { include: { customer: { select: { id: true, name: true } } } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((au) => ({
        id: au.id,
        username: au.username,
        displayName: au.displayName,
        phone: au.phone,
        status: au.status,
        remark: au.remark,
        createdAt: au.createdAt,
        customers: au.customerBindings.map((b: any) => b.customer),
      })),
    };
  }

  /** 创建代理账号（管理员） */
  async adminCreateAgentUser(adminPayload: any, dto: { username: string; password: string; displayName: string; phone?: string; remark?: string }) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN')) throw new ForbiddenException('仅超级管理员可创建代理账号');
    if (!dto.username || !dto.password || !dto.displayName) throw new BadRequestException('请填写账号、密码和名称');
    if (dto.password.length < 6) throw new BadRequestException('密码至少 6 位');
    const exists = await this.prisma.agentUser.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException('用户名已存在');
    const row = await this.prisma.agentUser.create({
      data: {
        username: dto.username,
        passwordHash: await bcrypt.hash(dto.password, 10),
        displayName: dto.displayName,
        phone: dto.phone || null,
        remark: dto.remark || null,
      },
    });
    return { success: true, id: row.id, username: row.username, displayName: row.displayName };
  }

  /** 更新代理账号（管理员） */
  async adminUpdateAgentUser(adminPayload: any, id: string, dto: { displayName?: string; phone?: string; remark?: string; status?: PortalUserStatus }) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN')) throw new ForbiddenException('仅超级管理员可修改代理账号');
    const row = await this.prisma.agentUser.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        phone: dto.phone,
        remark: dto.remark,
        status: dto.status,
      },
    });
    return { success: true, id: row.id, username: row.username, status: row.status };
  }

  /** 重置代理密码（管理员） */
  async adminResetAgentPassword(adminPayload: any, id: string, dto: { password: string }) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN')) throw new ForbiddenException('仅超级管理员可重置代理密码');
    if (!dto.password || dto.password.length < 6) throw new BadRequestException('密码至少 6 位');
    await this.prisma.agentUser.update({ where: { id }, data: { passwordHash: await bcrypt.hash(dto.password, 10) } });
    return { success: true };
  }

  /** 绑定客户到代理（管理员） */
  async adminBindCustomers(adminPayload: any, agentUserId: string, dto: { customerIds: string[] }) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN')) throw new ForbiddenException('仅超级管理员可绑定客户');
    const agent = await this.prisma.agentUser.findUnique({ where: { id: agentUserId } });
    if (!agent) throw new NotFoundException('代理账号不存在');
    const ids = [...new Set(dto.customerIds || [])];
    if (ids.length === 0) throw new BadRequestException('请选择客户');
    const existing = await this.prisma.agentCustomer.findMany({ where: { agentUserId }, select: { customerId: true } });
    const existingSet = new Set(existing.map((e: any) => e.customerId));
    const toCreate = ids.filter((id) => !existingSet.has(id));
    if (toCreate.length > 0) {
      await this.prisma.agentCustomer.createMany({
        data: toCreate.map((customerId) => ({ agentUserId, customerId })),
        skipDuplicates: true,
      });
    }
    return { success: true, created: toCreate.length, total: existing.length + toCreate.length };
  }

  /** 解绑客户（管理员） */
  async adminUnbindCustomer(adminPayload: any, agentUserId: string, customerId: string) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN')) throw new ForbiddenException('仅超级管理员可解绑客户');
    await this.prisma.agentCustomer.deleteMany({ where: { agentUserId, customerId } });
    return { success: true };
  }

  // ==================== 视图 ====================

  private walletView(w: any) {
    return {
      id: w.id,
      walletName: w.walletName,
      walletType: w.walletType,
      unit: w.unit,
      cashBalance: moneyToString(w.cashBalance),
      cashBalancePublic: moneyToString(w.cashBalancePublic ?? 0),
      cashBalancePrivate: moneyToString(w.cashBalancePrivate ?? 0),
      groupBalance: moneyToString(w.groupBalance),
      creditLimit: moneyToString(w.creditLimit),
      creditUsed: moneyToString(w.creditUsed),
      advanceOutstanding: moneyToString(w.advanceOutstanding),
      status: w.status,
    };
  }

  private walletTxLabel(type: string): string {
    const map: Record<string, string> = {
      OPENING_BALANCE: '期初余额',
      ADJUSTMENT_RED: '红字调整',
      ADJUSTMENT_BLUE: '蓝字调整',
      MANUAL_ADJUSTMENT: '手工调整',
      RECEIVE_POSTING: '收款入账',
      RECEIVE_REFUND: '收款退款',
      PROMOTION_ACCOUNT_CREDIT: '推广账户充值',
      PROMOTION_ACCOUNT_REFUND: '推广账户退款',
      ADVANCE_REPAY: '垫款还款',
      ADVANCE_WAIVE: '垫款豁免',
      CREDIT_UPDATE: '授信调整',
    };
    return map[type] || type;
  }

  private rechargeRequestView(r: any) {
    return {
      id: r.id,
      requestNo: r.requestNo,
      customerId: r.customerId,
      customerName: r.customer?.name || null,
      submitterName: r.customerUser?.displayName || r.customerUser?.username || null,
      promotionAccountId: r.promotionAccountId,
      promotionAccountName: r.promotionAccount?.accountName || null,
      platformAccountId: r.promotionAccount?.platformAccountId || null,
      promotionRebatePublic: r.promotionAccount?.customerRebatePublic ? moneyToString(r.promotionAccount.customerRebatePublic) : null,
      promotionRebatePrivate: r.promotionAccount?.customerRebatePrivate ? moneyToString(r.promotionAccount.customerRebatePrivate) : null,
      portId: r.portId,
      portName: r.port?.name || null,
      amount: moneyToString(r.amount),
      fundType: r.fundType || 'PRIVATE',
      customerRebate: r.customerRebate ? moneyToString(r.customerRebate) : null,
      costRebate: r.costRebate ? moneyToString(r.costRebate) : null,
      remitAmount: r.remitAmount ? moneyToString(r.remitAmount) : null,
      remark: r.remark,
      status: r.status,
      statusLabel: REQUEST_STATUS_LABEL[r.status] || r.status,
      agentName: r.agentUser?.displayName || null,
      confirmedAt: r.confirmedAt,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
    };
  }


  // ==================== 退款申请 ====================

  private refundRequestView(r: any) {
    return {
      id: r.id,
      requestNo: r.requestNo,
      customerId: r.customerId,
      customerName: r.customer?.name || null,
      submitterName: r.customerUser?.displayName || r.customerUser?.username || null,
      promotionAccountId: r.promotionAccountId,
      promotionAccountName: r.promotionAccount?.accountName || null,
      platformAccountId: r.promotionAccount?.platformAccountId || null,
      amount: moneyToString(r.amount),
      amountLabel: r.amount && Number(r.amount) > 0 ? moneyToString(r.amount) : '全退',
      promotionAccountBalance: r.promotionAccount?.currentBalance != null ? moneyToString(r.promotionAccount.currentBalance) : null,
      fundType: r.fundType || 'PRIVATE',
      cashAmount: r.cashAmount ? moneyToString(r.cashAmount) : null,
      remark: r.remark,
      status: r.status,
      statusLabel: REFUND_STATUS_LABEL[r.status] || r.status,
      agentName: r.agentUser?.displayName || null,
      confirmedAt: r.confirmedAt,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
    };
  }

  /** 操作日志落库 */
  private async logOperation(operatorName: string, actionType: OperationLogType, targetType?: string | null, targetNo?: string | null, detail?: string | null) {
    await this.prisma.operationLog.create({
      data: { operatorName, actionType, targetType: targetType || null, targetNo: targetNo || null, detail: detail || null },
    });
  }

  /** 代理商钱包记账（tx 内）：balance += changeAmount */
  private async agentWalletTxn(
    tx: Prisma.TransactionClient,
    agentUserId: string,
    changeAmount: Prisma.Decimal,
    businessType: AgentWalletTransactionType,
    businessNo: string,
    operatorId: string,
    remark?: string,
  ) {
    const before = await tx.agentWallet.findUnique({ where: { agentUserId }, select: { id: true, balance: true } });
    const balanceBefore = before ? new Prisma.Decimal(before.balance) : new Prisma.Decimal(0);
    const balanceAfter = balanceBefore.plus(changeAmount);
    const wallet = before
      ? await tx.agentWallet.update({ where: { agentUserId }, data: { balance: balanceAfter } })
      : await tx.agentWallet.create({ data: { agentUserId, balance: balanceAfter } });
    await tx.agentWalletTransaction.create({
      data: {
        transactionNo: this.generateNo('AW'),
        agentWalletId: wallet.id,
        businessType,
        businessNo,
        changeAmount,
        balanceBefore,
        balanceAfter,
        operatorId,
        remark: remark || null,
      },
    });
    return { balanceAfter };
  }

  /** C 端发起退款申请：退推广账户余额（账户币），默认全部余额，可自定义 */
  async cCreateRefundRequest(payload: PortalPayload, dto: { promotionAccountId: string; amount?: string; fundType?: string; remark?: string }) {
    this.assertPortal(payload, 'C');
    const customerId = payload.customerId!;
    const account = await this.prisma.promotionAccount.findUnique({ where: { id: dto.promotionAccountId } });
    if (!account || account.customerId !== customerId) throw new BadRequestException('推广账户不存在或不属于当前客户');
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能发起退款');
    const cu = await this.prisma.customerUser.findUnique({ where: { customerId } });
    if (!cu) throw new BadRequestException('客户账号异常');
    const amount = dto.amount ? toMoney(dto.amount, '退款金额') : new Prisma.Decimal(0);
    if (amount.lt(0)) throw new BadRequestException('退款金额不能为负数');
    const isFullRefund = amount.eq(0);
    const fundType = dto.fundType === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';
    const row = await this.prisma.refundRequest.create({
      data: {
        requestNo: this.generateNo('RF'),
        customerId,
        customerUserId: cu.id,
        promotionAccountId: account.id,
        amount,
        fundType,
        remark: dto.remark || null,
        status: RefundRequestStatus.PENDING,
      },
    });
    await this.logOperation(cu.username || cu.displayName || '客户', OperationLogType.OTHER, '退款申请', row.requestNo, `客户发起退款申请：${account.accountName}${isFullRefund ? '（全退）' : ` ¥${moneyToString(amount)}`}`);
    return this.refundRequestView(row);
  }

  /** C 端退款列表 */
  async cListRefundRequests(payload: PortalPayload, query: { page?: number; pageSize?: number }) {
    this.assertPortal(payload, 'C');
    const customerId = payload.customerId!;
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const [total, items] = await Promise.all([
      this.prisma.refundRequest.count({ where: { customerId } }),
      this.prisma.refundRequest.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          customerUser: { select: { displayName: true, username: true } },
          promotionAccount: { select: { id: true, accountName: true, platformAccountId: true } },
          agentUser: { select: { id: true, displayName: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items: items.map((r) => this.refundRequestView(r)) };
  }

  /** B 端退款申请列表 */
  async bListRefundRequests(payload: PortalPayload, query: { status?: string; page?: number; pageSize?: number }) {
    this.assertPortal(payload, 'B');
    const agentUserId = payload.agentUserId!;
    const bindings = await this.prisma.agentCustomer.findMany({ where: { agentUserId }, select: { customerId: true } });
    if (bindings.length === 0) return { total: 0, page: 1, pageSize: 15, items: [] };
    const customerIds = bindings.map((b: any) => b.customerId);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 15;
    const where: Prisma.RefundRequestWhereInput = { customerId: { in: customerIds } };
    if (query.status && Object.values(RefundRequestStatus).includes(query.status as RefundRequestStatus)) {
      where.status = query.status as RefundRequestStatus;
    }
    const [total, items] = await Promise.all([
      this.prisma.refundRequest.count({ where }),
      this.prisma.refundRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          customerUser: { select: { displayName: true, username: true } },
          promotionAccount: { select: { id: true, accountName: true, platformAccountId: true, customerRebatePublic: true, customerRebatePrivate: true, currentBalance: true } },
          agentUser: { select: { id: true, displayName: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items: items.map((r) => this.refundRequestView(r)) };
  }

  /** B 端通过退款：账户币扣减、现金退回客户钱包（对公/对私）、代理商欠款冲减 */
  async bApproveRefund(agentUserId: string, requestId: string, dto: { amount?: string | number }) {
    const req = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      include: { promotionAccount: true, customer: { select: { id: true, name: true } }, customerUser: { select: { id: true, username: true, displayName: true } } },
    });
    if (!req) throw new NotFoundException('退款申请不存在');
    if (req.status !== RefundRequestStatus.PENDING) throw new BadRequestException('该退款申请已处理，不能重复操作');
    await this.assertAgentCustomer(agentUserId, req.customerId);
    const agent = await this.prisma.agentUser.findUnique({ where: { id: agentUserId } });
    const agentName = agent?.displayName || agent?.username || '代理商';

    const account = req.promotionAccount;
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能退款');
    const accountBalance = new Prisma.Decimal(account.currentBalance ?? 0);
    if (!dto.amount && (!req.amount || Number(req.amount) <= 0)) throw new BadRequestException('请填写实际退款账户币');
    const amount = dto.amount ? toMoney(String(dto.amount), '实际退款金额') : new Prisma.Decimal(String(req.amount));
    if (amount.lte(0)) throw new BadRequestException('退款金额必须大于 0');
    if (amount.gt(accountBalance)) throw new BadRequestException(`退款金额不能超过账户余额（当前余额：${moneyToString(accountBalance)}）`);
    const fundType = req.fundType || 'PRIVATE';
    const rebateRate = fundType === 'PUBLIC'
      ? (account.customerRebatePublic ?? new Prisma.Decimal(0))
      : (account.customerRebatePrivate ?? new Prisma.Decimal(0));
    // 现金 = 退款账户币 ÷ (1 + 客户返点%)
    const cashAmount = amount.div(new Prisma.Decimal(1).plus(rebateRate.div(100)));

    const wallet = await this.prisma.customerWallet.findFirst({
      where: { customerId: req.customerId, status: AccountStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    if (!wallet) throw new BadRequestException('客户未开通钱包，无法退款');

    const operatorId = await this.getSystemOperatorId();
    const transactionNo = this.generateNo('PA');

    await this.prisma.$transaction(async (tx) => {
      // 锁定推广账户
      const locked = await tx.$queryRaw(Prisma.sql`SELECT id FROM promotion_accounts WHERE id = ${account.id} FOR UPDATE`);
      if (!locked || (locked as any[]).length === 0) throw new NotFoundException('推广账户不存在');
      const current = await tx.promotionAccount.findUnique({ where: { id: account.id } });
      const balanceBefore = new Prisma.Decimal(current!.currentBalance ?? 0);
      if (balanceBefore.lt(amount)) throw new BadRequestException(`推广账户余额不足，当前余额：${moneyToString(balanceBefore)}`);
      const balanceAfter = balanceBefore.sub(amount);

      // 推广账户流水（账户币减少）
      await tx.promotionTransaction.create({
        data: {
          transactionNo,
          promotionAccountId: account.id,
          unit: account.unit,
          businessType: PromotionTransactionBusinessType.REFUND,
          businessNo: req.requestNo,
          changeAmount: amount.negated(),
          balanceBefore,
          balanceAfter,
          operatorId,
          remark: `退款申请通过：${req.requestNo}`,
          remitAmount: cashAmount,
        },
      });
      await tx.promotionAccount.update({ where: { id: account.id }, data: { currentBalance: balanceAfter } });

      // 客户钱包现金退回（对公/对私）
      const walletLocked = await tx.$queryRaw(Prisma.sql`SELECT id FROM customer_wallets WHERE id = ${wallet.id} FOR UPDATE`);
      if (!walletLocked || (walletLocked as any[]).length === 0) throw new NotFoundException('客户钱包不存在');
      const walletCurrent: any = await tx.customerWallet.findUnique({ where: { id: wallet.id } });
      const cashBefore = new Prisma.Decimal(walletCurrent.cashBalance ?? 0);
      const cashAfter = cashBefore.plus(cashAmount);
      const fundBefore = fundType === 'PUBLIC'
        ? new Prisma.Decimal(walletCurrent.cashBalancePublic ?? 0)
        : new Prisma.Decimal(walletCurrent.cashBalancePrivate ?? 0);
      const fundAfter = fundBefore.plus(cashAmount);
      await tx.customerWalletTransaction.create({
        data: {
          transactionNo: this.generateNo('WT'),
          walletId: wallet.id,
          unit: wallet.unit,
          businessType: CustomerWalletTransactionType.PROMOTION_ACCOUNT_REFUND,
          businessNo: transactionNo,
          changeAmount: cashAmount,
          balanceBefore: cashBefore,
          balanceAfter: cashAfter,
          fundType,
          operatorId,
          remark: `推广账户退款退回现金（${fundType === 'PUBLIC' ? '对公' : '对私'}）：${account.accountName}，退款单 ${req.requestNo}`,
        },
      });
      if (fundType === 'PUBLIC') {
        await tx.$executeRaw(Prisma.sql`UPDATE customer_wallets SET cash_balance = ${cashAfter}, cash_balance_public = ${fundAfter} WHERE id = ${wallet.id}`);
      } else {
        await tx.$executeRaw(Prisma.sql`UPDATE customer_wallets SET cash_balance = ${cashAfter}, cash_balance_private = ${fundAfter} WHERE id = ${wallet.id}`);
      }

      // 代理商钱包：退款冲减欠款（+现金）
      await this.agentWalletTxn(tx, agentUserId, cashAmount, AgentWalletTransactionType.REFUND_BACK, req.requestNo, operatorId, `退款冲减代理商欠款：${req.requestNo}`);

      // 更新退款申请
      await tx.refundRequest.update({
        where: { id: requestId },
        data: { status: RefundRequestStatus.CONFIRMED, agentUserId, confirmedAt: new Date(), cashAmount },
      });
    });

    await this.logOperation(agentName, OperationLogType.APPROVE_REFUND, '退款申请', req.requestNo, `通过退款：${account.accountName} ¥${moneyToString(amount)}，退现金 ¥${moneyToString(cashAmount)}（${fundType === 'PUBLIC' ? '对公' : '对私'}）`);
    return { success: true, requestNo: req.requestNo, cashAmount: moneyToString(cashAmount) };
  }

  /** B 端驳回退款 */
  async bRejectRefund(agentUserId: string, requestId: string, dto: { reason?: string }) {
    const req = await this.prisma.refundRequest.findUnique({ where: { id: requestId }, include: { promotionAccount: { select: { id: true, accountName: true } } } });
    if (!req) throw new NotFoundException('退款申请不存在');
    if (req.status !== RefundRequestStatus.PENDING) throw new BadRequestException('该退款申请已处理，不能重复操作');
    await this.assertAgentCustomer(agentUserId, req.customerId);
    const agent = await this.prisma.agentUser.findUnique({ where: { id: agentUserId } });
    await this.prisma.refundRequest.update({
      where: { id: requestId },
      data: { status: RefundRequestStatus.REJECTED, agentUserId, rejectReason: dto.reason?.trim() || null },
    });
    await this.logOperation(agent?.displayName || agent?.username || '代理商', OperationLogType.REJECT_REFUND, '退款申请', req.requestNo, `驳回退款：${req.promotionAccount?.accountName || ''}（${dto.reason?.trim() || '无理由'}）`);
    return { success: true };
  }

  // ==================== 管理端：端口钱包 / 代理商钱包 / 日志 ====================

  /** 端口钱包统计：端口汇总 + 推广账户明细 */
  async adminListPortWalletStats() {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT pa.id as promotionAccountId, pa.account_name as accountName, pa.platform as platform,
             pa.platform_account_id as platformAccountId, pa.channel_name as channelName,
             pa.channel_id as channelId, pa.current_balance as currentBalance, pa.status as status,
             c.name as customerName,
             COALESCE(rr.total_charge, 0) as totalCharge,
             COALESCE(rf.total_refund, 0) as totalRefund
      FROM promotion_accounts pa
      LEFT JOIN customers c ON c.id = pa.customer_id
      LEFT JOIN (
        SELECT promotion_account_id, SUM(amount) as total_charge FROM recharge_requests
        WHERE status = 'CONFIRMED' GROUP BY promotion_account_id
      ) rr ON rr.promotion_account_id = pa.id
      LEFT JOIN (
        SELECT promotion_account_id, SUM(amount) as total_refund FROM refund_requests
        WHERE status = 'CONFIRMED' GROUP BY promotion_account_id
      ) rf ON rf.promotion_account_id = pa.id
      WHERE pa.customer_id IS NOT NULL
      ORDER BY pa.channel_name, pa.account_name
    `;
    const items = (rows || []).map((r: any) => ({
      promotionAccountId: r.promotionAccountId,
      accountName: r.accountName,
      platform: r.platform || '—',
      platformAccountId: r.platformAccountId || '—',
      channelId: r.channelId || null,
      channelName: r.channelName || '未分端口',
      customerName: r.customerName || '—',
      currentBalance: moneyToString(r.currentBalance),
      totalCharge: moneyToString(r.totalCharge),
      totalRefund: moneyToString(r.totalRefund),
    }));
    // 端口汇总
    const byChannel: Record<string, any> = {};
    for (const it of items) {
      const k = it.channelName;
      if (!byChannel[k]) byChannel[k] = { channelName: k, channelId: it.channelId, totalCharge: new Prisma.Decimal(0), totalRefund: new Prisma.Decimal(0), currentBalance: new Prisma.Decimal(0) };
      byChannel[k].totalCharge = byChannel[k].totalCharge.plus(it.totalCharge);
      byChannel[k].totalRefund = byChannel[k].totalRefund.plus(it.totalRefund);
      byChannel[k].currentBalance = byChannel[k].currentBalance.plus(it.currentBalance);
    }
    // 读取端口置顶状态
    const channelIds = Object.values(byChannel).filter((c: any) => c.channelId).map((c: any) => c.channelId);
    const pinnedMap: Record<string, boolean> = {};
    if (channelIds.length) {
      const chans = await this.prisma.channel.findMany({ where: { id: { in: channelIds } }, select: { id: true, isPinned: true } });
      for (const ch of chans) pinnedMap[ch.id] = ch.isPinned;
    }
    const channels = Object.values(byChannel).map((c: any) => ({
      channelId: c.channelId,
      channelName: c.channelName,
      isPinned: c.channelId ? Boolean(pinnedMap[c.channelId]) : false,
      totalCharge: moneyToString(c.totalCharge),
      totalRefund: moneyToString(c.totalRefund),
      currentBalance: moneyToString(c.currentBalance),
      accounts: items.filter((i: any) => i.channelName === c.channelName),
    }));
    // 置顶优先，其余按钱包余额降序
    channels.sort((a: any, b: any) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || Number(b.currentBalance) - Number(a.currentBalance));
    return { channels, items };
  }

  /** 代理商钱包列表 */
  async adminListAgentWallets() {
    const rows = await this.prisma.agentWallet.findMany({
      include: { agentUser: { select: { id: true, username: true, displayName: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((w: any) => ({
      agentUserId: w.agentUserId,
      username: w.agentUser?.username,
      displayName: w.agentUser?.displayName,
      balance: moneyToString(w.balance),
      updatedAt: w.updatedAt,
    }));
  }

  /** 管理端：代理商打款录入（余额加回） */
  async adminAgentPayout(adminPayload: any, dto: { agentUserId: string; amount: string; remark?: string }) {
    if (!adminPayload.roles?.includes('SUPER_ADMIN') && !adminPayload.permissions?.includes('FINANCE_MANAGE')) {
      throw new ForbiddenException('无权限操作代理商打款');
    }
    const au = await this.prisma.agentUser.findUnique({ where: { id: dto.agentUserId } });
    if (!au) throw new NotFoundException('代理商不存在');
    const amount = toMoney(dto.amount, '打款金额');
    if (amount.lte(0)) throw new BadRequestException('打款金额必须大于 0');
    const operatorId = await this.getSystemOperatorId();
    const operatorName = adminPayload.username || '系统管理员';
    await this.prisma.$transaction(async (tx) => {
      await this.agentWalletTxn(tx, au.id, amount, AgentWalletTransactionType.AGENT_PAYOUT, this.generateNo('PO'), operatorId, dto.remark?.trim() || `给代理商打款：${au.displayName}`);
    });
    await this.logOperation(operatorName, OperationLogType.AGENT_PAYOUT, '代理商打款', null, `给代理商 ${au.displayName} 打款 ¥${moneyToString(amount)}${dto.remark?.trim() ? '（' + dto.remark.trim() + '）' : ''}`);
    return { success: true };
  }

  /** 管理端：退款记录（全部客户） */
  async adminListRefundRequests(query: { status?: string; page?: number; pageSize?: number }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const where: Prisma.RefundRequestWhereInput = {};
    if (query.status && Object.values(RefundRequestStatus).includes(query.status as RefundRequestStatus)) {
      where.status = query.status as RefundRequestStatus;
    }
    const [total, items] = await Promise.all([
      this.prisma.refundRequest.count({ where }),
      this.prisma.refundRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          customerUser: { select: { displayName: true, username: true } },
          promotionAccount: { select: { id: true, accountName: true, platformAccountId: true } },
          agentUser: { select: { id: true, displayName: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items: items.map((r) => this.refundRequestView(r)) };
  }

  /** 代理商钱包流水 */
  async adminListAgentWalletTransactions(query: { page?: number; pageSize?: number }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const [total, items] = await Promise.all([
      this.prisma.agentWalletTransaction.count(),
      this.prisma.agentWalletTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { wallet: { include: { agentUser: { select: { id: true, username: true, displayName: true } } } } },
      }),
    ]);
    return {
      total, page, pageSize,
      items: items.map((tx) => ({
        id: tx.id,
        transactionNo: tx.transactionNo,
        agentName: tx.wallet?.agentUser?.displayName || tx.wallet?.agentUser?.username || '',
        businessType: tx.businessType,
        businessTypeLabel: AgentWalletTransactionTypeLabel[tx.businessType] || tx.businessType,
        businessNo: tx.businessNo,
        changeAmount: Number(tx.changeAmount).toFixed(2),
        balanceBefore: Number(tx.balanceBefore).toFixed(2),
        balanceAfter: Number(tx.balanceAfter).toFixed(2),
        operatorId: tx.operatorId,
        remark: tx.remark,
        createdAt: tx.createdAt,
      })),
    };
  }

  /** 操作日志查询 */
  async adminListOperationLogs(query: { actionType?: string; start?: string; end?: string; page?: number; pageSize?: number }) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const where: Prisma.OperationLogWhereInput = {};
    if (query.actionType && Object.values(OperationLogType).includes(query.actionType as OperationLogType)) {
      where.actionType = query.actionType as OperationLogType;
    }
    if (query.start || query.end) {
      where.createdAt = {};
      if (query.start) where.createdAt.gte = new Date(query.start);
      if (query.end) where.createdAt.lte = new Date(query.end);
    }
    const [total, items] = await Promise.all([
      this.prisma.operationLog.count({ where }),
      this.prisma.operationLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map((l: any) => ({
        id: l.id,
        operatorName: l.operatorName,
        actionType: l.actionType,
        actionLabel: OPERATION_LOG_LABEL[l.actionType] || l.actionType,
        targetType: l.targetType,
        targetNo: l.targetNo,
        detail: l.detail,
        createdAt: l.createdAt,
      })),
    };
  }

  private async assertCustomerWallet(customerId: string, walletId: string) {
    const wallet = await this.prisma.customerWallet.findUnique({ where: { id: walletId } });
    if (!wallet || wallet.customerId !== customerId) throw new NotFoundException('钱包不存在');
  }
}
