import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, ProfitStatus } from '@prisma/client';
import { GrossProfitCalculator } from './gross-profit.calculator';

const decimal = (value: string) => new Prisma.Decimal(value);

test('客户10%和成本8%均为 CREDIT_TO_CASH 时按真实现金金额计算亏损', () => {
  const customerCash = decimal('10000').div(decimal('1.10')).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const supplierCash = decimal('10000').div(decimal('1.08')).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const result = new GrossProfitCalculator().calculate({ customerCashAmount: customerCash, supplierCashAmount: supplierCash });

  assert.equal(customerCash.toFixed(2), '9090.91');
  assert.equal(supplierCash.toFixed(2), '9259.26');
  assert.equal(result.grossProfit.toFixed(2), '-168.35');
  assert.equal(result.profitStatus, ProfitStatus.LOSS);
});

test('运营费作为实际费用从利润中扣除', () => {
  const result = new GrossProfitCalculator().calculate({ customerCashAmount: decimal('10000'), supplierCashAmount: decimal('9000'), operatingFeeAmount: decimal('100') });
  assert.equal(result.grossProfit.toFixed(2), '900.00');
});

test('毛利正数和零分别标记为盈利与持平', () => {
  const calculator = new GrossProfitCalculator();
  assert.equal(calculator.calculate({ customerCashAmount: decimal('10000'), supplierCashAmount: decimal('9000') }).profitStatus, ProfitStatus.PROFIT);
  assert.equal(calculator.calculate({ customerCashAmount: decimal('10000'), supplierCashAmount: decimal('10000') }).profitStatus, ProfitStatus.BREAK_EVEN);
});
