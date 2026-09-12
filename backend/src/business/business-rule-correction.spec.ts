import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, ProfitStatus } from '@prisma/client';
import { GrossProfitCalculator } from './gross-profit.calculator';

test('真实外采口径使用伙伴现金减客户现金，不使用返点比例差', () => {
  const customerCash = new Prisma.Decimal('10000').div(new Prisma.Decimal('1.10')).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const partnerCash = new Prisma.Decimal('10000').div(new Prisma.Decimal('1.05')).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const result = new GrossProfitCalculator().calculate({ customerCashAmount: customerCash, supplierCashAmount: partnerCash });
  assert.equal(customerCash.toFixed(2), '9090.91');
  assert.equal(partnerCash.toFixed(2), '9523.81');
  assert.equal(result.grossProfit.toFixed(2), '432.90');
  assert.equal(result.profitStatus, ProfitStatus.PROFIT);
});

test('服务费不配置时不会自动生成客户入账服务费', () => {
  const serviceFee = new Prisma.Decimal('0.00');
  const payment = new Prisma.Decimal('30000.00');
  assert.equal(payment.sub(serviceFee).toFixed(2), '30000.00');
  assert.equal(serviceFee.toFixed(2), '0.00');
});

test('有手工服务费时钱包与开票口径分离', () => {
  const payment = new Prisma.Decimal('30000.00');
  const serviceFee = new Prisma.Decimal('2000.00');
  assert.equal(payment.sub(serviceFee).toFixed(2), '28000.00');
  assert.equal(payment.toFixed(2), '30000.00');
});
