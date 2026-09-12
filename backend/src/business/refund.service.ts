import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus, PurchasePaymentType, RefundStatus, TransactionBusinessType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { CashflowService } from '../cashflow/cashflow.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRefundDto, RefundQueryDto } from './business.dto';

const RESERVED_REFUND_STATUSES: RefundStatus[] = [RefundStatus.PENDING, RefundStatus.APPROVED, RefundStatus.REFUNDED];

@Injectable()
export class RefundService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService, private readonly cashflowService: CashflowService) {}

  async create(purchaseOrderId: string, dto: CreateRefundDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_REFUND_CREATE');
    const refundAmount = toMoney(dto.refundAmount, '退款金额');
    if (refundAmount.lte(0)) throw new BadRequestException('退款金额必须大于 0');

    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, purchaseOrderId, context);
      if (![PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.SETTLED].includes(order.status)) throw new ConflictException('订单必须已确认后才能申请退款');
      if (!order.customerId) throw new BadRequestException('订单未关联客户，无法申请退款');
      const paidAmount = await this.paidAmount(tx, purchaseOrderId);
      if (paidAmount.lte(0)) throw new ConflictException({ success: false, code: 'CUSTOMER_PAYMENT_REQUIRED', message: '客户尚未实际付款，不能申请退款' });

      const existing = await tx.refund.findUnique({ where: { purchaseOrderId_idempotencyKey: { purchaseOrderId, idempotencyKey: dto.idempotencyKey } } });
      if (existing) return { idempotent: true, ...this.view(existing, paidAmount, await this.reservedAmount(tx, purchaseOrderId), await this.refundedAmount(tx, purchaseOrderId)) };

      const reserved = await this.reservedAmount(tx, purchaseOrderId);
      const refundable = paidAmount.sub(reserved);
      if (refundAmount.gt(refundable)) throw new ConflictException({ success: false, code: 'REFUND_AMOUNT_EXCEEDED', message: `退款金额超过可退款金额 ${moneyToString(refundable)}` });
      const originalPayment = await tx.purchaseOrderPayment.findFirst({ where: { orderId: purchaseOrderId, paymentType: PurchasePaymentType.CUSTOMER_PAYMENT }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }] });
      if (!originalPayment) throw new ConflictException({ success: false, code: 'CUSTOMER_PAYMENT_REQUIRED', message: '未找到客户收款流水，不能申请退款' });

      const refund = await tx.refund.create({ data: { refundNo: this.generateRefundNo(), organizationId: order.organizationId, purchaseOrderId, customerId: order.customerId, originalPaymentId: originalPayment.id, refundAmount, refundReason: dto.refundReason.trim(), status: RefundStatus.PENDING, idempotencyKey: dto.idempotencyKey, applicantId: context.sub } });
      await this.writeAudit(tx, context, order.organizationId, 'REFUND_APPLY', refund.id, null, { refundNo: refund.refundNo, purchaseOrderId, refundAmount: moneyToString(refundAmount), status: refund.status });
      return { idempotent: false, ...this.view(refund, paidAmount, reserved.add(refundAmount), await this.refundedAmount(tx, purchaseOrderId)) };
    });
  }

  async approve(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_REFUND_APPROVE');
    return this.prisma.$transaction(async (tx) => {
      const refund = await this.lockRefund(tx, id, context);
      if ([RefundStatus.APPROVED, RefundStatus.REFUNDED].includes(refund.status)) return { idempotent: true, ...this.view(refund) };
      if (refund.status !== RefundStatus.PENDING) throw new ConflictException('该退款记录当前状态不允许审批');
      const updated = await tx.refund.update({ where: { id }, data: { status: RefundStatus.APPROVED, approvedBy: context.sub, approvedAt: new Date() } });
      await this.writeAudit(tx, context, refund.organizationId, 'REFUND_APPROVE', id, { status: refund.status }, { status: updated.status, approvedBy: context.sub });
      return { idempotent: false, ...this.view(updated) };
    });
  }

  async reject(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_REFUND_APPROVE');
    return this.prisma.$transaction(async (tx) => {
      const refund = await this.lockRefund(tx, id, context);
      if (refund.status === RefundStatus.REJECTED) return { idempotent: true, ...this.view(refund) };
      if (refund.status !== RefundStatus.PENDING) throw new ConflictException('该退款记录当前状态不允许驳回');
      const updated = await tx.refund.update({ where: { id }, data: { status: RefundStatus.REJECTED } });
      await this.writeAudit(tx, context, refund.organizationId, 'REFUND_REJECT', id, { status: refund.status }, { status: updated.status });
      return { idempotent: false, ...this.view(updated) };
    });
  }

  async execute(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_REFUND_APPROVE');
    return this.prisma.$transaction(async (tx) => {
      const refund = await this.lockRefund(tx, id, context);
      if (refund.status === RefundStatus.REFUNDED) return { idempotent: true, ...this.view(refund) };
      if (refund.status !== RefundStatus.APPROVED) throw new ConflictException('退款必须审批通过后才能执行');

      if (!refund.purchaseOrderId) throw new ConflictException('该退款记录属于收款入账退款，请使用收款退款流程');
      const order = await this.lockOrder(tx, refund.purchaseOrderId, context);
      if (!order.cashAccountId) throw new BadRequestException('订单未配置公司人民币资金账户');
      const account = await tx.account.findUnique({ where: { id: order.cashAccountId }, select: { id: true, currency: true, organizationId: true } });
      if (!account || account.organizationId !== order.organizationId) throw new ForbiddenException('退款目标资金账户不属于订单组织');
      if (account.currency !== 'CNY') throw new BadRequestException('客户退款只支持公司人民币资金账户');
      const paidAmount = await this.paidAmount(tx, order.id);
      const reserved = await this.reservedAmount(tx, order.id);
      if (reserved.gt(paidAmount)) throw new ConflictException({ success: false, code: 'REFUND_AMOUNT_EXCEEDED', message: '累计退款金额已超过客户实际付款金额' });

      const transaction = await this.cashflowService.createTransactionInTransaction(tx, { accountId: account.id, businessType: TransactionBusinessType.CUSTOMER_REFUND, businessNo: refund.refundNo, changeAmount: refund.refundAmount.neg(), operatorId: context.sub, occurredAt: new Date(), remark: `客户退款：${refund.refundReason}`, accessContext: context });
      const updated = await tx.refund.update({ where: { id }, data: { status: RefundStatus.REFUNDED, executedBy: context.sub, executedAt: new Date(), transactionNo: transaction.transactionNo } });
      await this.writeAudit(tx, context, refund.organizationId, 'REFUND_EXECUTE', id, { status: refund.status, refundAmount: moneyToString(refund.refundAmount) }, { status: updated.status, transactionNo: transaction.transactionNo, accountId: account.id });
      return { idempotent: false, ...this.view(updated), transactionNo: transaction.transactionNo, accountId: account.id, balanceBefore: transaction.balanceBefore, balanceAfter: transaction.balanceAfter };
    });
  }

  async list(query: RefundQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_REFUND_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.RefundWhereInput = { organizationId: organizationIds ? { in: organizationIds } : undefined, customerId: query.customerId, purchaseOrderId: query.purchaseOrderId, status: query.status, refundNo: query.refundNo, createdAt: query.startDate || query.endDate ? { gte: query.startDate ? this.parseDate(query.startDate, '开始时间格式不正确') : undefined, lte: query.endDate ? this.parseDate(query.endDate, '结束时间格式不正确') : undefined } : undefined };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({ where, orderBy: [{ createdAt: 'desc' }, { refundNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { purchaseOrder: { select: { orderNo: true } }, customer: { select: { name: true } } } }),
      this.prisma.refund.count({ where }),
    ]);
    return { items: items.map((item) => ({ ...this.view(item), procurementNo: item.purchaseOrder?.orderNo || null, customerName: item.customer.name })), total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_REFUND_VIEW');
    const refund = await this.prisma.refund.findUnique({ where: { id }, include: { purchaseOrder: { select: { orderNo: true, customerPaidAmount: true } }, customer: { select: { name: true } } } });
    if (!refund) throw new NotFoundException('退款记录不存在');
    await this.scope.assertOrganizationAccess(refund.organizationId, context);
    if (!refund.purchaseOrderId) return { ...this.view(refund), procurementNo: null, customerName: refund.customer.name };
    const paid = await this.paidAmount(this.prisma, refund.purchaseOrderId);
    const [reserved, refunded] = await Promise.all([this.reservedAmount(this.prisma, refund.purchaseOrderId), this.refundedAmount(this.prisma, refund.purchaseOrderId)]);
    return { ...this.view(refund, paid, reserved, refunded), procurementNo: refund.purchaseOrder?.orderNo || null, customerName: refund.customer.name };
  }

  async listByOrder(purchaseOrderId: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_REFUND_VIEW');
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { organizationId: true, customerPaidAmount: true } });
    if (!order) throw new NotFoundException('外采订单不存在');
    await this.scope.assertOrganizationAccess(order.organizationId, context);
    const [items, paid, reserved, refunded] = await Promise.all([
      this.prisma.refund.findMany({ where: { purchaseOrderId }, orderBy: [{ createdAt: 'desc' }, { refundNo: 'desc' }] }),
      this.paidAmount(this.prisma, purchaseOrderId),
      this.reservedAmount(this.prisma, purchaseOrderId),
      this.refundedAmount(this.prisma, purchaseOrderId),
    ]);
    return { items: items.map((item) => this.view(item)), total: items.length, paidAmount: moneyToString(paid), refundedAmount: moneyToString(refunded), refundableAmount: moneyToString(paid.sub(reserved)) };
  }

  private async lockRefund(tx: Prisma.TransactionClient, id: string, context: AccessContext) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "refunds" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const refund = await tx.refund.findUnique({ where: { id } });
    if (!refund) throw new NotFoundException('退款记录不存在');
    await this.scope.assertOrganizationAccess(refund.organizationId, context);
    return refund;
  }

  private async lockOrder(tx: Prisma.TransactionClient, id: string, context: AccessContext) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const order = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('外采订单不存在');
    await this.scope.assertOrganizationAccess(order.organizationId, context);
    return order;
  }

  private async reservedAmount(tx: Prisma.TransactionClient | PrismaService, purchaseOrderId: string) {
    const result = await tx.refund.aggregate({ where: { purchaseOrderId, status: { in: RESERVED_REFUND_STATUSES } }, _sum: { refundAmount: true } });
    return result._sum.refundAmount ?? new Prisma.Decimal(0);
  }

  private async refundedAmount(tx: Prisma.TransactionClient | PrismaService, purchaseOrderId: string) {
    const result = await tx.refund.aggregate({ where: { purchaseOrderId, status: RefundStatus.REFUNDED }, _sum: { refundAmount: true } });
    return result._sum.refundAmount ?? new Prisma.Decimal(0);
  }

  private async paidAmount(tx: Prisma.TransactionClient | PrismaService, purchaseOrderId: string) {
    const result = await tx.purchaseOrderPayment.aggregate({ where: { orderId: purchaseOrderId, paymentType: PurchasePaymentType.CUSTOMER_PAYMENT }, _sum: { amount: true } });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  private view(row: any, paidAmount?: Prisma.Decimal, reservedAmount?: Prisma.Decimal, refundedAmount?: Prisma.Decimal) {
    const paid = paidAmount ?? undefined;
    const reserved = reservedAmount ?? undefined;
    const refunded = refundedAmount ?? undefined;
    return { refundId: row.id, refundNo: row.refundNo, purchaseOrderId: row.purchaseOrderId, customerId: row.customerId, originalPaymentId: row.originalPaymentId, refundAmount: moneyToString(row.refundAmount), refundReason: row.refundReason, status: row.status, idempotencyKey: row.idempotencyKey, applicantId: row.applicantId, approvedBy: row.approvedBy, approvedAt: row.approvedAt, executedBy: row.executedBy, executedAt: row.executedAt, transactionNo: row.transactionNo, createdAt: row.createdAt, updatedAt: row.updatedAt, paidAmount: paid ? moneyToString(paid) : undefined, reservedRefundAmount: reserved ? moneyToString(reserved) : undefined, refundedAmount: refunded ? moneyToString(refunded) : undefined, refundableAmount: paid && reserved ? moneyToString(paid.sub(reserved)) : undefined };
  }

  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作退款业务' }); }
  private async writeAudit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, action: string, resourceId: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'REFUND', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
  private generateRefundNo() { const date = new Date().toISOString().slice(0, 10).replaceAll('-', ''); return `RF${date}${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`; }
  private parseDate(value: string, message: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException(message); return date; }
}
