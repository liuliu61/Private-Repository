import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PaymentStatus, PurchaseOrderStatus, PurchasePaymentType, TransactionBusinessType } from '@prisma/client';
import { ProcurementOrderService } from './procurement-order.service';

const context = { sub: 'operator-a', username: '财务人员', roles: ['FINANCE'], permissions: ['PROCUREMENT_CONFIRM'] };

function createPaymentService(options: { failCompanyTransaction?: boolean } = {}) {
  let order: any = {
    id: 'order-a', orderNo: 'PO20260910A', organizationId: 'org-a', status: PurchaseOrderStatus.CONFIRMED,
    customerId: 'customer-a', supplierId: 'supplier-a', amount: new Prisma.Decimal('10000.00'), baseAmount: new Prisma.Decimal('10000.00'),
    cashAccountId: 'cash-a', customerReceivable: new Prisma.Decimal('10000.00'), customerCashAmount: new Prisma.Decimal('10000.00'), customerPaidAmount: new Prisma.Decimal('0.00'), customerPaymentStatus: PaymentStatus.PENDING,
    supplierPayable: new Prisma.Decimal('9259.26'), supplierCashAmount: new Prisma.Decimal('9259.26'), supplierPaidAmount: new Prisma.Decimal('0.00'), supplierPaymentStatus: PaymentStatus.PENDING,
  };
  let payment: any = null;
  const companyInputs: any[] = [];
  const supplierInputs: any[] = [];
  let paymentCreates = 0;
  let orderUpdates = 0;
  const tx = {
    $queryRaw: async () => [],
    purchaseOrder: {
      findUnique: async () => order,
      update: async ({ data }: any) => { order = { ...order, ...data }; orderUpdates += 1; return order; },
    },
    purchaseOrderPayment: {
      findUnique: async ({ where }: any) => (payment && payment.idempotencyKey === where.orderId_paymentType_idempotencyKey.idempotencyKey ? payment : null),
      create: async ({ data }: any) => { paymentCreates += 1; payment = { id: 'payment-a', ...data }; return payment; },
    },
    supplierAccount: { findUnique: async () => ({ id: 'supplier-account-a', supplierId: 'supplier-a', currency: 'CNY', status: 'ACTIVE' }) },
    auditLog: { create: async () => undefined },
  } as never;
  const prisma = { $transaction: async (callback: (value: unknown) => unknown) => callback(tx) } as never;
  const scope = { isSuperAdmin: () => true, assertOrganizationAccess: async () => undefined } as never;
  const cashflow = {
    createTransactionInTransaction: async (_tx: unknown, input: any) => {
      if (options.failCompanyTransaction) throw new Error('模拟公司账户流水失败');
      companyInputs.push(input);
      return { transactionNo: 'TX-COMPANY-1' };
    },
    createSupplierAccountTransactionInTransaction: async (_tx: unknown, input: any) => {
      supplierInputs.push(input);
      return { transactionNo: 'TX-SUPPLIER-1' };
    },
  } as never;
  const service = new ProcurementOrderService(prisma, scope, {} as never, {} as never, {} as never, {} as never, cashflow);
  return { service, order: () => order, companyInputs, supplierInputs, get paymentCreates() { return paymentCreates; }, get orderUpdates() { return orderUpdates; } };
}

test('客户打款支持部分收款、正确入账并通过幂等键防重复', async () => {
  const fixture = createPaymentService();
  const dto = { actualAmount: '3000.00', businessNo: 'CUSTOMER-PAY-1', idempotencyKey: 'idem-1', occurredAt: '2026-09-10T10:00:00.000Z' };
  const first = await fixture.service.recordCustomerPayment('order-a', dto, context);
  assert.equal(first.idempotent, false);
  assert.equal(fixture.order().customerPaidAmount.toFixed(2), '3000.00');
  assert.equal(fixture.order().customerPaymentStatus, PaymentStatus.PARTIAL);
  assert.equal(fixture.companyInputs[0].businessType, TransactionBusinessType.CUSTOMER_PAYMENT);
  assert.equal(fixture.companyInputs[0].changeAmount.toFixed(2), '3000.00');

  const second = await fixture.service.recordCustomerPayment('order-a', dto, context);
  assert.equal(second.idempotent, true);
  assert.equal(fixture.paymentCreates, 1);
  assert.equal(fixture.orderUpdates, 1);
});

test('向一级代理付款同时产生公司负流水和代理商正流水', async () => {
  const fixture = createPaymentService();
  const result = await fixture.service.recordSupplierPayment('order-a', { supplierAccountId: 'supplier-account-a', actualAmount: '9259.26', businessNo: 'SUPPLIER-PAY-1', idempotencyKey: 'idem-supplier-1', occurredAt: '2026-09-10T11:00:00.000Z' }, context);
  assert.equal(result.idempotent, false);
  assert.equal(fixture.companyInputs[0].businessType, TransactionBusinessType.SUPPLIER_PAYMENT);
  assert.equal(fixture.companyInputs[0].changeAmount.toFixed(2), '-9259.26');
  assert.equal(fixture.supplierInputs[0].businessType, TransactionBusinessType.SUPPLIER_PAYMENT);
  assert.equal(fixture.supplierInputs[0].changeAmount.toFixed(2), '9259.26');
  assert.equal(fixture.order().supplierPaidAmount.toFixed(2), '9259.26');
  assert.equal(fixture.order().supplierPaymentStatus, PaymentStatus.PAID);
});

test('公司流水失败时支付记录和订单支付状态都不写入', async () => {
  const fixture = createPaymentService({ failCompanyTransaction: true });
  await assert.rejects(() => fixture.service.recordSupplierPayment('order-a', { supplierAccountId: 'supplier-account-a', actualAmount: '1000.00', businessNo: 'SUPPLIER-PAY-FAIL', idempotencyKey: 'idem-fail-1', occurredAt: '2026-09-10T11:00:00.000Z' }, context));
  assert.equal(fixture.paymentCreates, 0);
  assert.equal(fixture.orderUpdates, 0);
  assert.equal(fixture.order().supplierPaidAmount.toFixed(2), '0.00');
});

test('支付金额超过应收或应付时不会创建流水', async () => {
  const fixture = createPaymentService();
  await fixture.service.recordCustomerPayment('order-a', { actualAmount: '10000.00', businessNo: 'CUSTOMER-PAY-1', idempotencyKey: 'idem-1', occurredAt: '2026-09-10T10:00:00.000Z' }, context);
  await assert.rejects(() => fixture.service.recordCustomerPayment('order-a', { actualAmount: '0.01', businessNo: 'CUSTOMER-PAY-2', idempotencyKey: 'idem-2', occurredAt: '2026-09-10T10:00:00.000Z' }, context));
  assert.equal(fixture.companyInputs.length, 1);
  assert.equal(fixture.paymentCreates, 1);
  assert.equal(PurchasePaymentType.CUSTOMER_PAYMENT, 'CUSTOMER_PAYMENT');
});
