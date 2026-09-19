import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProfitStatus, PurchasePaymentType, RefundStatus } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceCustomerQueryDto, FinanceDateQueryDto, FinanceOrderProfitQueryDto, FinanceSupplierQueryDto } from './finance-overview.dto';

const ZERO = () => new Prisma.Decimal(0);
const CNY = 'CNY';

@Injectable()
export class FinanceOverviewService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async getOverview(query: FinanceDateQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const organizationIds = await this.scope.getOrganizationIds(context);
    const now = new Date();
    const todayStart = this.shanghaiDayStart(now);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const monthStart = this.shanghaiMonthStart(now);
    const nextMonthStart = this.shanghaiNextMonthStart(now);
    const accounts = await this.prisma.account.findMany({ where: { currency: CNY, organizationId: organizationIds ? { in: organizationIds } : undefined }, select: { id: true, name: true, currentBalance: true, organizationId: true }, orderBy: { createdAt: 'desc' } });
    const transactions = accounts.length === 0 ? [] : await this.prisma.transaction.findMany({ where: { accountId: { in: accounts.map((account) => account.id) }, occurredAt: { gte: monthStart, lt: nextMonthStart } }, select: { accountId: true, changeAmount: true, occurredAt: true } });
    const rows = accounts.map((account) => {
      const related = transactions.filter((transaction) => transaction.accountId === account.id);
      const today = this.incomeExpense(related.filter((transaction) => transaction.occurredAt >= todayStart && transaction.occurredAt < tomorrowStart));
      const month = this.incomeExpense(related);
      return { accountId: account.id, accountName: account.name, currency: CNY, balance: moneyToString(account.currentBalance), todayIncome: moneyToString(today.income), todayExpense: moneyToString(today.expense), monthIncome: moneyToString(month.income), monthExpense: moneyToString(month.expense) };
    });
    const promotionAccounts = await this.prisma.promotionAccount.findMany({ where: { organizationId: organizationIds ? { in: organizationIds } : undefined, unit: 'ACCOUNT_CREDIT', status: 'ACTIVE' }, select: { id: true, accountName: true, unit: true, currentBalance: true }, orderBy: { createdAt: 'desc' } });
    const promotionTransactions = promotionAccounts.length === 0 ? [] : await this.prisma.promotionTransaction.findMany({ where: { promotionAccountId: { in: promotionAccounts.map((account) => account.id) } }, select: { promotionAccountId: true, changeAmount: true } });
    const promotionRows = promotionAccounts.map((account) => ({ accountId: account.id, accountName: account.accountName, unit: account.unit, balance: moneyToString(account.currentBalance), calculatedBalance: moneyToString(this.sum(promotionTransactions.filter((transaction) => transaction.promotionAccountId === account.id).map((transaction) => transaction.changeAmount))) }));
    await this.audit(context, 'FINANCE_OVERVIEW', { endpoint: 'overview', query: this.queryScope(query) });
    return { asOf: now, accounts: rows, promotionAccounts: promotionRows };
  }

  async getCustomer(customerId: string, query: FinanceCustomerQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, agentId: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    await this.assertOrganization(customer.agentId, context);
    const range = this.dateRange(query);
    const orders = await this.prisma.purchaseOrder.findMany({ where: { customerId, businessTime: range }, select: { customerCreditAmount: true, customerCreditedAmount: true, customerCashAmount: true, grossProfit: true } });
    const payments = await this.prisma.purchaseOrderPayment.findMany({ where: { order: { customerId }, paymentType: PurchasePaymentType.CUSTOMER_PAYMENT, occurredAt: range }, select: { amount: true } });
    const refunds = await this.prisma.refund.findMany({ where: { customerId, status: RefundStatus.REFUNDED, executedAt: range }, select: { refundAmount: true } });
    const accounts = await this.prisma.promotionAccount.findMany({ where: { customerId, unit: 'ACCOUNT_CREDIT', status: 'ACTIVE' }, select: { id: true, accountName: true, currentBalance: true } });
    const creditTransactions = accounts.length === 0 ? [] : await this.prisma.promotionTransaction.findMany({ where: { promotionAccountId: { in: accounts.map((account) => account.id) }, occurredAt: range }, select: { promotionAccountId: true, changeAmount: true } });
    const due = this.sum(orders.map((order) => order.customerCreditAmount));
    const credited = this.sum(orders.map((order) => order.customerCreditedAmount));
    const paid = this.sum(payments.map((payment) => payment.amount));
    const refunded = this.sum(refunds.map((refund) => refund.refundAmount));
    const realizedProfit = this.sum(orders.map((order) => order.grossProfit)).sub(refunded);
    const promotionAccounts = accounts.map((account) => ({ accountId: account.id, accountName: account.accountName, unit: 'ACCOUNT_CREDIT', balance: moneyToString(account.currentBalance), calculatedBalance: moneyToString(this.sum(creditTransactions.filter((transaction) => transaction.promotionAccountId === account.id).map((transaction) => transaction.changeAmount))) }));
    await this.audit(context, 'FINANCE_CUSTOMER_DETAIL', { endpoint: 'customer', customerId, query: this.queryScope(query) });
    return { customerId: customer.id, customerName: customer.name, currency: CNY, totalPaid: moneyToString(paid), totalRefund: moneyToString(refunded), netCollected: moneyToString(paid.sub(refunded)), realizedProfit: moneyToString(realizedProfit), creditDue: moneyToString(due), creditReceived: moneyToString(credited), creditRemaining: moneyToString(due.sub(credited)), promotionAccounts };
  }

  async getSupplier(supplierId: string, query: FinanceSupplierQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true, organizationId: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    await this.assertOrganization(supplier.organizationId, context);
    const range = this.dateRange(query);
    const payments = await this.prisma.purchaseOrderPayment.findMany({ where: { order: { supplierId }, paymentType: PurchasePaymentType.SUPPLIER_PAYMENT, occurredAt: range }, select: { amount: true } });
    const orders = await this.prisma.purchaseOrder.findMany({ where: { supplierId, businessTime: range }, select: { supplierCashAmount: true } });
    const accounts = await this.prisma.supplierAccount.findMany({ where: { supplierId }, select: { id: true, accountName: true, currency: true, currentBalance: true } });
    const creditAccounts = await this.prisma.promotionAccount.findMany({ where: { supplierId, unit: 'ACCOUNT_CREDIT', status: 'ACTIVE' }, select: { id: true, accountName: true, currentBalance: true } });
    const creditTransactions = creditAccounts.length === 0 ? [] : await this.prisma.promotionTransaction.findMany({ where: { promotionAccountId: { in: creditAccounts.map((account) => account.id) }, occurredAt: range }, select: { promotionAccountId: true, changeAmount: true } });
    const cnyAccounts = accounts.filter((account) => account.currency === CNY).map((account) => ({ accountId: account.id, accountName: account.accountName, unit: CNY, balance: moneyToString(account.currentBalance) }));
    const promotion = creditAccounts.map((account) => ({ accountId: account.id, accountName: account.accountName, unit: 'ACCOUNT_CREDIT', balance: moneyToString(account.currentBalance), totalReceived: moneyToString(this.sum(creditTransactions.filter((transaction) => transaction.promotionAccountId === account.id).map((transaction) => transaction.changeAmount))) }));
    await this.audit(context, 'FINANCE_SUPPLIER_DETAIL', { endpoint: 'supplier', supplierId, query: this.queryScope(query) });
    return { supplierId: supplier.id, supplierName: supplier.name, totalPaid: moneyToString(this.sum(payments.map((payment) => payment.amount))), totalCost: moneyToString(this.sum(orders.map((order) => order.supplierCashAmount))), cnyAccounts, creditAccounts: promotion };
  }

  async getOrderProfit(query: FinanceOrderProfitQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const organizationIds = await this.scope.getOrganizationIds(context);
    const range = this.dateRange(query);
    const profitStatus = query.profitStatus && query.profitStatus !== 'PENDING' ? (query.profitStatus as ProfitStatus) : undefined;
    const where: Prisma.PurchaseOrderWhereInput = { organizationId: organizationIds ? { in: organizationIds } : undefined, status: query.status, customerId: query.customerId, supplierId: query.supplierId, businessTime: range, profitStatus: query.profitStatus === 'PENDING' ? null : profitStatus };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({ where, orderBy: [{ businessTime: 'desc' }, { orderNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, orderNo: true, businessTime: true, customerCashAmount: true, supplierCashAmount: true, operatingFeeAmount: true, grossProfit: true, profitStatus: true, customerPolicyVersionId: true, supplierPolicyVersionId: true } }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    const refundRows = orders.length === 0 ? [] : await this.prisma.refund.groupBy({ by: ['purchaseOrderId'], where: { purchaseOrderId: { in: orders.map((order) => order.id) }, status: RefundStatus.REFUNDED }, _sum: { refundAmount: true } });
    const refundsByOrder = new Map(refundRows.map((row) => [row.purchaseOrderId, row._sum.refundAmount ?? ZERO()]));
    const items = orders.map((order) => {
      const refundedAmount = refundsByOrder.get(order.id) ?? ZERO();
      const realizedProfit = order.grossProfit === null ? null : order.grossProfit.sub(refundedAmount);
      const realizedProfitStatus = realizedProfit === null ? 'PENDING' : realizedProfit.gt(0) ? 'PROFIT' : realizedProfit.lt(0) ? 'LOSS' : 'BREAK_EVEN';
      return { id: order.id, procurementNo: order.orderNo, businessTime: order.businessTime, customerCashAmount: this.optionalMoney(order.customerCashAmount), supplierCashAmount: this.optionalMoney(order.supplierCashAmount), operatingFeeAmount: this.optionalMoney(order.operatingFeeAmount), grossProfit: this.optionalMoney(order.grossProfit), refundedAmount: moneyToString(refundedAmount), netCustomerCashAmount: order.customerCashAmount === null ? null : moneyToString(order.customerCashAmount.sub(refundedAmount)), realizedProfit: this.optionalMoney(realizedProfit), realizedProfitStatus, profitStatus: order.profitStatus ?? 'PENDING', customerPolicyVersionId: order.customerPolicyVersionId, supplierPolicyVersionId: order.supplierPolicyVersionId };
    });
    await this.audit(context, 'FINANCE_ORDER_PROFIT', { endpoint: 'orders/profit', query: this.queryScope(query) });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private incomeExpense(rows: Array<{ changeAmount: Prisma.Decimal }>) { return rows.reduce((result, row) => row.changeAmount.gte(0) ? { income: result.income.add(row.changeAmount), expense: result.expense } : { income: result.income, expense: result.expense.add(row.changeAmount.abs()) }, { income: ZERO(), expense: ZERO() }); }
  private sum(values: Array<Prisma.Decimal | null | undefined>): Prisma.Decimal { return values.reduce<Prisma.Decimal>((total, value) => total.add(value ?? ZERO()), ZERO()); }
  private optionalMoney(value: Prisma.Decimal | null | undefined) { return value === null || value === undefined ? null : moneyToString(value); }
  private dateRange(query: FinanceDateQueryDto): Prisma.DateTimeFilter | undefined { if (!query.startDate && !query.endDate) return undefined; return { gte: query.startDate ? new Date(query.startDate) : undefined, lt: query.endDate ? new Date(query.endDate) : undefined }; }
  private queryScope(query: FinanceDateQueryDto) { return { startDate: query.startDate ?? null, endDate: query.endDate ?? null }; }
  private shanghaiDayStart(date: Date) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {}); return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+08:00`); }
  private shanghaiMonthStart(date: Date) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {}); return new Date(`${parts.year}-${parts.month}-01T00:00:00+08:00`); }
  private shanghaiNextMonthStart(date: Date) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {}); const year = Number(parts.year); const month = Number(parts.month); const nextYear = month === 12 ? year + 1 : year; const nextMonth = month === 12 ? 1 : month + 1; return new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+08:00`); }
  private assertViewPermission(context: AccessContext) { if (!this.scope.isSuperAdmin(context) && !context.permissions.includes('FINANCE_VIEW')) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '没有财务查看权限' }); }
  private async assertOrganization(organizationId: string | null, context: AccessContext) { if (!organizationId) { if (!this.scope.isSuperAdmin(context)) throw new ForbiddenException('数据未配置所属组织'); return; } await this.scope.assertOrganizationAccess(organizationId, context); }
  private async audit(context: AccessContext, actionType: string, afterData: Record<string, unknown>) { await this.prisma.auditLog.create({ data: { operatorId: context.sub, actionType, businessType: 'FINANCE_QUERY', businessId: null, beforeData: undefined, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
}
