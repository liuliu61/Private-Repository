import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccountStatus, AccountUnit, Prisma, PromotionAccountUnit, PromotionTransactionBusinessType, TransactionBusinessType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountBalanceCheckView,
  AccountBalanceView,
  AccountAccessContext,
  AccountSummaryView,
  CreateTransactionInput,
  CreateSupplierAccountTransactionInput,
  CreatePromotionTransactionInput,
  PaginatedTransactionsView,
  TransactionQueryInput,
  TransactionView,
} from './cashflow.types';
import { moneyToString, toMoney } from './utils/money.util';
import { AccessScopeService } from '../common/access-scope.service';

@Injectable()
export class CashflowService {
  constructor(private readonly prisma: PrismaService, private readonly accessScope?: AccessScopeService) {}

  async createTransaction(input: CreateTransactionInput): Promise<TransactionView> {
    return this.prisma.$transaction((tx) => this.createTransactionInTransaction(tx, input));
  }

  async createTransactionInTransaction(tx: Prisma.TransactionClient, input: CreateTransactionInput): Promise<TransactionView> {
    if (input.accessContext && this.accessScope) await this.accessScope.assertAccountAccess(input.accountId, input.accessContext);
    const changeAmount = toMoney(input.changeAmount, '变动金额');
    if (changeAmount.isZero()) throw new BadRequestException('变动金额不能为 0');

    const accountRows = await tx.$queryRaw<Array<{ id: string; name: string; status: string; current_balance: Prisma.Decimal }>>(
      Prisma.sql`SELECT "id", "name", "status", "current_balance" FROM "accounts" WHERE "id" = ${input.accountId}::uuid FOR UPDATE`,
    );
    const account = accountRows[0];
    if (!account) throw new NotFoundException('资金账户不存在');
    if (account.status !== 'ACTIVE') throw new BadRequestException('资金账户已停用，不能创建流水');

    const balanceBefore = toMoney(account.current_balance, '账户当前余额');
    const balanceAfter = toMoney(balanceBefore.add(changeAmount), '账户变动后余额');
    const transactionNo = this.generateTransactionNo();

    const transaction = await tx.transaction.create({
      data: {
        transactionNo,
        accountId: input.accountId,
        businessType: input.businessType,
        businessNo: input.businessNo?.trim() || '',
        changeAmount,
        balanceBefore,
        balanceAfter,
        operatorId: input.operatorId,
        occurredAt: input.occurredAt,
        remark: input.remark?.trim() || null,
        adjustmentId: input.adjustmentId,
      },
    });

    await tx.account.update({
      where: { id: input.accountId },
      data: { currentBalance: balanceAfter },
    });

    return this.toTransactionView(transaction);
  }

  async createPromotionTransactionInTransaction(tx: Prisma.TransactionClient, input: CreatePromotionTransactionInput) {
    const changeAmount = toMoney(input.changeAmount, '推广账户变动金额');
    if (changeAmount.isZero()) throw new BadRequestException('推广账户变动金额不能为 0');
    const rows = await tx.$queryRaw<Array<{ id: string; unit: PromotionAccountUnit; status: AccountStatus; current_balance: Prisma.Decimal }>>(
      Prisma.sql`SELECT "id", "unit", "status", "current_balance" FROM "promotion_accounts" WHERE "id" = ${input.promotionAccountId}::uuid FOR UPDATE`,
    );
    const account = rows[0];
    if (!account) throw new NotFoundException('推广账户不存在');
    if (account.unit !== PromotionAccountUnit.ACCOUNT_CREDIT) throw new BadRequestException('推广账户单位不正确');
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能创建流水');
    const balanceBefore = toMoney(account.current_balance, '推广账户当前余额');
    const balanceAfter = toMoney(balanceBefore.add(changeAmount), '推广账户变动后余额');
    const transaction = await tx.promotionTransaction.create({ data: { transactionNo: this.generateTransactionNo(), promotionAccountId: input.promotionAccountId, unit: account.unit, businessType: input.businessType, businessNo: input.businessNo?.trim() || '', changeAmount, balanceBefore, balanceAfter, operatorId: input.operatorId, occurredAt: input.occurredAt, remark: input.remark?.trim() || null, adjustmentId: input.adjustmentId } });
    await tx.promotionAccount.update({ where: { id: input.promotionAccountId }, data: { currentBalance: balanceAfter } });
    return { id: transaction.id, transactionNo: transaction.transactionNo, promotionAccountId: transaction.promotionAccountId, businessType: transaction.businessType, businessNo: transaction.businessNo, changeAmount: moneyToString(transaction.changeAmount), balanceBefore: moneyToString(transaction.balanceBefore), balanceAfter: moneyToString(transaction.balanceAfter), occurredAt: transaction.occurredAt, operatorId: transaction.operatorId, remark: transaction.remark };
  }

  async createSupplierAccountTransactionInTransaction(tx: Prisma.TransactionClient, input: CreateSupplierAccountTransactionInput): Promise<TransactionView> {
    const changeAmount = toMoney(input.changeAmount, '供应商账户变动金额');
    if (changeAmount.isZero()) throw new BadRequestException('供应商账户变动金额不能为 0');

    const accountRows = await tx.$queryRaw<Array<{ id: string; status: string; currency: AccountUnit; current_balance: Prisma.Decimal }>>(
      Prisma.sql`SELECT "id", "status", "currency", "current_balance" FROM "supplier_accounts" WHERE "id" = ${input.supplierAccountId}::uuid FOR UPDATE`,
    );
    const account = accountRows[0];
    if (!account) throw new NotFoundException('一级代理商资金账户不存在');
    if (account.status !== 'ACTIVE') throw new BadRequestException('一级代理商资金账户已停用，不能创建流水');
    if (input.expectedUnit && account.currency !== input.expectedUnit) throw new BadRequestException(`一级代理商资金账户单位不匹配，要求为 ${input.expectedUnit}`);

    const balanceBefore = toMoney(account.current_balance, '供应商账户当前余额');
    const balanceAfter = toMoney(balanceBefore.add(changeAmount), '供应商账户变动后余额');
    const transaction = await tx.transaction.create({
      data: {
        transactionNo: this.generateTransactionNo(),
        supplierAccountId: input.supplierAccountId,
        businessType: input.businessType,
        businessNo: input.businessNo?.trim() || '',
        changeAmount,
        balanceBefore,
        balanceAfter,
        operatorId: input.operatorId,
        occurredAt: input.occurredAt,
        remark: input.remark?.trim() || null,
      },
    });
    await tx.supplierAccount.update({ where: { id: input.supplierAccountId }, data: { currentBalance: balanceAfter } });
    return this.toTransactionView(transaction);
  }

  async getTransactions(input: TransactionQueryInput = {}, accessContext: AccountAccessContext): Promise<PaginatedTransactionsView> {
    await this.assertAccountReadable(accessContext, input.accountId);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1) throw new BadRequestException('页码必须是大于等于 1 的整数');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException('每页数量必须是 1 到 100 之间的整数');

    const where: Prisma.TransactionWhereInput = {};
    if (input.accountId !== undefined) where.accountId = input.accountId;
    if (input.businessType !== undefined) where.businessType = input.businessType;
    if (input.businessNo !== undefined) where.businessNo = input.businessNo;
    if (input.transactionNo !== undefined) where.transactionNo = input.transactionNo;
    if (input.operatorId !== undefined) where.operatorId = input.operatorId;
    if (input.startDate !== undefined || input.endDate !== undefined) {
      if (input.startDate !== undefined && Number.isNaN(input.startDate.getTime())) throw new BadRequestException('开始时间格式不正确');
      if (input.endDate !== undefined && Number.isNaN(input.endDate.getTime())) throw new BadRequestException('结束时间格式不正确');
      const occurredAt: Prisma.DateTimeFilter = {};
      if (input.startDate !== undefined) occurredAt.gte = input.startDate;
      if (input.endDate !== undefined) occurredAt.lte = input.endDate;
      where.occurredAt = occurredAt;
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { transactionNo: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.transaction.count({ where }),
    ]);
    return { items: items.map((item) => this.toTransactionView(item)), total, page, pageSize };
  }

  async getAccountBalance(accountId: string, accessContext: AccountAccessContext): Promise<AccountBalanceView> {
    await this.assertAccountReadable(accessContext, accountId);
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true, currentBalance: true } });
    if (!account) throw new NotFoundException('资金账户不存在');
    return { accountId: account.id, currentBalance: moneyToString(account.currentBalance) };
  }

  private async assertAccountReadable(accessContext: AccountAccessContext, accountId?: string): Promise<void> {
    const isSuperAdmin = accessContext.roles.includes('SUPER_ADMIN');
    const hasSystemAccess = accessContext.permissions.includes('SYSTEM_ACCESS');
    if (!isSuperAdmin && !hasSystemAccess) throw new ForbiddenException('当前用户没有查看资金账户的权限');
    if (accountId && this.accessScope) await this.accessScope.assertAccountAccess(accountId, accessContext);
  }

  async recalculateAccountBalance(accountId: string, accessContext?: AccountAccessContext): Promise<AccountBalanceCheckView> {
    if (accessContext) await this.assertAccountReadable(accessContext, accountId);
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true, openingBalance: true, currentBalance: true } });
    if (!account) throw new NotFoundException('资金账户不存在');
    const aggregate = await this.prisma.transaction.aggregate({ where: { accountId }, _sum: { changeAmount: true } });
    const calculatedBalance = toMoney(account.openingBalance.add(aggregate._sum.changeAmount ?? new Prisma.Decimal(0)), '重新计算后的账户余额');
    const currentBalance = toMoney(account.currentBalance, '账户当前余额');
    const difference = toMoney(currentBalance.sub(calculatedBalance), '账户余额差额');
    return { accountId: account.id, currentBalance: moneyToString(currentBalance), calculatedBalance: moneyToString(calculatedBalance), difference: moneyToString(difference), consistent: difference.isZero() };
  }

  async getAccountSummary(accountId: string, startDate?: Date, endDate?: Date): Promise<AccountSummaryView> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true, name: true, currentBalance: true } });
    if (!account) throw new NotFoundException('资金账户不存在');
    const transactions = await this.prisma.transaction.findMany({ where: { accountId, occurredAt: startDate || endDate ? { gte: startDate, lte: endDate } : undefined }, select: { businessType: true, changeAmount: true } });
    const totals = new Map<TransactionBusinessType, Prisma.Decimal>();
    for (const transaction of transactions) totals.set(transaction.businessType, (totals.get(transaction.businessType) ?? new Prisma.Decimal(0)).add(transaction.changeAmount));
    const sum = (...types: TransactionBusinessType[]) => types.reduce((total, type) => total.add(totals.get(type) ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
    return {
      accountId: account.id,
      accountName: account.name,
      currentBalance: moneyToString(account.currentBalance),
      periodIncome: moneyToString(sum(TransactionBusinessType.RECEIPT, TransactionBusinessType.CUSTOMER_PAYMENT, TransactionBusinessType.RECHARGE)),
      periodExpense: moneyToString(sum(TransactionBusinessType.DEDUCTION, TransactionBusinessType.SUPPLIER_PAYMENT)),
      periodRebate: moneyToString(sum(TransactionBusinessType.REBATE)),
      periodRefund: moneyToString(sum(TransactionBusinessType.REFUND, TransactionBusinessType.CUSTOMER_REFUND)),
      periodAdjustment: moneyToString(sum(TransactionBusinessType.ADJUSTMENT)),
      periodOther: moneyToString(sum(TransactionBusinessType.OTHER)),
    };
  }

  private generateTransactionNo(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `TX${date}${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
  }

  private toTransactionView(transaction: { id: string; transactionNo: string; accountId: string | null; supplierAccountId: string | null; businessType: TransactionBusinessType; businessNo: string; changeAmount: Prisma.Decimal; balanceBefore: Prisma.Decimal; balanceAfter: Prisma.Decimal; occurredAt: Date; operatorId: string; remark: string | null; adjustmentId?: string | null }): TransactionView {
    return { id: transaction.id, transactionNo: transaction.transactionNo, accountId: transaction.accountId ?? null, supplierAccountId: transaction.supplierAccountId ?? null, businessType: transaction.businessType, businessNo: transaction.businessNo, changeAmount: moneyToString(transaction.changeAmount), balanceBefore: moneyToString(transaction.balanceBefore), balanceAfter: moneyToString(transaction.balanceAfter), occurredAt: transaction.occurredAt, operatorId: transaction.operatorId, remark: transaction.remark, adjustmentId: transaction.adjustmentId ?? null };
  }
}
