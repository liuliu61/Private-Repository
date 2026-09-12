import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus, PurchasePaymentType, RefundStatus, SettlementStatus, SettlementType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateCustomerSettlementDto, GenerateSupplierSettlementDto, SettlementQueryDto } from './business.dto';

const ZERO = () => new Prisma.Decimal(0);

@Injectable()
export class SettlementCenterService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async generateCustomer(dto: GenerateCustomerSettlementDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SETTLEMENT_CREATE');
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, agentId: true, name: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    await this.assertOrganization(customer.agentId, context);
    const { start, end } = this.period(dto.periodStart, dto.periodEnd);
    return this.generate(SettlementType.CUSTOMER, customer.agentId, customer.id, undefined, start, end, context);
  }

  async generateSupplier(dto: GenerateSupplierSettlementDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SETTLEMENT_CREATE');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true, organizationId: true, name: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    await this.assertOrganization(supplier.organizationId, context);
    const { start, end } = this.period(dto.periodStart, dto.periodEnd);
    return this.generate(SettlementType.SUPPLIER, supplier.organizationId, undefined, supplier.id, start, end, context);
  }

  async list(type: SettlementType, query: SettlementQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SETTLEMENT_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.SettlementWhereInput = { settlementType: type, organizationId: organizationIds ? { in: organizationIds } : undefined, status: query.status, customerId: type === SettlementType.CUSTOMER ? query.customerId : undefined, supplierId: type === SettlementType.SUPPLIER ? query.supplierId : undefined, periodStart: query.periodStart ? { gte: this.parseDate(query.periodStart, '结算开始时间格式不正确') } : undefined, periodEnd: query.periodEnd ? { lte: this.parseDate(query.periodEnd, '结算结束时间格式不正确') } : undefined };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.settlement.findMany({ where, orderBy: [{ periodStart: 'desc' }, { settlementNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { customer: { select: { name: true } }, supplier: { select: { name: true } } } }),
      this.prisma.settlement.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async getById(type: SettlementType, id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SETTLEMENT_VIEW');
    const settlement = await this.prisma.settlement.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } }, items: { include: { order: { select: { id: true, orderNo: true, customerId: true, supplierId: true, businessTime: true } } }, orderBy: { createdAt: 'asc' } } } });
    if (!settlement || settlement.settlementType !== type) throw new NotFoundException('结算单不存在');
    await this.assertOrganization(settlement.organizationId, context);
    return { ...this.view(settlement), customer: settlement.customer, supplier: settlement.supplier, items: settlement.items.map((item) => ({ ...this.itemView(item), orderNo: item.order.orderNo, businessTime: item.order.businessTime })) };
  }

  async confirm(type: SettlementType, id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SETTLEMENT_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.lockSettlement(tx, type, id, context);
      if (settlement.status === SettlementStatus.CONFIRMED || settlement.status === SettlementStatus.SETTLED) return { idempotent: true, ...this.view(settlement) };
      if (settlement.status !== SettlementStatus.GENERATED) throw new ConflictException('当前结算单状态不允许确认');
      const conflict = await tx.settlementItem.findFirst({ where: { settlementType: type, settlementId: { not: id }, orderId: { in: (await tx.settlementItem.findMany({ where: { settlementId: id }, select: { orderId: true } })).map((item) => item.orderId) }, settlement: { status: { not: SettlementStatus.CANCELLED } } } });
      if (conflict) throw new ConflictException('存在已被其他结算单占用的订单，不能确认');
      const updated = await tx.settlement.update({ where: { id }, data: { status: SettlementStatus.CONFIRMED, confirmedBy: context.sub, confirmedAt: new Date() } });
      await this.writeAudit(tx, context, settlement.organizationId, 'SETTLEMENT_CONFIRM', id, { status: settlement.status }, { status: updated.status, settlementType: type });
      return { idempotent: false, ...this.view(updated) };
    });
  }

  async cancel(type: SettlementType, id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SETTLEMENT_CANCEL');
    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.lockSettlement(tx, type, id, context);
      if (settlement.status === SettlementStatus.CANCELLED) return { idempotent: true, ...this.view(settlement) };
      if (![SettlementStatus.DRAFT, SettlementStatus.GENERATED].includes(settlement.status)) throw new ConflictException('当前结算单状态不允许取消');
      const updated = await tx.settlement.update({ where: { id }, data: { status: SettlementStatus.CANCELLED } });
      await this.writeAudit(tx, context, settlement.organizationId, 'SETTLEMENT_CANCEL', id, { status: settlement.status }, { status: updated.status, settlementType: type });
      return { idempotent: false, ...this.view(updated) };
    });
  }

  private async generate(type: SettlementType, organizationId: string | null, customerId: string | undefined, supplierId: string | undefined, start: Date, end: Date, context: AccessContext) {
    if (!organizationId) throw new BadRequestException('结算主体尚未配置所属组织');
    const where: Prisma.SettlementWhereInput = { organizationId, settlementType: type, customerId, supplierId, periodStart: start, periodEnd: end };
    const existing = await this.prisma.settlement.findFirst({ where });
    if (existing) return { idempotent: true, ...this.view(existing) };

    try {
      return await this.prisma.$transaction(async (tx) => {
      const orders = await tx.purchaseOrder.findMany({ where: { organizationId, customerId, supplierId, status: PurchaseOrderStatus.CONFIRMED, businessTime: { gte: start, lt: end } }, orderBy: [{ businessTime: 'asc' }, { orderNo: 'asc' }] });
      if (orders.length === 0) throw new ConflictException('结算周期内没有可结算的已确认订单');
      const orderIds = orders.map((order) => order.id);
      const occupied = await tx.settlementItem.findFirst({ where: { settlementType: type, orderId: { in: orderIds }, settlement: { status: { not: SettlementStatus.CANCELLED } } } });
      if (occupied) throw new ConflictException('结算周期内存在已经进入其他结算单的订单');

      const refunds = await tx.refund.groupBy({ by: ['purchaseOrderId'], where: { purchaseOrderId: { in: orderIds }, status: RefundStatus.REFUNDED, executedAt: { gte: start, lt: end } }, _sum: { refundAmount: true } });
      const refundMap = new Map(refunds.map((row) => [row.purchaseOrderId, row._sum.refundAmount ?? ZERO()]));
      const payments = await tx.purchaseOrderPayment.groupBy({ by: ['orderId', 'paymentType'], where: { orderId: { in: orderIds }, occurredAt: { gte: start, lt: end } }, _sum: { amount: true } });
      const paidMap = new Map(payments.map((row) => [`${row.orderId}:${row.paymentType}`, row._sum.amount ?? ZERO()]));
      const isCustomer = type === SettlementType.CUSTOMER;
      const rows = orders.map((order) => {
        const cashAmount = (isCustomer ? order.customerCashAmount : order.supplierCashAmount) ?? ZERO();
        if ((isCustomer ? order.customerCashAmount : order.supplierCashAmount) === null) throw new ConflictException('存在金额快照不完整的订单，不能生成结算单');
        const creditAmount = isCustomer ? order.customerCreditedAmount : order.supplierCreditAmount ?? ZERO();
        const refundAmount = isCustomer ? refundMap.get(order.id) ?? ZERO() : ZERO();
        const paymentType = isCustomer ? PurchasePaymentType.CUSTOMER_PAYMENT : PurchasePaymentType.SUPPLIER_PAYMENT;
        const paidAmount = paidMap.get(`${order.id}:${paymentType}`) ?? ZERO();
        return { order, cashAmount, creditAmount, refundAmount, paidAmount };
      });
      const cash = rows.reduce((sum, row) => sum.add(row.cashAmount), ZERO());
      const credit = rows.reduce((sum, row) => sum.add(row.creditAmount), ZERO());
      const refundsTotal = rows.reduce((sum, row) => sum.add(row.refundAmount), ZERO());
      const paid = rows.reduce((sum, row) => sum.add(row.paidAmount), ZERO());
      const grossProfitValues = rows.map((row) => row.order.grossProfit);
      const grossProfit = grossProfitValues.every((value) => value !== null) ? grossProfitValues.reduce((sum, value) => sum.add(value ?? ZERO()), ZERO()) : null;
      const realizedProfit = grossProfit === null ? null : grossProfit.sub(isCustomer ? refundsTotal : ZERO());
      const settlement = await tx.settlement.create({ data: { settlementNo: this.generateNo(type), settlementType: type, organizationId, customerId, supplierId, periodStart: start, periodEnd: end, orderCount: rows.length, totalAmount: cash, totalRebate: refundsTotal, payableAmount: isCustomer ? cash.sub(refundsTotal) : cash, customerCashAmount: isCustomer ? cash : ZERO(), customerPaidAmount: isCustomer ? paid : ZERO(), customerRefundAmount: isCustomer ? refundsTotal : ZERO(), netCustomerCashAmount: isCustomer ? cash.sub(refundsTotal) : ZERO(), customerCreditAmount: isCustomer ? credit : ZERO(), supplierCashAmount: isCustomer ? ZERO() : cash, supplierPaidAmount: isCustomer ? ZERO() : paid, supplierCreditAmount: isCustomer ? ZERO() : credit, supplierPayable: isCustomer ? ZERO() : cash, grossProfit, realizedProfit, status: SettlementStatus.GENERATED, createdBy: context.sub, items: { create: rows.map((row) => ({ orderId: row.order.id, settlementType: type, customerId: row.order.customerId, supplierId: row.order.supplierId, amount: row.order.baseAmount, paymentAmount: row.cashAmount, rebateAmount: isCustomer ? row.order.customerRebateAmount ?? ZERO() : row.order.supplierRebateAmount ?? ZERO(), payableAmount: isCustomer ? row.cashAmount.sub(row.refundAmount) : row.cashAmount, baseAmount: row.order.baseAmount, cashAmount: row.cashAmount, creditAmount: row.creditAmount, refundAmount: row.refundAmount, grossProfit: row.order.grossProfit })) } }, include: { items: true } });
      await this.writeAudit(tx, context, organizationId, 'SETTLEMENT_GENERATE', settlement.id, null, { status: settlement.status, settlementType: type, orderCount: settlement.orderCount, periodStart: start.toISOString(), periodEnd: end.toISOString() });
        return { idempotent: false, ...this.view(settlement) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicated = await this.prisma.settlement.findFirst({ where });
        if (duplicated) return { idempotent: true, ...this.view(duplicated) };
      }
      throw error;
    }
  }

  private async lockSettlement(tx: Prisma.TransactionClient, type: SettlementType, id: string, context: AccessContext) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "settlements" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const settlement = await tx.settlement.findUnique({ where: { id } });
    if (!settlement || settlement.settlementType !== type) throw new NotFoundException('结算单不存在');
    await this.assertOrganization(settlement.organizationId, context);
    return settlement;
  }

  private view(row: any) { return { id: row.id, settlementNo: row.settlementNo, settlementType: row.settlementType, organizationId: row.organizationId, customerId: row.customerId, supplierId: row.supplierId, periodStart: row.periodStart, periodEnd: row.periodEnd, orderCount: row.orderCount, customerCashAmount: moneyToString(row.customerCashAmount ?? ZERO()), customerPaidAmount: moneyToString(row.customerPaidAmount ?? ZERO()), customerRefundAmount: moneyToString(row.customerRefundAmount ?? ZERO()), netCustomerCashAmount: moneyToString(row.netCustomerCashAmount ?? ZERO()), customerCreditAmount: moneyToString(row.customerCreditAmount ?? ZERO()), supplierCashAmount: moneyToString(row.supplierCashAmount ?? ZERO()), supplierPaidAmount: moneyToString(row.supplierPaidAmount ?? ZERO()), supplierCreditAmount: moneyToString(row.supplierCreditAmount ?? ZERO()), supplierPayable: moneyToString(row.supplierPayable ?? ZERO()), totalAmount: moneyToString(row.totalAmount ?? ZERO()), totalRebate: moneyToString(row.totalRebate ?? ZERO()), payableAmount: moneyToString(row.payableAmount ?? ZERO()), grossProfit: row.grossProfit === null || row.grossProfit === undefined ? null : moneyToString(row.grossProfit), realizedProfit: row.realizedProfit === null || row.realizedProfit === undefined ? null : moneyToString(row.realizedProfit), status: row.status, createdBy: row.createdBy, confirmedBy: row.confirmedBy, confirmedAt: row.confirmedAt, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  private itemView(row: any) { return { id: row.id, settlementId: row.settlementId, settlementType: row.settlementType, orderId: row.orderId, customerId: row.customerId, supplierId: row.supplierId, baseAmount: moneyToString(row.baseAmount ?? row.amount ?? ZERO()), cashAmount: moneyToString(row.cashAmount ?? row.paymentAmount ?? ZERO()), creditAmount: moneyToString(row.creditAmount ?? ZERO()), refundAmount: moneyToString(row.refundAmount ?? ZERO()), grossProfit: row.grossProfit === null || row.grossProfit === undefined ? null : moneyToString(row.grossProfit), paymentAmount: moneyToString(row.paymentAmount ?? ZERO()), payableAmount: moneyToString(row.payableAmount ?? ZERO()) };
  }

  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作结算业务' }); }
  private async assertOrganization(organizationId: string | null, context: AccessContext) { if (!organizationId) throw new ForbiddenException('数据未配置所属组织'); await this.scope.assertOrganizationAccess(organizationId, context); }
  private period(startValue: string, endValue: string) { const start = this.parseDate(startValue, '结算开始时间格式不正确'); const end = this.parseDate(endValue, '结算结束时间格式不正确'); if (!(start < end)) throw new BadRequestException('结算期间必须满足开始时间早于结束时间'); return { start, end }; }
  private parseDate(value: string, message: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException(message); return date; }
  private generateNo(type: SettlementType) { const prefix = type === SettlementType.CUSTOMER ? 'CS' : 'SS'; return `${prefix}${new Date().toISOString().slice(0, 10).replaceAll('-', '')}${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`; }
  private async writeAudit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, action: string, resourceId: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'SETTLEMENT', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
}
