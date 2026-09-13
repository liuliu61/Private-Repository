import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceTaskStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteInvoiceTaskDto, CreateCustomerInvoiceProfileDto, InvoiceTaskQueryDto, InvoiceTaskRejectDto, InvoiceTaskReviewDto, UpdateCustomerInvoiceProfileDto, UpdateInvoiceTaskDto } from './business.dto';

@Injectable()
export class PublicInvoiceTaskService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async list(query: InvoiceTaskQueryDto, context: AccessContext) {
    this.assertView(context);
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.InvoiceTaskWhereInput = {
      organizationId: organizationIds ? { in: organizationIds } : undefined,
      customerId: query.customerId,
      status: query.status,
      OR: query.keyword ? [{ taskNo: { contains: query.keyword, mode: 'insensitive' } }, { payerName: { contains: query.keyword, mode: 'insensitive' } }, { payerAccount: { contains: query.keyword, mode: 'insensitive' } }] : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoiceTask.findMany({ where, include: this.include(), orderBy: [{ createdAt: 'desc' }, { taskNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.invoiceTask.count({ where }),
    ]);
    return { items: items.map((row) => this.view(row)), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, context: AccessContext) {
    this.assertView(context);
    const row = await this.findTask(id, context);
    const auditLogs = await this.prisma.auditLog.findMany({ where: { businessType: 'PUBLIC_INVOICE_TASK', businessId: id }, orderBy: { createdAt: 'asc' } });
    return { ...this.view(row), auditLogs };
  }

  async listProfiles(customerId: string, context: AccessContext) {
    this.assertView(context);
    await this.assertCustomer(customerId, context);
    return this.prisma.customerInvoiceProfile.findMany({ where: { customerId }, orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }] });
  }

  async createProfile(customerId: string, dto: CreateCustomerInvoiceProfileDto, context: AccessContext) {
    this.assertManage(context);
    await this.assertCustomer(customerId, context);
    return this.prisma.customerInvoiceProfile.create({ data: { customerId, ...this.profileData(dto) } });
  }

  async updateProfile(customerId: string, id: string, dto: UpdateCustomerInvoiceProfileDto, context: AccessContext) {
    this.assertManage(context);
    await this.assertCustomer(customerId, context);
    const profile = await this.prisma.customerInvoiceProfile.findUnique({ where: { id } });
    if (!profile || profile.customerId !== customerId) throw new NotFoundException('开票信息不存在');
    return this.prisma.customerInvoiceProfile.update({ where: { id }, data: this.profileData(dto) });
  }

  async update(id: string, dto: UpdateInvoiceTaskDto, context: AccessContext) {
    this.assertManage(context);
    const task = await this.findTask(id, context);
    const editableStatuses: InvoiceTaskStatus[] = [InvoiceTaskStatus.PENDING, InvoiceTaskStatus.REJECTED];
    if (!editableStatuses.includes(task.status)) throw new ConflictException('当前状态不允许修改开票任务');
    const amount = toMoney(dto.invoiceAmount, '需开票金额');
    if (amount.lte(0) || amount.gt(task.publicAmount)) throw new BadRequestException('需开票金额必须大于0且不能超过对公入账金额');
    const snapshot = await this.resolveProfile(task.customerId, dto.invoiceProfileId, context);
    const updated = await this.prisma.invoiceTask.update({ where: { id }, data: { invoiceAmount: amount, invoiceProfileId: dto.invoiceProfileId === undefined ? task.invoiceProfileId : dto.invoiceProfileId || null, ...this.taskSnapshot(snapshot, dto) }, include: this.include() });
    await this.audit(this.prisma, context, updated.organizationId, id, 'INVOICE_TASK_UPDATE', { status: task.status, invoiceAmount: moneyToString(task.invoiceAmount) }, { invoiceAmount: moneyToString(amount) });
    return this.view(updated);
  }

  async submit(id: string, context: AccessContext) {
    this.assertManage(context);
    return this.prisma.$transaction(async (tx) => {
      const task = await this.lockTask(tx, id, context);
      if (task.status === InvoiceTaskStatus.REVIEWING) return { idempotent: true, task: this.view(task) };
      const submittableStatuses: InvoiceTaskStatus[] = [InvoiceTaskStatus.PENDING, InvoiceTaskStatus.REJECTED];
      if (!submittableStatuses.includes(task.status)) throw new ConflictException('当前状态不允许提交审核');
      const updated = await tx.invoiceTask.update({ where: { id }, data: { status: InvoiceTaskStatus.REVIEWING, submittedAt: new Date(), rejectReason: null }, include: this.include() });
      await this.audit(tx, context, updated.organizationId, id, 'INVOICE_TASK_SUBMIT', { status: task.status }, { status: updated.status });
      return { idempotent: false, task: this.view(updated) };
    });
  }

  async approve(id: string, dto: InvoiceTaskReviewDto, context: AccessContext) {
    this.assertReview(context);
    return this.prisma.$transaction(async (tx) => {
      const task = await this.lockTask(tx, id, context);
      if (task.status !== InvoiceTaskStatus.REVIEWING) throw new ConflictException('只有审核中的开票任务可以审核通过');
      const updated = await tx.invoiceTask.update({ where: { id }, data: { status: InvoiceTaskStatus.APPROVED, reviewedBy: context.sub, reviewedAt: new Date(), approvalRemark: dto.approvalRemark?.trim() || null }, include: this.include() });
      await this.audit(tx, context, updated.organizationId, id, 'INVOICE_TASK_APPROVE', { status: task.status }, { status: updated.status, approvalRemark: updated.approvalRemark });
      return this.view(updated);
    });
  }

  async reject(id: string, dto: InvoiceTaskRejectDto, context: AccessContext) {
    this.assertReview(context);
    return this.prisma.$transaction(async (tx) => {
      const task = await this.lockTask(tx, id, context);
      if (task.status !== InvoiceTaskStatus.REVIEWING) throw new ConflictException('只有审核中的开票任务可以驳回');
      const updated = await tx.invoiceTask.update({ where: { id }, data: { status: InvoiceTaskStatus.REJECTED, reviewedBy: context.sub, reviewedAt: new Date(), rejectReason: dto.rejectReason.trim() }, include: this.include() });
      await this.audit(tx, context, updated.organizationId, id, 'INVOICE_TASK_REJECT', { status: task.status }, { status: updated.status, rejectReason: updated.rejectReason });
      return this.view(updated);
    });
  }

  async revoke(id: string, context: AccessContext) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.lockTask(tx, id, context);
      if (task.status !== InvoiceTaskStatus.REVIEWING || task.createdBy !== context.sub) throw new ForbiddenException('只有创建人可以撤回审核中的开票任务');
      const updated = await tx.invoiceTask.update({ where: { id }, data: { status: InvoiceTaskStatus.PENDING }, include: this.include() });
      await this.audit(tx, context, updated.organizationId, id, 'INVOICE_TASK_REVOKE', { status: task.status }, { status: updated.status });
      return this.view(updated);
    });
  }

  async complete(id: string, dto: CompleteInvoiceTaskDto, context: AccessContext) {
    this.assertComplete(context);
    return this.prisma.$transaction(async (tx) => {
      const task = await this.lockTask(tx, id, context);
      if (task.status !== InvoiceTaskStatus.APPROVED) throw new ConflictException('只有待完成开票的任务可以完成');
      const amount = toMoney(dto.amount, '实际开票金额');
      if (amount.lte(0)) throw new BadRequestException('实际开票金额必须大于0');
      const detail = await tx.invoiceDetail.create({ data: { invoiceTaskId: id, amount, invoiceType: dto.invoiceType, invoiceCode: dto.invoiceCode?.trim() || null, invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null, invoiceContent: dto.invoiceContent?.trim() || task.invoiceContent || null, remark: dto.remark?.trim() || null, invoiceUrl: dto.invoiceUrl?.trim() || null, imageUrl: dto.imageUrl?.trim() || null, createdBy: context.sub } });
      const updated = await tx.invoiceTask.update({ where: { id }, data: { status: InvoiceTaskStatus.COMPLETED, completedBy: context.sub, completedAt: new Date() }, include: this.include() });
      await this.audit(tx, context, updated.organizationId, id, 'INVOICE_TASK_COMPLETE', { status: task.status }, { status: updated.status, invoiceDetailId: detail.id, note: '完成开票' });
      return this.view(updated);
    });
  }

  private include() { return { customer: { select: { id: true, name: true, customerCode: true } }, invoiceProfile: true, receiveRecordDetail: { include: { receiveRecord: { include: { bankTransaction: { select: { transactionNo: true, counterpartyName: true, counterpartyAccount: true } } } } } }, creator: { select: { id: true, displayName: true } }, reviewer: { select: { id: true, displayName: true } }, completer: { select: { id: true, displayName: true } }, invoiceDetails: { orderBy: { createdAt: 'asc' } } } as const; }
  private async findTask(id: string, context: AccessContext) { const task = await this.prisma.invoiceTask.findUnique({ where: { id }, include: this.include() }); if (!task) throw new NotFoundException('开票任务不存在'); await this.scope.assertOrganizationAccess(task.organizationId, context); return task; }
  private async lockTask(tx: Prisma.TransactionClient, id: string, context: AccessContext) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoice_tasks" WHERE "id" = ${id}::uuid FOR UPDATE`); const task = await tx.invoiceTask.findUnique({ where: { id }, include: this.include() }); if (!task) throw new NotFoundException('开票任务不存在'); await this.scope.assertOrganizationAccess(task.organizationId, context); return task; }
  private async assertCustomer(customerId: string, context: AccessContext) { const customer = await this.prisma.customer.findUnique({ where: { id: customerId } }); if (!customer) throw new NotFoundException('客户不存在'); if (!customer.agentId) throw new ForbiddenException('客户未配置组织归属'); await this.scope.assertOrganizationAccess(customer.agentId, context); return customer; }
  private async resolveProfile(customerId: string, profileId: string | undefined, context: AccessContext) { if (profileId === undefined) return undefined; if (!profileId) return null; const profile = await this.prisma.customerInvoiceProfile.findUnique({ where: { id: profileId } }); if (!profile || profile.customerId !== customerId) throw new NotFoundException('开票信息不存在'); await this.assertCustomer(customerId, context); return profile; }
  private profileData(dto: CreateCustomerInvoiceProfileDto) { return { titleName: dto.titleName.trim(), taxpayerCode: dto.taxpayerCode?.trim() || null, address: dto.address?.trim() || null, phone: dto.phone?.trim() || null, bankName: dto.bankName?.trim() || null, bankAccount: dto.bankAccount?.trim() || null, defaultInvoiceContent: dto.defaultInvoiceContent?.trim() || null, enabled: dto.enabled ?? true }; }
  private taskSnapshot(profile: any, dto: UpdateInvoiceTaskDto) { const base: Record<string, string | null | undefined> = profile === undefined ? {} : profile ? { titleName: profile.titleName, taxpayerCode: profile.taxpayerCode, address: profile.address, phone: profile.phone, bankName: profile.bankName, bankAccount: profile.bankAccount, invoiceContent: profile.defaultInvoiceContent } : { titleName: null, taxpayerCode: null, address: null, phone: null, bankName: null, bankAccount: null, invoiceContent: null }; return { ...base, titleName: dto.titleName?.trim() ?? base.titleName, taxpayerCode: dto.taxpayerCode?.trim() ?? base.taxpayerCode, address: dto.address?.trim() ?? base.address, phone: dto.phone?.trim() ?? base.phone, bankName: dto.bankName?.trim() ?? base.bankName, bankAccount: dto.bankAccount?.trim() ?? base.bankAccount, invoiceContent: dto.invoiceContent?.trim() ?? base.invoiceContent, remark: dto.remark?.trim() ?? undefined }; }
  private view(row: any) { return { ...row, publicAmount: moneyToString(row.publicAmount), invoiceAmount: moneyToString(row.invoiceAmount), invoiceDetails: row.invoiceDetails?.map((detail: any) => ({ ...detail, amount: moneyToString(detail.amount) })) }; }
  private assertView(context: AccessContext) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes('FINANCE_INVOICE_VIEW')) throw new ForbiddenException('无权查看开票任务'); }
  private assertManage(context: AccessContext) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes('FINANCE_INVOICE_CREATE') && !context.permissions.includes('FINANCE_INVOICE_EDIT')) throw new ForbiddenException('无权维护开票任务'); }
  private assertReview(context: AccessContext) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes('FINANCE_INVOICE_CONFIRM')) throw new ForbiddenException('无权审核开票任务'); }
  private assertComplete(context: AccessContext) { if (!this.scope.isSuperAdmin(context) && !context.permissions.includes('FINANCE_INVOICE_COMPLETE')) throw new ForbiddenException('无权完成开票'); }
  private async audit(tx: Prisma.TransactionClient | PrismaService, context: AccessContext, organizationId: string, taskId: string, action: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'PUBLIC_INVOICE_TASK', businessId: taskId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
}
