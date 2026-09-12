import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, RebateCalculationMode, RebateRuleType, ProfitStatus } from '@prisma/client';
import { RebateCalculator } from '../rebate/rebate.calculator';
import { GrossProfitCalculator } from './gross-profit.calculator';

test('标准推广业务：50000 人民币按 10% 换算为 55000 账户币，成本 15% 倒推为 47826.09，毛利 2173.91', () => {
  const calculator = new RebateCalculator();
  const customer = calculator.calculate({ amount: new Prisma.Decimal('50000.00'), rate: new Prisma.Decimal('10'), type: RebateRuleType.FIXED_ADD, calculationMode: RebateCalculationMode.CASH_TO_CREDIT });
  const supplier = calculator.calculate({ amount: customer.creditAmount, rate: new Prisma.Decimal('15'), type: RebateRuleType.PRIVATE_DIVIDE, calculationMode: RebateCalculationMode.CREDIT_TO_CASH });
  const profit = new GrossProfitCalculator().calculate({ customerCashAmount: customer.cashAmount, supplierCashAmount: supplier.cashAmount });
  assert.equal(customer.cashAmount.toFixed(2), '50000.00');
  assert.equal(customer.creditAmount.toFixed(2), '55000.00');
  assert.equal(supplier.cashAmount.toFixed(2), '47826.09');
  assert.equal(profit.grossProfit.toFixed(2), '2173.91');
  assert.equal(profit.profitStatus, ProfitStatus.PROFIT);
});
