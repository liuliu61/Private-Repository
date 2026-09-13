import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RebateCalculationMode, RebateRuleStatus, RebateRuleType } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerRebatePolicyVersionDto, CustomerPolicyAtQueryDto, CustomerPolicyListQueryDto } from './business.dto';

type PolicyVersionWindow = { status: RebateRuleStatus; effectiveFrom: Date; effectiveTo: Date | null };

export function policyRangesOverlap(leftStart: Date, leftEnd: Date | null, rightStart: Date, rightEnd: Date | null): boolean {
  return leftStart < (rightEnd ?? new Date('9999-12-31T23:59:59.999Z')) && (leftEnd === null || leftEnd > rightStart);
}

export function selectEffectivePolicyVersion<T extends PolicyVersionWindow>(versions: T[], at: Date): T | null {
  const matches = versions.filter((version) => version.status === RebateRuleStatus.ACTIVE && version.effectiveFrom <= at && (version.effectiveTo === null || at < version.effectiveTo));
  if (matches.length > 1) throw new ConflictException({ success: false, code: 'CUSTOMER_REBATE_POLICY_CONFLICT', message: '该客户的返点政策生效时间存在冲突' });
  return matches[0] ?? null;
}

@Injectable()
export class CustomerRebatePolicyService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async getCurrent(customerId: string, query: CustomerPolicyAtQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const customer = await this.getAccessibleCustomer(customerId, context);
    const at = query.at ? new Date(query.at) : new Date();
    const policies = await this.prisma.customerRebatePolicy.findMany({
      where: { customerId, adSubjectId: null, adAccountId: null, status: RebateRuleStatus.ACTIVE },
      include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } },
      orderBy: { createdAt: 'asc' },
    });
    const matches = policies.flatMap((policy) => policy.versions.map((version) => ({ policy, version }))).filter(({ version }) => version.effectiveFrom <= at && (version.effectiveTo === null || at < version.effectiveTo));
    if (matches.length > 1) this.throwConflict();
    if (matches.length === 0) this.throwNotFound();
    return this.view(matches[0].policy, matches[0].version, customer);
  }

  async list(customerId: string, query: CustomerPolicyListQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const customer = await this.getAccessibleCustomer(customerId, context);
    const where = { policy: { customerId, adSubjectId: null, adAccountId: null } };
    const [versions, total] = await this.prisma.$transaction([
      this.prisma.customerRebatePolicyVersion.findMany({ where, include: { policy: true }, orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.customerRebatePolicyVersion.count({ where }),
    ]);
    return { items: versions.map((version) => this.view(version.policy, version, customer)), total, page: query.page, pageSize: query.pageSize };
  }

  async create(customerId: string, dto: CreateCustomerRebatePolicyVersionDto, context: AccessContext) {
    this.assertEditPermission(context);
    const customer = await this.getAccessibleCustomer(customerId, context);
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new ConflictException({ success: false, code: 'CUSTOMER_REBATE_POLICY_CONFLICT', message: '该客户的返点政策生效时间存在冲突' });
    const rate = new Prisma.Decimal(dto.rate).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (rate.lte(-100) || rate.gte(100)) throw new ConflictException({ success: false, code: 'CUSTOMER_REBATE_POLICY_INVALID_RATE', message: '返点比例必须大于 -100% 且小于 100%' });

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "customers" WHERE "id" = ${customerId}::uuid FOR UPDATE`);
      const policies = await tx.customerRebatePolicy.findMany({
        where: { customerId, adSubjectId: null, adAccountId: null, status: RebateRuleStatus.ACTIVE },
        include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } },
        orderBy: { createdAt: 'asc' },
      });
      for (const policy of policies) {
        for (const version of policy.versions) {
          if (policyRangesOverlap(version.effectiveFrom, version.effectiveTo, effectiveFrom, effectiveTo)) this.throwConflict();
        }
      }
      const policy = policies[0] ?? await tx.customerRebatePolicy.create({ data: { name: `${customer.name}客户返点政策`, customerId, createdBy: context.sub, remark: dto.remark } });
      const versionNumber = Math.max(0, ...policies.flatMap((item) => item.versions.map((version) => version.version))) + 1;
      const version = await tx.customerRebatePolicyVersion.create({ data: { policyId: policy.id, version: versionNumber, rebateType: dto.rebateType, calculationMode: dto.calculationMode, rate, effectiveFrom, effectiveTo, createdBy: context.sub, remark: dto.remark } });
      await tx.auditLog.create({ data: { operatorId: context.sub, organizationId: customer.agentId, actionType: policies.length === 0 ? 'CUSTOMER_REBATE_POLICY_CREATE' : 'CUSTOMER_REBATE_POLICY_VERSION_CREATE', businessType: 'CUSTOMER_REBATE_POLICY', businessId: policy.id, result: 'SUCCESS', afterData: { customerId, policyId: policy.id, version: versionNumber, rebateType: dto.rebateType, calculationMode: dto.calculationMode, rate: rate.toFixed(4), effectiveFrom: effectiveFrom.toISOString(), effectiveTo: effectiveTo?.toISOString() ?? null, remark: dto.remark ?? null } } });
      return this.view(policy, version, customer);
    });
  }

  async disable(customerId: string, policyId: string, context: AccessContext) {
    this.assertEditPermission(context);
    const customer = await this.getAccessibleCustomer(customerId, context);
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.customerRebatePolicy.findFirst({ where: { id: policyId, customerId, adSubjectId: null, adAccountId: null } });
      if (!policy) throw new NotFoundException({ success: false, code: 'CUSTOMER_REBATE_POLICY_NOT_FOUND', message: '该客户返点政策不存在' });
      if (policy.status === RebateRuleStatus.INACTIVE) return { id: policy.id, customerId, status: policy.status };
      await tx.customerRebatePolicy.update({ where: { id: policy.id }, data: { status: RebateRuleStatus.INACTIVE } });
      await tx.customerRebatePolicyVersion.updateMany({ where: { policyId: policy.id, status: RebateRuleStatus.ACTIVE }, data: { status: RebateRuleStatus.INACTIVE } });
      await tx.auditLog.create({ data: { operatorId: context.sub, organizationId: customer.agentId, actionType: 'CUSTOMER_REBATE_POLICY_DISABLE', businessType: 'CUSTOMER_REBATE_POLICY', businessId: policy.id, result: 'SUCCESS', beforeData: { status: policy.status }, afterData: { status: RebateRuleStatus.INACTIVE } } });
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

  private view(policy: { id: string; customerId: string | null; status: RebateRuleStatus; createdBy: string | null; remark: string | null }, version: { id: string; version: number; rebateType: string; calculationMode: RebateCalculationMode | null; rate: Prisma.Decimal; effectiveFrom: Date; effectiveTo: Date | null; status: RebateRuleStatus; createdAt: Date; createdBy: string | null; remark: string | null }, customer: { id: string; name: string; agentId: string | null }) {
    const calculationMode = version.calculationMode ?? (version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH);
    return { id: version.id, policyId: policy.id, customerId: customer.id, customerName: customer.name, organizationId: customer.agentId, version: version.version, rebateType: version.rebateType, calculationMode, rate: version.rate.toFixed(4), effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo, status: version.status, policyStatus: policy.status, createdAt: version.createdAt, createdBy: version.createdBy ?? policy.createdBy, remark: version.remark ?? policy.remark };
  }
}
