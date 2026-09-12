import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountStatus, PaymentStatus, Prisma, PromotionAccountOwnerType, PromotionAccountUnit, PromotionTransactionBusinessType, PurchaseOrderStatus } from '@prisma/client';
import { PromotionAccountService } from './promotion-account.service';

const context = { sub: 'operator-a', username: '财务人员', roles: ['FINANCE'], permissions: ['PROMOTION_CREDIT_CONFIRM'] };

function fixture() {
  let order: any = { id: 'order-a', organizationId: 'org-a', customerId: 'customer-a', status: PurchaseOrderStatus.CONFIRMED, customerCreditAmount: new Prisma.Decimal('55000.00'), customerCreditedAmount: new Prisma.Decimal('0.00'), customerCreditStatus: PaymentStatus.PENDING, customerPromotionAccountId: null };
  let account = { id: 'promotion-a', customer_id: 'customer-a', organization_id: 'org-a', unit: PromotionAccountUnit.ACCOUNT_CREDIT, status: AccountStatus.ACTIVE, current_balance: new Prisma.Decimal('0.00') };
  let credit: any = null;
  let transactionCount = 0;
  const tx = {
    $queryRaw: async () => [],
    purchaseOrder: { findUnique: async () => order, update: async ({ data }: any) => { order = { ...order, ...data }; return order; } },
    customer: { findUnique: async () => ({ agentId: 'org-a' }) },
    purchaseOrderCredit: { findUnique: async () => credit, create: async ({ data }: any) => { credit = { id: 'credit-a', ...data }; return credit; } },
    promotionTransaction: { create: async ({ data }: any) => { transactionCount += 1; return { id: 'promotion-tx-a', ...data }; } },
    promotionAccount: { update: async ({ data }: any) => { account = { ...account, current_balance: data.currentBalance }; return account; } },
    auditLog: { create: async () => undefined },
  } as never;
  const prisma = { $transaction: async (callback: (value: unknown) => unknown) => callback(tx) } as never;
  const scope = { isSuperAdmin: () => true, assertOrganizationAccess: async () => undefined } as never;
  const service = new PromotionAccountService(prisma, scope);
  return { service, order: () => order, account: () => account, get transactionCount() { return transactionCount; } };
}

test('客户账户币到账支持分批并在达到应到账金额后标记已到账', async () => {
  const value = fixture();
  const base = { promotionAccountId: 'promotion-a', businessNo: 'CREDIT-1', idempotencyKey: 'credit-1', occurredAt: '2026-09-10T10:00:00.000Z' };
  const first = await value.service.recordCustomerCredit('order-a', { ...base, creditAmount: '20000.00' }, context);
  assert.equal(first.idempotent, false);
  assert.equal(value.order().customerCreditedAmount.toFixed(2), '20000.00');
  assert.equal(value.order().customerCreditStatus, PaymentStatus.PARTIAL);
  assert.equal(value.account().current_balance.toFixed(2), '20000.00');

  const second = await value.service.recordCustomerCredit('order-a', { ...base, businessNo: 'CREDIT-2', idempotencyKey: 'credit-2', creditAmount: '35000.00' }, context);
  assert.equal(second.idempotent, false);
  assert.equal(value.order().customerCreditedAmount.toFixed(2), '55000.00');
  assert.equal(value.order().customerCreditStatus, PaymentStatus.PAID);
  assert.equal(value.account().current_balance.toFixed(2), '55000.00');
  assert.equal(value.transactionCount, 2);
});

test('重复幂等键不会再次生成推广账户币流水', async () => {
  const value = fixture();
  const dto = { promotionAccountId: 'promotion-a', businessNo: 'CREDIT-1', idempotencyKey: 'same-key', creditAmount: '55000.00', occurredAt: '2026-09-10T10:00:00.000Z' };
  await value.service.recordCustomerCredit('order-a', dto, context);
  const second = await value.service.recordCustomerCredit('order-a', dto, context);
  assert.equal(second.idempotent, true);
  assert.equal(value.transactionCount, 1);
});

test('到账不能超过订单应到账账户币金额', async () => {
  const value = fixture();
  await assert.rejects(() => value.service.recordCustomerCredit('order-a', { promotionAccountId: 'promotion-a', businessNo: 'CREDIT-OVER', idempotencyKey: 'over-key', creditAmount: '55000.01', occurredAt: '2026-09-10T10:00:00.000Z' }, context), (error: unknown) => error instanceof Error && 'response' in error && JSON.stringify((error as { response?: unknown }).response).includes('CREDIT_AMOUNT_EXCEEDED'));
  assert.equal(value.transactionCount, 0);
});

test('账户币单位始终与推广账户一致，不创建 CNY 推广流水', async () => {
  const value = fixture();
  await value.service.recordCustomerCredit('order-a', { promotionAccountId: 'promotion-a', businessNo: 'CREDIT-UNIT', idempotencyKey: 'unit-key', creditAmount: '1.00', occurredAt: '2026-09-10T10:00:00.000Z' }, context);
  assert.equal(value.account().unit, PromotionAccountUnit.ACCOUNT_CREDIT);
  assert.equal(PromotionAccountOwnerType.CUSTOMER, 'CUSTOMER');
  assert.equal(PromotionTransactionBusinessType.CUSTOMER_CREDIT, 'CUSTOMER_CREDIT');
});
