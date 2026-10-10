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

  async cCreateRechargeRequest(payload: PortalPayload, dto: { promotionAccountId: string; amount: string; remark?: string }) {
    const customerId = payload.customerId!;
    const amount = toMoney(dto.amount, '充值金额');
    if (amount.lte(0)) throw new BadRequestException('充值金额必须大于 0');
    const account = await this.prisma.promotionAccount.findUnique({ where: { id: dto.promotionAccountId } });
    if (!account || account.customerId !== customerId) throw new BadRequestException('推广账户不存在或不属于当前客户');
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能发起充值');
    const cu = await this.prisma.customerUser.findUnique({ where: { customerId } });
    if (!cu) throw new BadRequestException('客户账号异常');
    const row = await this.prisma.rechargeRequest.create({
      data: {
        requestNo: this.generateNo('RQ'),
        customerId,
        customerUserId: cu.id,
        promotionAccountId: account.id,
        amount,
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
          promotionAccount: { select: { id: true, accountName: true, channelName: true, customerRebatePublic: true, customerRebatePrivate: true } },
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

      // 锁定钱包并扣款
      const walletLocked = await tx.$queryRaw(Prisma.sql`SELECT id FROM customer_wallets WHERE id = ${wallet.id} FOR UPDATE`);
      if (!walletLocked || (walletLocked as any[]).length === 0) throw new NotFoundException('客户钱包不存在');
      const walletCurrent = await tx.customerWallet.findUnique({ where: { id: wallet.id } });
      // 钱包扣款按客户现金成本（实打金额）扣除：申请金额 ÷ (1 + 客户返点%)；未传时兜底按申请全额
      const walletDeduction = remitAmount ?? amount;
      if (walletCurrent!.cashBalance.lt(walletDeduction)) {
        throw new BadRequestException(`客户钱包余额不足，当前余额：${moneyToString(walletCurrent!.cashBalance)}`);
      }
      const walletBalanceBefore = walletCurrent!.cashBalance;
      const walletBalanceAfter = walletBalanceBefore.sub(walletDeduction);

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
          operatorId,
          remark: `推广账户充值扣款：${account.accountName}（由一级代理确认）`,
        },
      });
      await tx.customerWallet.update({ where: { id: wallet.id }, data: { cashBalance: walletBalanceAfter } });

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
      return { transactionNo, balanceAfter, walletBalanceAfter, requestNo: req.requestNo };
    });

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
      promotionRebatePublic: r.promotionAccount?.customerRebatePublic ? moneyToString(r.promotionAccount.customerRebatePublic) : null,
      promotionRebatePrivate: r.promotionAccount?.customerRebatePrivate ? moneyToString(r.promotionAccount.customerRebatePrivate) : null,
      portId: r.portId,
      portName: r.port?.name || null,
      amount: moneyToString(r.amount),
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

  private async assertCustomerWallet(customerId: string, walletId: string) {
    const wallet = await this.prisma.customerWallet.findUnique({ where: { id: walletId } });
    if (!wallet || wallet.customerId !== customerId) throw new NotFoundException('钱包不存在');
  }
}
