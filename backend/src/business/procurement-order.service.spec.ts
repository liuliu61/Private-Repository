import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, ProfitStatus, PurchaseOrderStatus, RebateCalculationMode, RebateRuleType, SupplierPlatform } from '@prisma/client';
import { isPurchaseOrderTransitionAllowed, ProcurementOrderService } from './procurement-order.service';
import { GrossProfitCalculator } from './gross-profit.calculator';
import { SupplierCostCalculator } from './supplier-cost.calculator';
import { RebateCalculator } from '../rebate/rebate.calculator';

test('外采订单状态机只允许指定方向转换', () => {
  assert.equal(isPurchaseOrderTransitionAllowed(PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_CONFIRMATION), true);
  assert.equal(isPurchaseOrderTransitionAllowed(PurchaseOrderStatus.PENDING_CONFIRMATION, PurchaseOrderStatus.CONFIRMED), true);
  assert.equal(isPurchaseOrderTransitionAllowed(PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.SETTLED), true);
  assert.equal(isPurchaseOrderTransitionAllowed(PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.CANCELLED), true);
  assert.equal(isPurchaseOrderTransitionAllowed(PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.CANCELLED), false);
  assert.equal(isPurchaseOrderTransitionAllowed(PurchaseOrderStatus.SETTLED, PurchaseOrderStatus.DRAFT), false);
});

test('创建订单保存客户和供应商政策快照，并完成成本与毛利计算', async () => {
  const created: any[] = [];
  const tx = {
    purchaseOrder: { create: async ({ data }: any) => { const row = { id: 'order-a', ...data, paymentAmount: new Prisma.Decimal(0), rebateAmount: new Prisma.Decimal(0), creditAmount: new Prisma.Decimal(0), createdAt: new Date(), updatedAt: new Date() }; created.push(row); return row; } },
    auditLog: { create: async () => undefined },
  } as never;
  const prisma = {
    customer: { findUnique: async () => ({ id: 'customer-a', agentId: 'org-a', status: 'ACTIVE' }) },
    supplier: { findUnique: async () => ({ id: 'supplier-a', organizationId: 'org-a', status: 'ACTIVE', platform: SupplierPlatform.DOUYIN }) },
    adSubject: { findUnique: async () => ({ id: 'subject-a', organizationId: 'org-a', platform: SupplierPlatform.DOUYIN, status: 'ACTIVE' }) },
    adAccount: { findUnique: async () => ({ id: 'account-a', subjectId: 'subject-a', customerId: 'customer-a', platform: SupplierPlatform.DOUYIN, status: 'ACTIVE' }) },
    account: { findUnique: async () => ({ id: 'cash-account-a', organizationId: 'org-a', currency: 'CNY', status: 'ACTIVE' }) },
    $transaction: async (callback: (value: unknown) => unknown) => callback(tx),
  } as never;
  const scope = { assertOrganizationAccess: async () => undefined, assertAccountAccess: async () => undefined, getOrganizationIds: async () => ['org-a'], isSuperAdmin: () => true } as never;
  const policyResolver = {
    resolveCustomerRebatePolicy: async () => ({ customerPolicyId: 'customer-policy', customerPolicyVersionId: 'customer-version', policyId: 'customer-policy', policyVersionId: 'customer-version', version: 1, rebateType: RebateRuleType.PRIVATE_DIVIDE, calculationMode: RebateCalculationMode.CREDIT_TO_CASH, rate: new Prisma.Decimal('10'), effectiveFrom: new Date('2026-09-01'), effectiveTo: null }),
    resolveSupplierRebatePolicy: async () => ({ supplierPolicyId: 'supplier-policy', supplierPolicyVersionId: 'supplier-version', policyId: 'supplier-policy', policyVersionId: 'supplier-version', version: 1, matchLevel: 'ACCOUNT' as const, rebateType: RebateRuleType.PRIVATE_DIVIDE, calculationMode: RebateCalculationMode.CREDIT_TO_CASH, rate: new Prisma.Decimal('8'), effectiveFrom: new Date('2026-09-01'), effectiveTo: null }),
  } as never;
  const calculator = new RebateCalculator();
  const cashflow = {} as never;
  const service = new ProcurementOrderService(prisma, scope, policyResolver, calculator, new SupplierCostCalculator(calculator), new GrossProfitCalculator(), cashflow);

  await service.create({ organizationId: 'org-a', customerId: 'customer-a', supplierId: 'supplier-a', platform: SupplierPlatform.DOUYIN, subjectId: 'subject-a', accountId: 'account-a', cashAccountId: 'cash-account-a', baseAmount: '10000.00', businessTime: '2026-09-10T10:00:00.000Z' }, { sub: 'user-a', username: '用户A', roles: ['FINANCE'], permissions: ['PROCUREMENT_CREATE'] });

  assert.equal(created[0].customerPolicyVersionId, 'customer-version');
  assert.equal(created[0].supplierPolicyVersionId, 'supplier-version');
  assert.equal(created[0].customerRebateRate.toFixed(4), '10.0000');
  assert.equal(created[0].customerCalculationMode, RebateCalculationMode.CREDIT_TO_CASH);
  assert.equal(created[0].customerCashAmount.toFixed(2), '9090.91');
  assert.equal(created[0].customerCreditAmount.toFixed(2), '10000.00');
  assert.equal(created[0].customerRebateAmount.toFixed(2), '909.09');
  assert.equal(created[0].supplierRebateRate.toFixed(4), '8.0000');
  assert.equal(created[0].supplierCostRate.toFixed(4), '8.0000');
  assert.equal(created[0].supplierCalculationMode, RebateCalculationMode.CREDIT_TO_CASH);
  assert.equal(created[0].supplierCashAmount.toFixed(2), '9259.26');
  assert.equal(created[0].supplierCreditAmount.toFixed(2), '10000.00');
  assert.equal(created[0].supplierRebateAmount.toFixed(2), '740.74');
  assert.equal(created[0].grossProfit.toFixed(2), '-168.35');
  assert.equal(created[0].profitStatus, ProfitStatus.LOSS);
});

test('查询订单时跨组织访问被拒绝', async () => {
  const prisma = { purchaseOrder: { findUnique: async () => ({ id: 'order-b', organizationId: 'org-b' }) } } as never;
  const scope = { isSuperAdmin: () => false, assertOrganizationAccess: async () => { throw new Error('PERMISSION_DENIED'); } } as never;
  const service = new ProcurementOrderService(prisma, scope, {} as never, {} as never, {} as never, {} as never, {} as never);

  await assert.rejects(() => service.getById('order-b', { sub: 'user-a', username: '用户A', roles: [], permissions: ['PROCUREMENT_VIEW'] }));
});

test('金额计算不完整时禁止进入确认流程', () => {
  const service = new ProcurementOrderService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  assert.throws(() => (service as unknown as { assertCalculationComplete: (order: unknown) => void }).assertCalculationComplete({
    customerCalculationMode: RebateCalculationMode.CREDIT_TO_CASH,
    customerCashAmount: new Prisma.Decimal('9090.91'),
    customerCreditAmount: new Prisma.Decimal('10000.00'),
    customerRebateAmount: new Prisma.Decimal('909.09'),
    supplierCalculationMode: RebateCalculationMode.CREDIT_TO_CASH,
    supplierCashAmount: null,
    supplierCreditAmount: null,
    grossProfit: null,
    profitStatus: null,
  }), (error: unknown) => {
    return error instanceof Error && 'response' in error && JSON.stringify((error as { response?: unknown }).response).includes('PURCHASE_ORDER_CALCULATION_INCOMPLETE');
  });
});

test('读取订单详情直接使用订单快照，不重新解析当前政策', async () => {
  let resolverCalled = false;
  const prisma = { purchaseOrder: { findUnique: async () => ({ id: 'order-a', orderNo: 'PO20260910A', organizationId: 'org-a', amount: new Prisma.Decimal('10000'), baseAmount: new Prisma.Decimal('10000'), customerCreditAmount: new Prisma.Decimal('10000'), customerCashAmount: new Prisma.Decimal('9090.91'), supplierCashAmount: new Prisma.Decimal('9259.26'), grossProfit: new Prisma.Decimal('-168.35') }) } } as never;
  const scope = { isSuperAdmin: () => true, assertOrganizationAccess: async () => undefined } as never;
  const policyResolver = { resolveCustomerRebatePolicy: async () => { resolverCalled = true; throw new Error('不应重新解析政策'); }, resolveSupplierRebatePolicy: async () => { resolverCalled = true; throw new Error('不应重新解析政策'); } } as never;
  const service = new ProcurementOrderService(prisma, scope, policyResolver, {} as never, {} as never, {} as never, {} as never);

  const result = await service.getById('order-a', { sub: 'user-a', username: '用户A', roles: ['FINANCE'], permissions: ['PROCUREMENT_VIEW'] });
  assert.equal(result.customerCashAmount, '9090.91');
  assert.equal(result.supplierCashAmount, '9259.26');
  assert.equal(result.grossProfit, '-168.35');
  assert.equal(resolverCalled, false);
});
