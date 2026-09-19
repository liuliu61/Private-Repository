import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma, RebateRuleType, ProfitStatus } from '@prisma/client';
import { RebateCalculator } from '../rebate/rebate.calculator';
import { ProfitCalculator } from './profit.calculator';

const decimal = (value: string) => new Prisma.Decimal(value);

describe('ProfitCalculator', () => {
  it('10%客户返点与8%成本返点必须分别计算，利润只使用实际结算金额', () => {
    const customer = new RebateCalculator().calculate({ amount: decimal('10000.00'), rate: decimal('10.00'), type: RebateRuleType.FIXED_ADD });
    const result = new ProfitCalculator().calculate({ customerCashAmount: customer.creditAmount, supplierCashAmount: decimal('9200.00') });

    assert.equal(customer.rebateAmount.toFixed(2), '1000.00');
    assert.equal(customer.creditAmount.toFixed(2), '11000.00');
    // 真实外采口径：grossProfit = 客户到账币 - 供应商现金（customer - supplier）
    assert.equal(result.grossProfit.toFixed(2), '1800.00');
    assert.equal(result.profitStatus, ProfitStatus.PROFIT);
    assert.notEqual(result.grossProfit.toFixed(2), '200.00');
  });
});
