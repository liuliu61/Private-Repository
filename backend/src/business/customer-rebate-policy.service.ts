import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RebateCalculationMode, RebateRuleStatus, RebateRuleType } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerRebatePolicyVersionDto, CustomerPolicyAtQueryDto, CustomerPolicyListQueryDto } from './business.dto';

export type CustomerPolicyMatchLevel = 'ACCOUNT_SUBJECT' | 'ACCOUNT' | 'SUBJECT' | 'CUSTOMER';

export interface CustomerPolicyCandidate {
  customerId: string;
  policyId: string;
  policyVersionId: string;
  subjectId: string | null;
  accountId: string | null;
  rebateType: RebateRuleType;
  calculationMode: RebateCalculationMode;
  rate: Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  version: number;
}

export interface CustomerPolicyContext {
  customerId: string;
  subjectId?: string;
  accountId?: string;
  at: Date;
}

export interface EffectivePolicyVersion {
  id: string;
  policyId: string;
  version: number;
  rebateType: RebateRuleType;
  calculationMode: RebateCalculationMode | null;
  rate: Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function selectEffectivePolicyVersion(versions: Array<{ id: string; policyId: string; version: number; rebateType: RebateRuleType; calculationMode: RebateCalculationMode | null; rate: Prisma.Decimal; effectiveFrom: Date; effectiveTo: Date | null }>, at: Date): EffectivePolicyVersion | null {
  const effective = versions.filter((v) => v.effectiveFrom <= at && (!v.effectiveTo || v.effectiveTo >= at));
  if (effective.length === 0) return null;
  return effective.sort((a, b) => b.version - a.version)[0];
}

const matchWeight: Record<CustomerPolicyMatchLevel, number> = {
  ACCOUNT_SUBJECT: 80,
  ACCOUNT: 60,
  SUBJECT: 40,
  CUSTOMER: 20,
};

function candidateLevel(candidate: CustomerPolicyCandidate, context: CustomerPolicyContext): CustomerPolicyMatchLevel | null {
  if (candidate.customerId !== context.customerId) return null;
  if (candidate.subjectId && candidate.subjectId !== context.subjectId) return null;
  if (candidate.accountId && candidate.accountId !== context.accountId) return null;
  if (candidate.accountId) return candidate.subjectId ? 'ACCOUNT_SUBJECT' : 'ACCOUNT';
  if (candidate.subjectId) return 'SUBJECT';
  return 'CUSTOMER';
}

export function selectBestCustomerPolicy(candidates: CustomerPolicyCandidate[], context: CustomerPolicyContext): (CustomerPolicyCandidate & { matchLevel: CustomerPolicyMatchLevel }) | null {
  const matches = candidates
    .filter((candidate) => candidate.effectiveFrom <= context.at && (candidate.effectiveTo === null || context.at < candidate.effectiveTo))
    .map((candidate) => ({ candidate, matchLevel: candidateLevel(candidate, context) }))
    .filter((item): item is { candidate: CustomerPolicyCandidate; matchLevel: CustomerPolicyMatchLevel } => item.matchLevel !== null);
  if (matches.length === 0) return null;
  const highestWeight = Math.max(...matches.map((item) => matchWeight[item.matchLevel]));
  const best = matches.filter((item) => matchWeight[item.matchLevel] === highestWeight);
  if (best.length > 1) throw new ConflictException({ success: false, code: 'CUSTOMER_REBATE_POLICY_CONFLICT', message: '同一客户匹配范围存在多个有效返点政策' });
  return { ...best[0].candidate, matchLevel: best[0].matchLevel };
}

@Injectable()
export class CustomerRebatePolicyService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async getCurrent(customerId: string, query: CustomerPolicyAtQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const customer = await this.getAccessibleCustomer(customerId, context);
    const at = query.at ? new Date(query.at) : new Date();
    const policies = await this.prisma.customerRebatePolicy.findMany({
      where: { customerId, status: RebateRuleStatus.ACTIVE, versions: { some: { status: RebateRuleStatus.ACTIVE } } },
      include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } },
    });
    const candidate = selectBestCustomerPolicy(
      policies.flatMap((policy) => policy.versions.map((version) => ({
        customerId,
        policyId: policy.id,
        policyVersionId: version.id,
        subjectId: policy.adSubjectId,
        accountId: policy.adAccountId,
        rebateType: version.rebateType,
        calculationMode: version.calculationMode ?? (version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH),
        rate: version.rate,
        effectiveFrom: version.effectiveFrom,
        effectiveTo: version.effectiveTo,
        version: version.version,
      }))),
      { customerId, subjectId: query.subjectId, accountId: query.accountId, at },
    );
    if (!candidate) this.throwNotFound();
    return { ...candidate, customerName: customer.name, rate: candidate.rate.toFixed(4) };
  }

  async list(customerId: string, query: CustomerPolicyListQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const customer = await this.getAccessibleCustomer(customerId, context);
    const where: Prisma.CustomerRebatePolicyVersionWhereInput = {
      policy: {
        customerId,
        ...(query.allDimensions ? {} : { adSubjectId: query.subjectId ?? null, adAccountId: query.accountId ?? null }),
      },
    };
    const [versions, total] = await this.prisma.$transaction([
      this.prisma.customerRebatePolicyVersion.findMany({ where, include: { policy: true }, orderBy: [{ createdAt: 'desc' }, { version: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.customerRebatePolicyVersion.count({ where }),
    ]);
    return {
      items: versions.map((version) => ({
        id: version.id,
        policyId: version.policyId,
        customerId: customer.id,
        customerName: customer.name,
        organizationId: customer.agentId,
        version: version.version,
        subjectId: version.policy.adSubjectId,
        accountId: version.policy.adAccountId,
        dimension: version.policy.adAccountId ? 'account' : version.policy.adSubjectId ? 'subject' : 'customer',
        rebateType: version.rebateType,
        calculationMode: version.calculationMode ?? (version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH),
        rate: version.rate.toFixed(4),
        effectiveFrom: version.effectiveFrom,
        effectiveTo: version.effectiveTo,
        status: version.status,
        policyStatus: version.policy.status,
        createdAt: version.createdAt,
        createdBy: version.createdBy ?? version.policy.createdBy,
        remark: version.remark ?? version.policy.remark,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(customerId: string, dto: CreateCustomerRebatePolicyVersionDto, context: AccessContext) {
    this.assertEditPermission(context);
    const customer = await this.getAccessibleCustomer(customerId, context);
    if (dto.accountId && !dto.subjectId) throw new BadRequestException({ success: false, code: 'CUSTOMER_REBATE_POLICY_INVALID_DIMENSION', message: '账户维度政策必须同时指定广告主体' });
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new ConflictException({ success: false, code: 'CUSTOMER_REBATE_POLICY_CONFLICT', message: '该客户的返点政策生效时间存在冲突' });
    const rate = new Prisma.Decimal(dto.rate).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (rate.lte(-100) || rate.gte(100)) throw new ConflictException({ success: false, code: 'CUSTOMER_REBATE_POLICY_INVALID_RATE', message: '返点比例必须大于 -100% 且小于 100%' });

    if (dto.subjectId) {
      const subject = await this.prisma.adSubject.findUnique({ where: { id: dto.subjectId }, select: { id: true, name: true } });
      if (!subject) throw new NotFoundException({ success: false, code: 'AD_SUBJECT_NOT_FOUND', message: '广告主体不存在' });
    }
    if (dto.accountId) {
      const account = await this.prisma.adAccount.findUnique({ where: { id: dto.accountId }, select: { id: true, name: true, subjectId: true } });
      if (!account) throw new NotFoundException({ success: false, code: 'AD_ACCOUNT_NOT_FOUND', message: '广告账户不存在' });
      if (dto.subjectId && account.subjectId !== dto.subjectId) throw new BadRequestException({ success: false, code: 'ACCOUNT_SUBJECT_MISMATCH', message: '广告账户不属于指定的广告主体' });
    }

    const dimensionName = dto.accountId ? '账户' : dto.subjectId ? '主体' : '客户';

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "customers" WHERE "id" = ${customerId}::uuid FOR UPDATE`);
      const policies = await tx.customerRebatePolicy.findMany({
        where: { customerId, adSubjectId: dto.subjectId ?? null, adAccountId: dto.accountId ?? null, status: RebateRuleStatus.ACTIVE },
        include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } },
        orderBy: { createdAt: 'asc' },
      });
      for (const policy of policies) {
        for (const version of policy.versions) {
          if (version.effectiveFrom < (effectiveTo ?? new Date('9999-12-31T23:59:59.999Z')) && (version.effectiveTo === null || version.effectiveTo > effectiveFrom)) {
            this.throwConflict();
          }
        }
      }
      const policy = policies[0] ?? await tx.customerRebatePolicy.create({
        data: { name: `${customer.name}${dimensionName}返点政策`, customerId, adSubjectId: dto.subjectId ?? null, adAccountId: dto.accountId ?? null, createdBy: context.sub, remark: dto.remark },
      });
      const versionNumber = Math.max(0, ...policies.flatMap((item) => item.versions.map((version) => version.version))) + 1;
      const version = await tx.customerRebatePolicyVersion.create({
        data: { policyId: policy.id, version: versionNumber, rebateType: dto.rebateType, calculationMode: dto.calculationMode, rate, effectiveFrom, effectiveTo, createdBy: context.sub, remark: dto.remark },
      });
      await tx.auditLog.create({
        data: {
          operatorId: context.sub,
          organizationId: customer.agentId,
          actionType: policies.length === 0 ? 'CUSTOMER_REBATE_POLICY_CREATE' : 'CUSTOMER_REBATE_POLICY_VERSION_CREATE',
          businessType: 'CUSTOMER_REBATE_POLICY',
          businessId: policy.id,
          result: 'SUCCESS',
          afterData: { customerId, policyId: policy.id, version: versionNumber, subjectId: dto.subjectId ?? null, accountId: dto.accountId ?? null, rebateType: dto.rebateType, calculationMode: dto.calculationMode, rate: rate.toFixed(4), effectiveFrom: effectiveFrom.toISOString(), effectiveTo: effectiveTo?.toISOString() ?? null, remark: dto.remark ?? null },
        },
      });
      return {
        id: version.id,
        policyId: policy.id,
        customerId: customer.id,
        customerName: customer.name,
        organizationId: customer.agentId,
        version: version.version,
        subjectId: policy.adSubjectId,
        accountId: policy.adAccountId,
        dimension: policy.adAccountId ? 'account' : policy.adSubjectId ? 'subject' : 'customer',
        rebateType: version.rebateType,
        calculationMode: version.calculationMode ?? (version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH),
        rate: version.rate.toFixed(4),
        effectiveFrom: version.effectiveFrom,
        effectiveTo: version.effectiveTo,
        status: version.status,
        policyStatus: policy.status,
        createdAt: version.createdAt,
        createdBy: version.createdBy ?? policy.createdBy,
        remark: version.remark ?? policy.remark,
      };
    });
  }

  async disable(customerId: string, policyId: string, context: AccessContext) {
    this.assertEditPermission(context);
    const customer = await this.getAccessibleCustomer(customerId, context);
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.customerRebatePolicy.findFirst({ where: { id: policyId, customerId } });
      if (!policy) throw new NotFoundException({ success: false, code: 'CUSTOMER_REBATE_POLICY_NOT_FOUND', message: '该客户返点政策不存在' });
      if (policy.status === RebateRuleStatus.INACTIVE) return { id: policy.id, customerId, status: policy.status };
      await tx.customerRebatePolicy.update({ where: { id: policy.id }, data: { status: RebateRuleStatus.INACTIVE } });
      await tx.customerRebatePolicyVersion.updateMany({ where: { policyId: policy.id, status: RebateRuleStatus.ACTIVE }, data: { status: RebateRuleStatus.INACTIVE } });
      await tx.auditLog.create({
        data: {
          operatorId: context.sub,
          organizationId: customer.agentId,
          actionType: 'CUSTOMER_REBATE_POLICY_DISABLE',
          businessType: 'CUSTOMER_REBATE_POLICY',
          businessId: policy.id,
          result: 'SUCCESS',
          beforeData: { status: policy.status },
          afterData: { status: RebateRuleStatus.INACTIVE },
        },
      });
      return { id: policy.id, customerId, status: RebateRuleStatus.INACTIVE };
    });
  }

  private async getAccessibleCustomer(customerId: string, context: AccessContext) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, agentId: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    if (!customer.agentId && !this.scope.isSuperAdmin(context)) this.throwPermissionDenied();
    if (customer.agentId) await this.scope.assertOrganizationAccess(customer.agentId, context);
    return customer;
  }

  private assertViewPermission(context: AccessContext): void {
    if (!this.scope.canViewCustomerRebatePolicy(context)) this.throwPermissionDenied();
  }

  private assertEditPermission(context: AccessContext): void {
    if (!this.scope.canEditCustomerRebatePolicy(context)) this.throwPermissionDenied();
  }

  private throwPermissionDenied(): never {
    throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作该客户返点政策' });
  }

  private throwNotFound(): never {
    throw new NotFoundException({ success: false, code: 'CUSTOMER_REBATE_POLICY_NOT_FOUND', message: '该客户当前没有有效返点政策' });
  }

  private throwConflict(): never {
    throw new ConflictException({ success: false, code: 'CUSTOMER_REBATE_POLICY_CONFLICT', message: '该客户的返点政策生效时间存在冲突' });
  }
}
