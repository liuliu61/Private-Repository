import type { Prisma, RebateCalculationMode, RebateRuleType, SupplierPlatform } from '@prisma/client';
import type { SupplierPolicyMatchLevel } from './supplier-rebate-policy.service';

export interface PolicySnapshot {
  policyId: string;
  policyVersionId: string;
  version: number;
  rebateType: RebateRuleType;
  calculationMode: RebateCalculationMode;
  rate: Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  matchLevel?: SupplierPolicyMatchLevel;
}

export interface CustomerPolicySnapshot extends PolicySnapshot {
  customerPolicyId: string;
  customerPolicyVersionId: string;
}

export interface SupplierPolicySnapshot extends PolicySnapshot {
  supplierPolicyId: string;
  supplierPolicyVersionId: string;
}

export interface CustomerPolicyResolveInput {
  customerId: string;
  businessTime: Date;
  context: { sub: string; username: string; roles: string[]; permissions: string[] };
}

export interface SupplierPolicyResolveInput {
  supplierId: string;
  platform?: SupplierPlatform;
  subjectId?: string;
  accountId?: string;
  businessTime: Date;
  context: { sub: string; username: string; roles: string[]; permissions: string[] };
}
