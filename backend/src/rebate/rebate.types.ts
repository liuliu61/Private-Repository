import { Prisma, RebateCalculationMode, RebateRuleType } from '@prisma/client';

export type DecimalInput = string | Prisma.Decimal;

export interface RebateCalculationInput {
  amount: Prisma.Decimal;
  rate: Prisma.Decimal;
  type: RebateRuleType;
  calculationMode?: RebateCalculationMode;
}

export interface RebateCalculationResult {
  cashAmount: Prisma.Decimal;
  paymentAmount: Prisma.Decimal;
  rebateAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  calculationMode: RebateCalculationMode;
}

export interface RebateAccessContext {
  sub: string;
  username: string;
  roles: string[];
  permissions: string[];
}
