import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountUnit, FinancialAdjustmentStatus, FinancialAdjustmentType, Prisma } from '@prisma/client';
import { FinancialAdjustmentService } from './financial-adjustment.service';

const createContext = { sub: 'finance-a', username: '财务人员', roles: ['FINANCE'], permissions: ['FINANCE_ADJUST_VIEW', 'FINANCE_ADJUST_CREATE', 'FINANCE_ADJUST_APPROVE', 'FINANCE_ADJUST_EXECUTE'] };

function fixture(options: { accountType?: AccountUnit; failExecution?: boolean; organizationId?: string } = {}) {
  const accountType = options.accountType ?? AccountUnit.CNY;
  let row: any = null;
  let updateCount = 0;
  const account = { id: 'account-a', organizationId: options.organizationId ?? 'org-a', currency: 'CNY', status: 'ACTIVE' };
  const promotionAccount = { id: 'promotion-a', organizationId: options.organizationId ?? 'org-a', unit: 'ACCOUNT_CREDIT', status: 'ACTIVE' };
  const tx: any = {
    $queryRaw: async () => [],
    financialAdjustment: {
      create: async ({ data }: any) => { row = { id: 'adjustment-a', adjustmentNo: 'ADJ202609110001', createdAt: new Date(), updatedAt: new Date(), ...data }; return row; },
      findUnique: async () => row,
      update: async ({ data }: any) => { updateCount += 1; row = { ...row, ...data }; return row; },
    },
    auditLog: { create: async () => undefined },
  };
  const prisma: any = {
    account: { findUnique: async () => account },
    promotionAccount: { findUnique: async () => promotionAccount },
    financialAdjustment: tx.financialAdjustment,
    $transaction: async (callback: any) => callback(tx),
  };
  const cashflow: any = {
    createTransactionInTransaction: async (_tx: unknown, input: any) => {
      if (options.failExecution) throw new Error('模拟流水写入失败');
      return { id: 'transaction-a', transactionNo: 'TX-ADJUST-001', accountId: input.accountId, businessType: 'ADJUSTMENT', businessNo: input.businessNo, changeAmount: input.changeAmount.toFixed(2), balanceBefore: '1000.00', balanceAfter: input.changeAmount.isNegative() ? '900.00' : '1100.00' };
    },
    createPromotionTransactionInTransaction: async (_tx: unknown, input: any) => {
      if (options.failExecution) throw new Error('模拟推广流水写入失败');
      return { id: 'promotion-transaction-a', transactionNo: 'PTX-ADJUST-001', promotionAccountId: input.promotionAccountId, businessType: 'ADJUSTMENT', businessNo: input.businessNo, changeAmount: input.changeAmount.toFixed(2), balanceBefore: '500.00', balanceAfter: input.changeAmount.isNegative() ? '400.00' : '600.00' };
    },
  };
  const scope: any = { isSuperAdmin: () => false, getOrganizationIds: async () => ['org-a'], assertOrganizationAccess: async (organizationId: string) => { if (organizationId !== 'org-a') throw new Error('无权访问该组织数据'); } };
  return { service: new FinancialAdjustmentService(prisma, cashflow, scope), getRow: () => row, getUpdateCount: () => updateCount, scope };
}

test('创建、审批、执行CNY调整并生成ADJUSTMENT流水', async () => {
  const { service, getRow } = fixture();
  const created = await service.create({ accountId: 'account-a', accountType: AccountUnit.CNY, type: FinancialAdjustmentType.INCOME, amount: '100.10', reason: '人工补录收入' }, createContext);
  assert.equal(created.status, FinancialAdjustmentStatus.DRAFT);
  await service.approve(created.id, createContext);
  const executed = await service.execute(created.id, createContext);
  assert.equal(executed.adjustment.status, FinancialAdjustmentStatus.EXECUTED);
  assert.equal(executed.transaction.businessType, 'ADJUSTMENT');
  assert.equal(executed.transaction.changeAmount, '100.10');
  assert.equal(getRow().executedBy, createContext.sub);
});

test('支出调整生成负数变动，重复执行幂等且不产生第二次流水', async () => {
  const { service, getUpdateCount } = fixture();
  const created = await service.create({ accountId: 'account-a', accountType: AccountUnit.CNY, type: FinancialAdjustmentType.EXPENSE, amount: '0.30', reason: '银行手续费' }, createContext);
  await service.approve(created.id, createContext);
  const first = await service.execute(created.id, createContext);
  assert.equal(first.transaction.changeAmount, '-0.30');
  const countBefore = getUpdateCount();
  const second = await service.execute(created.id, createContext);
  assert.equal(second.idempotent, true);
  assert.equal(getUpdateCount(), countBefore);
});

test('审批拒绝后不能执行', async () => {
  const { service } = fixture();
  const created = await service.create({ accountId: 'account-a', accountType: AccountUnit.CNY, type: FinancialAdjustmentType.INCOME, amount: '1.00', reason: '测试拒绝' }, createContext);
  await service.reject(created.id, createContext);
  await assert.rejects(() => service.execute(created.id, createContext));
});

test('流水写入失败时调整单不会变为EXECUTED', async () => {
  const { service, getRow } = fixture({ failExecution: true });
  const created = await service.create({ accountId: 'account-a', accountType: AccountUnit.CNY, type: FinancialAdjustmentType.INCOME, amount: '10.00', reason: '失败回滚' }, createContext);
  await service.approve(created.id, createContext);
  await assert.rejects(() => service.execute(created.id, createContext));
  assert.equal(getRow().status, FinancialAdjustmentStatus.APPROVED);
  assert.equal(getRow().executedAt, undefined);
});

test('ACCOUNT_CREDIT调整只调用推广账户流水，不触碰CNY账户', async () => {
  const { service } = fixture({ accountType: AccountUnit.ACCOUNT_CREDIT });
  const created = await service.create({ promotionAccountId: 'promotion-a', accountType: AccountUnit.ACCOUNT_CREDIT, type: FinancialAdjustmentType.INCOME, amount: '0.10', reason: '账户币调账' }, createContext);
  await service.approve(created.id, createContext);
  const result = await service.execute(created.id, createContext);
  assert.equal(result.transaction.promotionAccountId, 'promotion-a');
  assert.equal(result.transaction.changeAmount, '0.10');
});

test('权限不足和跨组织访问被拒绝', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.create({ accountId: 'account-a', accountType: AccountUnit.CNY, type: FinancialAdjustmentType.INCOME, amount: '1.00', reason: '无权限' }, { sub: 'user-b', username: '普通用户', roles: [], permissions: [] }));
  const crossOrg = fixture({ organizationId: 'org-b' });
  await assert.rejects(() => crossOrg.service.create({ accountId: 'account-a', accountType: AccountUnit.CNY, type: FinancialAdjustmentType.INCOME, amount: '1.00', reason: '跨组织' }, createContext));
});
