import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, AccountUnit, FinancialAdjustmentStatus, FinancialAdjustmentType, Prisma, PromotionAccountUnit, PromotionTransactionBusinessType, TransactionBusinessType } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { CashflowService } from '../cashflow/cashflow.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialAdjustmentDto, FinancialAdjustmentQueryDto } from './business.dto';
import { randomUUID } from 'node:crypto';

@Injectable()
export class FinancialAdjustmentService {
  constructor(private readonly prisma: PrismaService, private readonly cashflow: CashflowService, private readonly scope: AccessScopeService) {}

  async list(query: FinancialAdjustmentQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_ADJUST_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.FinancialAdjustmentWhereInput = { organizationId: organizationIds ? { in: organizationIds } : undefined, status: query.status, accountType: query.accountType, accountId: query.accountId, promotionAccountId: query.promotionAccountId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.financialAdjustment.findMany({ where, orderBy: [{ createdAt: 'desc' }, { adjustmentNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { account: { select: { id: true, name: true, accountCode: true, currency: true } }, promotionAccount: { select: { id: true, accountName: true, unit: true } } } }),
      this.prisma.financialAdjustment.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_ADJUST_VIEW');
    const row = await this.prisma.financialAdjustment.findUnique({ where: { id }, include: { account: { select: { id: true, name: true, accountCode: true, currency: true } }, promotionAccount: { select: { id: true, accountName: true, unit: true } }, transaction: true, promotionTransaction: true } });
    if (!row) throw new NotFoundException('财务调整单不存在');
    await this.assertOrganization(row.organizationId, context);
    return this.view(row);
  }

  async create(dto: CreateFinancialAdjustmentDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_ADJUST_CREATE');
    const amount = toMoney(dto.amount, '调整金额');
    if (amount.lte(0)) throw new BadRequestException('调整金额必须大于 0');
    const target = await this.resolveTarget(dto, context);
    const reason = dto.reason.trim();
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.financialAdjustment.create({ data: { adjustmentNo: this.generateNo(), organizationId: target.organizationId, accountId: target.accountId, promotionAccountId: target.promotionAccountId, accountType: dto.accountType, type: dto.type, amount, reason, status: FinancialAdjustmentStatus.DRAFT, createdBy: context.sub } });
      await this.audit(tx, context, created.organizationId, created.id, 'FINANCIAL_ADJUSTMENT_CREATE', null, { status: created.status, amount: moneyToString(amount), type: dto.type });
      return created;
    });
    return this.view(row);
  }

  async approve(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_ADJUST_APPROVE');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === FinancialAdjustmentStatus.APPROVED) return { idempotent: true, ...this.view(row) };
      if (row.status !== FinancialAdjustmentStatus.DRAFT) throw new ConflictException('当前调整单状态不允许审核通过');
      const updated = await tx.financialAdjustment.update({ where: { id }, data: { status: FinancialAdjustmentStatus.APPROVED, approvedBy: context.sub, approvedAt: new Date() } });
      await this.audit(tx, context, row.organizationId, id, 'FINANCIAL_ADJUSTMENT_APPROVE', { status: row.status }, { status: updated.status });
      return { idempotent: false, ...this.view(updated) };
    });
  }

  async reject(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_ADJUST_APPROVE');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === FinancialAdjustmentStatus.REJECTED) return { idempotent: true, ...this.view(row) };
      if (row.status !== FinancialAdjustmentStatus.DRAFT) throw new ConflictException('当前调整单状态不允许拒绝');
      const updated = await tx.financialAdjustment.update({ where: { id }, data: { status: FinancialAdjustmentStatus.REJECTED } });
      await this.audit(tx, context, row.organizationId, id, 'FINANCIAL_ADJUSTMENT_REJECT', { status: row.status }, { status: updated.status });
      return { idempotent: false, ...this.view(updated) };
    });
  }

  async execute(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_ADJUST_EXECUTE');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === FinancialAdjustmentStatus.EXECUTED) return { idempotent: true, adjustment: this.view(row), transaction: null };
      if (row.status !== FinancialAdjustmentStatus.APPROVED) throw new ConflictException('只有审核通过的调整单才能执行');
      if (row.accountType === AccountUnit.CNY && !row.accountId) throw new BadRequestException('CNY调整单缺少资金账户');
      if (row.accountType === AccountUnit.ACCOUNT_CREDIT && !row.promotionAccountId) throw new BadRequestException('ACCOUNT_CREDIT调整单缺少推广账户');
      const changeAmount = row.type === FinancialAdjustmentType.INCOME ? row.amount : row.amount.negated();
      const transaction = row.accountType === AccountUnit.CNY
        ? await this.cashflow.createTransactionInTransaction(tx, { accountId: row.accountId!, businessType: TransactionBusinessType.ADJUSTMENT, businessNo: row.adjustmentNo, changeAmount, operatorId: context.sub, remark: row.reason, occurredAt: new Date(), adjustmentId: row.id })
        : await this.cashflow.createPromotionTransactionInTransaction(tx, { promotionAccountId: row.promotionAccountId!, businessType: PromotionTransactionBusinessType.ADJUSTMENT, businessNo: row.adjustmentNo, changeAmount, operatorId: context.sub, remark: row.reason, occurredAt: new Date(), adjustmentId: row.id });
      const updated = await tx.financialAdjustment.update({ where: { id }, data: { status: FinancialAdjustmentStatus.EXECUTED, executedBy: context.sub, executedAt: new Date() } });
      await this.audit(tx, context, row.organizationId, id, 'FINANCIAL_ADJUSTMENT_EXECUTE', { status: row.status }, { status: updated.status, transactionNo: transaction.transactionNo, changeAmount: moneyToString(changeAmount) });
      return { idempotent: false, adjustment: this.view(updated), transaction };
    });
  }

  private async resolveTarget(dto: CreateFinancialAdjustmentDto, context: AccessContext) {
    if (dto.accountType === AccountUnit.CNY) {
      if (!dto.accountId || dto.promotionAccountId) throw new BadRequestException('CNY调整必须指定资金账户');
      const account = await this.prisma.account.findUnique({ where: { id: dto.accountId }, select: { id: true, organizationId: true, currency: true, status: true } });
      if (!account) throw new NotFoundException('资金账户不存在');
      if (account.currency !== 'CNY') throw new BadRequestException('CNY调整只能使用CNY资金账户');
      if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('资金账户已停用，不能创建调整单');
      await this.assertOrganization(account.organizationId, context);
      if (!account.organizationId) throw new ForbiddenException('资金账户尚未配置所属组织');
      return { organizationId: account.organizationId, accountId: account.id, promotionAccountId: null };
    }
    if (!dto.promotionAccountId || dto.accountId) throw new BadRequestException('ACCOUNT_CREDIT调整必须指定推广账户');
    const account = await this.prisma.promotionAccount.findUnique({ where: { id: dto.promotionAccountId }, select: { id: true, organizationId: true, unit: true, status: true } });
    if (!account) throw new NotFoundException('推广账户不存在');
    if (account.unit !== PromotionAccountUnit.ACCOUNT_CREDIT) throw new BadRequestException('推广账户单位必须为ACCOUNT_CREDIT');
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能创建调整单');
    await this.assertOrganization(account.organizationId, context);
    return { organizationId: account.organizationId, accountId: null, promotionAccountId: account.id };
  }

  private async lock(tx: Prisma.TransactionClient, id: string, context: AccessContext) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "financial_adjustments" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const row = await tx.financialAdjustment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('财务调整单不存在');
    await this.assertOrganization(row.organizationId, context);
    return row;
  }

  private async assertOrganization(organizationId: string | null, context: AccessContext) { if (!organizationId) throw new ForbiddenException('数据未配置所属组织'); await this.scope.assertOrganizationAccess(organizationId, context); }
  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作财务调整' }); }
  private generateNo() { return `ADJ${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
  private view(row: any) { return { ...row, amount: moneyToString(row.amount), account: row.account, promotionAccount: row.promotionAccount, transaction: row.transaction ? { ...row.transaction, changeAmount: moneyToString(row.transaction.changeAmount), balanceBefore: moneyToString(row.transaction.balanceBefore), balanceAfter: moneyToString(row.transaction.balanceAfter) } : undefined, promotionTransaction: row.promotionTransaction ? { ...row.promotionTransaction, changeAmount: moneyToString(row.promotionTransaction.changeAmount), balanceBefore: moneyToString(row.promotionTransaction.balanceBefore), balanceAfter: moneyToString(row.promotionTransaction.balanceAfter) } : undefined };
  }
  private async audit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, resourceId: string, action: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'FINANCIAL_ADJUSTMENT', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
}
