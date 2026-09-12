import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RebateCalculationMode, RebateRuleStatus, RebateRuleType } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { selectEffectivePolicyVersion } from './customer-rebate-policy.service';
import { selectBestSupplierPolicy } from './supplier-rebate-policy.service';
import { CustomerPolicyResolveInput, CustomerPolicySnapshot, SupplierPolicyResolveInput, SupplierPolicySnapshot } from './policy.types';

@Injectable()
export class PolicyResolverService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async resolveCustomerRebatePolicy(input: CustomerPolicyResolveInput): Promise<CustomerPolicySnapshot> {
    this.assertBusinessTime(input.businessTime);
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true, agentId: true } });
    if (!customer) throw new NotFoundException({ success: false, code: 'CUSTOMER_REBATE_POLICY_NOT_FOUND', message: '该客户当前没有有效返点政策' });
    await this.assertOrganizationAccess(customer.agentId, input.context);

    const policies = await this.prisma.customerRebatePolicy.findMany({
      where: { customerId: input.customerId, adSubjectId: null, adAccountId: null, status: RebateRuleStatus.ACTIVE },
      include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } },
    });
    const matches = policies.flatMap((policy) => policy.versions.map((version) => ({ policy, version })));
    const selected = selectEffectivePolicyVersion(matches.map((item) => ({ ...item.version, policyId: item.policy.id })), input.businessTime);
    if (!selected) this.throwCustomerPolicyNotFound();
    const source = matches.find((item) => item.version.id === selected.id);
    if (!source) this.throwCustomerPolicyNotFound();
    return {
      policyId: source.policy.id,
      policyVersionId: source.version.id,
      customerPolicyId: source.policy.id,
      customerPolicyVersionId: source.version.id,
      version: source.version.version,
      rebateType: source.version.rebateType,
      calculationMode: source.version.calculationMode ?? (source.version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH),
      rate: source.version.rate,
      effectiveFrom: source.version.effectiveFrom,
      effectiveTo: source.version.effectiveTo,
    };
  }

  async resolveSupplierRebatePolicy(input: SupplierPolicyResolveInput): Promise<SupplierPolicySnapshot> {
    this.assertBusinessTime(input.businessTime);
    const supplier = await this.prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, organizationId: true } });
    if (!supplier) throw new NotFoundException({ success: false, code: 'SUPPLIER_REBATE_POLICY_NOT_FOUND', message: '该时间和业务范围内没有有效供应商成本返点政策' });
    await this.assertOrganizationAccess(supplier.organizationId, input.context);
    const context = await this.resolveSupplierContext(input);
    const policies = await this.prisma.supplierRebatePolicy.findMany({
      where: { supplierId: input.supplierId, status: RebateRuleStatus.ACTIVE, versions: { some: { status: RebateRuleStatus.ACTIVE } } },
      include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } },
    });
    const selected = selectBestSupplierPolicy(policies.flatMap((policy) => policy.versions.map((version) => ({
      supplierId: input.supplierId,
      policyId: policy.id,
      policyVersionId: version.id,
      platform: policy.platform,
      subjectId: policy.adSubjectId,
      accountId: policy.adAccountId,
      rebateType: version.rebateType,
      calculationMode: version.calculationMode ?? (version.rebateType === RebateRuleType.FIXED_ADD ? RebateCalculationMode.CASH_TO_CREDIT : RebateCalculationMode.CREDIT_TO_CASH),
      rate: version.rate,
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      version: version.version,
    }))), context);
    if (!selected) this.throwSupplierPolicyNotFound();
    return {
      policyId: selected.policyId,
      policyVersionId: selected.policyVersionId,
      supplierPolicyId: selected.policyId,
      supplierPolicyVersionId: selected.policyVersionId,
      version: selected.version,
      rebateType: selected.rebateType,
      calculationMode: selected.calculationMode,
      rate: selected.rate,
      effectiveFrom: selected.effectiveFrom,
      effectiveTo: selected.effectiveTo,
      matchLevel: selected.matchLevel,
    };
  }

  private async resolveSupplierContext(input: SupplierPolicyResolveInput) {
    const account = input.accountId ? await this.prisma.adAccount.findUnique({ where: { id: input.accountId }, select: { subjectId: true, platform: true } }) : null;
    if (input.accountId && !account) throw new NotFoundException('广告账户不存在');
    if (input.subjectId && account && input.subjectId !== account.subjectId) throw new BadRequestException('广告账户与广告主体不匹配');
    if (input.platform && account && input.platform !== account.platform) throw new BadRequestException('广告账户与平台不匹配');
    const subjectId = input.subjectId ?? account?.subjectId;
    const platform = input.platform ?? account?.platform;
    if (subjectId) {
      const subject = await this.prisma.adSubject.findUnique({ where: { id: subjectId }, select: { organizationId: true } });
      if (!subject) throw new NotFoundException('广告主体不存在');
      await this.assertOrganizationAccess(subject.organizationId, input.context);
    }
    return { supplierId: input.supplierId, platform, subjectId, accountId: input.accountId, at: input.businessTime };
  }

  private async assertOrganizationAccess(organizationId: string | null, context: AccessContext): Promise<void> {
    if (!organizationId && !this.scope.isSuperAdmin(context)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权访问该组织数据' });
    if (organizationId) await this.scope.assertOrganizationAccess(organizationId, context);
  }

  private assertBusinessTime(value: Date): void {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new BadRequestException('业务时间格式不正确');
  }

  private throwCustomerPolicyNotFound(): never { throw new NotFoundException({ success: false, code: 'CUSTOMER_REBATE_POLICY_NOT_FOUND', message: '该客户当前没有有效返点政策' }); }
  private throwSupplierPolicyNotFound(): never { throw new NotFoundException({ success: false, code: 'SUPPLIER_REBATE_POLICY_NOT_FOUND', message: '该时间和业务范围内没有有效供应商成本返点政策' }); }
}
