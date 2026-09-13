import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvoiceTaskStatus, Prisma } from '@prisma/client';
import { PublicInvoiceTaskService } from './public-invoice-task.service';

const ids = { org: '00000000-0000-4000-8000-000000000001', customer: '00000000-0000-4000-8000-000000000002', task: '00000000-0000-4000-8000-000000000003', user: '00000000-0000-4000-8000-000000000004' };
const normal: any = { sub: ids.user, username: '操作员', roles: [], permissions: ['FINANCE_INVOICE_VIEW', 'FINANCE_INVOICE_CREATE', 'FINANCE_INVOICE_EDIT'] };
const finance: any = { sub: ids.user, username: '财务', roles: ['FINANCE'], permissions: ['FINANCE_INVOICE_VIEW', 'FINANCE_INVOICE_CONFIRM'] };
const admin: any = { sub: ids.user, username: '管理员', roles: ['SUPER_ADMIN'], permissions: [] };

function fixture(status = InvoiceTaskStatus.PENDING) {
  const wallet = { balance: '100.00' }; const receive = { amount: '50000.00' }; const details: any[] = [];
  const task: any = { id: ids.task, taskNo: 'IT001', organizationId: ids.org, customerId: ids.customer, receiveRecordDetailId: 'detail-1', publicAmount: new Prisma.Decimal('30000.00'), invoiceAmount: new Prisma.Decimal('30000.00'), status, createdBy: ids.user, customer: { id: ids.customer, name: '客户A', customerCode: 'C001' }, invoiceDetails: [], receiveRecordDetail: { receiveRecord: { receiveNo: 'RC001', bankTransaction: { counterpartyName: '付款方A', counterpartyAccount: 'payer-a' } } } };
  const profiles: any[] = [];
  const tx: any = {
    $queryRaw: async () => [], auditLog: { create: async () => undefined },
    customer: { findUnique: async () => ({ id: ids.customer, agentId: ids.org }) },
    customerInvoiceProfile: { findUnique: async ({ where: { id } }: any) => profiles.find((item) => item.id === id) || null, findMany: async () => profiles, create: async ({ data }: any) => { const row = { id: `profile-${profiles.length + 1}`, ...data }; profiles.push(row); return row; }, update: async ({ where: { id }, data }: any) => Object.assign(profiles.find((item) => item.id === id), data) },
    invoiceTask: { findUnique: async () => task, update: async ({ data }: any) => Object.assign(task, data), count: async () => 1, findMany: async () => [task] },
    invoiceDetail: { create: async ({ data }: any) => { const row = { id: `detail-${details.length + 1}`, ...data }; details.push(row); task.invoiceDetails.push(row); return row; } },
    $transaction: async (input: any) => typeof input === 'function' ? input(tx) : Promise.all(input),
  };
  const scope: any = { isSuperAdmin: (context: any) => context.roles.includes('SUPER_ADMIN'), getOrganizationIds: async () => [ids.org], assertOrganizationAccess: async () => undefined };
  return { service: new PublicInvoiceTaskService(tx, scope), task, profiles, details, wallet, receive };
}

test('对公开票任务允许将需开票金额下调且不超过对公金额', async () => {
  const value = fixture();
  const result = await value.service.update(ids.task, { invoiceAmount: '25000.00' }, normal);
  assert.equal(result.invoiceAmount, '25000.00');
  await assert.rejects(() => value.service.update(ids.task, { invoiceAmount: '30000.01' }, normal), /不能超过对公入账金额/);
});

test('客户可以维护并选择多条开票信息', async () => {
  const value = fixture();
  const first = await value.service.createProfile(ids.customer, { titleName: '客户A有限公司', taxpayerCode: 'A' }, normal);
  const second = await value.service.createProfile(ids.customer, { titleName: '客户A科技有限公司', taxpayerCode: 'B' }, normal);
  await value.service.update(ids.task, { invoiceAmount: '20000.00', invoiceProfileId: second.id }, normal);
  assert.equal(value.profiles.length, 2);
  assert.equal(value.task.invoiceProfileId, second.id);
  assert.equal(value.task.titleName, second.titleName);
  assert.notEqual(first.id, second.id);
});

test('普通操作员不能审核或完成开票，财务可以审核', async () => {
  const value = fixture(InvoiceTaskStatus.PENDING);
  value.task.status = InvoiceTaskStatus.REVIEWING;
  await assert.rejects(() => value.service.approve(ids.task, {}, normal), /无权审核/);
  const approved = await value.service.approve(ids.task, { approvalRemark: '通过' }, finance);
  assert.equal(approved.status, InvoiceTaskStatus.APPROVED);
  await assert.rejects(() => value.service.complete(ids.task, { amount: '20000.00', invoiceType: '增值税普通发票' }, normal), /无权完成/);
});

test('管理员人工填写实际发票信息后完成开票，不改变收款或钱包', async () => {
  const value = fixture(InvoiceTaskStatus.PENDING);
  value.task.status = InvoiceTaskStatus.APPROVED;
  const completed = await value.service.complete(ids.task, { amount: '25000.00', invoiceType: '增值税普通发票', invoiceCode: 'INV-001', invoiceContent: '服务费' }, admin);
  assert.equal(completed.status, InvoiceTaskStatus.COMPLETED);
  assert.equal(value.details[0].invoiceCode, 'INV-001');
  assert.equal(value.receive.amount, '50000.00');
  assert.equal(value.wallet.balance, '100.00');
});
