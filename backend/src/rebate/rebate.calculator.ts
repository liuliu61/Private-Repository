import { BadRequestException } from '@nestjs/common';
import { Prisma, RebateCalculationMode, RebateRuleType } from '@prisma/client';
import { RebateCalculationInput, RebateCalculationResult } from './rebate.types';

const ZERO = new Prisma.Decimal(0);
const ONE_HUNDRED = new Prisma.Decimal(100);

export function normalizeCalculationMode(type: RebateRuleType, mode?: RebateCalculationMode): RebateCalculationMode {
  if (mode === RebateCalculationMode.ADD) return RebateCalculationMode.CASH_TO_CREDIT;
  if (mode === RebateCalculationMode.DIVIDE) return RebateCalculationMode.CREDIT_TO_CASH;
  return mode ?? (type === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH);
}

export class RebateCalculator {
  calculate(input: RebateCalculationInput): RebateCalculationResult {
    const amount = input.amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const rate = input.rate.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    const calculationMode = normalizeCalculationMode(input.type, input.calculationMode);
    this.validate(amount, rate, input.type, calculationMode);

    const rateRatio = rate.div(ONE_HUNDRED);
    if (rate.lt(ZERO)) {
      const cashAmount = amount.mul(new Prisma.Decimal(1).add(rate.abs().div(ONE_HUNDRED))).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const creditAmount = amount;
      const rebateAmount = creditAmount.sub(cashAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return { cashAmount, paymentAmount: cashAmount, rebateAmount, creditAmount, calculationMode };
    }

    if (calculationMode === RebateCalculationMode.CASH_TO_CREDIT) {
      const cashAmount = amount;
      const creditAmount = amount.mul(new Prisma.Decimal(1).add(rateRatio)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const rebateAmount = creditAmount.sub(cashAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return { cashAmount, paymentAmount: cashAmount, rebateAmount, creditAmount, calculationMode };
    }

    const cashAmount = amount.div(new Prisma.Decimal(1).add(rateRatio)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const rebateAmount = amount.sub(cashAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return { cashAmount, paymentAmount: cashAmount, rebateAmount, creditAmount: amount, calculationMode };
  }

  private validate(amount: Prisma.Decimal, rate: Prisma.Decimal, type: string, calculationMode: RebateCalculationMode): void {
    if (type !== RebateRuleType.FIXED_ADD && type !== RebateRuleType.PRIVATE_DIVIDE) throw new BadRequestException('返点计算类型不受支持');
    if (![RebateCalculationMode.ADD, RebateCalculationMode.DIVIDE, RebateCalculationMode.CASH_TO_CREDIT, RebateCalculationMode.CREDIT_TO_CASH].includes(calculationMode)) throw new BadRequestException('返点计算方向不受支持');
    if (amount.lte(ZERO)) throw new BadRequestException('计算金额必须大于 0');
    if (rate.lte(new Prisma.Decimal(-100)) || rate.gte(ONE_HUNDRED)) throw new BadRequestException('返点比例必须大于 -100% 且小于 100%');
  }
}
