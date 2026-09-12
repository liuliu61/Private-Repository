import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, ReconciliationStatus, TransactionBusinessType } from '@prisma/client';
import { ReconciliationCenterService } from './reconciliation-center.service';

const financeContext = { sub: 'finance-a', username: '财务人员', roles: ['FINANCE'], permissions: ['FINANCE_RECONCILIATION_VIEW', 'FINANCE_RECONCILIATION_CREATE', 'FINANCE_RECONCILIATION_CONFIRM'] };
const period = { periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' };

function fixture(options: { balance?: string; transactions?: any[]; promotionBalance?: string; promotionTransactions?: any[]; profitMismatch?: boolean } = {}) {
  let reconciliation: any = null;
  const account = { id: 'account-a', organizationId: 'org-a', currency: 'CNY', openingBalance: new Prisma.Decimal('10000.00'), currentBalance: new Prisma.Decimal(options.balance ?? '12000.30') };
  const promotionAccount = { id: 'promotion-a', organizationId: 'org-a', unit: 'ACCOUNT_CREDIT', currentBalance: new Prisma.Decimal(options.promotionBalance ?? '5000.00') };
  const transactions = options.transactions ?? [
    { businessType: TransactionBusinessType.RECHARGE, changeAmount: new Prisma.Decimal('2000.10'), occurredAt: new Date('2026-09-10T00:00:00.000Z') },
    { businessType: TransactionBusinessType.RECEIPT, changeAmount: new Prisma.Decimal('0.20'), occurredAt: new Date('2026-09-11T00:00:00.000Z') },
  ];
  const promotionTransactions = options.promotionTransactions ?? [{ businessType: 'CUSTOMER_CREDIT', changeAmount: new Prisma.Decimal('5000.00'), occurredAt: new Date('2026-09-10T00:00:00.000Z') }];
  const order = { id: 'order-a', orderNo: 'PO-A', customerCashAmount: new Prisma.Decimal('100.00'), supplierCashAmount: new Prisma.Decimal('10.00'), operatingFeeAmount: new Prisma.Decimal('0.00'), grossProfit: new Prisma.Decimal(options.profitMismatch ? '80.00' : '90.00') };
  const tx: any = {
    transaction: { findMany: async () => transactions },
    promotionTransaction: { findMany: async () => promotionTransactions },
    account: { findUnique: async () => account },
    promotionAccount: { findUnique: async () => promotionAccount },
    purchaseOrder: { findMany: async () => [order] },
    refund: { groupBy: async () => [] },
    reconciliation: {
      findFirst: async () => reconciliation,
      create: async ({ data }: any) => { reconciliation = { id: 'reconciliation-a', createdAt: new Date(), updatedAt: new Date(), ...data }; return reconciliation; },
      findUnique: async () => reconciliation,
      update: async ({ data }: any) => { reconciliation = { ...reconciliation, ...data, updatedAt: new Date() }; return reconciliation; },
    },
    auditLog: { create: async () => undefined },
    $queryRaw: async () => [],
  };
  const prisma: any = {
    ...tx,
    $transaction: async (callback: any) => callback(tx),
    reconciliation: tx.reconciliation,
  };
  const scope: any = {
    isSuperAdmin: () => false,
    getOrganizationIds: async () => ['org-a'],
    assertOrganizationAccess: async (organizationId: string) => { if (organizationId !== 'org-a') throw new Error('无权访问该组织数据'); },
  };
  return new ReconciliationCenterService(prisma, scope);
}

test('CNY账户余额一致时对账通过，金额保持Decimal两位精度', async () => {
  const service: any = fixture();
  const generated = await service.generate({ accountId: 'account-a', ...period }, financeContext);
  assert.equal(generated.calculatedBalance, '12000.30');
  assert.equal(generated.systemBalance, '12000.30');
  const checked = await service.check(generated.id, financeContext);
  assert.equal(checked.status, ReconciliationStatus.PASSED);
  assert.equal(checked.difference, '0.00');
});

test('余额累计错误时对账失败且返回差额', async () => {
  const service: any = fixture({ balance: '12001.30' });
  const generated = await service.generate({ accountId: 'account-a', ...period }, financeContext);
  const checked = await service.check(generated.id, financeContext);
  assert.equal(checked.status, ReconciliationStatus.FAILED);
  assert.equal(checked.difference, '1.00');
});

test('推广账户独立核算，不与CNY账户混算', async () => {
  const service: any = fixture();
  const generated = await service.generate({ promotionAccountId: 'promotion-a', ...period }, financeContext);
  assert.equal(generated.calculatedBalance, '5000.00');
  assert.equal(generated.systemBalance, '5000.00');
  assert.equal(generated.incomeAmount, '5000.00');
  assert.equal(generated.accountId, null);
});

test('利润快照不一致时记录异常并使对账失败', async () => {
  const service: any = fixture({ profitMismatch: true });
  const generated = await service.generate({ accountId: 'account-a', ...period }, financeContext);
  const checked = await service.check(generated.id, financeContext);
  assert.equal(checked.status, ReconciliationStatus.FAILED);
  assert.equal(checked.profitAnomalyCount, 1);
});

test('无权限用户不能生成对账，跨组织账户不能访问', async () => {
  const service: any = fixture();
  await assert.rejects(() => service.generate({ accountId: 'account-a', ...period }, { sub: 'user-b', username: '普通用户', roles: [], permissions: [] }));
  const crossOrg: any = fixture();
  crossOrg.scope = { isSuperAdmin: () => false, getOrganizationIds: async () => ['org-b'], assertOrganizationAccess: async () => { throw new Error('无权访问该组织数据'); } };
  await assert.rejects(() => crossOrg.generate({ accountId: 'account-a', ...period }, financeContext));
});

test('对账确认只允许PASSED状态且重复确认幂等', async () => {
  const service: any = fixture();
  const generated = await service.generate({ accountId: 'account-a', ...period }, financeContext);
  await service.check(generated.id, financeContext);
  const confirmed = await service.confirm(generated.id, financeContext);
  assert.equal(confirmed.status, ReconciliationStatus.CONFIRMED);
  const repeated = await service.confirm(generated.id, financeContext);
  assert.equal(repeated.idempotent, true);
});
