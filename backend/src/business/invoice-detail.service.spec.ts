import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvoiceStatus } from '@prisma/client';
import { InvoiceService } from './invoice.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const applicationId = '00000000-0000-4000-8000-000000000002';
const operatorId = '00000000-0000-4000-8000-000000000003';
const context: any = { sub: operatorId, username: '财务人员', roles: ['FINANCE'], permissions: ['FINANCE_INVOICE_VIEW', 'FINANCE_INVOICE_CONFIRM'] };

function fixture(status: InvoiceStatus = InvoiceStatus.APPROVED, details = [{ id: 'detail-1' }]) {
  const invoice = { id: applicationId, organizationId, status, amount: '10000.00', createdBy: operatorId };
  const updates: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    invoice: {
      findUnique: async () => invoice,
      update: async ({ data }: any) => { Object.assign(invoice, data); updates.push({ entity: 'invoice', data }); return invoice; },
    },
    invoiceDetail: {
      findMany: async () => details,
      findUnique: async () => details[0] || null,
    },
    auditLog: { create: async ({ data }: any) => updates.push({ entity: 'audit', data }) },
  };
  const prisma: any = { ...tx, $transaction: async (callback: any) => callback(tx) };
  const scope: any = { isSuperAdmin: () => false, assertOrganizationAccess: async (id: string) => { if (id !== organizationId) throw new Error('PERMISSION_DENIED'); } };
  return { service: new InvoiceService(prisma, scope), invoice, updates };
}

test('审核通过上传完成开票只将申请从2变为3，不修改额度', async () => {
  const value = fixture();
  const result = await value.service.completeInvoiceApplication(applicationId, context);
  assert.equal(result.invoice.status, InvoiceStatus.ISSUED);
  assert.deepEqual(value.updates.filter((item) => item.entity === 'invoice')[0].data.status, InvoiceStatus.ISSUED);
  assert.equal(value.updates.some((item) => item.entity === 'receiveRecord'), false);
});

test('审核中申请不能进入完成开票', async () => {
  const value = fixture(InvoiceStatus.REVIEWING);
  await assert.rejects(() => value.service.completeInvoiceApplication(applicationId, context), /只有审核通过的申请可以完成开票/);
});

test('已完成开票重复完成保持幂等', async () => {
  const value = fixture(InvoiceStatus.ISSUED);
  const result = await value.service.completeInvoiceApplication(applicationId, context);
  assert.equal(result.idempotent, true);
  assert.equal(value.updates.length, 0);
});

test('没有上传发票明细不能完成开票', async () => {
  const value = fixture(InvoiceStatus.APPROVED, []);
  await assert.rejects(() => value.service.completeInvoiceApplication(applicationId, context), /请先上传发票/);
});
