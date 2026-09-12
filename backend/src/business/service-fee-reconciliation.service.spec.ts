import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { ServiceFeeReconciliationService } from './service-fee-reconciliation.service';

const rows = [
  { id: 'receive-a', organizationId: 'org-a', receiveNo: 'RC-A', bankTransactionId: 'bank-a', amount: new Prisma.Decimal('30000.00'), receivedAt: new Date('2026-09-11T00:00:00Z'), customer: { id: 'customer-a', name: '客户A', departmentId: '商务A' }, bankTransaction: { transactionNo: 'LS20260911002', occurredAt: new Date('2026-09-11T00:00:00Z'), counterpartyName: '付款方A', counterpartyAccount: 'PAYER-A', remark: '银行备注', account: { id: 'account-a', name: '公司收款账户', accountCode: 'CNY-A' } }, serviceFeeDetails: [{ id: 'fee-a', amount: new Prisma.Decimal('2000.00'), businessType: 'SERVICE_FEE', remark: '人工添加', operator: { id: 'user-a', displayName: '财务' } }] },
  { id: 'receive-b', organizationId: 'org-a', receiveNo: 'RC-B', bankTransactionId: 'bank-b', amount: new Prisma.Decimal('5000.00'), receivedAt: new Date('2026-09-10T00:00:00Z'), customer: { id: 'customer-b', name: '客户B', departmentId: '商务B' }, bankTransaction: { transactionNo: 'LS20260910001', occurredAt: new Date('2026-09-10T00:00:00Z'), counterpartyName: '付款方B', counterpartyAccount: 'PAYER-B', remark: null, account: { id: 'account-a', name: '公司收款账户', accountCode: 'CNY-A' } }, serviceFeeDetails: [] },
];

test('服务费对账读取收款入账服务费明细，不读取外采订单服务费', async () => {
  const prisma: any = { receiveRecord: { findMany: async (args: any) => args.where.serviceFeeDetails ? rows.filter((row) => row.serviceFeeDetails.length > 0) : rows }, receiveRecordCount: 0, auditLog: { create: async () => undefined } };
  const scope: any = { getOrganizationIds: async () => ['org-a'], isSuperAdmin: () => false, assertOrganizationAccess: async () => undefined };
  const service = new ServiceFeeReconciliationService(prisma, scope);
  const context: any = { sub: 'user-a', username: '财务', roles: [], permissions: ['FINANCE_SERVICE_FEE_RECONCILIATION_VIEW'] };
  const all = await service.list({ page: 1, pageSize: 10, tab: 'ALL' }, context);
  assert.equal(all.totalCount, 2);
  assert.equal(all.totalAmount, '35000.00');
  assert.equal(all.totalServiceFee, '2000.00');
  assert.equal(all.items[0].transactionNo, 'LS20260911002');
  const nonZero = await service.list({ page: 1, pageSize: 10, tab: 'NON_ZERO' }, context);
  assert.equal(nonZero.totalCount, 1);
});

test('服务费对账无权限时拒绝访问', async () => {
  const service = new ServiceFeeReconciliationService({} as never, { getOrganizationIds: async () => ['org-a'], isSuperAdmin: () => false } as never);
  await assert.rejects(() => service.list({ page: 1, pageSize: 10, tab: 'ALL' }, { sub: 'user-a', username: '普通用户', roles: [], permissions: [] }), (error: unknown) => error instanceof Error && JSON.stringify((error as { response?: unknown }).response).includes('PERMISSION_DENIED'));
});
