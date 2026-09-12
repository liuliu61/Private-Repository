import { Prisma } from '@prisma/client';
import { GrossProfitCalculator, GrossProfitCalculationInput, GrossProfitCalculationResult } from './gross-profit.calculator';

export type ProfitCalculationInput = GrossProfitCalculationInput & { customerPaymentAmount?: Prisma.Decimal; supplierPaymentAmount?: Prisma.Decimal };
export type ProfitCalculationResult = GrossProfitCalculationResult;

export class ProfitCalculator extends GrossProfitCalculator {
  calculate(input: ProfitCalculationInput): ProfitCalculationResult {
    return super.calculate({ customerCashAmount: input.customerCashAmount ?? input.customerPaymentAmount!, supplierCashAmount: input.supplierCashAmount ?? input.supplierPaymentAmount!, operatingFeeAmount: input.operatingFeeAmount, otherCost: input.otherCost });
  }
}
