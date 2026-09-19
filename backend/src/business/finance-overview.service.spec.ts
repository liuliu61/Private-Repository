import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { FinanceOverviewService } from './finance-overview.service';

const context = { sub: 'user-a', username: '财务人员', roles: [], permissions: ['FINANCE_VIEW'] };

test('订单利润汇总只使用实际人民币收入、成本和费用', async () => {
  const auditCalls: unknown[] = [];
  const prisma = {
    purchaseOrder: {
      findMany: async () => [{ id: 'order-a', orderNo: 'PO-A', businessTime: new Date('2026-09-10T00:00:00Z'), customerCashAmount: new Prisma.Decimal('50000.00'), supplierCashAmount: new Prisma.Decimal('47826.09'), operatingFeeAmount: new Prisma.Decimal('0.00'), grossProfit: new Prisma.Decimal('-2173.91'), profitStatus: 'LOSS', customerPolicyVersionId: 'customer-v1', supplierPolicyVersionId: 'supplier-v1' }],
      count: async () => 1,
    },
    refund: { groupBy: async () => [] },
    auditLog: { create: async ({ data }: { data: unknown }) => { auditCalls.push(data); } },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  } as never;
  const scope = { isSuperAdmin: () => false, getOrganizationIds: async () => ['org-a'] } as never;
  const result = await new FinanceOverviewService(prisma, scope).getOrderProfit({ page: 1, pageSize: 20 }, context);
  assert.equal(result.items[0].customerCashAmount, '50000.00');
  assert.equal(result.items[0].supplierCashAmount, '47826.09');
  assert.equal(result.items[0].grossProfit, '-2173.91');
  assert.equal(result.items[0].profitStatus, 'LOSS');
  assert.equal(auditCalls.length, 1);
  assert.equal(JSON.stringify(auditCalls[0]).includes('2173.91'), false);
});

test('财务查询无 FINANCE_VIEW 权限时拒绝', async () => {
  const service = new FinanceOverviewService({} as never, { isSuperAdmin: () => false } as never);
  await assert.rejects(() => service.getOrderProfit({ page: 1, pageSize: 20 }, { ...context, permissions: [] }), (error: unknown) => error instanceof Error && 'response' in error && JSON.stringify((error as { response?: unknown }).response).includes('PERMISSION_DENIED'));
});

test('供应商 CNY 账户与 ACCOUNT_CREDIT 账户分开返回，不混合余额', async () => {
  const prisma = {
    supplier: { findUnique: async () => ({ id: 'supplier-a', name: '供应商A', organizationId: 'org-a' }) },
    purchaseOrderPayment: { findMany: async () => [] },
    purchaseOrder: { findMany: async () => [] },
    supplierAccount: { findMany: async () => [{ id: 'cny-a', accountName: '人民币账户', currency: 'CNY', currentBalance: new Prisma.Decimal('100.00') }] },
    promotionAccount: { findMany: async () => [{ id: 'credit-a', accountName: '账户币账户', currentBalance: new Prisma.Decimal('55000.00') }] },
    promotionTransaction: { findMany: async () => [{ promotionAccountId: 'credit-a', changeAmount: new Prisma.Decimal('55000.00') }] },
    auditLog: { create: async () => undefined },
  } as never;
  const scope = { isSuperAdmin: () => false, assertOrganizationAccess: async () => undefined } as never;
  const result = await new FinanceOverviewService(prisma, scope).getSupplier('supplier-a', {}, context);
  assert.equal(result.cnyAccounts[0].balance, '100.00');
  assert.equal(result.creditAccounts[0].balance, '55000.00');
  assert.equal(result.creditAccounts[0].totalReceived, '55000.00');
});

test('亏损订单按实际人民币金额返回 LOSS，不按返点比例差计算', async () => {
  const prisma = {
    purchaseOrder: {
      findMany: async () => [{ id: 'order-loss', orderNo: 'PO-LOSS', businessTime: new Date('2026-09-10T00:00:00Z'), customerCashAmount: new Prisma.Decimal('50000.00'), supplierCashAmount: new Prisma.Decimal('40000.00'), operatingFeeAmount: new Prisma.Decimal('0.00'), grossProfit: new Prisma.Decimal('-10000.00'), profitStatus: 'LOSS', customerPolicyVersionId: 'customer-v1', supplierPolicyVersionId: 'supplier-v1' }],
      count: async () => 1,
    },
    refund: { groupBy: async () => [] },
    auditLog: { create: async () => undefined },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  } as never;
  const scope = { isSuperAdmin: () => false, getOrganizationIds: async () => ['org-a'] } as never;
  const result = await new FinanceOverviewService(prisma, scope).getOrderProfit({ page: 1, pageSize: 20 }, context);
  assert.equal(result.items[0].grossProfit, '-10000.00');
  assert.equal(result.items[0].profitStatus, 'LOSS');
});
