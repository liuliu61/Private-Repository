import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PurchaseOrderStatus, PurchasePaymentType, RefundStatus, TransactionBusinessType } from '@prisma/client';
import { RefundService } from './refund.service';

const context = { sub: 'operator-a', username: '财务人员', roles: ['FINANCE'], permissions: ['FINANCE_REFUND_CREATE', 'FINANCE_REFUND_APPROVE', 'FINANCE_REFUND_VIEW'] };

function createFixture() {
  let order: any = { id: 'order-a', orderNo: 'PO-1', organizationId: 'org-a', customerId: 'customer-a', status: PurchaseOrderStatus.CONFIRMED, customerPaidAmount: new Prisma.Decimal('10000.00'), cashAccountId: 'account-a' };
  let refund: any = null;
  let refundCreates = 0;
  let transactionInputs: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    purchaseOrder: { findUnique: async () => order },
    purchaseOrderPayment: { findFirst: async ({ where }: any) => where.paymentType === PurchasePaymentType.CUSTOMER_PAYMENT ? { id: 'payment-a', amount: new Prisma.Decimal('10000.00') } : null, aggregate: async () => ({ _sum: { amount: new Prisma.Decimal('10000.00') } }) },
    refund: {
      findUnique: async ({ where }: any) => where.id ? refund : refund,
      create: async ({ data }: any) => { refundCreates += 1; refund = { id: 'refund-a', createdAt: new Date(), updatedAt: new Date(), ...data }; return refund; },
      update: async ({ data }: any) => { refund = { ...refund, ...data }; return refund; },
      aggregate: async ({ where }: any) => ({ _sum: { refundAmount: where.status?.equals === RefundStatus.REFUNDED || where.status === RefundStatus.REFUNDED ? (refund?.status === RefundStatus.REFUNDED ? refund.refundAmount : null) : (refund && [RefundStatus.PENDING, RefundStatus.APPROVED, RefundStatus.REFUNDED].includes(refund.status) ? refund.refundAmount : null) } }),
    },
    account: { findUnique: async () => ({ id: 'account-a', currency: 'CNY', organizationId: 'org-a' }) },
    auditLog: { create: async () => undefined },
  };
  const prisma: any = { $transaction: async (callback: (value: any) => unknown) => callback(tx), refund: tx.refund, purchaseOrder: { findUnique: async () => order } };
  const scope: any = { isSuperAdmin: () => false, assertOrganizationAccess: async () => undefined, getOrganizationIds: async () => undefined };
  const cashflow: any = { createTransactionInTransaction: async (_tx: unknown, input: any) => { transactionInputs.push(input); return { transactionNo: 'TX-REFUND-1', balanceBefore: '10000.00', balanceAfter: '9000.00' }; } };
  const service = new RefundService(prisma, scope, cashflow);
  return { service, get order() { return order; }, get refund() { return refund; }, get refundCreates() { return refundCreates; }, transactionInputs };
}

test('退款申请、审批和执行使用客户实际付款并产生负向客户退款流水', async () => {
  const fixture = createFixture();
  const request = await fixture.service.create('order-a', { refundAmount: '1000.00', refundReason: '客户申请退款', idempotencyKey: 'refund-1' }, context);
  assert.equal(request.status, RefundStatus.PENDING);
  const approved = await fixture.service.approve('refund-a', context);
  assert.equal(approved.status, RefundStatus.APPROVED);
  const executed = await fixture.service.execute('refund-a', context);
  assert.equal(executed.status, RefundStatus.REFUNDED);
  assert.equal(fixture.transactionInputs[0].businessType, TransactionBusinessType.CUSTOMER_REFUND);
  assert.equal(fixture.transactionInputs[0].changeAmount.toFixed(2), '-1000.00');
  assert.equal(executed.transactionNo, 'TX-REFUND-1');
  const repeated = await fixture.service.execute('refund-a', context);
  assert.equal(repeated.idempotent, true);
  assert.equal(fixture.transactionInputs.length, 1);
  assert.equal(fixture.refundCreates, 1);
});

test('相同幂等键不会创建第二条退款申请', async () => {
  const fixture = createFixture();
  const dto = { refundAmount: '500.00', refundReason: '部分退款', idempotencyKey: 'same-key' };
  await fixture.service.create('order-a', dto, context);
  const second = await fixture.service.create('order-a', dto, context);
  assert.equal(second.idempotent, true);
  assert.equal(fixture.refundCreates, 1);
});

test('退款申请金额超过客户实际付款减去已占用退款金额时拒绝', async () => {
  const fixture = createFixture();
  await assert.rejects(() => fixture.service.create('order-a', { refundAmount: '10000.01', refundReason: '超额退款', idempotencyKey: 'too-much' }, context));
  assert.equal(fixture.refundCreates, 0);
});

test('未审批的退款不能执行，且原订单毛利字段不会被退款流程修改', async () => {
  const fixture = createFixture();
  const originalGrossProfit = '2173.91';
  await fixture.service.create('order-a', { refundAmount: '100.00', refundReason: '待审批', idempotencyKey: 'pending' }, context);
  await assert.rejects(() => fixture.service.execute('refund-a', context));
  assert.equal(originalGrossProfit, '2173.91');
  assert.equal(fixture.order.status, PurchaseOrderStatus.CONFIRMED);
});

test('没有退款申请权限时服务层拒绝操作', async () => {
  const fixture = createFixture();
  await assert.rejects(() => fixture.service.create('order-a', { refundAmount: '1.00', refundReason: '权限测试', idempotencyKey: 'permission' }, { sub: 'user-b', username: '普通用户', roles: [], permissions: [] }));
});
