import { Injectable } from '@nestjs/common';
import { Prisma, ProfitStatus } from '@prisma/client';

export interface GrossProfitCalculationInput {
  customerCashAmount: Prisma.Decimal;
  supplierCashAmount: Prisma.Decimal;
  operatingFeeAmount?: Prisma.Decimal;
  otherCost?: Prisma.Decimal;
}

export interface GrossProfitCalculationResult {
  grossProfit: Prisma.Decimal;
  profitStatus: ProfitStatus;
  otherCost: Prisma.Decimal;
}

@Injectable()
export class GrossProfitCalculator {
  calculate(input: GrossProfitCalculationInput): GrossProfitCalculationResult {
    const customerCashAmount = input.customerCashAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const supplierCashAmount = input.supplierCashAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const operatingFeeAmount = (input.operatingFeeAmount ?? new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const otherCost = (input.otherCost ?? operatingFeeAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const grossProfit = customerCashAmount.sub(supplierCashAmount).sub(otherCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const profitStatus = grossProfit.gt(0) ? ProfitStatus.PROFIT : grossProfit.lt(0) ? ProfitStatus.LOSS : ProfitStatus.BREAK_EVEN;
    return { grossProfit, profitStatus, otherCost };
  }
}
