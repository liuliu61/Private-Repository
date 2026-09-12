import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, RebateCalculationMode, RebateRuleType } from '@prisma/client';
import { RebateCalculator } from '../rebate/rebate.calculator';
import { SupplierCostCalculator } from './supplier-cost.calculator';

const decimal = (value: string) => new Prisma.Decimal(value);
const calculator = new SupplierCostCalculator(new RebateCalculator());

test('供应商 CREDIT_TO_CASH 8% 计算实际人民币成本', () => {
  const result = calculator.calculate({ amount: decimal('10000'), rate: decimal('8'), type: RebateRuleType.PRIVATE_DIVIDE, calculationMode: RebateCalculationMode.CREDIT_TO_CASH });
  assert.equal(result.cashAmount.toFixed(2), '9259.26');
  assert.equal(result.creditAmount.toFixed(2), '10000.00');
});

test('供应商 CASH_TO_CREDIT 8% 计算账户币到账', () => {
  const result = calculator.calculate({ amount: decimal('10000'), rate: decimal('8'), type: RebateRuleType.FIXED_ADD, calculationMode: RebateCalculationMode.CASH_TO_CREDIT });
  assert.equal(result.cashAmount.toFixed(2), '10000.00');
  assert.equal(result.creditAmount.toFixed(2), '10800.00');
});
