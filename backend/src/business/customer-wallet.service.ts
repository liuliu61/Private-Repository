import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, AccountUnit, CustomerWalletTransactionType, CustomerWalletType, Prisma, PromotionAccountOwnerType, PromotionAccountUnit, PromotionTransactionBusinessType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerWalletDto, CustomerWalletListQueryDto, CustomerWalletTransactionQueryDto, WalletAdjustmentDirection, WalletAdjustmentDto, WalletAdvanceUpdateDto, WalletComparisonOperator, WalletCreditUpdateDto, WalletOpeningBalanceDto } from './business.dto';

@Injectable()
export class CustomerWalletService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async create(dto: CreateCustomerWalletDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_ADJUST');
    const walletType = dto.walletType ?? CustomerWalletType.FINANCE_V;
    const unit = dto.unit ?? AccountUnit.CNY;
    if (unit !== AccountUnit.CNY) throw new BadRequestException('客户钱包只支持CNY，ACCOUNT_CREDIT请使用推广账户');
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, name: true, agentId: true, status: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    if (!customer.agentId) throw new ForbiddenException('客户尚未配置所属组织，不能创建客户钱包');
    await this.scope.assertOrganizationAccess(customer.agentId, context);
    if (customer.status !== 'ACTIVE') throw new BadRequestException('客户已停用，不能创建客户钱包');
    const existing = await this.prisma.customerWallet.findUnique({ where: { customerId_walletType: { customerId: customer.id, walletType } } });
    if (existing) throw new ConflictException('该客户已经存在客户钱包');
    const wallet = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customerWallet.create({ data: { customerId: customer.id, organizationId: customer.agentId!, walletName: dto.walletName?.trim() || `${customer.name}${walletType === CustomerWalletType.FINANCE_V ? '财务V钱包' : '外采钱包'}`, walletType, unit } });
      await this.audit(tx, context, created.organizationId, created.id, 'CUSTOMER_WALLET_CREATE', null, { walletName: created.walletName, unit: created.unit });
      return created;
    });
    return this.walletView(wallet, new Prisma.Decimal(0), customer);
  }

  async list(query: CustomerWalletListQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    if (query.organizationId && organizationIds && !organizationIds.includes(query.organizationId)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权访问该组织的钱包数据' });
    const rows = await this.prisma.customerWallet.findMany({
      where: {
        organizationId: query.organizationId ? query.organizationId : organizationIds ? { in: organizationIds } : undefined,
        customerId: query.customerId,
        unit: query.unit,
        walletType: query.walletType,
        status: query.status,
        customer: query.keyword ? { OR: [{ name: { contains: query.keyword, mode: 'insensitive' } }, { customerCode: { contains: query.keyword, mode: 'insensitive' } }] } : undefined,
      },
      include: { customer: { select: { id: true, name: true, customerCode: true, agentId: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const groupBalances = await this.getGroupBalances(rows.filter((row) => row.walletType !== CustomerWalletType.FINANCE_V).map((row) => row.customerId));
    const views = rows.map((row) => this.walletView(row, groupBalances.get(row.customerId) || new Prisma.Decimal(0), row.customer));
    const filtered = views.filter((row) => this.matchesComparison(new Prisma.Decimal(row.totalBalance), query.totalBalanceOperator, query.totalBalance) && this.matchesComparison(new Prisma.Decimal(row.advanceOutstanding), query.advanceOperator, query.advanceOutstanding) && this.matchesComparison(new Prisma.Decimal(row.creditLimit), query.creditLimitOperator, query.creditLimit));
    const start = (query.page - 1) * query.pageSize;
    return { items: filtered.slice(start, start + query.pageSize), total: filtered.length, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_VIEW');
    const wallet = await this.getWallet(id, context);
    const groupBalance = wallet.walletType === CustomerWalletType.FINANCE_V ? new Prisma.Decimal(0) : (await this.getGroupBalances([wallet.customerId])).get(wallet.customerId) || new Prisma.Decimal(0);
    return this.walletView(wallet, groupBalance, wallet.customer);
  }

  async listTransactions(walletId: string, query: CustomerWalletTransactionQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_VIEW');
    const wallet = await this.getWallet(walletId, context);
    const minAmount = query.minAmount === undefined ? undefined : toMoney(query.minAmount, '最小金额');
    const maxAmount = query.maxAmount === undefined ? undefined : toMoney(query.maxAmount, '最大金额');
    if (minAmount && maxAmount && minAmount.gt(maxAmount)) throw new BadRequestException('最小金额不能大于最大金额');
    const isPromotionType = false;
    const isWalletType = query.businessType === undefined || Object.values(CustomerWalletTransactionType).includes(query.businessType as CustomerWalletTransactionType);
    const walletWhere: Prisma.CustomerWalletTransactionWhereInput = { walletId: isWalletType ? walletId : undefined, businessType: isWalletType && query.businessType && Object.values(CustomerWalletTransactionType).includes(query.businessType as CustomerWalletTransactionType) ? query.businessType as CustomerWalletTransactionType : undefined, transactionNo: query.transactionNo, occurredAt: { gte: query.startDate ? new Date(query.startDate) : undefined, lt: query.endDate ? new Date(query.endDate) : undefined }, changeAmount: { gte: minAmount, lte: maxAmount } };
    const promotionWhere: Prisma.PromotionTransactionWhereInput = { promotionAccount: { customerId: wallet.customerId, ownerType: PromotionAccountOwnerType.CUSTOMER, unit: PromotionAccountUnit.ACCOUNT_CREDIT }, businessType: isPromotionType && query.businessType && Object.values(PromotionTransactionBusinessType).includes(query.businessType as PromotionTransactionBusinessType) ? query.businessType as PromotionTransactionBusinessType : undefined, transactionNo: query.transactionNo, occurredAt: { gte: query.startDate ? new Date(query.startDate) : undefined, lt: query.endDate ? new Date(query.endDate) : undefined }, changeAmount: { gte: minAmount, lte: maxAmount } };
    const [walletItems, promotionItems] = await Promise.all([
      isWalletType ? this.prisma.customerWalletTransaction.findMany({ where: walletWhere }) : Promise.resolve([]),
      isPromotionType ? this.prisma.promotionTransaction.findMany({ where: promotionWhere }) : Promise.resolve([]),
    ]);
    const items = [
      ...walletItems.map((item) => ({ ...this.transactionView(item), source: 'CUSTOMER_WALLET' as const })),
      ...promotionItems.map((item) => ({ ...this.promotionTransactionView(item), source: 'PROMOTION_ACCOUNT' as const })),
    ].sort((left, right) => { const timeDifference = right.occurredAt.getTime() - left.occurredAt.getTime(); return timeDifference || right.transactionNo.localeCompare(left.transactionNo); });
    const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total: items.length, page: query.page, pageSize: query.pageSize };
  }

  async openingBalance(walletId: string, dto: WalletOpeningBalanceDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_OPENING_BALANCE');
    const amount = toMoney(dto.amount, '期初余额');
    if (amount.isZero()) throw new BadRequestException('期初余额不能为0');
    return this.createLedger(walletId, CustomerWalletTransactionType.OPENING_BALANCE, amount, dto, context, 'CUSTOMER_WALLET_OPENING_BALANCE');
  }

  async adjust(walletId: string, dto: WalletAdjustmentDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_ADJUST');
    if (![CustomerWalletTransactionType.ADJUSTMENT_RED, CustomerWalletTransactionType.ADJUSTMENT_BLUE, CustomerWalletTransactionType.MANUAL_ADJUSTMENT].includes(dto.type)) throw new BadRequestException('钱包调整类型不正确');
    if (dto.type === CustomerWalletTransactionType.MANUAL_ADJUSTMENT && !dto.direction) throw new BadRequestException('手工调整必须指定收入或支出方向');
    const amount = toMoney(dto.amount, '调整金额');
    if (amount.lte(0)) throw new BadRequestException('调整金额必须大于0');
    const changeAmount = dto.type === CustomerWalletTransactionType.ADJUSTMENT_RED || (dto.type === CustomerWalletTransactionType.MANUAL_ADJUSTMENT && dto.direction === WalletAdjustmentDirection.EXPENSE) ? amount.negated() : amount;
    return this.createLedger(walletId, dto.type, changeAmount, dto, context, `CUSTOMER_WALLET_${dto.type}`);
  }

  async updateCredit(walletId: string, dto: WalletCreditUpdateDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_ADJUST');
    if (dto.creditLimit === undefined && dto.creditUsed === undefined) throw new BadRequestException('至少需要提供一个授信字段');
    const wallet = await this.getWallet(walletId, context);
    this.assertActive(wallet.status);
    const creditLimit = dto.creditLimit === undefined ? wallet.creditLimit : this.nonNegativeMoney(dto.creditLimit, '授信额度');
    const creditUsed = dto.creditUsed === undefined ? wallet.creditUsed : this.nonNegativeMoney(dto.creditUsed, '授信已使用金额');
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockWallet(tx, walletId, context);
      const row = await tx.customerWallet.update({ where: { id: walletId }, data: { creditLimit, creditUsed } });
      await this.audit(tx, context, locked.organizationId, walletId, 'CUSTOMER_WALLET_CREDIT_UPDATE', { creditLimit: moneyToString(locked.creditLimit), creditUsed: moneyToString(locked.creditUsed) }, { creditLimit: moneyToString(creditLimit), creditUsed: moneyToString(creditUsed), effectiveAt: dto.effectiveAt || new Date().toISOString(), remark: dto.remark || null });
      return row;
    });
    return this.walletView(updated, updated.walletType === CustomerWalletType.FINANCE_V ? new Prisma.Decimal(0) : (await this.getGroupBalances([updated.customerId])).get(updated.customerId) || new Prisma.Decimal(0));
  }

  async updateAdvance(walletId: string, dto: WalletAdvanceUpdateDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_ADJUST');
    const amount = this.nonNegativeMoney(dto.advanceOutstanding, '垫款金额');
    const wallet = await this.getWallet(walletId, context);
    this.assertActive(wallet.status);
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockWallet(tx, walletId, context);
      const row = await tx.customerWallet.update({ where: { id: walletId }, data: { advanceOutstanding: amount } });
      await this.audit(tx, context, locked.organizationId, walletId, 'CUSTOMER_WALLET_ADVANCE_UPDATE', { advanceOutstanding: moneyToString(locked.advanceOutstanding) }, { advanceOutstanding: moneyToString(amount), effectiveAt: dto.effectiveAt || new Date().toISOString(), remark: dto.remark || null });
      return row;
    });
    return this.walletView(updated, updated.walletType === CustomerWalletType.FINANCE_V ? new Prisma.Decimal(0) : (await this.getGroupBalances([updated.customerId])).get(updated.customerId) || new Prisma.Decimal(0));
  }

  async checkBalance(walletId: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_WALLET_VIEW');
    const wallet = await this.getWallet(walletId, context);
    const aggregate = await this.prisma.customerWalletTransaction.aggregate({ where: { walletId }, _sum: { changeAmount: true } });
    const calculatedBalance = (aggregate._sum.changeAmount || new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const currentBalance = toMoney(wallet.cashBalance, '钱包余额');
    const difference = currentBalance.sub(calculatedBalance).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return { walletId, currentBalance: moneyToString(currentBalance), calculatedBalance: moneyToString(calculatedBalance), difference: moneyToString(difference), consistent: difference.isZero() };
  }

  async applyProcurementChangeInTransaction(
    tx: Prisma.TransactionClient,
    input: { customerId: string; organizationId: string; changeAmount: Prisma.Decimal; orderNo: string; operatorId: string; remark?: string },
  ) {
    const wallet = await tx.customerWallet.findUnique({ where: { customerId_walletType: { customerId: input.customerId, walletType: CustomerWalletType.EXTERNAL_PROCUREMENT } } });
    if (!wallet || wallet.organizationId !== input.organizationId) throw new BadRequestException('客户未配置当前组织的外采钱包');
    if (wallet.status !== AccountStatus.ACTIVE) throw new BadRequestException('客户钱包已停用，不能执行外采钱包联动');
    if (wallet.unit !== AccountUnit.CNY) throw new BadRequestException('外采钱包必须使用CNY单位');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "customer_wallets" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`);
    const idempotencyKey = `PURCHASE_ORDER:${input.orderNo}:CUSTOMER_WALLET`;
    const existing = await tx.customerWalletTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return { idempotent: true, transaction: this.transactionView(existing) };
    const balanceBefore = toMoney(wallet.cashBalance, '客户钱包余额');
    const changeAmount = input.changeAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const balanceAfter = balanceBefore.add(changeAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const transaction = await tx.customerWalletTransaction.create({
      data: {
        transactionNo: this.generateTransactionNo(),
        walletId: wallet.id,
        unit: wallet.unit,
        businessType: CustomerWalletTransactionType.MANUAL_ADJUSTMENT,
        businessNo: input.orderNo,
        changeAmount,
        balanceBefore,
        balanceAfter,
        operatorId: input.operatorId,
        remark: input.remark?.trim() || '外采订单客户钱包联动',
        idempotencyKey,
      },
    });
    await tx.customerWallet.update({ where: { id: wallet.id }, data: { cashBalance: balanceAfter } });
    await tx.auditLog.create({ data: { operatorId: input.operatorId, organizationId: input.organizationId, actionType: 'PURCHASE_ORDER_CUSTOMER_WALLET', businessType: 'CUSTOMER_WALLET', businessId: wallet.id, beforeData: { balance: moneyToString(balanceBefore), orderNo: input.orderNo } as Prisma.InputJsonValue, afterData: { balance: moneyToString(balanceAfter), changeAmount: moneyToString(changeAmount), transactionNo: transaction.transactionNo } as Prisma.InputJsonValue, result: 'SUCCESS' } });
    return { idempotent: false, transaction: this.transactionView(transaction) };
  }

  async applyReceivePostingInTransaction(
    tx: Prisma.TransactionClient,
    input: { customerId: string; organizationId: string; receiveRecordId: string; receiveNo: string; walletCreditAmount: Prisma.Decimal; operatorId: string; remark?: string },
  ) {
    const wallet = await tx.customerWallet.findUnique({ where: { customerId_walletType: { customerId: input.customerId, walletType: CustomerWalletType.FINANCE_V } } });
    if (!wallet || wallet.organizationId !== input.organizationId) throw new BadRequestException('客户未配置财务V钱包');
    if (wallet.status !== AccountStatus.ACTIVE) throw new BadRequestException('客户财务V钱包已停用，不能入账');
    if (wallet.unit !== AccountUnit.CNY) throw new BadRequestException('财务V钱包必须使用CNY单位');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "customer_wallets" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`);
    const idempotencyKey = `RECEIVE_POSTING:${input.receiveRecordId}`;
    const existing = await tx.customerWalletTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return { idempotent: true, transaction: this.transactionView(existing) };
    const changeAmount = input.walletCreditAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (changeAmount.lte(0)) throw new BadRequestException('V钱包入账金额必须大于0');
    const balanceBefore = toMoney(wallet.cashBalance, '客户V钱包余额');
    const balanceAfter = balanceBefore.add(changeAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const transaction = await tx.customerWalletTransaction.create({ data: { transactionNo: this.generateTransactionNo(), walletId: wallet.id, unit: wallet.unit, businessType: CustomerWalletTransactionType.RECEIVE_POSTING, businessNo: input.receiveNo, changeAmount, balanceBefore, balanceAfter, operatorId: input.operatorId, remark: input.remark?.trim() || '收款入账进入客户财务V钱包', idempotencyKey } });
    await tx.customerWallet.update({ where: { id: wallet.id }, data: { cashBalance: balanceAfter } });
    return { idempotent: false, transaction: this.transactionView(transaction), walletId: wallet.id, balanceBefore, balanceAfter };
  }

  async applyReceiveRefundInTransaction(
    tx: Prisma.TransactionClient,
    input: { customerId: string; organizationId: string; receiveRecordId: string; refundNo: string; refundAmount: Prisma.Decimal; operatorId: string; idempotencyKey: string; remark?: string },
  ) {
    const wallet = await tx.customerWallet.findUnique({ where: { customerId_walletType: { customerId: input.customerId, walletType: CustomerWalletType.FINANCE_V } } });
    if (!wallet || wallet.organizationId !== input.organizationId) throw new BadRequestException('客户未配置财务V钱包');
    if (wallet.status !== AccountStatus.ACTIVE || wallet.unit !== AccountUnit.CNY) throw new BadRequestException('客户财务V钱包不可退款');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "customer_wallets" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`);
    const idempotencyKey = `RECEIVE_REFUND:${input.receiveRecordId}:${input.idempotencyKey}`;
    const existing = await tx.customerWalletTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return { idempotent: true, transaction: this.transactionView(existing) };
    const changeAmount = input.refundAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).negated();
    const balanceBefore = toMoney(wallet.cashBalance, '客户V钱包余额');
    const balanceAfter = balanceBefore.add(changeAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const transaction = await tx.customerWalletTransaction.create({ data: { transactionNo: this.generateTransactionNo(), walletId: wallet.id, unit: wallet.unit, businessType: CustomerWalletTransactionType.RECEIVE_REFUND, businessNo: input.refundNo, changeAmount, balanceBefore, balanceAfter, operatorId: input.operatorId, remark: input.remark?.trim() || '收款退款冲减客户财务V钱包', idempotencyKey } });
    await tx.customerWallet.update({ where: { id: wallet.id }, data: { cashBalance: balanceAfter } });
    return { idempotent: false, transaction: this.transactionView(transaction), walletId: wallet.id, balanceBefore, balanceAfter };
  }

  async syncGroupBalanceInTransaction(tx: Prisma.TransactionClient, customerId: string) {
    return;
  }

  private async createLedger(walletId: string, businessType: CustomerWalletTransactionType, changeAmount: Prisma.Decimal, dto: { businessNo?: string; idempotencyKey?: string; occurredAt?: string; remark?: string }, context: AccessContext, action: string) {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('发生时间格式不正确');
    return this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existing = await tx.customerWalletTransaction.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing) {
          if (existing.walletId !== walletId) throw new ConflictException('幂等键已经用于其他客户钱包');
          return { idempotent: true, transaction: this.transactionView(existing) };
        }
      }
      const wallet = await this.lockWallet(tx, walletId, context);
      this.assertActive(wallet.status);
      const balanceBefore = toMoney(wallet.cashBalance, '钱包当前余额');
      const balanceAfter = balanceBefore.add(changeAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const transactionNo = this.generateTransactionNo();
      const transaction = await tx.customerWalletTransaction.create({ data: { transactionNo, walletId, unit: wallet.unit, businessType, businessNo: dto.businessNo?.trim() || null, changeAmount: changeAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP), balanceBefore, balanceAfter, operatorId: context.sub, occurredAt, remark: dto.remark?.trim() || null, idempotencyKey: dto.idempotencyKey?.trim() || null } });
      const updated = await tx.customerWallet.update({ where: { id: walletId }, data: { cashBalance: balanceAfter } });
      await this.audit(tx, context, wallet.organizationId, walletId, action, { cashBalance: moneyToString(balanceBefore) }, { cashBalance: moneyToString(balanceAfter), transactionNo, changeAmount: moneyToString(changeAmount), businessType });
      return { idempotent: false, transaction: this.transactionView(transaction), wallet: this.walletView(updated, wallet.groupBalance) };
    });
  }

  private async getWallet(id: string, context: AccessContext) {
    const wallet = await this.prisma.customerWallet.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, customerCode: true, agentId: true } } } });
    if (!wallet) throw new NotFoundException('客户钱包不存在');
    await this.scope.assertOrganizationAccess(wallet.organizationId, context);
    return wallet;
  }

  private async lockWallet(tx: Prisma.TransactionClient, id: string, context: AccessContext) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "customer_wallets" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const wallet = await tx.customerWallet.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, customerCode: true, agentId: true } } } });
    if (!wallet) throw new NotFoundException('客户钱包不存在');
    await this.scope.assertOrganizationAccess(wallet.organizationId, context);
    return wallet;
  }

  private async getGroupBalances(customerIds: string[]) {
    return new Map<string, Prisma.Decimal>();
  }

  private walletView(row: any, groupBalance: Prisma.Decimal, customer?: any) {
    const currentGroup = row.walletType === CustomerWalletType.FINANCE_V ? new Prisma.Decimal(0) : groupBalance;
    const cashBalance = toMoney(row.cashBalance, '钱包现金余额');
    const totalBalance = cashBalance.add(currentGroup).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const creditAvailable = toMoney(row.creditLimit, '授信额度').sub(toMoney(row.creditUsed, '授信已使用金额')).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return { id: row.id, customerId: row.customerId, organizationId: row.organizationId, walletName: row.walletName, walletType: row.walletType, unit: row.unit, cashBalance: moneyToString(cashBalance), groupBalance: moneyToString(currentGroup), totalBalance: moneyToString(totalBalance), creditLimit: moneyToString(row.creditLimit), creditUsed: moneyToString(row.creditUsed), creditAvailable: moneyToString(creditAvailable), advanceOutstanding: moneyToString(row.advanceOutstanding), status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, customer: customer || row.customer };
  }

  private transactionView(row: any) { return { id: row.id, transactionNo: row.transactionNo, walletId: row.walletId, unit: row.unit, businessType: row.businessType, businessNo: row.businessNo, changeAmount: moneyToString(row.changeAmount), balanceBefore: moneyToString(row.balanceBefore), balanceAfter: moneyToString(row.balanceAfter), operatorId: row.operatorId, occurredAt: row.occurredAt, remark: row.remark }; }
  private promotionTransactionView(row: any) { return { id: row.id, transactionNo: row.transactionNo, walletId: null, promotionAccountId: row.promotionAccountId, unit: row.unit, businessType: row.businessType, businessNo: row.businessNo, changeAmount: moneyToString(row.changeAmount), balanceBefore: moneyToString(row.balanceBefore), balanceAfter: moneyToString(row.balanceAfter), operatorId: row.operatorId, occurredAt: row.occurredAt, remark: row.remark }; }
  private matchesComparison(value: Prisma.Decimal, operator?: WalletComparisonOperator, expected?: string) { if (!operator || expected === undefined) return true; const target = toMoney(expected, '筛选金额'); if (operator === WalletComparisonOperator.EQ) return value.eq(target); if (operator === WalletComparisonOperator.NE) return !value.eq(target); if (operator === WalletComparisonOperator.GT) return value.gt(target); if (operator === WalletComparisonOperator.GTE) return value.gte(target); if (operator === WalletComparisonOperator.LT) return value.lt(target); return value.lte(target); }
  private nonNegativeMoney(value: string, field: string) { const amount = toMoney(value, field); if (amount.lt(0)) throw new BadRequestException(`${field}不能为负数`); return amount; }
  private assertActive(status: AccountStatus) { if (status !== AccountStatus.ACTIVE) throw new BadRequestException('客户钱包已停用，不能进行新的余额操作'); }
  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作客户钱包' }); }
  private async audit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, resourceId: string, action: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'CUSTOMER_WALLET', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
  private generateTransactionNo() { return `CWTX${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
}
