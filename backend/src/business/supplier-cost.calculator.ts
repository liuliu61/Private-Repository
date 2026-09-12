import { Injectable } from '@nestjs/common';
import { Prisma, RebateCalculationMode, RebateRuleType } from '@prisma/client';
import { RebateCalculator } from '../rebate/rebate.calculator';
import { RebateCalculationResult } from '../rebate/rebate.types';

export interface SupplierCostCalculationInput {
  amount: Prisma.Decimal;
  rate: Prisma.Decimal;
  type: RebateRuleType;
  calculationMode: RebateCalculationMode;
}

@Injectable()
export class SupplierCostCalculator {
  constructor(private readonly rebateCalculator: RebateCalculator) {}

  calculate(input: SupplierCostCalculationInput): RebateCalculationResult {
    return this.rebateCalculator.calculate(input);
  }
}
