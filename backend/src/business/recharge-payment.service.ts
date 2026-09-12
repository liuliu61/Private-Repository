import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RechargePaymentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRechargePaymentApplicationDto, RechargePaymentApplicationQueryDto, RejectRechargePaymentApplicationDto, UpdateRechargePaymentApplicationDto } from './business.dto';

@Injectable()
export class RechargePaymentService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async list(query: RechargePaymentApplicationQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECHARGE_PAYMENT_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.RechargePaymentApplicationWhereInput = {
      organizationId: organizationIds ? { in: organizationIds } : undefined,
      status: query.status,
      customerId: query.customerId,
      applicantId: query.mine ? context.sub : query.applicantId,
      applicationNo: query.applicationNo ? { contains: query.applicationNo.trim(), mode: 'insensitive' } : undefined,
      appliedAt: { gte: query.startDate ? new Date(query.startDate) : undefined, lt: query.endDate ? new Date(query.endDate) : undefined },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rechargePaymentApplication.findMany({ where, include: this.listInclude(), orderBy: [{ appliedAt: 'desc' }, { applicationNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.rechargePaymentApplication.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECHARGE_PAYMENT_VIEW');
    const row = await this.prisma.rechargePaymentApplication.findUnique({ where: { id }, include: { ...this.listInclude(), receiveRecord: { include: { bankTransaction: { include: { account: true } }, customer: true, postings: true } } } });
    if (!row) throw new NotFoundException('充值付款申请不存在');
    await this.scope.assertOrganizationAccess(row.organizationId, context);
    const auditLogs = await this.prisma.auditLog.findMany({ where: { businessType: 'RECHARGE_PAYMENT', businessId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, actionType: true, beforeData: true, afterData: true, operatorId: true, createdAt: true } });
    return { ...this.view(row), auditLogs };
  }

  async create(dto: CreateRechargePaymentApplicationDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECHARGE_PAYMENT_CREATE');
    const amount = this.amount(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      if (dto.clientRequestId) {
        const existing = await tx.rechargePaymentApplication.findUnique({ where: { clientRequestId: dto.clientRequestId.trim() }, include: this.listInclude() });
        if (existing) {
          await this.scope.assertOrganizationAccess(existing.organizationId, context);
          return { idempotent: true, application: this.view(existing) };
        }
      }
      const receive = await tx.receiveRecord.findUnique({ where: { id: dto.receiveRecordId }, include: { customer: true } });
      if (!receive) throw new NotFoundException('收款记录不存在');
      await this.scope.assertOrganizationAccess(receive.organizationId, context);
      if (!receive.customerId) throw new BadRequestException('收款记录尚未关联客户');
      const row = await tx.rechargePaymentApplication.create({ data: { applicationNo: this.generateNo(), organizationId: receive.organizationId, receiveRecordId: receive.id, customerId: receive.customerId, amount, currency: receive.currency, status: RechargePaymentStatus.DRAFT, applicantId: context.sub, clientRequestId: dto.clientRequestId?.trim() || null, remark: dto.remark?.trim() || null }, include: this.listInclude() });
      await this.audit(tx, context, row.organizationId, row.id, 'RECHARGE_PAYMENT_CREATE', null, { status: row.status, amount: moneyToString(amount), receiveRecordId: row.receiveRecordId });
      return { idempotent: false, application: this.view(row) };
    });
  }

  async updateDraft(id: string, dto: UpdateRechargePaymentApplicationDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECHARGE_PAYMENT_CREATE');
    const amount = this.amount(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status !== RechargePaymentStatus.DRAFT) throw new ConflictException('只有草稿申请允许修改');
      const updated = await tx.rechargePaymentApplication.update({ where: { id }, data: { amount, remark: dto.remark?.trim() || null }, include: this.listInclude() });
      await this.audit(tx, context, row.organizationId, id, 'RECHARGE_PAYMENT_UPDATE', { status: row.status, amount: moneyToString(row.amount) }, { status: updated.status, amount: moneyToString(amount) });
      return { idempotent: false, application: this.view(updated) };
    });
  }

  async cancel(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECHARGE_PAYMENT_CREATE');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === RechargePaymentStatus.CANCELLED) return { idempotent: true, application: this.view(row) };
      if (row.status !== RechargePaymentStatus.DRAFT) throw new ConflictException('只有草稿申请允许取消');
      const updated = await tx.rechargePaymentApplication.update({ where: { id }, data: { status: RechargePaymentStatus.CANCELLED }, include: this.listInclude() });
      await this.audit(tx, context, row.organizationId, id, 'RECHARGE_PAYMENT_CANCEL', { status: row.status }, { status: updated.status });
      return { idempotent: false, application: this.view(updated) };
    });
  }

  async submit(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECHARGE_PAYMENT_CREATE');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === RechargePaymentStatus.PENDING_REVIEW) return { idempotent: true, application: this.view(row) };
      if (row.status !== RechargePaymentStatus.DRAFT) throw new ConflictException('只有草稿申请允许提交审核');
      const updated = await tx.rechargePaymentApplication.update({ where: { id }, data: { status: RechargePaymentStatus.PENDING_REVIEW, submittedAt: new Date() }, include: this.listInclude() });
      await this.audit(tx, context, row.organizationId, id, 'RECHARGE_PAYMENT_SUBMIT', { status: row.status }, { status: updated.status });
      return { idempotent: false, application: this.view(updated) };
    });
  }

  async approve(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECHARGE_PAYMENT_REVIEW');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === RechargePaymentStatus.APPROVED) return { idempotent: true, application: this.view(row) };
      if (row.status !== RechargePaymentStatus.PENDING_REVIEW) throw new ConflictException('只有审核中的申请允许通过');
      const updated = await tx.rechargePaymentApplication.update({ where: { id }, data: { status: RechargePaymentStatus.APPROVED, reviewerId: context.sub, reviewedAt: new Date(), rejectReason: null }, include: this.listInclude() });
      await this.audit(tx, context, row.organizationId, id, 'RECHARGE_PAYMENT_APPROVE', { status: row.status }, { status: updated.status });
      return { idempotent: false, application: this.view(updated) };
    });
  }

  async reject(id: string, dto: RejectRechargePaymentApplicationDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECHARGE_PAYMENT_REVIEW');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, id, context);
      if (row.status === RechargePaymentStatus.REJECTED) return { idempotent: true, application: this.view(row) };
      if (row.status !== RechargePaymentStatus.PENDING_REVIEW) throw new ConflictException('只有审核中的申请允许退回');
      const updated = await tx.rechargePaymentApplication.update({ where: { id }, data: { status: RechargePaymentStatus.REJECTED, reviewerId: context.sub, reviewedAt: new Date(), rejectReason: dto.rejectReason.trim() }, include: this.listInclude() });
      await this.audit(tx, context, row.organizationId, id, 'RECHARGE_PAYMENT_REJECT', { status: row.status }, { status: updated.status, rejectReason: updated.rejectReason });
      return { idempotent: false, application: this.view(updated) };
    });
  }

  private listInclude() { return { receiveRecord: { select: { id: true, receiveNo: true, amount: true, status: true, receivedAt: true } }, customer: { select: { id: true, name: true, customerCode: true } }, applicant: { select: { id: true, displayName: true } }, reviewer: { select: { id: true, displayName: true } } }; }
  private amount(value: string) { const amount = toMoney(value, '申请金额'); if (amount.lte(0)) throw new BadRequestException('申请金额必须大于 0'); return amount; }
  private async lock(tx: Prisma.TransactionClient, id: string, context: AccessContext) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "recharge_payment_applications" WHERE "id" = ${id}::uuid FOR UPDATE`); const row = await tx.rechargePaymentApplication.findUnique({ where: { id }, include: this.listInclude() }); if (!row) throw new NotFoundException('充值付款申请不存在'); await this.scope.assertOrganizationAccess(row.organizationId, context); return row; }
  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作充值付款流程' }); }
  private async audit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, resourceId: string, action: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'RECHARGE_PAYMENT', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
  private view(row: any) { return { ...row, amount: moneyToString(row.amount) }; }
  private generateNo() { return `RPA${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
}
