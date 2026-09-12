import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Prisma, RebateCalculationMode, RebateRuleType } from '@prisma/client';
import { RebateCalculator } from './rebate.calculator';

const calculator = new RebateCalculator();
const decimal = (value: string) => new Prisma.Decimal(value);
const resultStrings = (result: { paymentAmount: Prisma.Decimal; rebateAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }) => ({
  paymentAmount: result.paymentAmount.toFixed(2),
  rebateAmount: result.rebateAmount.toFixed(2),
  creditAmount: result.creditAmount.toFixed(2),
});

describe('RebateCalculator', () => {
  it('固定返点支持 10%、5% 和 0%', () => {
    assert.deepEqual(resultStrings(calculator.calculate({ amount: decimal('10000.00'), rate: decimal('10'), type: RebateRuleType.FIXED_ADD })), { paymentAmount: '10000.00', rebateAmount: '1000.00', creditAmount: '11000.00' });
    assert.deepEqual(resultStrings(calculator.calculate({ amount: decimal('10000.00'), rate: decimal('5'), type: RebateRuleType.FIXED_ADD })), { paymentAmount: '10000.00', rebateAmount: '500.00', creditAmount: '10500.00' });
    assert.deepEqual(resultStrings(calculator.calculate({ amount: decimal('10000.00'), rate: decimal('0'), type: RebateRuleType.FIXED_ADD })), { paymentAmount: '10000.00', rebateAmount: '0.00', creditAmount: '10000.00' });
  });

  it('明确支持 CASH_TO_CREDIT 方向', () => {
    const result = calculator.calculate({ amount: decimal('10000'), rate: decimal('10'), type: RebateRuleType.FIXED_ADD, calculationMode: RebateCalculationMode.CASH_TO_CREDIT });
    assert.equal(result.cashAmount.toFixed(2), '10000.00');
    assert.equal(result.creditAmount.toFixed(2), '11000.00');
    assert.equal(result.rebateAmount.toFixed(2), '1000.00');
  });

  it('明确支持 CREDIT_TO_CASH 方向和 8% 成本计算', () => {
    const customer = calculator.calculate({ amount: decimal('10000'), rate: decimal('10'), type: RebateRuleType.PRIVATE_DIVIDE, calculationMode: RebateCalculationMode.CREDIT_TO_CASH });
    const supplier = calculator.calculate({ amount: decimal('10000'), rate: decimal('8'), type: RebateRuleType.PRIVATE_DIVIDE, calculationMode: RebateCalculationMode.CREDIT_TO_CASH });
    assert.equal(customer.cashAmount.toFixed(2), '9090.91');
    assert.equal(customer.rebateAmount.toFixed(2), '909.09');
    assert.equal(supplier.cashAmount.toFixed(2), '9259.26');
  });

  it('私反支持 10%、5% 和 0%', () => {
    assert.deepEqual(resultStrings(calculator.calculate({ amount: decimal('10000.00'), rate: decimal('10'), type: RebateRuleType.PRIVATE_DIVIDE })), { paymentAmount: '9090.91', rebateAmount: '909.09', creditAmount: '10000.00' });
    assert.deepEqual(resultStrings(calculator.calculate({ amount: decimal('10000.00'), rate: decimal('5'), type: RebateRuleType.PRIVATE_DIVIDE })), { paymentAmount: '9523.81', rebateAmount: '476.19', creditAmount: '10000.00' });
    assert.deepEqual(resultStrings(calculator.calculate({ amount: decimal('10000.00'), rate: decimal('0'), type: RebateRuleType.PRIVATE_DIVIDE })), { paymentAmount: '10000.00', rebateAmount: '0.00', creditAmount: '10000.00' });
  });

  it('使用 Decimal 进行 0.1 + 0.2 和私反计算', () => {
    assert.equal(decimal('0.1').add(decimal('0.2')).toFixed(2), '0.30');
    assert.equal(calculator.calculate({ amount: decimal('10000'), rate: decimal('10'), type: RebateRuleType.PRIVATE_DIVIDE }).paymentAmount.toFixed(2), '9090.91');
  });

  it('支持负返点，并拒绝零金额、-100% 和 100% 比例及非法类型', () => {
    assert.throws(() => calculator.calculate({ amount: decimal('0'), rate: decimal('10'), type: RebateRuleType.FIXED_ADD }), /计算金额必须大于 0/);
    assert.throws(() => calculator.calculate({ amount: decimal('-1'), rate: decimal('10'), type: RebateRuleType.FIXED_ADD }), /计算金额必须大于 0/);
    assert.equal(calculator.calculate({ amount: decimal('10000'), rate: decimal('-5'), type: RebateRuleType.FIXED_ADD, calculationMode: RebateCalculationMode.CASH_TO_CREDIT }).cashAmount.toFixed(2), '10500.00');
    assert.equal(calculator.calculate({ amount: decimal('10000'), rate: decimal('-5'), type: RebateRuleType.FIXED_ADD, calculationMode: RebateCalculationMode.CASH_TO_CREDIT }).rebateAmount.toFixed(2), '-500.00');
    assert.throws(() => calculator.calculate({ amount: decimal('1'), rate: decimal('-100'), type: RebateRuleType.FIXED_ADD }), /返点比例必须大于 -100%/);
    assert.throws(() => calculator.calculate({ amount: decimal('1'), rate: decimal('100'), type: RebateRuleType.FIXED_ADD }), /返点比例必须大于 -100%/);
    assert.throws(() => calculator.calculate({ amount: decimal('1'), rate: decimal('10'), type: 'INVALID' as RebateRuleType }), /返点计算类型不受支持/);
  });
});
