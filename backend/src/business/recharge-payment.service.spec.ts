import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, RechargePaymentStatus } from '@prisma/client';
import { RechargePaymentService } from './recharge-payment.service';

const context = { sub: 'user-a', username: '申请人A', roles: ['FINANCE'], permissions: ['FINANCE_RECHARGE_PAYMENT_VIEW', 'FINANCE_RECHARGE_PAYMENT_CREATE', 'FINANCE_RECHARGE_PAYMENT_REVIEW'] };
const otherContext = { sub: 'user-b', username: '申请人B', roles: ['FINANCE'], permissions: ['FINANCE_RECHARGE_PAYMENT_VIEW', 'FINANCE_RECHARGE_PAYMENT_CREATE'] };

function fixture(organizationId = 'org-a', contractChecker: any = { checkValidContract: async () => ({ status: 'NOT_VERIFIED', reason: '合同主数据来源暂不可用' }) }) {
  const applications: any[] = [];
  const receive = { id: 'receive-a', receiveNo: 'RC-001', organizationId, customerId: 'customer-a', currency: 'CNY', amount: new Prisma.Decimal('30000.00'), walletCreditAmount: new Prisma.Decimal('30000.00'), status: 'CONFIRMED', customer: { id: 'customer-a', name: '客户A', customerCode: 'C001' }, bankTransaction: { counterpartyName: '付款方A', account: { name: '我方收款账户' } } };
  let capturedWhere: any;
  const include = (row: any) => ({ ...row, receiveRecord: { id: receive.id, receiveNo: receive.receiveNo, amount: receive.amount, status: receive.status, receivedAt: new Date() }, customer: receive.customer, applicant: { id: row.applicantId, displayName: row.applicantId }, reviewer: row.reviewerId ? { id: row.reviewerId, displayName: row.reviewerId } : null });
  const repo: any = {
    findUnique: async ({ where }: any) => applications.find((item) => (where.id && item.id === where.id) || (where.clientRequestId && item.clientRequestId === where.clientRequestId)) ? include(applications.find((item) => (where.id && item.id === where.id) || (where.clientRequestId && item.clientRequestId === where.clientRequestId))) : null,
    create: async ({ data }: any) => { const row = { id: `application-${applications.length + 1}`, appliedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), ...data }; applications.push(row); return include(row); },
    update: async ({ where, data }: any) => { const row = applications.find((item) => item.id === where.id); Object.assign(row, data); return include(row); },
    findMany: async ({ where }: any) => { capturedWhere = where; return applications.filter((item) => !where.applicantId || item.applicantId === where.applicantId).map(include); },
    count: async () => applications.length,
  };
  const tx: any = { $queryRaw: async () => [], rechargePaymentApplication: repo, receiveRecord: { findUnique: async ({ where }: any) => where.id === receive.id ? receive : null }, auditLog: { create: async () => undefined } };
  const prisma: any = { rechargePaymentApplication: repo, receiveRecord: tx.receiveRecord, auditLog: { findMany: async () => [] }, $transaction: async (input: any) => Array.isArray(input) ? await Promise.all(input) : input(tx) };
  const scope: any = { isSuperAdmin: () => false, getOrganizationIds: async () => ['org-a'], assertOrganizationAccess: async (id: string) => { if (id !== 'org-a') throw new Error('无权访问该组织数据'); } };
  return { service: new RechargePaymentService(prisma, scope, contractChecker), applications, getWhere: () => capturedWhere };
}

test('创建草稿按幂等键去重，且不生成资金流水或钱包流水', async () => {
  const f = fixture();
  const first = await f.service.create({ receiveRecordId: 'receive-a', amount: '100.10', clientRequestId: 'web-001' }, context);
  const second = await f.service.create({ receiveRecordId: 'receive-a', amount: '100.10', clientRequestId: 'web-001' }, context);
  assert.equal(first.application.status, RechargePaymentStatus.DRAFT);
  assert.equal(first.application.amount, '100.10');
  assert.equal(second.idempotent, true);
  assert.equal(f.applications.length, 1);
});

test('草稿可修改和取消，取消幂等', async () => {
  const f = fixture();
  const created = await f.service.create({ receiveRecordId: 'receive-a', amount: '100.00' }, context);
  const updated = await f.service.updateDraft(created.application.id, { amount: '120.25', remark: '拆分补款' }, context);
  assert.equal(updated.application.amount, '120.25');
  const cancelled = await f.service.cancel(created.application.id, context);
  assert.equal(cancelled.application.status, RechargePaymentStatus.CANCELLED);
  assert.equal((await f.service.cancel(created.application.id, context)).idempotent, true);
});

test('草稿提交审核后可通过，审核中不允许修改核心金额', async () => {
  const f = fixture('org-a', { checkValidContract: async () => ({ status: 'VALID' }) });
  const created = await f.service.create({ receiveRecordId: 'receive-a', amount: '200.00' }, context);
  await f.service.submit(created.application.id, context);
  await assert.rejects(() => f.service.updateDraft(created.application.id, { amount: '201.00' }, context));
  const approved = await f.service.approve(created.application.id, context);
  assert.equal(approved.application.status, RechargePaymentStatus.APPROVED);
  assert.equal(approved.application.reviewerId, context.sub);
});

test('审核中申请可退回并记录退回原因', async () => {
  const f = fixture();
  const created = await f.service.create({ receiveRecordId: 'receive-a', amount: '200.00' }, context);
  await f.service.submit(created.application.id, context);
  const rejected = await f.service.reject(created.application.id, { rejectReason: '金额资料不完整' }, context);
  assert.equal(rejected.application.status, RechargePaymentStatus.REJECTED);
  assert.equal(rejected.application.rejectReason, '金额资料不完整');
});

test('跨组织收款记录被拒绝，且我的申请由服务端按当前用户过滤', async () => {
  const crossOrg = fixture('org-b');
  await assert.rejects(() => crossOrg.service.create({ receiveRecordId: 'receive-a', amount: '1.00' }, context));
  const f = fixture();
  await f.service.create({ receiveRecordId: 'receive-a', amount: '1.00' }, otherContext);
  await f.service.list({ page: 1, pageSize: 10, mine: true }, context);
  assert.equal(f.getWhere().applicantId, context.sub);
});

test('无充值付款权限不能访问', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.create({ receiveRecordId: 'receive-a', amount: '1.00' }, { ...context, roles: [], permissions: [] }));
});

test('提交前合同源不可用时明确阻断且不产生申请', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.submitNew({ receiveRecordId: 'receive-a', details: [{ amount: '100.00' }] }, context), /当前系统无法验证有效合同/);
  assert.equal(f.applications.length, 0);
});

test('合同校验通过后提交才写入审核申请，金额使用Decimal汇总', async () => {
  const f = fixture('org-a', { checkValidContract: async () => ({ status: 'VALID' }) });
  const result = await f.service.submitNew({ receiveRecordId: 'receive-a', details: [{ businessType: '常规', amount: '100.10' }, { amount: '0.20' }] }, context);
  assert.equal(result.application.status, RechargePaymentStatus.PENDING_REVIEW);
  assert.equal(result.application.amount, '100.30');
});
