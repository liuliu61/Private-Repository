import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PromotionAccountUnit, PromotionTransactionBusinessType, PurchaseOrderStatus, ReconciliationStatus, RefundStatus, TransactionBusinessType } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateReconciliationDto, ReconciliationListQueryDto } from './business.dto';

const zero = () => new Prisma.Decimal(0);

@Injectable()
export class ReconciliationCenterService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async list(query: ReconciliationListQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECONCILIATION_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.ReconciliationWhereInput = {
      organizationId: organizationIds ? { in: organizationIds } : undefined,
      status: query.status,
      accountId: query.accountId,
      promotionAccountId: query.promotionAccountId,
      periodStart: query.periodStart ? { gte: this.parseDate(query.periodStart, '对账开始时间格式不正确') } : undefined,
      periodEnd: query.periodEnd ? { lte: this.parseDate(query.periodEnd, '对账结束时间格式不正确') } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reconciliation.findMany({ where, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { account: { select: { id: true, name: true, currency: true } }, promotionAccount: { select: { id: true, accountName: true, unit: true } } } }),
      this.prisma.reconciliation.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECONCILIATION_VIEW');
    const row = await this.prisma.reconciliation.findUnique({ where: { id }, include: { account: { select: { id: true, name: true, currency: true } }, promotionAccount: { select: { id: true, accountName: true, unit: true } } } });
    if (!row) throw new NotFoundException('对账记录不存在');
    await this.assertOrganization(row.organizationId, context);
    return this.view(row);
  }

  async generate(dto: GenerateReconciliationDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECONCILIATION_CREATE');
    if ((dto.accountId ? 1 : 0) + (dto.promotionAccountId ? 1 : 0) !== 1) throw new BadRequestException('资金账户和推广账户必须且只能选择一个');
    const { start, end } = this.period(dto.periodStart, dto.periodEnd);
    const target = await this.resolveTarget(dto, context);
    const where = { organizationId: target.organizationId, accountId: target.accountId, promotionAccountId: target.promotionAccountId, periodStart: start, periodEnd: end };
    const existing = await this.prisma.reconciliation.findFirst({ where });
    if (existing) return { idempotent: true, ...this.view(existing) };
    const snapshot = await this.calculate(target, start, end);
    try {
      return await this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.reconciliation.findFirst({ where });
      if (duplicate) return { idempotent: true, ...this.view(duplicate) };
      const row = await tx.reconciliation.create({ data: { organizationId: target.organizationId, accountId: target.accountId, promotionAccountId: target.promotionAccountId, periodStart: start, periodEnd: end, openingBalance: snapshot.openingBalance, incomeAmount: snapshot.incomeAmount, expenseAmount: snapshot.expenseAmount, refundAmount: snapshot.refundAmount, adjustmentAmount: snapshot.adjustmentAmount, calculatedBalance: snapshot.calculatedBalance, systemBalance: snapshot.systemBalance, totalReceipt: snapshot.incomeAmount, totalExpense: snapshot.expenseAmount, totalRefund: snapshot.refundAmount, totalAdjustment: snapshot.adjustmentAmount, systemClosingBalance: snapshot.calculatedBalance, difference: snapshot.difference, profitAnomalyCount: snapshot.profitAnomalies.length, profitAnomalies: snapshot.profitAnomalies as Prisma.InputJsonValue, status: ReconciliationStatus.DRAFT, createdBy: context.sub }, include: { account: { select: { id: true, name: true, currency: true } }, promotionAccount: { select: { id: true, accountName: true, unit: true } } } });
      await this.audit(tx, context, target.organizationId, row.id, 'RECONCILIATION_GENERATE', null, { status: row.status, accountId: target.accountId, promotionAccountId: target.promotionAccountId });
      return { idempotent: false, ...this.view(row) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.reconciliation.findFirst({ where });
        if (duplicate) return { idempotent: true, ...this.view(duplicate) };
      }
      throw error;
    }
  }

  async check(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECONCILIATION_CREATE');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === ReconciliationStatus.CONFIRMED) throw new ConflictException('已确认的对账记录禁止重新检查');
      const checkableStatuses: ReconciliationStatus[] = [ReconciliationStatus.DRAFT, ReconciliationStatus.FAILED];
      if (!checkableStatuses.includes(row.status)) throw new ConflictException('当前对账状态不允许检查');
      await tx.reconciliation.update({ where: { id }, data: { status: ReconciliationStatus.CHECKING } });
      const snapshot = await this.calculate({ organizationId: row.organizationId, accountId: row.accountId, promotionAccountId: row.promotionAccountId }, row.periodStart, row.periodEnd, tx);
      const status = snapshot.difference.isZero() && snapshot.profitAnomalies.length === 0 ? ReconciliationStatus.PASSED : ReconciliationStatus.FAILED;
      const updated = await tx.reconciliation.update({ where: { id }, data: { status, openingBalance: snapshot.openingBalance, incomeAmount: snapshot.incomeAmount, expenseAmount: snapshot.expenseAmount, refundAmount: snapshot.refundAmount, adjustmentAmount: snapshot.adjustmentAmount, calculatedBalance: snapshot.calculatedBalance, systemBalance: snapshot.systemBalance, totalReceipt: snapshot.incomeAmount, totalExpense: snapshot.expenseAmount, totalRefund: snapshot.refundAmount, totalAdjustment: snapshot.adjustmentAmount, systemClosingBalance: snapshot.calculatedBalance, difference: snapshot.difference, profitAnomalyCount: snapshot.profitAnomalies.length, profitAnomalies: snapshot.profitAnomalies as Prisma.InputJsonValue } });
      await this.audit(tx, context, row.organizationId, id, 'RECONCILIATION_CHECK', { status: row.status }, { status, difference: moneyToString(snapshot.difference), profitAnomalyCount: snapshot.profitAnomalies.length });
      return { idempotent: false, ...this.view(updated) };
    });
  }

  async confirm(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECONCILIATION_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === ReconciliationStatus.CONFIRMED) return { idempotent: true, ...this.view(row) };
      if (row.status !== ReconciliationStatus.PASSED) throw new ConflictException('只有通过检查的对账记录才能确认');
      const updated = await tx.reconciliation.update({ where: { id }, data: { status: ReconciliationStatus.CONFIRMED, confirmedBy: context.sub, confirmedAt: new Date() } });
      await this.audit(tx, context, row.organizationId, id, 'RECONCILIATION_CONFIRM', { status: row.status }, { status: updated.status });
      return { idempotent: false, ...this.view(updated) };
    });
  }

  private async resolveTarget(dto: GenerateReconciliationDto, context: AccessContext) {
    if (dto.accountId) {
      const account = await this.prisma.account.findUnique({ where: { id: dto.accountId }, select: { id: true, organizationId: true, currency: true } });
      if (!account) throw new NotFoundException('资金账户不存在');
      if (account.currency !== 'CNY') throw new BadRequestException('该账户不是CNY账户，不能进行CNY对账');
      await this.assertOrganization(account.organizationId, context);
      if (!account.organizationId) throw new ForbiddenException('资金账户尚未配置所属组织');
      return { organizationId: account.organizationId, accountId: account.id, promotionAccountId: null };
    }
    const account = await this.prisma.promotionAccount.findUnique({ where: { id: dto.promotionAccountId! }, select: { id: true, organizationId: true, unit: true } });
    if (!account) throw new NotFoundException('推广账户不存在');
    if (account.unit !== PromotionAccountUnit.ACCOUNT_CREDIT) throw new BadRequestException('该推广账户不是ACCOUNT_CREDIT账户');
    await this.assertOrganization(account.organizationId, context);
    return { organizationId: account.organizationId, accountId: null, promotionAccountId: account.id };
  }

  private async calculate(target: { organizationId: string | null; accountId: string | null; promotionAccountId: string | null }, start: Date, end: Date, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const rows: any[] = target.accountId
      ? await client.transaction.findMany({ where: { accountId: target.accountId }, select: { businessType: true, changeAmount: true, occurredAt: true } })
      : await client.promotionTransaction.findMany({ where: { promotionAccountId: target.promotionAccountId! }, select: { businessType: true, changeAmount: true, occurredAt: true } });
    const before = rows.filter((row) => row.occurredAt < start).reduce((sum, row) => sum.add(row.changeAmount), zero());
    const periodRows = rows.filter((row) => row.occurredAt >= start && row.occurredAt < end);
    const account = target.accountId ? await client.account.findUnique({ where: { id: target.accountId }, select: { openingBalance: true, currentBalance: true } }) : await client.promotionAccount.findUnique({ where: { id: target.promotionAccountId! }, select: { currentBalance: true } });
    if (!account) throw new NotFoundException(target.accountId ? '资金账户不存在' : '推广账户不存在');
    const openingBalance = (account as any).openingBalance ? (account as any).openingBalance.add(before) : before;
    const periodChange = periodRows.reduce((sum, row) => sum.add(row.changeAmount), zero());
    const calculatedBalance = openingBalance.add(periodChange).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const systemBalance = (account as any).currentBalance.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const difference = systemBalance.sub(calculatedBalance).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const totals = this.totals(periodRows, Boolean(target.accountId));
    const profitAnomalies = target.accountId ? await this.profitAnomalies(target.organizationId, start, end, client) : [];
    return { openingBalance, incomeAmount: totals.incomeAmount, expenseAmount: totals.expenseAmount, refundAmount: totals.refundAmount, adjustmentAmount: totals.adjustmentAmount, calculatedBalance, systemBalance, difference, profitAnomalies };
  }

  private totals(rows: any[], cny: boolean) {
    const incomeTypes: Array<TransactionBusinessType | PromotionTransactionBusinessType> = cny ? [TransactionBusinessType.RECEIPT, TransactionBusinessType.CUSTOMER_PAYMENT, TransactionBusinessType.RECHARGE, TransactionBusinessType.REBATE] : [PromotionTransactionBusinessType.CUSTOMER_CREDIT, PromotionTransactionBusinessType.SUPPLIER_CREDIT];
    const expenseTypes: TransactionBusinessType[] = cny ? [TransactionBusinessType.DEDUCTION, TransactionBusinessType.SUPPLIER_PAYMENT] : [];
    const incomeAmount = rows.filter((row) => incomeTypes.includes(row.businessType) && row.changeAmount.gt(0)).reduce((sum, row) => sum.add(row.changeAmount), zero());
    const expenseAmount = rows.filter((row) => expenseTypes.includes(row.businessType) && row.changeAmount.lt(0)).reduce((sum, row) => sum.add(row.changeAmount.abs()), zero());
    const refundTypes = cny ? [TransactionBusinessType.REFUND, TransactionBusinessType.CUSTOMER_REFUND] : [];
    const refundAmount = rows.filter((row) => refundTypes.includes(row.businessType)).reduce((sum, row) => sum.add(row.changeAmount.abs()), zero());
    const adjustmentAmount = rows.filter((row) => row.businessType === TransactionBusinessType.ADJUSTMENT || row.businessType === PromotionTransactionBusinessType.ADJUSTMENT).reduce((sum, row) => sum.add(row.changeAmount.abs()), zero());
    return { incomeAmount, expenseAmount, refundAmount, adjustmentAmount };
  }

  private async profitAnomalies(organizationId: string | null, start: Date, end: Date, client: PrismaService | Prisma.TransactionClient) {
    if (!organizationId) return [];
    const orders = await client.purchaseOrder.findMany({ where: { organizationId, status: { in: [PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.SETTLED] }, businessTime: { gte: start, lt: end } }, select: { id: true, orderNo: true, customerCashAmount: true, supplierCashAmount: true, operatingFeeAmount: true, grossProfit: true } });
    const refunds = await client.refund.groupBy({ by: ['purchaseOrderId'], where: { purchaseOrderId: { in: orders.map((order) => order.id) }, status: RefundStatus.REFUNDED, executedAt: { gte: start, lt: end } }, _sum: { refundAmount: true } });
    const refundMap = new Map(refunds.map((row) => [row.purchaseOrderId, row._sum.refundAmount ?? zero()]));
    return orders.flatMap((order) => {
      if (order.customerCashAmount === null || order.supplierCashAmount === null || order.grossProfit === null) return [{ orderNo: order.orderNo, code: 'PROFIT_SNAPSHOT_INCOMPLETE' }];
      const expected = order.customerCashAmount.sub(order.supplierCashAmount).sub(refundMap.get(order.id) ?? zero()).sub(order.operatingFeeAmount ?? zero()).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return expected.eq(order.grossProfit) ? [] : [{ orderNo: order.orderNo, code: 'PROFIT_SNAPSHOT_MISMATCH', expectedRealizedProfit: moneyToString(expected), storedGrossProfit: moneyToString(order.grossProfit) }];
    });
  }

  private async lock(tx: Prisma.TransactionClient, id: string, context: AccessContext) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "reconciliations" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const row = await tx.reconciliation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('对账记录不存在');
    await this.assertOrganization(row.organizationId, context);
    return row;
  }

  private async assertOrganization(organizationId: string | null, context: AccessContext) { if (!organizationId) throw new ForbiddenException('对账记录尚未配置所属组织'); await this.scope.assertOrganizationAccess(organizationId, context); }
  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作财务对账' }); }
  private period(startValue: string, endValue: string) { const start = this.parseDate(startValue, '对账开始时间格式不正确'); const end = this.parseDate(endValue, '对账结束时间格式不正确'); if (!(start < end)) throw new BadRequestException('对账期间必须满足开始时间早于结束时间'); return { start, end }; }
  private parseDate(value: string, message: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException(message); return date; }
  private view(row: any) { return { ...row, openingBalance: moneyToString(row.openingBalance), incomeAmount: moneyToString(row.incomeAmount ?? zero()), expenseAmount: moneyToString(row.expenseAmount ?? zero()), refundAmount: moneyToString(row.refundAmount ?? zero()), adjustmentAmount: moneyToString(row.adjustmentAmount ?? zero()), calculatedBalance: row.calculatedBalance === null || row.calculatedBalance === undefined ? null : moneyToString(row.calculatedBalance), systemBalance: row.systemBalance === null || row.systemBalance === undefined ? null : moneyToString(row.systemBalance), difference: row.difference === null || row.difference === undefined ? null : moneyToString(row.difference), totalReceipt: moneyToString(row.totalReceipt ?? zero()), totalExpense: moneyToString(row.totalExpense ?? zero()), totalRefund: moneyToString(row.totalRefund ?? zero()), totalAdjustment: moneyToString(row.totalAdjustment ?? zero()), systemClosingBalance: moneyToString(row.systemClosingBalance ?? zero()), actualClosingBalance: row.actualClosingBalance === null || row.actualClosingBalance === undefined ? null : moneyToString(row.actualClosingBalance), profitAnomalyCount: row.profitAnomalyCount ?? 0, profitAnomalies: row.profitAnomalies ?? [] };
  }
  private async audit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string | null, resourceId: string, action: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'RECONCILIATION', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
}
