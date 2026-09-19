import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvoiceStatus, Prisma, ReceiveRecordStatus } from '@prisma/client';
import { InvoiceService } from './invoice.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';
const receiveId = '00000000-0000-4000-8000-000000000003';
const operatorId = '00000000-0000-4000-8000-000000000004';
const context: any = { sub: operatorId, username: '财务人员', roles: ['FINANCE'], permissions: ['FINANCE_INVOICE_VIEW', 'FINANCE_INVOICE_CREATE', 'FINANCE_INVOICE_EDIT', 'FINANCE_INVOICE_CONFIRM'] };

function fixture() {
  const receives: any[] = [{ id: receiveId, receiveNo: 'RC202609130001', organizationId, customerId, accountId: null, currency: 'CNY', amount: new Prisma.Decimal('50000.00'), invoiceEligibleAmount: new Prisma.Decimal('50000.00'), unBillingAmount: new Prisma.Decimal('50000.00'), billingAmount: new Prisma.Decimal('0.00'), billedAmount: new Prisma.Decimal('0.00'), serviceFeeAmount: new Prisma.Decimal('1000.00'), status: ReceiveRecordStatus.CONFIRMED, customer: { id: customerId, name: '客户A' }, bankTransaction: null }];
  const rows: any[] = [];
  const sources: any[] = [];
  const items: any[] = [];
  let sequence = 1;
  const tx: any = {
    $queryRaw: async () => [],
    receiveRecord: { findUnique: async ({ where: { id } }: any) => receives.find((item) => item.id === id) || null, update: async ({ where: { id }, data }: any) => { const row = receives.find((item) => item.id === id); Object.assign(row, data); return row; } },
    invoiceApplicationReceiveRecord: {
      aggregate: async ({ where }: any) => ({ _sum: { amount: sources.filter((item) => item.receiveRecordId === where.receiveRecordId && rows.find((row) => row.id === item.invoiceId)?.status !== InvoiceStatus.REJECTED).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0)) } }),
      findMany: async ({ where }: any) => sources.filter((item) => item.invoiceId === where.invoiceId),
      createMany: async ({ data }: any) => { sources.push(...data); },
      deleteMany: async ({ where }: any) => { for (let index = sources.length - 1; index >= 0; index -= 1) if (sources[index].invoiceId === where.invoiceId) sources.splice(index, 1); },
    },
    invoiceApplicationItem: {
      createMany: async ({ data }: any) => { items.push(...data); },
      findMany: async ({ where }: any) => items.filter((item) => item.invoiceId === where.invoiceId),
      deleteMany: async ({ where }: any) => { for (let index = items.length - 1; index >= 0; index -= 1) if (items[index].invoiceId === where.invoiceId) items.splice(index, 1); },
    },
    invoice: {
      findUnique: async ({ where }: any) => where.clientRequestId ? rows.find((item) => item.clientRequestId === where.clientRequestId) || null : rows.find((item) => item.id === where.id) || null,
      create: async ({ data }: any) => { const row = { id: `invoice-${sequence}`, invoiceNo: `INV-${sequence++}`, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; },
      update: async ({ where: { id }, data }: any) => { const row = rows.find((item) => item.id === id); Object.assign(row, data); return row; },
      aggregate: async ({ where }: any) => ({ _sum: { amount: rows.filter((item) => item.receiveRecordId === where.receiveRecordId && ![InvoiceStatus.VOIDED, InvoiceStatus.REJECTED].includes(item.status) && (!where.id?.not || item.id !== where.id.not)).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0)) } }),
    },
    auditLog: { create: async () => undefined },
  };
  const prisma: any = { ...tx, $transaction: async (callback: any) => callback(tx) };
  const scope: any = { isSuperAdmin: () => false, getOrganizationIds: async () => [organizationId], assertOrganizationAccess: async (id: string) => { if (id !== organizationId) throw new Error('PERMISSION_DENIED'); } };
  return { service: new InvoiceService(prisma, scope), rows, sources, items, receives };
}

test('发票申请按收款可开票金额创建并自动拆分，不产生资金动作', async () => {
  const value = fixture();
  const result = await value.service.createApplication({ receiveRecordIds: [receiveId], amount: '50000.00', autoSplit: true }, context);
  assert.equal(result.invoice.status, InvoiceStatus.DRAFT);
  // 服务费 1000 单列后，剩余 49000 按已采集的 91.5%/8.5% 拆分：
  // 技术服务 = 49000*0.915 = 44835.00，广告发布 = 49000-44835 = 4165.00，合计 50000.00
  assert.deepEqual(value.items.map((item) => item.amount.toFixed(2)), ['1000.00', '44835.00', '4165.00']);
  assert.equal(value.sources[0].amount.toFixed(2), '50000.00');
  assert.equal(value.rows.length, 1);
});

test('草稿不占用额度，提交后按收款金额占用额度', async () => {
  const value = fixture();
  const created = await value.service.createApplication({ receiveRecordIds: [receiveId], amount: '10000.00', autoSplit: false, items: [{ amount: '10000.00' }] }, context);
  assert.equal(value.rows.length, 1);
  assert.equal(value.rows[0].status, InvoiceStatus.DRAFT);
  assert.equal(value.rows[0].amount.toFixed(2), '10000.00');
  assert.equal(value.receives[0].unBillingAmount.toFixed(2), '50000.00');
  await value.service.submitApplication(created.invoice.id, context);
  assert.equal(value.receives[0].unBillingAmount.toFixed(2), '40000.00');
  assert.equal(value.receives[0].billingAmount.toFixed(2), '10000.00');
});

test('发票申请只能按起草、审核中、审核通过或审核不通过流转', async () => {
  const value = fixture();
  const created = await value.service.createApplication({ receiveRecordIds: [receiveId], amount: '1000.00', autoSplit: false, items: [{ amount: '1000.00', itemType: '蓝字发票' }] }, context);
  const submitted = await value.service.submitApplication(created.invoice.id, context);
  const approved = await value.service.approveApplication(created.invoice.id, { approvalRemark: '审核通过' }, context);
  assert.equal(submitted.invoice.status, InvoiceStatus.REVIEWING);
  assert.equal(approved.invoice.status, InvoiceStatus.APPROVED);
  assert.equal(value.rows[0].approvedAmount.toFixed(2), '1000.00');
  assert.equal(value.receives[0].unBillingAmount.toFixed(2), '49000.00');
  assert.equal(value.receives[0].billingAmount.toFixed(2), '0.00');
  assert.equal(value.receives[0].billedAmount.toFixed(2), '1000.00');
  await assert.rejects(() => value.service.rejectApplication(created.invoice.id, { rejectReason: '重复审核' }, context));
});

test('驳回必须填写原因且不改变收款金额', async () => {
  const value = fixture();
  const created = await value.service.createApplication({ receiveRecordIds: [receiveId], amount: '1000.00', autoSplit: false, items: [{ amount: '1000.00' }] }, context);
  await value.service.submitApplication(created.invoice.id, context);
  await assert.rejects(() => value.service.rejectApplication(created.invoice.id, {}, context), /驳回原因不能为空/);
  const rejected = await value.service.rejectApplication(created.invoice.id, { rejectReason: '资料不完整' }, context);
  assert.equal(rejected.invoice.status, InvoiceStatus.REJECTED);
  assert.equal(value.rows[0].amount.toFixed(2), '1000.00');
  assert.equal(value.receives[0].unBillingAmount.toFixed(2), '50000.00');
  assert.equal(value.receives[0].billingAmount.toFixed(2), '0.00');
  assert.equal(value.receives[0].billedAmount.toFixed(2), '0.00');
});

test('审核中的申请只能由创建人撤回并释放额度', async () => {
  const value = fixture();
  const created = await value.service.createApplication({ receiveRecordIds: [receiveId], amount: '2000.00', autoSplit: false, items: [{ amount: '2000.00' }] }, context);
  await value.service.submitApplication(created.invoice.id, context);
  const revoked = await value.service.revokeApplication(created.invoice.id, context);
  assert.equal(revoked.invoice.status, InvoiceStatus.DRAFT);
  assert.equal(value.receives[0].unBillingAmount.toFixed(2), '50000.00');
  assert.equal(value.receives[0].billingAmount.toFixed(2), '0.00');
});

test('服务费不减少可申请开票金额', async () => {
  const value = fixture();
  const result = await value.service.createApplication({ receiveRecordIds: [receiveId], amount: '50000.00', autoSplit: false, items: [{ amount: '50000.00' }] }, context);
  assert.equal(result.invoice.amount, '50000.00');
});

test('申请金额超过可开票金额时拒绝提交', async () => {
  const value = fixture();
  await assert.rejects(() => value.service.createApplication({ receiveRecordIds: [receiveId], amount: '50001.00', autoSplit: false, items: [{ amount: '50001.00' }] }, context), /申请开票金额不能大于可开票金额/);
});
