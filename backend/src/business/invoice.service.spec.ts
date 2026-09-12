import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvoiceStatus, Prisma, PurchaseOrderStatus } from '@prisma/client';
import { InvoiceService } from './invoice.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';
const orderId = '00000000-0000-4000-8000-000000000003';
const operatorId = '00000000-0000-4000-8000-000000000004';

const context: any = { sub: operatorId, username: '财务人员', roles: ['FINANCE'], permissions: ['FINANCE_INVOICE_VIEW', 'FINANCE_INVOICE_CREATE', 'FINANCE_INVOICE_EDIT', 'FINANCE_INVOICE_CONFIRM', 'FINANCE_INVOICE_VOID'] };
const order = { id: orderId, orderNo: 'PO202609110001', organizationId, customerId, status: PurchaseOrderStatus.CONFIRMED, customerCashAmount: new Prisma.Decimal('10000.00'), customerReceivable: new Prisma.Decimal('10000.00'), baseAmount: new Prisma.Decimal('10000.00'), cashAccountId: null };

function fixture(options: { organizationId?: string; allowedOrganizationId?: string; existing?: string } = {}) {
  const rows: any[] = options.existing ? [{ id: 'invoice-old', invoiceNo: 'INV-OLD', organizationId: options.organizationId ?? organizationId, customerId, purchaseOrderId: orderId, amount: new Prisma.Decimal(options.existing), status: InvoiceStatus.ISSUED }] : [];
  let sequence = rows.length + 1;
  const audits: any[] = [];
  let lockCount = 0;
  const tx: any = {
    $queryRaw: async () => { lockCount += 1; return []; },
    purchaseOrder: { findUnique: async () => ({ ...order, organizationId: options.organizationId ?? organizationId }), findMany: async () => [{ ...order, organizationId: options.organizationId ?? organizationId }] },
    receiveRecord: { findUnique: async () => null, findMany: async () => [] },
    refund: { aggregate: async () => ({ _sum: { refundAmount: null } }), groupBy: async () => [] },
    invoice: {
      findUnique: async ({ where }: any) => where.clientRequestId ? rows.find((item) => item.clientRequestId === where.clientRequestId) || null : rows.find((item) => item.id === where.id) || null,
      create: async ({ data }: any) => { const row = { id: `invoice-${sequence}`, invoiceNo: `INV-${sequence++}`, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; },
      update: async ({ where: { id }, data }: any) => { const row = rows.find((item) => item.id === id); Object.assign(row, data); return row; },
      aggregate: async ({ where }: any) => ({ _sum: { amount: rows.filter((item) => item.status !== InvoiceStatus.VOIDED && item.customerId === where.customerId && (!where.purchaseOrderId || item.purchaseOrderId === where.purchaseOrderId) && (!where.receiveRecordId || item.receiveRecordId === where.receiveRecordId) && (!where.id?.not || item.id !== where.id.not)).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0)) } }),
      findMany: async () => rows,
      count: async () => rows.length,
      groupBy: async () => [],
    },
    auditLog: { create: async ({ data }: any) => { audits.push(data); } },
  };
  const prisma: any = { ...tx, customer: { findUnique: async () => ({ id: customerId, name: '客户A', customerCode: 'C001', agentId: options.organizationId ?? organizationId }) }, purchaseOrder: tx.purchaseOrder, receiveRecord: tx.receiveRecord, invoice: tx.invoice, auditLog: tx.auditLog, $transaction: async (callback: any) => callback(tx) };
  const allowedOrganizationId = options.allowedOrganizationId ?? organizationId;
  const scope: any = { isSuperAdmin: () => false, getOrganizationIds: async () => [allowedOrganizationId], assertOrganizationAccess: async (id: string) => { if (id !== allowedOrganizationId) throw new Error('PERMISSION_DENIED'); } };
  return { service: new InvoiceService(prisma, scope), rows, audits, prisma, scope, getLockCount: () => lockCount };
}

test('创建发票草稿并按Decimal返回金额', async () => {
  const value = fixture();
  const result = await value.service.create({ purchaseOrderId: orderId, amount: '1000.10', clientRequestId: 'invoice-request-1' }, context);
  assert.equal(result.invoice.status, InvoiceStatus.DRAFT);
  assert.equal(result.invoice.amount, '1000.10');
  assert.equal(value.audits[0].actionType, 'INVOICE_CREATE');
});

test('开票金额不能超过订单未开票金额，重复创建请求幂等', async () => {
  const value = fixture({ existing: '9000.00' });
  await assert.rejects(() => value.service.create({ purchaseOrderId: orderId, amount: '1000.01' }, context), /不能超过未开票金额/);
  const first = await value.service.create({ purchaseOrderId: orderId, amount: '1000.00', clientRequestId: 'same-request' }, context);
  const second = await value.service.create({ purchaseOrderId: orderId, amount: '1000.00', clientRequestId: 'same-request' }, context);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
});

test('确认发票后再次确认幂等，不创建资金流水', async () => {
  const value = fixture();
  const created = await value.service.create({ purchaseOrderId: orderId, amount: '1000.00' }, context);
  const first = await value.service.confirm(created.invoice.id, context);
  const second = await value.service.confirm(created.invoice.id, context);
  assert.equal(first.invoice.status, InvoiceStatus.ISSUED);
  assert.equal(second.idempotent, true);
  assert.equal(value.rows[0].status, InvoiceStatus.ISSUED);
  await assert.rejects(() => value.service.updateDraft(created.invoice.id, { remark: '尝试修改历史发票' }, context), /只有草稿/);
});

test('发票状态按草稿、开票中、已开票顺序流转', async () => {
  const value = fixture();
  const created = await value.service.create({ purchaseOrderId: orderId, amount: '300.00' }, context);
  const processing = await value.service.process(created.invoice.id, context);
  const confirmed = await value.service.confirm(created.invoice.id, context);
  assert.equal(processing.invoice.status, InvoiceStatus.PROCESSING);
  assert.equal(confirmed.invoice.status, InvoiceStatus.ISSUED);
});

test('已确认发票可以作废但保留历史记录，重复作废幂等', async () => {
  const value = fixture();
  const created = await value.service.create({ purchaseOrderId: orderId, amount: '200.00' }, context);
  await value.service.confirm(created.invoice.id, context);
  const first = await value.service.voidInvoice(created.invoice.id, { reason: '客户信息更正' }, context);
  const second = await value.service.voidInvoice(created.invoice.id, { reason: '重复操作' }, context);
  assert.equal(first.invoice.status, InvoiceStatus.VOIDED);
  assert.equal(second.idempotent, true);
  assert.equal(value.rows.length, 1);
});

test('客户未开票金额使用订单Decimal金额减去历史发票', async () => {
  const value = fixture({ existing: '2500.00' });
  const result = await value.service.getCustomerBalance(customerId, context);
  assert.equal(result.sourceAmount, '10000.00');
  assert.equal(result.invoicedAmount, '2500.00');
  assert.equal(result.uninvoicedAmount, '7500.00');
});

test('跨组织访问和无权限操作被拒绝', async () => {
  const crossOrg = fixture({ organizationId: '00000000-0000-4000-8000-000000000099' });
  await assert.rejects(() => crossOrg.service.create({ purchaseOrderId: orderId, amount: '1.00' }, context));
  const noPermission = fixture();
  await assert.rejects(() => noPermission.service.create({ purchaseOrderId: orderId, amount: '1.00' }, { ...context, roles: [], permissions: [] }));
});

test('Decimal金额计算不存在浮点误差，并通过行锁保护确认入口', async () => {
  const value = fixture();
  assert.equal(new Prisma.Decimal('0.1').add(new Prisma.Decimal('0.2')).toFixed(2), '0.30');
  await value.service.create({ purchaseOrderId: orderId, amount: '100.00' }, context);
  await value.service.confirm('invoice-1', context);
  assert.equal(value.rows[0].status, InvoiceStatus.ISSUED);
  assert.equal(value.getLockCount() >= 2, true);
});
