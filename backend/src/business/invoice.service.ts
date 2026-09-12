import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma, PurchaseOrderStatus, ReceiveInvoiceStatus, ReceiveRecordStatus, RefundStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto, InvoiceQueryDto, InvoiceVoidDto, UpdateInvoiceDraftDto } from './business.dto';

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async list(query: InvoiceQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where = this.invoiceWhere(query, organizationIds);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, include: { customer: { select: { id: true, name: true, customerCode: true } }, purchaseOrder: { select: { id: true, orderNo: true } }, receiveRecord: { select: { id: true, receiveNo: true } }, account: { select: { id: true, name: true, accountCode: true } }, creator: { select: { id: true, displayName: true } } }, orderBy: [{ createdAt: 'desc' }, { invoiceNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), total, page: query.page, pageSize: query.pageSize, summary: await this.summary(query, organizationIds) };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const row = await this.prisma.invoice.findUnique({ where: { id }, include: { customer: true, purchaseOrder: { select: { id: true, orderNo: true, amount: true, customerCashAmount: true, customerReceivable: true, status: true } }, receiveRecord: { select: { id: true, receiveNo: true, amount: true, status: true } }, account: true, creator: { select: { id: true, displayName: true } }, confirmer: { select: { id: true, displayName: true } }, voider: { select: { id: true, displayName: true } } } });
    if (!row) throw new NotFoundException('发票记录不存在');
    await this.scope.assertOrganizationAccess(row.organizationId, context);
    const logs = await this.prisma.auditLog.findMany({ where: { businessType: 'INVOICE', businessId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, actionType: true, beforeData: true, afterData: true, operatorId: true, createdAt: true } });
    return { ...this.view(row), auditLogs: logs };
  }

  async create(dto: CreateInvoiceDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CREATE');
    return this.prisma.$transaction(async (tx) => {
      if (dto.clientRequestId) {
        const existing = await tx.invoice.findUnique({ where: { clientRequestId: dto.clientRequestId } });
        if (existing) {
          await this.scope.assertOrganizationAccess(existing.organizationId, context);
          return { idempotent: true, invoice: this.view(existing) };
        }
      }
      const source = await this.resolveSource(tx, dto, context);
      const amount = toMoney(dto.amount, '开票金额');
      await this.assertAmountAvailable(tx, source, amount, context);
      const row = await tx.invoice.create({ data: { invoiceNo: this.generateInvoiceNo(), invoiceNumber: dto.invoiceNumber?.trim() || null, organizationId: source.organizationId, customerId: source.customerId, purchaseOrderId: source.purchaseOrderId, receiveRecordId: source.receiveRecordId, accountId: source.accountId, businessNo: source.businessNo, amount, currency: source.currency, invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null, invoiceType: dto.invoiceType?.trim() || null, invoiceTitle: dto.invoiceTitle?.trim() || null, taxNumber: dto.taxNumber?.trim() || null, invoiceContent: dto.invoiceContent?.trim() || null, issuingEntity: dto.issuingEntity?.trim() || null, contractNo: dto.contractNo?.trim() || null, invoiceNature: dto.invoiceNature?.trim() || null, redFlushStatus: dto.redFlushStatus?.trim() || null, recipientEmail: dto.recipientEmail?.trim() || null, status: InvoiceStatus.DRAFT, clientRequestId: dto.clientRequestId?.trim() || null, createdBy: context.sub, remark: dto.remark?.trim() || null } });
      await this.audit(tx, context, row.organizationId, row.id, 'INVOICE_CREATE', null, { invoiceNo: row.invoiceNo, amount: moneyToString(amount), businessNo: row.businessNo, status: row.status });
      return { idempotent: false, invoice: this.view(row) };
    });
  }

  async updateDraft(id: string, dto: UpdateInvoiceDraftDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_EDIT');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status !== InvoiceStatus.DRAFT) throw new ConflictException('只有草稿发票允许修改');
      const updated = await tx.invoice.update({ where: { id }, data: { invoiceNumber: dto.invoiceNumber?.trim(), invoiceType: dto.invoiceType?.trim(), invoiceTitle: dto.invoiceTitle?.trim(), taxNumber: dto.taxNumber?.trim(), invoiceContent: dto.invoiceContent?.trim(), issuingEntity: dto.issuingEntity?.trim(), contractNo: dto.contractNo?.trim(), invoiceNature: dto.invoiceNature?.trim(), redFlushStatus: dto.redFlushStatus?.trim(), recipientEmail: dto.recipientEmail?.trim(), remark: dto.remark?.trim() } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_UPDATE', { status: row.status }, { status: updated.status });
      return { invoice: this.view(updated) };
    });
  }

  async confirm(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.ISSUED) return { idempotent: true, invoice: this.view(row) };
      if (![InvoiceStatus.DRAFT, InvoiceStatus.PROCESSING].includes(row.status)) throw new ConflictException('当前发票状态不允许确认开票');
      const source = await this.resolveExistingSource(tx, row, context);
      await this.assertAmountAvailable(tx, source, row.amount, context, row.id);
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.ISSUED, confirmedBy: context.sub, confirmedAt: new Date(), invoiceDate: row.invoiceDate || new Date() } });
      if (row.receiveRecordId) await this.syncReceiveInvoiceStatus(tx, row.receiveRecordId);
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_CONFIRM', { status: row.status }, { status: updated.status, amount: moneyToString(row.amount) });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async process(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.PROCESSING) return { idempotent: true, invoice: this.view(row) };
      if (row.status !== InvoiceStatus.DRAFT) throw new ConflictException('只有草稿发票可以提交开票');
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.PROCESSING } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_PROCESS', { status: row.status }, { status: updated.status });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async voidInvoice(id: string, dto: InvoiceVoidDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VOID');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.VOIDED) return { idempotent: true, invoice: this.view(row) };
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.VOIDED, voidedBy: context.sub, voidedAt: new Date(), voidReason: dto.reason?.trim() || null } });
      if (row.receiveRecordId) await this.syncReceiveInvoiceStatus(tx, row.receiveRecordId);
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_VOID', { status: row.status }, { status: updated.status, reason: updated.voidReason });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async getCustomerBalance(customerId: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, customerCode: true, agentId: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    if (customer.agentId) await this.scope.assertOrganizationAccess(customer.agentId, context);
    return this.calculateCustomerBalance(customerId, customer.agentId || undefined);
  }

  private async summary(query: InvoiceQueryDto, organizationIds?: string[]) {
    const balances = await this.calculateCustomerBalance(query.customerId, organizationIds?.length === 1 ? organizationIds[0] : undefined, { startDate: query.startDate, endDate: query.endDate });
    const where = this.invoiceWhere(query, organizationIds);
    const groups = await this.prisma.invoice.groupBy({ by: ['status'], where, _sum: { amount: true } });
    const grouped = groups.reduce((result, item) => { result[item.status] = item._sum.amount || new Prisma.Decimal(0); return result; }, {} as Record<string, Prisma.Decimal>);
    return { sourceAmount: balances.sourceAmount, invoicedAmount: balances.invoicedAmount, uninvoicedAmount: balances.uninvoicedAmount, processingAmount: grouped[InvoiceStatus.PROCESSING]?.toFixed(2) || '0.00', issuedAmount: grouped[InvoiceStatus.ISSUED]?.toFixed(2) || '0.00' };
  }

  private async calculateCustomerBalance(customerId?: string, organizationId?: string, period?: { startDate?: string; endDate?: string }) {
    const orderWhere: Prisma.PurchaseOrderWhereInput = { customerId, organizationId, status: { in: [PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.SETTLED, PurchaseOrderStatus.COMPLETED] }, businessTime: { gte: period?.startDate ? new Date(period.startDate) : undefined, lt: period?.endDate ? new Date(period.endDate) : undefined } };
    const orders = await this.prisma.purchaseOrder.findMany({ where: orderWhere, select: { id: true, customerCashAmount: true, customerReceivable: true, baseAmount: true } });
    const orderIds = orders.map((item) => item.id);
    const refunds = orderIds.length ? await this.prisma.refund.groupBy({ by: ['purchaseOrderId'], where: { purchaseOrderId: { in: orderIds }, status: RefundStatus.REFUNDED }, _sum: { refundAmount: true } }) : [];
    const refundMap = new Map(refunds.map((item) => [item.purchaseOrderId, item._sum.refundAmount || new Prisma.Decimal(0)]));
    const standaloneReceives = await this.prisma.receiveRecord.findMany({ where: { customerId, purchaseOrderId: null, status: ReceiveRecordStatus.CONFIRMED, organizationId, receivedAt: { gte: period?.startDate ? new Date(period.startDate) : undefined, lt: period?.endDate ? new Date(period.endDate) : undefined } }, select: { id: true, invoiceEligibleAmount: true, amount: true } });
    const sourceAmount = orders.reduce((sum, order) => sum.add(order.customerCashAmount || order.customerReceivable || order.baseAmount).sub(refundMap.get(order.id) || new Prisma.Decimal(0)), new Prisma.Decimal(0)).add(standaloneReceives.reduce((sum, item) => sum.add(item.invoiceEligibleAmount ?? item.amount), new Prisma.Decimal(0)));
    const invoices = await this.prisma.invoice.aggregate({ where: { customerId, organizationId, status: { not: InvoiceStatus.VOIDED }, createdAt: { gte: period?.startDate ? new Date(period.startDate) : undefined, lt: period?.endDate ? new Date(period.endDate) : undefined } }, _sum: { amount: true } });
    const invoicedAmount = invoices._sum.amount || new Prisma.Decimal(0);
    const uninvoicedAmount = sourceAmount.sub(invoicedAmount);
    return { customerId, sourceAmount: moneyToString(sourceAmount), invoicedAmount: moneyToString(invoicedAmount), uninvoicedAmount: moneyToString(uninvoicedAmount.isNegative() ? new Prisma.Decimal(0) : uninvoicedAmount) };
  }

  private invoiceWhere(query: InvoiceQueryDto, organizationIds?: string[]): Prisma.InvoiceWhereInput {
    return { organizationId: organizationIds ? { in: organizationIds } : undefined, customerId: query.customerId, accountId: query.accountId, status: query.status, invoiceNo: query.invoiceNo, invoiceNumber: query.invoiceNumber, businessNo: query.businessNo, OR: query.keyword ? [{ invoiceNo: { contains: query.keyword, mode: 'insensitive' } }, { invoiceNumber: { contains: query.keyword, mode: 'insensitive' } }, { businessNo: { contains: query.keyword, mode: 'insensitive' } }, { invoiceTitle: { contains: query.keyword, mode: 'insensitive' } }] : undefined, createdAt: { gte: query.startDate ? new Date(query.startDate) : undefined, lt: query.endDate ? new Date(query.endDate) : undefined } };
  }

  private async resolveSource(tx: Prisma.TransactionClient, dto: CreateInvoiceDto, context: AccessContext) {
    if (!dto.purchaseOrderId && !dto.receiveRecordId) throw new ConflictException('发票必须关联一个订单或一笔收款记录');
    if (dto.purchaseOrderId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "purchase_orders" WHERE "id" = ${dto.purchaseOrderId}::uuid FOR UPDATE`);
    if (dto.receiveRecordId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "receive_records" WHERE "id" = ${dto.receiveRecordId}::uuid FOR UPDATE`);
    const order = dto.purchaseOrderId ? await tx.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId } }) : null;
    const receive = dto.receiveRecordId ? await tx.receiveRecord.findUnique({ where: { id: dto.receiveRecordId } }) : null;
    if (dto.purchaseOrderId && !order) throw new NotFoundException('外采订单不存在');
    if (dto.receiveRecordId && !receive) throw new NotFoundException('收款记录不存在');
    if (order && receive && receive.purchaseOrderId !== order.id) throw new ConflictException('订单与收款记录不匹配');
    const organizationId = order?.organizationId || receive?.organizationId;
    if (!organizationId) throw new ConflictException('发票业务来源缺少组织信息');
    await this.scope.assertOrganizationAccess(organizationId, context);
    const customerId = order?.customerId || receive?.customerId || dto.customerId;
    if (!customerId) throw new ConflictException('发票业务来源缺少客户');
    if (dto.customerId && dto.customerId !== customerId) throw new ConflictException('发票客户与业务来源不匹配');
    if (receive && receive.status !== ReceiveRecordStatus.CONFIRMED) throw new ConflictException('只有已确认收款记录才能作为发票来源');
    if (order && [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_CONFIRMATION, PurchaseOrderStatus.CANCELLED].includes(order.status)) throw new ConflictException('当前订单状态不允许开票');
    return { organizationId, customerId, purchaseOrderId: order?.id || receive?.purchaseOrderId || null, receiveRecordId: receive?.id || null, accountId: order?.cashAccountId || receive?.accountId || null, businessNo: order?.orderNo || receive?.receiveNo || null, currency: 'CNY' };
  }

  private async resolveExistingSource(tx: Prisma.TransactionClient, row: any, context: AccessContext) { return this.resolveSource(tx, { customerId: row.customerId, purchaseOrderId: row.purchaseOrderId || undefined, receiveRecordId: row.receiveRecordId || undefined, amount: moneyToString(row.amount) }, context); }

  private async assertAmountAvailable(tx: Prisma.TransactionClient, source: any, amount: Prisma.Decimal, context: AccessContext, excludingInvoiceId?: string) {
    if (amount.lte(0)) throw new ConflictException('开票金额必须大于0');
    let sourceAmount = new Prisma.Decimal(0);
    if (source.receiveRecordId) {
      const receive = await tx.receiveRecord.findUnique({ where: { id: source.receiveRecordId } });
      if (!receive) throw new NotFoundException('收款记录不存在');
      sourceAmount = receive.invoiceEligibleAmount ?? receive.amount;
      if (source.purchaseOrderId) {
        const order = await tx.purchaseOrder.findUnique({ where: { id: source.purchaseOrderId } });
        if (!order) throw new NotFoundException('外采订单不存在');
        const refund = await tx.refund.aggregate({ where: { purchaseOrderId: order.id, status: RefundStatus.REFUNDED }, _sum: { refundAmount: true } });
        const orderAvailable = (order.customerCashAmount || order.customerReceivable || order.baseAmount).sub(refund._sum.refundAmount || new Prisma.Decimal(0));
        if (orderAvailable.lt(sourceAmount)) sourceAmount = orderAvailable;
      }
    } else if (source.purchaseOrderId) {
      const order = await tx.purchaseOrder.findUnique({ where: { id: source.purchaseOrderId } });
      if (!order) throw new NotFoundException('外采订单不存在');
      const refund = await tx.refund.aggregate({ where: { purchaseOrderId: order.id, status: RefundStatus.REFUNDED }, _sum: { refundAmount: true } });
      sourceAmount = (order.customerCashAmount || order.customerReceivable || order.baseAmount).sub(refund._sum.refundAmount || new Prisma.Decimal(0));
    }
    const existing = await tx.invoice.aggregate({ where: { status: { not: InvoiceStatus.VOIDED }, customerId: source.customerId, ...(source.purchaseOrderId ? { purchaseOrderId: source.purchaseOrderId } : { receiveRecordId: source.receiveRecordId }), ...(excludingInvoiceId ? { id: { not: excludingInvoiceId } } : {}) }, _sum: { amount: true } });
    const available = sourceAmount.sub(existing._sum.amount || new Prisma.Decimal(0));
    if (amount.gt(available)) throw new ConflictException(`开票金额不能超过未开票金额，当前最多可开票${moneyToString(available.isNegative() ? new Prisma.Decimal(0) : available)}元`);
  }

  private async syncReceiveInvoiceStatus(tx: Prisma.TransactionClient, receiveRecordId: string) {
    const receive = await tx.receiveRecord.findUnique({ where: { id: receiveRecordId }, select: { invoiceEligibleAmount: true } });
    if (!receive) return;
    const aggregate = await tx.invoice.aggregate({ where: { receiveRecordId, status: { not: InvoiceStatus.VOIDED } }, _sum: { amount: true } });
    const issued = aggregate._sum.amount || new Prisma.Decimal(0);
    const invoiceStatus = issued.gte(receive.invoiceEligibleAmount) ? ReceiveInvoiceStatus.ISSUED : issued.gt(0) ? ReceiveInvoiceStatus.PARTIAL : ReceiveInvoiceStatus.UNISSUED;
    await tx.receiveRecord.update({ where: { id: receiveRecordId }, data: { invoiceStatus } });
  }

  private async lockInvoice(tx: Prisma.TransactionClient, id: string, context: AccessContext) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${id}::uuid FOR UPDATE`); const row = await tx.invoice.findUnique({ where: { id } }); if (!row) throw new NotFoundException('发票记录不存在'); await this.scope.assertOrganizationAccess(row.organizationId, context); return row; }
  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作发票管理' }); }
  private async audit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, resourceId: string, action: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'INVOICE', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
  private view(row: any) { return { ...row, amount: moneyToString(row.amount) }; }
  private generateInvoiceNo() { return `INV${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
}
