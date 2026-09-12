import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, RebateCalculationMode, RebateRuleStatus, RebateRuleType, SupplierPlatform } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierRebatePolicyVersionDto, SupplierRebatePolicyListQueryDto, SupplierRebatePolicyQueryDto } from './business.dto';

export type SupplierPolicyMatchLevel = 'ACCOUNT_SUBJECT_PLATFORM' | 'ACCOUNT_PLATFORM' | 'ACCOUNT_SUBJECT' | 'ACCOUNT' | 'SUBJECT_PLATFORM' | 'SUBJECT' | 'SUPPLIER_PLATFORM' | 'SUPPLIER';

export interface SupplierPolicyCandidate {
  supplierId: string;
  policyId: string;
  policyVersionId: string;
  platform: SupplierPlatform | null;
  subjectId: string | null;
  accountId: string | null;
  rebateType: RebateRuleType;
  calculationMode: RebateCalculationMode;
  rate: Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  version: number;
}

export interface SupplierPolicyContext {
  supplierId: string;
  platform?: SupplierPlatform;
  subjectId?: string;
  accountId?: string;
  at: Date;
}

const matchWeight: Record<SupplierPolicyMatchLevel, number> = {
  ACCOUNT_SUBJECT_PLATFORM: 80,
  ACCOUNT_PLATFORM: 70,
  ACCOUNT_SUBJECT: 65,
  ACCOUNT: 60,
  SUBJECT_PLATFORM: 50,
  SUBJECT: 40,
  SUPPLIER_PLATFORM: 30,
  SUPPLIER: 20,
};

function candidateLevel(candidate: SupplierPolicyCandidate, context: SupplierPolicyContext): SupplierPolicyMatchLevel | null {
  if (candidate.supplierId !== context.supplierId) return null;
  if (candidate.platform && candidate.platform !== context.platform) return null;
  if (candidate.subjectId && candidate.subjectId !== context.subjectId) return null;
  if (candidate.accountId && candidate.accountId !== context.accountId) return null;
  if (candidate.accountId) {
    if (candidate.subjectId && candidate.platform) return 'ACCOUNT_SUBJECT_PLATFORM';
    if (candidate.platform) return 'ACCOUNT_PLATFORM';
    if (candidate.subjectId) return 'ACCOUNT_SUBJECT';
    return 'ACCOUNT';
  }
  if (candidate.subjectId) return candidate.platform ? 'SUBJECT_PLATFORM' : 'SUBJECT';
  return candidate.platform ? 'SUPPLIER_PLATFORM' : 'SUPPLIER';
}

export function selectBestSupplierPolicy(candidates: SupplierPolicyCandidate[], context: SupplierPolicyContext): (SupplierPolicyCandidate & { matchLevel: SupplierPolicyMatchLevel }) | null {
  const matches = candidates.filter((candidate) => candidate.effectiveFrom <= context.at && (candidate.effectiveTo === null || context.at < candidate.effectiveTo)).map((candidate) => ({ candidate, matchLevel: candidateLevel(candidate, context) })).filter((item): item is { candidate: SupplierPolicyCandidate; matchLevel: SupplierPolicyMatchLevel } => item.matchLevel !== null);
  if (matches.length === 0) return null;
  const highestWeight = Math.max(...matches.map((item) => matchWeight[item.matchLevel]));
  const best = matches.filter((item) => matchWeight[item.matchLevel] === highestWeight);
  if (best.length > 1) throw new ConflictException({ success: false, code: 'SUPPLIER_REBATE_POLICY_CONFLICT', message: '同一供应商匹配范围存在多个有效成本返点政策' });
  return { ...best[0].candidate, matchLevel: best[0].matchLevel };
}

@Injectable()
export class SupplierRebatePolicyService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async getCurrent(supplierId: string, query: SupplierRebatePolicyQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const supplier = await this.getAccessibleSupplier(supplierId, context);
    const resolvedContext = await this.resolveContext(supplierId, query, context);
    const policies = await this.prisma.supplierRebatePolicy.findMany({ where: { supplierId, status: RebateRuleStatus.ACTIVE, versions: { some: { status: RebateRuleStatus.ACTIVE } } }, include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } } });
    const candidate = selectBestSupplierPolicy(policies.flatMap((policy) => policy.versions.map((version) => ({ supplierId, policyId: policy.id, policyVersionId: version.id, platform: policy.platform, subjectId: policy.adSubjectId, accountId: policy.adAccountId, rebateType: version.rebateType, calculationMode: version.calculationMode ?? (version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH), rate: version.rate, effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo, version: version.version }))), resolvedContext);
    if (!candidate) this.throwNotFound();
    return { ...candidate, supplierName: supplier.name, rate: candidate.rate.toFixed(4) };
  }

  async list(supplierId: string, query: SupplierRebatePolicyListQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const supplier = await this.getAccessibleSupplier(supplierId, context);
    const where = { policy: { supplierId, platform: query.platform, adSubjectId: query.subjectId, adAccountId: query.accountId } };
    const [versions, total] = await this.prisma.$transaction([
      this.prisma.supplierRebatePolicyVersion.findMany({ where, include: { policy: true }, orderBy: [{ createdAt: 'desc' }, { version: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.supplierRebatePolicyVersion.count({ where }),
    ]);
    return { items: versions.map((version) => ({ id: version.id, policyId: version.policyId, supplierId, supplierName: supplier.name, version: version.version, platform: version.policy.platform, subjectId: version.policy.adSubjectId, accountId: version.policy.adAccountId, rebateType: version.rebateType, calculationMode: version.calculationMode ?? (version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH), rate: version.rate.toFixed(4), effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo, status: version.status, policyStatus: version.policy.status, createdBy: version.createdBy ?? version.policy.createdBy, createdAt: version.createdAt, remark: version.remark ?? version.policy.remark })), total, page: query.page, pageSize: query.pageSize };
  }

  async create(supplierId: string, dto: CreateSupplierRebatePolicyVersionDto, context: AccessContext) {
    this.assertEditPermission(context);
    const supplier = await this.getAccessibleSupplier(supplierId, context);
    if (supplier.status !== 'ACTIVE') throw new BadRequestException({ success: false, code: 'SUPPLIER_DISABLED', message: '供应商已停用，不能新增成本返点政策' });
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new ConflictException({ success: false, code: 'SUPPLIER_REBATE_POLICY_CONFLICT', message: '供应商成本返点政策生效时间存在冲突' });
    const rate = new Prisma.Decimal(dto.rate).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (rate.lte(-100) || rate.gte(100)) throw new BadRequestException({ success: false, code: 'SUPPLIER_REBATE_POLICY_INVALID_RATE', message: '返点比例必须大于 -100% 且小于 100%' });
    const contextData = await this.normalizeCreateContext(dto, supplierId, context);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "suppliers" WHERE "id" = ${supplierId}::uuid FOR UPDATE`);
      const policies = await tx.supplierRebatePolicy.findMany({ where: { supplierId, platform: contextData.platform, adSubjectId: contextData.subjectId, adAccountId: contextData.accountId, status: RebateRuleStatus.ACTIVE }, include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } }, orderBy: { createdAt: 'asc' } });
      for (const policy of policies) for (const version of policy.versions) if (version.effectiveFrom < (effectiveTo ?? new Date('9999-12-31T23:59:59.999Z')) && (version.effectiveTo === null || version.effectiveTo > effectiveFrom)) this.throwConflict();
      const policy = policies[0] ?? await tx.supplierRebatePolicy.create({ data: { name: `${supplier.name}成本返点政策`, supplierId, platform: contextData.platform, adSubjectId: contextData.subjectId, adAccountId: contextData.accountId, createdBy: context.sub, updatedBy: context.sub, remark: dto.remark } });
      const versionNumber = Math.max(0, ...policies.flatMap((item) => item.versions.map((version) => version.version))) + 1;
      const version = await tx.supplierRebatePolicyVersion.create({ data: { policyId: policy.id, version: versionNumber, rebateType: dto.rebateType, calculationMode: dto.calculationMode, rate, effectiveFrom, effectiveTo, createdBy: context.sub, remark: dto.remark } });
      await tx.supplierRebatePolicy.update({ where: { id: policy.id }, data: { updatedBy: context.sub, remark: dto.remark ?? policy.remark } });
      await tx.auditLog.create({ data: { operatorId: context.sub, organizationId: supplier.organizationId, actionType: policies.length === 0 ? 'SUPPLIER_REBATE_POLICY_CREATE' : 'SUPPLIER_REBATE_POLICY_VERSION_CREATE', businessType: 'SUPPLIER_REBATE_POLICY', businessId: policy.id, result: 'SUCCESS', afterData: { supplierId, policyId: policy.id, version: versionNumber, platform: contextData.platform ?? null, subjectId: contextData.subjectId ?? null, accountId: contextData.accountId ?? null, rebateType: dto.rebateType, calculationMode: dto.calculationMode, rate: rate.toFixed(4), effectiveFrom: effectiveFrom.toISOString(), effectiveTo: effectiveTo?.toISOString() ?? null, remark: dto.remark ?? null } } });
      return { id: version.id, policyId: policy.id, supplierId, supplierName: supplier.name, version: version.version, platform: policy.platform, subjectId: policy.adSubjectId, accountId: policy.adAccountId, rebateType: version.rebateType, calculationMode: version.calculationMode ?? (version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH), rate: version.rate.toFixed(4), effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo, status: version.status, createdBy: version.createdBy, createdAt: version.createdAt, remark: version.remark };
    });
  }

  async disable(supplierId: string, policyId: string, context: AccessContext) {
    this.assertEditPermission(context);
    const supplier = await this.getAccessibleSupplier(supplierId, context);
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.supplierRebatePolicy.findFirst({ where: { id: policyId, supplierId } });
      if (!policy) throw new NotFoundException({ success: false, code: 'SUPPLIER_REBATE_POLICY_NOT_FOUND', message: '该供应商成本返点政策不存在' });
      if (policy.status === RebateRuleStatus.DISABLED) return { id: policy.id, supplierId, status: policy.status };
      await tx.supplierRebatePolicy.update({ where: { id: policy.id }, data: { status: RebateRuleStatus.DISABLED, updatedBy: context.sub } });
      await tx.supplierRebatePolicyVersion.updateMany({ where: { policyId: policy.id, status: RebateRuleStatus.ACTIVE }, data: { status: RebateRuleStatus.DISABLED } });
      await tx.auditLog.create({ data: { operatorId: context.sub, organizationId: supplier.organizationId, actionType: 'SUPPLIER_REBATE_POLICY_DISABLE', businessType: 'SUPPLIER_REBATE_POLICY', businessId: policy.id, result: 'SUCCESS', beforeData: { status: policy.status }, afterData: { status: RebateRuleStatus.DISABLED } } });
      return { id: policy.id, supplierId, status: RebateRuleStatus.DISABLED };
    });
  }

  private async normalizeCreateContext(dto: CreateSupplierRebatePolicyVersionDto, supplierId: string, context: AccessContext) {
    const account = dto.accountId ? await this.prisma.adAccount.findUnique({ where: { id: dto.accountId }, select: { subjectId: true, platform: true, status: true } }) : null;
    if (dto.accountId && !account) throw new NotFoundException('广告账户不存在');
    const subjectId = dto.subjectId ?? account?.subjectId;
    const platform = dto.platform ?? account?.platform;
    if (dto.subjectId && account && dto.subjectId !== account.subjectId) throw new BadRequestException('广告账户与广告主体不匹配');
    if (dto.platform && account && dto.platform !== account.platform) throw new BadRequestException('广告账户与平台不匹配');
    if (subjectId) {
      const subject = await this.prisma.adSubject.findUnique({ where: { id: subjectId }, select: { organizationId: true } });
      if (!subject) throw new NotFoundException('广告主体不存在');
      if (subject.organizationId) await this.scope.assertOrganizationAccess(subject.organizationId, context);
    }
    return { subjectId, accountId: dto.accountId, platform };
  }

  private async resolveContext(supplierId: string, query: SupplierRebatePolicyQueryDto, context: AccessContext): Promise<SupplierPolicyContext> {
    const account = query.accountId ? await this.prisma.adAccount.findUnique({ where: { id: query.accountId }, select: { subjectId: true, platform: true } }) : null;
    if (query.accountId && !account) throw new NotFoundException('广告账户不存在');
    if (query.subjectId && account && query.subjectId !== account.subjectId) throw new BadRequestException('广告账户与广告主体不匹配');
    if (query.platform && account && query.platform !== account.platform) throw new BadRequestException('广告账户与平台不匹配');
    const subjectId = query.subjectId ?? account?.subjectId;
    const platform = query.platform ?? account?.platform;
    if (subjectId) {
      const subject = await this.prisma.adSubject.findUnique({ where: { id: subjectId }, select: { organizationId: true } });
      if (!subject) throw new NotFoundException('广告主体不存在');
      if (subject.organizationId) await this.scope.assertOrganizationAccess(subject.organizationId, context);
    }
    return { supplierId, platform, subjectId, accountId: query.accountId, at: query.at ? new Date(query.at) : new Date() };
  }

  private async getAccessibleSupplier(supplierId: string, context: AccessContext) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true, organizationId: true, status: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    if (!supplier.organizationId && !this.scope.isSuperAdmin(context)) this.throwPermissionDenied();
    if (supplier.organizationId) await this.scope.assertOrganizationAccess(supplier.organizationId, context);
    return supplier;
  }

  private assertViewPermission(context: AccessContext): void { if (!this.scope.canViewCustomerRebatePolicy(context)) this.throwPermissionDenied(); }
  private assertEditPermission(context: AccessContext): void { if (!this.scope.canEditCustomerRebatePolicy(context)) this.throwPermissionDenied(); }
  private throwPermissionDenied(): never { throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作该供应商成本返点政策' }); }
  private throwNotFound(): never { throw new NotFoundException({ success: false, code: 'SUPPLIER_REBATE_POLICY_NOT_FOUND', message: '该时间和业务范围内没有有效供应商成本返点政策' }); }
  private throwConflict(): never { throw new ConflictException({ success: false, code: 'SUPPLIER_REBATE_POLICY_CONFLICT', message: '供应商成本返点政策生效时间存在冲突' }); }
}
