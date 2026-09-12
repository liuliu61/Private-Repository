import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PurchaseOrderStatus, PurchasePaymentType, SettlementStatus, SettlementType } from '@prisma/client';
import { SettlementCenterService } from './settlement-center.service';

const financeContext = { sub: 'finance-a', username: '财务人员', roles: ['FINANCE'], permissions: ['FINANCE_SETTLEMENT_VIEW', 'FINANCE_SETTLEMENT_CREATE', 'FINANCE_SETTLEMENT_CONFIRM', 'FINANCE_SETTLEMENT_CANCEL'] };

function fixture() {
  const orders: any[] = [
    { id: 'order-a', orderNo: 'PO-A', organizationId: 'org-a', customerId: 'customer-a', supplierId: 'supplier-a', status: PurchaseOrderStatus.CONFIRMED, baseAmount: new Prisma.Decimal('50000.00'), customerCashAmount: new Prisma.Decimal('50000.00'), customerCreditedAmount: new Prisma.Decimal('55000.00'), customerRebateAmount: new Prisma.Decimal('5000.00'), supplierCashAmount: new Prisma.Decimal('47826.09'), supplierCreditAmount: new Prisma.Decimal('55000.00'), supplierRebateAmount: new Prisma.Decimal('7173.91'), grossProfit: new Prisma.Decimal('2173.91'), businessTime: new Date('2026-09-10T10:00:00.000Z') },
    { id: 'order-b', orderNo: 'PO-B', organizationId: 'org-a', customerId: 'customer-a', supplierId: 'supplier-a', status: PurchaseOrderStatus.CONFIRMED, baseAmount: new Prisma.Decimal('30000.00'), customerCashAmount: new Prisma.Decimal('30000.00'), customerCreditedAmount: new Prisma.Decimal('33000.00'), customerRebateAmount: new Prisma.Decimal('3000.00'), supplierCashAmount: new Prisma.Decimal('31000.00'), supplierCreditAmount: new Prisma.Decimal('33000.00'), supplierRebateAmount: new Prisma.Decimal('2000.00'), grossProfit: new Prisma.Decimal('-1000.00'), businessTime: new Date('2026-09-20T10:00:00.000Z') },
  ];
  let existingSettlement: any = null;
  const tx: any = {
    purchaseOrder: { findMany: async () => orders },
    settlementItem: { findFirst: async () => null, findMany: async () => [] },
    refund: { groupBy: async () => [{ purchaseOrderId: 'order-a', _sum: { refundAmount: new Prisma.Decimal('1000.00') } }] },
    purchaseOrderPayment: { groupBy: async ({ where }: any) => [{ orderId: 'order-a', paymentType: where.paymentType ?? PurchasePaymentType.CUSTOMER_PAYMENT, _sum: { amount: new Prisma.Decimal('49000.00') } }, { orderId: 'order-b', paymentType: where.paymentType ?? PurchasePaymentType.CUSTOMER_PAYMENT, _sum: { amount: new Prisma.Decimal('30000.00') } }] },
    settlement: { create: async ({ data }: any) => { existingSettlement = { id: 'settlement-a', createdAt: new Date(), updatedAt: new Date(), ...data }; return existingSettlement; } },
    auditLog: { create: async () => undefined },
    $queryRaw: async () => [],
  };
  const prisma: any = { $transaction: async (callback: (value: any) => unknown) => callback(tx), customer: { findUnique: async () => ({ id: 'customer-a', agentId: 'org-a', name: '客户A' }) }, supplier: { findUnique: async () => ({ id: 'supplier-a', organizationId: 'org-a', name: '代理A' }) }, settlement: { findFirst: async () => existingSettlement } };
  const scope: any = { isSuperAdmin: () => false, getOrganizationIds: async () => ['org-a'], assertOrganizationAccess: async () => undefined };
  return new SettlementCenterService(prisma, scope);
}

test('客户结算使用订单快照、退款和实际收款汇总', async () => {
  const result: any = await fixture().generateCustomer({ customerId: 'customer-a', periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' }, financeContext);
  assert.equal(result.settlementType, SettlementType.CUSTOMER);
  assert.equal(result.orderCount, 2);
  assert.equal(result.customerCashAmount, '80000.00');
  assert.equal(result.customerRefundAmount, '1000.00');
  assert.equal(result.netCustomerCashAmount, '79000.00');
  assert.equal(result.customerPaidAmount, '79000.00');
  assert.equal(result.grossProfit, '1173.91');
  assert.equal(result.realizedProfit, '173.91');
  assert.equal(result.status, SettlementStatus.GENERATED);
});

test('供应商结算单独汇总供应商现金成本和账户币快照', async () => {
  const result: any = await fixture().generateSupplier({ supplierId: 'supplier-a', periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' }, financeContext);
  assert.equal(result.settlementType, SettlementType.SUPPLIER);
  assert.equal(result.supplierCashAmount, '78826.09');
  assert.equal(result.supplierCreditAmount, '88000.00');
});

test('结算服务没有政策解析依赖，重复生成由幂等查询返回已有结算单', async () => {
  const service: any = fixture();
  const dto = { customerId: 'customer-a', periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' };
  const first = await service.generateCustomer(dto, financeContext);
  const second = await service.generateCustomer(dto, financeContext);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.id, first.id);
});

test('没有结算权限时拒绝生成', async () => {
  await assert.rejects(() => fixture().generateCustomer({ customerId: 'customer-a', periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' }, { sub: 'user-b', username: '普通用户', roles: [], permissions: [] }));
});
