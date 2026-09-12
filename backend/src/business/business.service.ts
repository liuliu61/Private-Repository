import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, AccountType, AccountUnit, OrganizationStatus, Prisma, PurchaseOrderStatus, RebateRuleStatus, ReconciliationStatus, SettlementStatus, SupplierPlatform, TransactionBusinessType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { toMoney } from '../cashflow/utils/money.util';
import { moneyToString } from '../cashflow/utils/money.util';
import { CreateAccountDto, CreateAdAccountDto, CreateAdSubjectDto, CreateCustomerDto, CreateCustomerPolicyDto, CreateOrganizationDto, CreateSettlementDto, CreateSupplierAccountDto, CreateSupplierDto, CreateSupplierPolicyDto, ListQueryDto, ReconciliationQueryDto } from './business.dto';

const zero = () => new Prisma.Decimal(0);
const money = (value?: string) => toMoney(value ?? '0', '金额');

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async listOrganizations(query: ListQueryDto, context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    const rows = await this.prisma.organization.findMany({ where: { id: ids ? { in: ids } : undefined, type: query.type, status: OrganizationStatus.ACTIVE }, orderBy: { createdAt: 'desc' } });
    return rows;
  }

  async createOrganization(dto: CreateOrganizationDto, context: AccessContext) {
    if (!this.scope.isSuperAdmin(context)) throw new ForbiddenException('只有超级管理员可以创建组织');
    if (dto.parentId) await this.prisma.organization.findUniqueOrThrow({ where: { id: dto.parentId } }).catch(() => { throw new NotFoundException('上级组织不存在'); });
    return this.prisma.organization.create({ data: { code: dto.code, name: dto.name, type: dto.type, parentId: dto.parentId } });
  }

  async assignOrganization(dto: { userId: string; organizationId: string }, context: AccessContext) {
    if (!this.scope.isSuperAdmin(context)) throw new ForbiddenException('只有超级管理员可以分配组织');
    const [user, organization] = await Promise.all([this.prisma.user.findUnique({ where: { id: dto.userId } }), this.prisma.organization.findUnique({ where: { id: dto.organizationId } })]);
    if (!user) throw new NotFoundException('用户不存在');
    if (!organization) throw new NotFoundException('组织不存在');
    return this.prisma.userOrganization.upsert({ where: { userId_organizationId: dto }, update: {}, create: dto });
  }

  async listAccounts(query: ListQueryDto, context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    const rows = await this.prisma.account.findMany({ where: { organizationId: ids ? { in: ids } : undefined, status: query.status }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({ ...row, openingBalance: moneyToString(row.openingBalance), currentBalance: moneyToString(row.currentBalance) }));
  }

  async createAccount(dto: CreateAccountDto, context: AccessContext) {
    if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE')) throw new ForbiddenException('没有创建资金账户的权限');
    if (dto.organizationId) await this.scope.assertOrganizationAccess(dto.organizationId, context);
    const openingBalance = money(dto.openingBalance);
    return this.prisma.account.create({ data: { name: dto.name, accountCode: dto.accountCode, accountType: dto.accountType, organizationId: dto.organizationId, openingBalance, currentBalance: openingBalance, legacyBalanceSide: null } }).then((row) => ({ ...row, openingBalance: moneyToString(row.openingBalance), currentBalance: moneyToString(row.currentBalance) }));
  }

  async listCustomers(query: ListQueryDto, context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    return this.prisma.customer.findMany({ where: { agentId: ids ? { in: ids } : undefined, OR: query.keyword ? [{ name: { contains: query.keyword, mode: 'insensitive' } }, { customerCode: { contains: query.keyword, mode: 'insensitive' } }] : undefined }, orderBy: { createdAt: 'desc' } });
  }

  async createCustomer(dto: CreateCustomerDto, context: AccessContext) {
    const agentId = dto.agentId ?? (await this.scope.getOrganizationIds(context))?.[0];
    if (!agentId && !this.scope.isSuperAdmin(context)) throw new BadRequestException('请先配置客户所属组织');
    if (agentId) await this.scope.assertOrganizationAccess(agentId, context);
    return this.prisma.customer.create({ data: { customerCode: dto.customerCode, name: dto.name, fullName: dto.fullName, contact: dto.contact, phone: dto.phone, departmentId: dto.departmentId, agentId, remark: dto.remark } });
  }

  async listSuppliers(query: ListQueryDto, context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    return this.prisma.supplier.findMany({ where: { organizationId: ids ? { in: ids } : undefined, status: query.assetStatus, name: query.keyword ? { contains: query.keyword, mode: 'insensitive' } : undefined }, orderBy: { createdAt: 'desc' } });
  }

  async createSupplier(dto: CreateSupplierDto, context: AccessContext) {
    if (dto.organizationId) await this.scope.assertOrganizationAccess(dto.organizationId, context);
    return this.prisma.supplier.create({ data: dto });
  }

  async listSupplierAccounts(supplierId: string, context: AccessContext) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { organizationId: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    if (supplier.organizationId) await this.scope.assertOrganizationAccess(supplier.organizationId, context);
    const rows = await this.prisma.supplierAccount.findMany({ where: { supplierId }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({ ...row, currentBalance: moneyToString(row.currentBalance) }));
  }

  async createSupplierAccount(supplierId: string, dto: CreateSupplierAccountDto, context: AccessContext) {
    if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE')) throw new ForbiddenException('没有维护一级代理商资金账户的权限');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { organizationId: true, status: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    if (supplier.status !== 'ACTIVE') throw new BadRequestException('供应商已停用，不能创建资金账户');
    if (supplier.organizationId) await this.scope.assertOrganizationAccess(supplier.organizationId, context);
    if (![AccountUnit.CNY, AccountUnit.ACCOUNT_CREDIT].includes(dto.currency)) throw new BadRequestException('一级代理账户单位只支持 CNY 或 ACCOUNT_CREDIT');
    const row = await this.prisma.supplierAccount.create({ data: { supplierId, accountName: dto.accountName, accountType: dto.accountType, currency: dto.currency, currentBalance: zero(), status: AccountStatus.ACTIVE } });
    return { ...row, currentBalance: moneyToString(row.currentBalance) };
  }

  async listAdSubjects(query: ListQueryDto, context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    return this.prisma.adSubject.findMany({ where: { organizationId: ids ? { in: ids } : undefined, status: query.assetStatus }, orderBy: { createdAt: 'desc' } });
  }

  async createAdSubject(dto: CreateAdSubjectDto, context: AccessContext) {
    if (dto.organizationId) await this.scope.assertOrganizationAccess(dto.organizationId, context);
    return this.prisma.adSubject.create({ data: dto });
  }

  async listAdAccounts(query: ListQueryDto, context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    return this.prisma.adAccount.findMany({ where: { status: query.assetStatus, subject: { organizationId: ids ? { in: ids } : undefined } }, include: { subject: true, customer: true }, orderBy: { createdAt: 'desc' } });
  }

  async createAdAccount(dto: CreateAdAccountDto, context: AccessContext) {
    const subject = await this.prisma.adSubject.findUnique({ where: { id: dto.subjectId }, select: { organizationId: true } });
    if (!subject) throw new NotFoundException('广告主体不存在');
    if (subject.organizationId) await this.scope.assertOrganizationAccess(subject.organizationId, context);
    return this.prisma.adAccount.create({ data: dto });
  }

  async createCustomerPolicy(dto: CreateCustomerPolicyDto, context: AccessContext) {
    if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE')) throw new ForbiddenException('没有维护客户返点政策的权限');
    this.assertPolicyScope(dto.customerId, dto.adSubjectId, dto.adAccountId, '客户');
    const rate = money(dto.rate);
    this.validateRate(rate);
    const effectiveFrom = new Date(dto.effectiveFrom); const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    this.assertDateRange(effectiveFrom, effectiveTo);
    await this.assertCustomerPolicyConflict(dto, effectiveFrom, effectiveTo);
    const existingVersion = await this.prisma.customerRebatePolicy.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } });
    const version = existingVersion ? 1 : 1;
    return this.prisma.customerRebatePolicy.create({ data: { name: dto.name, customerId: dto.customerId, adSubjectId: dto.adSubjectId, adAccountId: dto.adAccountId, versions: { create: { version, rebateType: dto.rebateType, calculationMode: dto.calculationMode, rate, effectiveFrom, effectiveTo } } }, include: { versions: true } });
  }

  async createSupplierPolicy(dto: CreateSupplierPolicyDto, context: AccessContext) {
    if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE')) throw new ForbiddenException('没有维护供应商返点政策的权限');
    this.assertPolicyScope(dto.supplierId, dto.adSubjectId, dto.adAccountId, '供应商');
    if (dto.adAccountId && !dto.adSubjectId) {
      const account = await this.prisma.adAccount.findUnique({ where: { id: dto.adAccountId }, select: { subjectId: true, platform: true } });
      if (!account) throw new NotFoundException('广告账户不存在');
      dto.adSubjectId = account.subjectId;
    }
    const rate = money(dto.rate); this.validateRate(rate);
    const effectiveFrom = new Date(dto.effectiveFrom); const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    this.assertDateRange(effectiveFrom, effectiveTo);
    await this.assertSupplierPolicyConflict(dto, effectiveFrom, effectiveTo);
    return this.prisma.supplierRebatePolicy.create({ data: { name: dto.name, supplierId: dto.supplierId, platform: dto.platform, adSubjectId: dto.adSubjectId, adAccountId: dto.adAccountId, versions: { create: { version: 1, rebateType: dto.rebateType, calculationMode: dto.calculationMode, rate, settlementType: dto.settlementType, effectiveFrom, effectiveTo } } }, include: { versions: true } });
  }

  async listCustomerPolicies(context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    const rows = await this.prisma.customerRebatePolicy.findMany({ where: ids ? { OR: [{ customer: { agentId: { in: ids } } }, { adSubject: { organizationId: { in: ids } } }] } : undefined, include: { versions: true, customer: true, adSubject: true, adAccount: true }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({ ...row, versions: row.versions.map((version) => ({ ...version, rate: version.rate.toFixed(4) })) }));
  }

  async listSupplierPolicies(context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    const rows = await this.prisma.supplierRebatePolicy.findMany({ where: ids ? { OR: [{ supplier: { organizationId: { in: ids } } }, { adSubject: { organizationId: { in: ids } } }] } : undefined, include: { versions: true, supplier: true, adSubject: true, adAccount: true }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({ ...row, versions: row.versions.map((version) => ({ ...version, rate: version.rate.toFixed(4) })) }));
  }

  async listSettlements(query: ListQueryDto, context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.settlement.findMany({ where: { organizationId: ids ? { in: ids } : undefined, status: query.settlementStatus }, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.settlement.count({ where: { organizationId: ids ? { in: ids } : undefined, status: query.settlementStatus } }),
    ]);
    return { items: items.map((item) => this.settlementView(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async createSettlement(dto: CreateSettlementDto, context: AccessContext) {
    if (!this.scope.canFinance(context)) throw new ForbiddenException('没有创建结算单的权限');
    await this.scope.assertOrganizationAccess(dto.organizationId, context);
    const start = new Date(dto.periodStart); const end = new Date(dto.periodEnd);
    if (!(start < end)) throw new BadRequestException('结算期间必须满足开始时间早于结束时间');
    const orders = await this.prisma.purchaseOrder.findMany({ where: { id: { in: dto.orderIds }, organizationId: dto.organizationId, status: { in: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.COMPLETED] } } });
    if (orders.length !== dto.orderIds.length) throw new BadRequestException('存在不可结算或不属于当前组织的采购单');
    if (orders.some((order) => !order.supplierBaseAmount || !order.supplierPaymentAmount || !order.supplierRebateAmount)) throw new BadRequestException('存在尚未完成供应商结算计算的采购单，不能创建结算单');
    const totalAmount = orders.reduce((sum, item) => sum.add(item.supplierBaseAmount as Prisma.Decimal), zero());
    const totalRebate = orders.reduce((sum, item) => sum.add(item.supplierRebateAmount as Prisma.Decimal), zero());
    const payableAmount = orders.reduce((sum, item) => sum.add(item.supplierPaymentAmount as Prisma.Decimal), zero());
    const settlement = await this.prisma.$transaction(async (tx) => tx.settlement.create({ data: { settlementNo: this.generateNo('ST'), organizationId: dto.organizationId, periodStart: start, periodEnd: end, totalAmount, totalRebate, payableAmount, createdBy: context.sub, items: { create: orders.map((order) => ({ orderId: order.id, amount: order.supplierBaseAmount as Prisma.Decimal, paymentAmount: order.supplierPaymentAmount as Prisma.Decimal, rebateAmount: order.supplierRebateAmount as Prisma.Decimal, payableAmount: order.supplierPaymentAmount as Prisma.Decimal })) } }, include: { items: true } }));
    return this.settlementView(settlement);
  }

  async confirmSettlement(id: string, context: AccessContext) {
    if (!this.scope.canFinance(context)) throw new ForbiddenException('没有确认结算单的权限');
    const item = await this.prisma.settlement.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('结算单不存在');
    if (item.status !== SettlementStatus.DRAFT) throw new ConflictException('当前结算单状态不允许确认');
    await this.scope.assertOrganizationAccess(item.organizationId, context);
    return this.prisma.settlement.update({ where: { id }, data: { status: SettlementStatus.CONFIRMED, confirmedBy: context.sub, confirmedAt: new Date() }, include: { items: true } }).then((row) => this.settlementView(row));
  }

  async previewReconciliation(dto: ReconciliationQueryDto, context: AccessContext) {
    await this.scope.assertAccountAccess(dto.accountId, context);
    const { start, end } = this.period(dto.periodStart, dto.periodEnd);
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId }, select: { id: true, openingBalance: true, currentBalance: true } });
    if (!account) throw new NotFoundException('资金账户不存在');
    const before = await this.prisma.transaction.aggregate({ where: { accountId: dto.accountId, occurredAt: { lt: start } }, _sum: { changeAmount: true } });
    const rows = await this.prisma.transaction.findMany({ where: { accountId: dto.accountId, occurredAt: { gte: start, lt: end } }, select: { businessType: true, changeAmount: true } });
    const opening = account.openingBalance.add(before._sum.changeAmount ?? zero());
    const totals = this.reconciliationTotals(rows);
    const system = opening.add(rows.reduce((sum, row) => sum.add(row.changeAmount), zero()));
    const actual = dto.actualClosingBalance === undefined ? null : money(dto.actualClosingBalance);
    const difference = actual === null ? null : actual.sub(system);
    return { accountId: account.id, periodStart: start, periodEnd: end, openingBalance: moneyToString(opening), ...totals, systemClosingBalance: moneyToString(system), actualClosingBalance: actual === null ? null : moneyToString(actual), difference: difference === null ? null : moneyToString(difference), consistent: difference?.isZero() ?? null };
  }

  async createReconciliation(dto: ReconciliationQueryDto, context: AccessContext) {
    if (!this.scope.canFinance(context)) throw new ForbiddenException('没有创建对账单的权限');
    const preview = await this.previewReconciliation(dto, context);
    return this.prisma.reconciliation.create({ data: { accountId: dto.accountId, periodStart: preview.periodStart, periodEnd: preview.periodEnd, openingBalance: money(preview.openingBalance), totalReceipt: money(preview.totalReceipt), totalRebate: money(preview.totalRebate), totalExpense: money(preview.totalExpense), totalRefund: money(preview.totalRefund), totalAdjustment: money(preview.totalAdjustment), systemClosingBalance: money(preview.systemClosingBalance), actualClosingBalance: preview.actualClosingBalance ? money(preview.actualClosingBalance) : null, difference: preview.difference ? money(preview.difference) : null, status: preview.consistent === false ? ReconciliationStatus.HAS_DIFFERENCE : ReconciliationStatus.DRAFT, createdBy: context.sub } });
  }

  async listReconciliations(query: ListQueryDto, context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    const where = { account: { organizationId: ids ? { in: ids } : undefined }, status: query.reconciliationStatus };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reconciliation.findMany({ where, include: { account: { select: { id: true, name: true, accountCode: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.reconciliation.count({ where }),
    ]);
    return { items: items.map((item) => ({ ...item, openingBalance: moneyToString(item.openingBalance), totalReceipt: moneyToString(item.totalReceipt), totalRebate: moneyToString(item.totalRebate), totalExpense: moneyToString(item.totalExpense), totalRefund: moneyToString(item.totalRefund), totalAdjustment: moneyToString(item.totalAdjustment), systemClosingBalance: moneyToString(item.systemClosingBalance), actualClosingBalance: item.actualClosingBalance ? moneyToString(item.actualClosingBalance) : null, difference: item.difference ? moneyToString(item.difference) : null })), total, page: query.page, pageSize: query.pageSize };
  }

  async completeReconciliation(id: string, context: AccessContext) {
    if (!this.scope.canFinance(context)) throw new ForbiddenException('没有完成对账的权限');
    const row = await this.prisma.reconciliation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('对账单不存在');
    await this.scope.assertAccountAccess(row.accountId, context);
    if (row.difference === null || !row.difference.isZero()) throw new BadRequestException('对账存在差异，不能完成');
    return this.prisma.reconciliation.update({ where: { id }, data: { status: ReconciliationStatus.COMPLETED, completedBy: context.sub, completedAt: new Date() } });
  }

  async dashboard(context: AccessContext) {
    const ids = await this.scope.getOrganizationIds(context);
    const accountWhere = { organizationId: ids ? { in: ids } : undefined };
    const [accounts, pendingRebates, pendingOrders, pendingSettlements] = await Promise.all([
      this.prisma.account.findMany({ where: accountWhere, select: { currentBalance: true } }),
      this.prisma.rebateRecord.count({ where: { status: 'PENDING_CONFIRMATION', customer: { agentId: ids ? { in: ids } : undefined } } }),
      this.prisma.purchaseOrder.count({ where: { organizationId: ids ? { in: ids } : undefined, status: { in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_CONFIRMATION, PurchaseOrderStatus.PENDING_REVIEW] } } }),
      this.prisma.settlement.count({ where: { organizationId: ids ? { in: ids } : undefined, status: SettlementStatus.DRAFT } }),
    ]);
    return { accountBalance: moneyToString(accounts.reduce((sum, item) => sum.add(item.currentBalance), zero())), accountCount: accounts.length, pendingRebates, pendingOrders, pendingSettlements };
  }

  async auditLogs(query: ListQueryDto, context: AccessContext) {
    if (!this.scope.isSuperAdmin(context) && !this.scope.canFinance(context)) throw new ForbiddenException('没有查看审计日志的权限');
    const [items, total] = await this.prisma.$transaction([this.prisma.auditLog.findMany({ include: { operator: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.prisma.auditLog.count()]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private assertPolicyScope(...values: Array<string | undefined>, label: string): void {
    if (values.filter(Boolean).length !== 1) throw new BadRequestException(`${label}政策必须且只能配置一个命中范围`);
  }

  private assertDateRange(start: Date, end: Date | null): void {
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime())) || (end && end <= start)) throw new BadRequestException('政策有效期不正确，必须满足开始时间早于结束时间');
  }

  private validateRate(rate: Prisma.Decimal): void {
    if (rate.lte(-100) || rate.gte(100)) throw new BadRequestException('返点比例必须大于 -100% 且小于 100%');
  }

  private async assertCustomerPolicyConflict(dto: CreateCustomerPolicyDto, start: Date, end: Date | null): Promise<void> {
    const rows = await this.prisma.customerRebatePolicy.findMany({ where: { customerId: dto.customerId, adSubjectId: dto.adSubjectId, adAccountId: dto.adAccountId, status: RebateRuleStatus.ACTIVE }, include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } } });
    if (rows.some((row) => row.versions.some((version) => version.effectiveFrom < (end ?? new Date('9999-12-31')) && (!version.effectiveTo || version.effectiveTo > start)))) throw new ConflictException('同一客户政策范围内存在重叠的有效政策');
  }

  private async assertSupplierPolicyConflict(dto: CreateSupplierPolicyDto, start: Date, end: Date | null): Promise<void> {
    const rows = await this.prisma.supplierRebatePolicy.findMany({ where: { supplierId: dto.supplierId, platform: dto.platform, adSubjectId: dto.adSubjectId, adAccountId: dto.adAccountId, status: RebateRuleStatus.ACTIVE }, include: { versions: { where: { status: RebateRuleStatus.ACTIVE } } } });
    if (rows.some((row) => row.versions.some((version) => version.effectiveFrom < (end ?? new Date('9999-12-31')) && (!version.effectiveTo || version.effectiveTo > start)))) throw new ConflictException('同一供应商政策范围内存在重叠的有效政策');
  }

  private reconciliationTotals(rows: Array<{ businessType: TransactionBusinessType; changeAmount: Prisma.Decimal }>) {
    const sum = (type: TransactionBusinessType, positive = false) => rows.filter((row) => row.businessType === type).reduce((total, row) => total.add(positive ? row.changeAmount.abs() : row.changeAmount), zero());
    return { totalReceipt: moneyToString(sum(TransactionBusinessType.RECEIPT, true).add(sum(TransactionBusinessType.RECHARGE, true))), totalRebate: moneyToString(sum(TransactionBusinessType.REBATE, true)), totalExpense: moneyToString(sum(TransactionBusinessType.DEDUCTION, true)), totalRefund: moneyToString(sum(TransactionBusinessType.REFUND, true)), totalAdjustment: moneyToString(sum(TransactionBusinessType.ADJUSTMENT)) };
  }
  private period(startValue: string, endValue: string) { const start = new Date(startValue); const end = new Date(endValue); if (!(start < end)) throw new BadRequestException('时间区间必须满足开始时间早于结束时间'); return { start, end }; }
  private generateNo(prefix: string) { return `${prefix}${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${Math.random().toString(36).slice(2, 8).toUpperCase()}`; }
  private settlementView(row: any) { return { ...row, totalAmount: row.totalAmount ? moneyToString(row.totalAmount) : undefined, totalRebate: row.totalRebate ? moneyToString(row.totalRebate) : undefined, payableAmount: row.payableAmount ? moneyToString(row.payableAmount) : undefined }; }
}
