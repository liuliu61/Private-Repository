import { AccountStatus, AccountUnit, CustomerWalletTransactionType, CustomerWalletType, Prisma, PromotionAccountOwnerType, PromotionAccountUnit } from '@prisma/client';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CustomerWalletService } from './customer-wallet.service';
import { WalletAdjustmentDirection } from './business.dto';

const organizationId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';
const operatorId = '00000000-0000-4000-8000-000000000003';

function decimal(value: string) { return new Prisma.Decimal(value); }
function walletRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return { id: '00000000-0000-4000-8000-000000000010', customerId, organizationId, walletName: '客户钱包', walletType: CustomerWalletType.FINANCE_V, unit: AccountUnit.CNY, cashBalance: decimal('0.00'), groupBalance: decimal('0.00'), creditLimit: decimal('0.00'), creditUsed: decimal('0.00'), advanceOutstanding: decimal('0.00'), status: AccountStatus.ACTIVE as AccountStatus, createdAt: now, updatedAt: now, customer: { id: customerId, name: '客户A', customerCode: 'C001', agentId: organizationId }, ...overrides };
}

function createFixture(withWallet = true) {
  const wallets = withWallet ? [walletRow()] : [];
  const walletTransactions: any[] = [];
  const promotions = [
    { customerId, ownerType: PromotionAccountOwnerType.CUSTOMER, unit: PromotionAccountUnit.ACCOUNT_CREDIT, currentBalance: decimal('30000.00') },
    { customerId, ownerType: PromotionAccountOwnerType.CUSTOMER, unit: PromotionAccountUnit.ACCOUNT_CREDIT, currentBalance: decimal('20000.00') },
  ];
  let txChain: Promise<unknown> = Promise.resolve();
  const prisma: any = {
    // 真实库行锁（SELECT ... FOR UPDATE）会串行化事务；mock 用队列模拟，避免并发 lost-update
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const run = txChain.then(() => callback(prisma));
      txChain = run.then(() => undefined, () => undefined);
      return run;
    },
    $queryRaw: async () => [],
    customer: { findUnique: async ({ where: { id } }: any) => id === customerId ? { id, name: '客户A', agentId: organizationId, status: 'ACTIVE' } : null },
    customerWallet: {
      findUnique: async ({ where: { id, customerId: idByCustomer } }: any) => wallets.find((item) => (id ? item.id === id : item.customerId === idByCustomer)) || null,
      findMany: async () => wallets,
      create: async ({ data }: any) => { const row = walletRow({ id: `wallet-${wallets.length + 1}`, ...data }); wallets.push(row); return row; },
      update: async ({ where: { id }, data }: any) => { const row = wallets.find((item) => item.id === id); if (!row) throw new Error('钱包不存在'); Object.assign(row, data); return row; },
    },
    customerWalletTransaction: {
      findUnique: async ({ where: { idempotencyKey } }: any) => walletTransactions.find((item) => item.idempotencyKey === idempotencyKey) || null,
      findMany: async ({ where }: any) => walletTransactions.filter((item) => item.walletId === where.walletId),
      count: async ({ where }: any) => walletTransactions.filter((item) => item.walletId === where.walletId).length,
      create: async ({ data }: any) => { const row = { id: `tx-${walletTransactions.length + 1}`, ...data }; walletTransactions.push(row); return row; },
      aggregate: async ({ where }: any) => ({ _sum: { changeAmount: walletTransactions.filter((item) => item.walletId === where.walletId).reduce((sum, item) => sum.add(item.changeAmount), decimal('0.00')) } }),
    },
    promotionAccount: {
      groupBy: async () => [{ customerId, _sum: { currentBalance: decimal('50000.00') } }],
      aggregate: async () => ({ _sum: { currentBalance: decimal('50000.00') } }),
    },
    auditLog: { create: async () => ({}) },
  };
  const scope: any = { isSuperAdmin: () => false, getOrganizationIds: async () => [organizationId], assertOrganizationAccess: async (id: string) => { if (id !== organizationId) throw new Error('PERMISSION_DENIED'); } };
  const context: any = { sub: operatorId, username: '财务', roles: ['FINANCE'], permissions: ['FINANCE_WALLET_VIEW', 'FINANCE_WALLET_ADJUST', 'FINANCE_WALLET_OPENING_BALANCE'] };
  return { service: new CustomerWalletService(prisma, scope), context, wallets, walletTransactions };
}

test('客户钱包创建、查询和多推广账户聚合', async () => {
  const fixture = createFixture(false);
  const created = await fixture.service.create({ customerId, walletName: '客户A钱包' }, fixture.context);
  assert.equal(created.unit, AccountUnit.CNY);
  const detail = await fixture.service.getById(fixture.wallets[0].id, fixture.context);
  assert.equal(detail.groupBalance, '50000.00');
  assert.equal(detail.totalBalance, '50000.00');
});

test('授信余额和可用余额使用Decimal计算', async () => {
  const fixture = createFixture();
  const updated = await fixture.service.updateCredit(fixture.wallets[0].id, { creditLimit: '10000.00', creditUsed: '2500.00' }, fixture.context);
  assert.equal(updated.creditAvailable, '7500.00');
  assert.equal(decimal('0.1').add(decimal('0.2')).toFixed(2), '0.30');
});

test('期初、蓝补、红冲都生成钱包流水并保持余额一致', async () => {
  const fixture = createFixture();
  await fixture.service.openingBalance(fixture.wallets[0].id, { amount: '10000.00', idempotencyKey: 'opening-1' }, fixture.context);
  await fixture.service.adjust(fixture.wallets[0].id, { type: CustomerWalletTransactionType.ADJUSTMENT_BLUE, amount: '2000.00', idempotencyKey: 'blue-1' }, fixture.context);
  await fixture.service.adjust(fixture.wallets[0].id, { type: CustomerWalletTransactionType.ADJUSTMENT_RED, amount: '500.00', idempotencyKey: 'red-1' }, fixture.context);
  assert.equal(fixture.wallets[0].cashBalance.toFixed(2), '11500.00');
  assert.equal(fixture.walletTransactions.length, 3);
  assert.equal((await fixture.service.checkBalance(fixture.wallets[0].id, fixture.context)).consistent, true);
});

test('手工调整、幂等和禁用钱包限制', async () => {
  const fixture = createFixture();
  const first = await fixture.service.adjust(fixture.wallets[0].id, { type: CustomerWalletTransactionType.MANUAL_ADJUSTMENT, direction: WalletAdjustmentDirection.EXPENSE, amount: '100.00', idempotencyKey: 'manual-1' }, fixture.context);
  const second = await fixture.service.adjust(fixture.wallets[0].id, { type: CustomerWalletTransactionType.MANUAL_ADJUSTMENT, direction: WalletAdjustmentDirection.EXPENSE, amount: '100.00', idempotencyKey: 'manual-1' }, fixture.context);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  fixture.wallets[0].status = AccountStatus.DISABLED;
  await assert.rejects(() => fixture.service.adjust(fixture.wallets[0].id, { type: CustomerWalletTransactionType.ADJUSTMENT_BLUE, amount: '1.00' }, fixture.context), /停用/);
});

test('客户钱包拒绝混用CNY单位', async () => {
  const fixture = createFixture();
  await assert.rejects(() => fixture.service.create({ customerId, unit: AccountUnit.ACCOUNT_CREDIT }, fixture.context), /只支持CNY/);
});

test('并发钱包调整最终余额等于全部流水合计', async () => {
  const fixture = createFixture();
  await Promise.all([
    fixture.service.adjust(fixture.wallets[0].id, { type: CustomerWalletTransactionType.ADJUSTMENT_BLUE, amount: '5000.00', idempotencyKey: 'parallel-1' }, fixture.context),
    fixture.service.adjust(fixture.wallets[0].id, { type: CustomerWalletTransactionType.ADJUSTMENT_RED, amount: '3000.00', idempotencyKey: 'parallel-2' }, fixture.context),
  ]);
  assert.equal(fixture.wallets[0].cashBalance.toFixed(2), '2000.00');
});
