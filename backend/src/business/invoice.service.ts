import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma, PurchaseOrderStatus, ReceiveInvoiceStatus, ReceiveRecordStatus, RefundStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceApplicationDto, CreateInvoiceDto, InvoiceApplicationItemDto, InvoiceQueryDto, InvoiceReviewDto, InvoiceVoidDto, UpdateInvoiceApplicationDto, UpdateInvoiceDraftDto } from './business.dto';
import { UpdateInvoiceDetailDto, UploadInvoiceDetailDto } from './business.dto';

const invoiceDetailTypes = new Set(['增值税电子专用发票', '增值税电子普通发票', '增值税专用发票', '增值税普通发票', '形式发票']);
const invoiceFileTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const invoiceFileExtensions = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const maxInvoiceFileSize = 20 * 1024 * 1024;

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async list(query: InvoiceQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where = this.invoiceWhere(query, organizationIds);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, include: { customer: { select: { id: true, name: true, customerCode: true } }, purchaseOrder: { select: { id: true, orderNo: true } }, receiveRecord: { select: { id: true, receiveNo: true } }, account: { select: { id: true, name: true, accountCode: true } }, creator: { select: { id: true, displayName: true } } }, orderBy: [{ createdAt: 'desc' }, { invoiceNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), total, page: query.page, pageSize: query.pageSize, summary: await this.summary(query, organizationIds) };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const row = await this.prisma.invoice.findUnique({ where: { id }, include: { customer: true, purchaseOrder: { select: { id: true, orderNo: true, amount: true, customerCashAmount: true, customerReceivable: true, status: true } }, receiveRecord: { select: { id: true, receiveNo: true, amount: true, status: true } }, account: true, creator: { select: { id: true, displayName: true } }, confirmer: { select: { id: true, displayName: true } }, voider: { select: { id: true, displayName: true } } } });
    if (!row) throw new NotFoundException('发票记录不存在');
    await this.scope.assertOrganizationAccess(row.organizationId, context);
    const logs = await this.prisma.auditLog.findMany({ where: { businessType: 'INVOICE', businessId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, actionType: true, beforeData: true, afterData: true, operatorId: true, createdAt: true } });
    return { ...this.view(row), auditLogs: logs };
  }

  async create(dto: CreateInvoiceDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CREATE');
    return this.prisma.$transaction(async (tx) => {
      if (dto.clientRequestId) {
        const existing = await tx.invoice.findUnique({ where: { clientRequestId: dto.clientRequestId } });
        if (existing) {
          await this.scope.assertOrganizationAccess(existing.organizationId, context);
          return { idempotent: true, invoice: this.view(existing) };
        }
      }
      const source = await this.resolveSource(tx, dto, context);
      const amount = toMoney(dto.amount, '开票金额');
      await this.assertAmountAvailable(tx, source, amount, context);
      const row = await tx.invoice.create({ data: { invoiceNo: this.generateInvoiceNo(), invoiceNumber: dto.invoiceNumber?.trim() || null, organizationId: source.organizationId, customerId: source.customerId, purchaseOrderId: source.purchaseOrderId, receiveRecordId: source.receiveRecordId, accountId: source.accountId, businessNo: source.businessNo, amount, currency: source.currency, invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null, invoiceType: dto.invoiceType?.trim() || null, invoiceTitle: dto.invoiceTitle?.trim() || null, taxNumber: dto.taxNumber?.trim() || null, invoiceContent: dto.invoiceContent?.trim() || null, issuingEntity: dto.issuingEntity?.trim() || null, contractNo: dto.contractNo?.trim() || null, invoiceNature: dto.invoiceNature?.trim() || null, redFlushStatus: dto.redFlushStatus?.trim() || null, recipientEmail: dto.recipientEmail?.trim() || null, status: InvoiceStatus.DRAFT, clientRequestId: dto.clientRequestId?.trim() || null, createdBy: context.sub, remark: dto.remark?.trim() || null } });
      await this.audit(tx, context, row.organizationId, row.id, 'INVOICE_CREATE', null, { invoiceNo: row.invoiceNo, amount: moneyToString(amount), businessNo: row.businessNo, status: row.status });
      return { idempotent: false, invoice: this.view(row) };
    });
  }

  async updateDraft(id: string, dto: UpdateInvoiceDraftDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_EDIT');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status !== InvoiceStatus.DRAFT) throw new ConflictException('只有草稿发票允许修改');
      const updated = await tx.invoice.update({ where: { id }, data: { invoiceNumber: dto.invoiceNumber?.trim(), invoiceType: dto.invoiceType?.trim(), invoiceTitle: dto.invoiceTitle?.trim(), taxNumber: dto.taxNumber?.trim(), invoiceContent: dto.invoiceContent?.trim(), issuingEntity: dto.issuingEntity?.trim(), contractNo: dto.contractNo?.trim(), invoiceNature: dto.invoiceNature?.trim(), redFlushStatus: dto.redFlushStatus?.trim(), recipientEmail: dto.recipientEmail?.trim(), remark: dto.remark?.trim() } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_UPDATE', { status: row.status }, { status: updated.status });
      return { invoice: this.view(updated) };
    });
  }

  async listApplications(query: InvoiceQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where = this.invoiceWhere(query, organizationIds);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, include: { customer: { select: { id: true, name: true, customerCode: true } }, receiveSources: { include: { receiveRecord: { select: { id: true, receiveNo: true } } } }, applicationItems: true, invoiceDetails: true, creator: { select: { id: true, displayName: true } } }, orderBy: [{ createdAt: 'desc' }, { invoiceNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async getApplicationById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const row = await this.prisma.invoice.findUnique({ where: { id }, include: { customer: true, creator: { select: { id: true, displayName: true } }, receiveSources: { include: { receiveRecord: { include: { bankTransaction: true } } } }, applicationItems: true, invoiceDetails: true } });
    if (!row) throw new NotFoundException('发票申请不存在');
    await this.scope.assertOrganizationAccess(row.organizationId, context);
    return this.view(row);
  }

  async createApplication(dto: CreateInvoiceApplicationDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CREATE');
    return this.prisma.$transaction(async (tx) => {
      if (dto.clientRequestId) {
        const existing = await tx.invoice.findUnique({ where: { clientRequestId: dto.clientRequestId.trim() } });
        if (existing) {
          await this.scope.assertOrganizationAccess(existing.organizationId, context);
          return { idempotent: true, invoice: this.view(existing) };
        }
      }
      const amount = toMoney(dto.amount, '申请开票金额');
      const resolved = await this.resolveApplicationSources(tx, dto.receiveRecordIds, amount, context);
      const sources = resolved.sources;
      const items = this.applicationItems(amount, dto.items, dto.autoSplit, resolved.totalServiceFee);
      const first = sources[0].receive;
      const row = await tx.invoice.create({ data: { invoiceNo: this.generateInvoiceNo(), invoiceNumber: dto.invoiceNumber?.trim() || null, invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : null, organizationId: first.organizationId, customerId: first.customerId!, receiveRecordId: sources.length === 1 ? first.id : null, accountId: first.accountId, businessNo: sources.length === 1 ? first.receiveNo : 'MULTI_RECEIVE', amount, currency: first.currency, invoiceType: dto.invoiceType?.trim() || null, invoiceNature: dto.invoiceNature?.trim() || null, invoiceTitle: dto.invoiceTitle?.trim() || null, taxNumber: dto.taxNumber?.trim() || null, invoiceContent: dto.invoiceContent?.trim() || null, status: InvoiceStatus.DRAFT, clientRequestId: dto.clientRequestId?.trim() || null, createdBy: context.sub, remark: dto.remark?.trim() || null } });
      await tx.invoiceApplicationReceiveRecord.createMany({ data: sources.map((source) => ({ invoiceId: row.id, receiveRecordId: source.receive.id, amount: source.amount })) });
      await tx.invoiceApplicationItem.createMany({ data: items.map((item) => ({ invoiceId: row.id, amount: item.amount, itemType: item.itemType, content: item.content, remark: item.remark })) });
      if (dto.ocrRecordId) {
        const ocrRecord = await tx.invoiceOcrRecord.findUnique({ where: { id: dto.ocrRecordId } });
        if (!ocrRecord || ocrRecord.invoiceId || ocrRecord.organizationId !== first.organizationId) throw new ConflictException('OCR记录不可绑定');
        await this.scope.assertOrganizationAccess(first.organizationId, context);
        await tx.invoiceOcrRecord.update({ where: { id: dto.ocrRecordId }, data: { invoiceId: row.id } });
      }
      await this.audit(tx, context, row.organizationId, row.id, 'INVOICE_APPLICATION_CREATE', null, { invoiceNo: row.invoiceNo, amount: moneyToString(amount), status: row.status });
      return { idempotent: false, invoice: this.view({ ...row, applicationItems: items, receiveSources: sources.map((source) => ({ amount: source.amount, receiveRecord: source.receive })) }) };
    });
  }

  async updateApplication(id: string, dto: UpdateInvoiceApplicationDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_EDIT');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (![InvoiceStatus.DRAFT, InvoiceStatus.REJECTED].includes(row.status)) throw new ConflictException('只有起草或审核不通过的发票申请允许修改');
      const currentSources = await tx.invoiceApplicationReceiveRecord.findMany({ where: { invoiceId: id }, select: { receiveRecordId: true } });
      const sourceIds = dto.receiveRecordIds?.length ? dto.receiveRecordIds : currentSources.map((item) => item.receiveRecordId);
      const amount = dto.amount ? toMoney(dto.amount, '申请开票金额') : row.amount;
      const resolved = await this.resolveApplicationSources(tx, sourceIds, amount, context);
      const sources = resolved.sources;
      const currentItems = await tx.invoiceApplicationItem.findMany({ where: { invoiceId: id } });
      const items = dto.items || (dto.amount || dto.autoSplit !== undefined ? this.applicationItems(amount, undefined, dto.autoSplit ?? true, resolved.totalServiceFee) : currentItems);
      this.assertApplicationItems(amount, items);
      const updated = await tx.invoice.update({ where: { id }, data: { amount, invoiceNumber: dto.invoiceNumber?.trim(), invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined, receiveRecordId: sources.length === 1 ? sources[0].receive.id : null, accountId: sources[0].receive.accountId, businessNo: sources.length === 1 ? sources[0].receive.receiveNo : 'MULTI_RECEIVE', invoiceType: dto.invoiceType?.trim(), invoiceNature: dto.invoiceNature?.trim(), invoiceTitle: dto.invoiceTitle?.trim(), taxNumber: dto.taxNumber?.trim(), invoiceContent: dto.invoiceContent?.trim(), rejectReason: row.status === InvoiceStatus.REJECTED ? null : undefined, reviewedBy: row.status === InvoiceStatus.REJECTED ? null : undefined, reviewedAt: row.status === InvoiceStatus.REJECTED ? null : undefined, approvalRemark: row.status === InvoiceStatus.REJECTED ? null : undefined, remark: dto.remark?.trim() } });
      await tx.invoiceApplicationReceiveRecord.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceApplicationReceiveRecord.createMany({ data: sources.map((source) => ({ invoiceId: id, receiveRecordId: source.receive.id, amount: source.amount })) });
      if (dto.items || dto.amount || dto.autoSplit !== undefined) {
        await tx.invoiceApplicationItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceApplicationItem.createMany({ data: items.map((item) => ({ invoiceId: id, amount: item.amount, itemType: item.itemType, content: item.content, remark: item.remark })) });
      }
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_APPLICATION_UPDATE', { status: row.status, amount: moneyToString(row.amount) }, { status: updated.status, amount: moneyToString(amount) });
      return { invoice: this.view({ ...updated, applicationItems: items, receiveSources: sources.map((source) => ({ amount: source.amount, receiveRecord: source.receive })) }) };
    });
  }

  async submitApplication(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CREATE');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.REVIEWING) return { idempotent: true, invoice: this.view(row) };
      if (row.status !== InvoiceStatus.DRAFT) throw new ConflictException('只有起草状态的发票申请可以提交');
      const sources = await this.lockApplicationSources(tx, id, context);
      await this.moveApplicationAllocation(tx, sources, 'occupy');
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.REVIEWING, submittedAt: new Date() } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_APPLICATION_SUBMIT', { status: row.status }, { status: updated.status });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async approveApplication(id: string, dto: InvoiceReviewDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.APPROVED) return { idempotent: true, invoice: this.view(row) };
      if (row.status !== InvoiceStatus.REVIEWING) throw new ConflictException('只有审核中的发票申请可以审核通过');
      const sources = await this.lockApplicationSources(tx, id, context);
      await this.moveApplicationAllocation(tx, sources, 'approve');
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.APPROVED, reviewedBy: context.sub, reviewedAt: new Date(), approvalRemark: dto.approvalRemark?.trim() || null, approvedAmount: row.amount } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_APPLICATION_APPROVE', { status: row.status }, { status: updated.status, amount: moneyToString(row.amount) });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async rejectApplication(id: string, dto: InvoiceReviewDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    const reason = dto.rejectReason?.trim();
    if (!reason) throw new ConflictException('驳回原因不能为空');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.REJECTED) return { idempotent: true, invoice: this.view(row) };
      if (row.status !== InvoiceStatus.REVIEWING) throw new ConflictException('只有审核中的发票申请可以驳回');
      const sources = await this.lockApplicationSources(tx, id, context);
      await this.moveApplicationAllocation(tx, sources, 'release');
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.REJECTED, reviewedBy: context.sub, reviewedAt: new Date(), rejectReason: reason } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_APPLICATION_REJECT', { status: row.status }, { status: updated.status, rejectReason: reason });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async listInvoiceDetails(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const row = await this.prisma.invoice.findUnique({ where: { id }, select: { id: true, organizationId: true } });
    if (!row) throw new NotFoundException('发票申请不存在');
    await this.scope.assertOrganizationAccess(row.organizationId, context);
    const details = await this.prisma.invoiceDetail.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } });
    return details.map((detail) => this.invoiceDetailView(detail));
  }

  async uploadInvoiceDetail(id: string, dto: UploadInvoiceDetailDto, file: any, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    this.assertInvoiceDetailFile(file);
    this.assertInvoiceDetailType(dto.invoiceType);
    const preflight = await this.prisma.invoice.findUnique({ where: { id }, select: { status: true, organizationId: true } });
    if (!preflight) throw new NotFoundException('发票申请不存在');
    await this.scope.assertOrganizationAccess(preflight.organizationId, context);
    if (![InvoiceStatus.APPROVED, InvoiceStatus.ISSUED].includes(preflight.status)) throw new ConflictException('只有审核通过或已完成开票的申请可以上传发票');
    const amount = dto.amount ? toMoney(dto.amount, '发票金额') : new Prisma.Decimal(0);
    const fileId = randomUUID();
    const extension = extname(file.originalname).toLowerCase();
    const storageRoot = resolve(process.env.INVOICE_UPLOAD_DIR || join(process.cwd(), 'storage', 'invoices'));
    await mkdir(storageRoot, { recursive: true });
    const storedPath = join(storageRoot, `${fileId}${extension}`);
    await writeFile(storedPath, file.buffer);
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (![InvoiceStatus.APPROVED, InvoiceStatus.ISSUED].includes(row.status)) throw new ConflictException('只有审核通过或已完成开票的申请可以上传发票');
      let itemId = dto.invoiceApplicationItemId;
      if (itemId) {
        const item = await tx.invoiceApplicationItem.findUnique({ where: { id: itemId }, select: { id: true, invoiceId: true } });
        if (!item || item.invoiceId !== id) throw new ConflictException('发票申请明细不属于当前申请');
      }
      const detail = await tx.invoiceDetail.create({ data: { invoiceId: id, invoiceApplicationItemId: itemId || null, amount, invoiceType: dto.invoiceType.trim(), invoiceContent: dto.invoiceContent?.trim() || null, invoiceCode: dto.invoiceCode?.trim() || null, filePath: storedPath, originalFileName: file.originalname, mimeType: file.mimetype, createdBy: context.sub, invoiceUrl: null, imageUrl: null } });
      const fileUrl = `/api/invoices/applications/${id}/details/${detail.id}/file`;
      const updatedDetail = await tx.invoiceDetail.update({ where: { id: detail.id }, data: { invoiceUrl: fileUrl, imageUrl: fileUrl } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_DETAIL_UPLOAD', { status: row.status }, { status: row.status, invoiceDetailId: detail.id });
      return { invoice: this.view({ ...row, invoiceDetails: [updatedDetail] }), invoiceDetail: this.invoiceDetailView(updatedDetail) };
    });
  }

  async completeInvoiceApplication(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.ISSUED) return { idempotent: true, invoice: this.view(row) };
      if (row.status !== InvoiceStatus.APPROVED) throw new ConflictException('只有审核通过的申请可以完成开票');
      const details = await tx.invoiceDetail.findMany({ where: { invoiceId: id }, select: { id: true } });
      if (!details.length) throw new ConflictException('请先上传发票');
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.ISSUED, confirmedBy: context.sub, confirmedAt: new Date() } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_APPLICATION_COMPLETE', { status: row.status }, { status: updated.status, note: '完成开票' });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async updateInvoiceDetail(applicationId: string, detailId: string, dto: UpdateInvoiceDetailDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    this.assertInvoiceDetailType(dto.invoiceType);
    const amount = dto.amount ? toMoney(dto.amount, '发票金额') : undefined;
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, applicationId, context);
      if (row.status !== InvoiceStatus.APPROVED) throw new ConflictException('只有完成开票前的审核通过申请可以修改发票明细');
      const detail = await tx.invoiceDetail.findUnique({ where: { id: detailId } });
      if (!detail || detail.invoiceId !== applicationId) throw new NotFoundException('发票明细不存在');
      const updated = await tx.invoiceDetail.update({ where: { id: detailId }, data: { amount, invoiceType: dto.invoiceType.trim(), invoiceContent: dto.invoiceContent?.trim() || null, invoiceCode: dto.invoiceCode?.trim() || null } });
      await this.audit(tx, context, row.organizationId, applicationId, 'INVOICE_DETAIL_UPDATE', null, { invoiceDetailId: detailId });
      return this.invoiceDetailView(updated);
    });
  }

  async deleteInvoiceDetail(applicationId: string, detailId: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, applicationId, context);
      if (row.status !== InvoiceStatus.APPROVED) throw new ConflictException('只有完成开票前的审核通过申请可以删除发票明细');
      const detail = await tx.invoiceDetail.findUnique({ where: { id: detailId } });
      if (!detail || detail.invoiceId !== applicationId) throw new NotFoundException('发票明细不存在');
      await tx.invoiceDetail.delete({ where: { id: detailId } });
      await this.audit(tx, context, row.organizationId, applicationId, 'INVOICE_DETAIL_DELETE', { invoiceDetailId: detailId }, null);
      return { idempotent: false };
    });
  }

  async getInvoiceDetailFile(applicationId: string, detailId: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const detail = await this.prisma.invoiceDetail.findUnique({ where: { id: detailId }, select: { invoiceId: true, filePath: true, originalFileName: true, mimeType: true } });
    if (!detail || detail.invoiceId !== applicationId || !detail.filePath) throw new NotFoundException('发票文件不存在');
    const application = await this.prisma.invoice.findUnique({ where: { id: applicationId }, select: { organizationId: true } });
    if (!application) throw new NotFoundException('发票申请不存在');
    await this.scope.assertOrganizationAccess(application.organizationId, context);
    return { path: detail.filePath, fileName: detail.originalFileName || 'invoice', mimeType: detail.mimeType || 'application/octet-stream' };
  }

  async revokeApplication(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CREATE');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.DRAFT) return { idempotent: true, invoice: this.view(row) };
      if (row.status !== InvoiceStatus.REVIEWING) throw new ConflictException('只有审核中的发票申请可以撤回');
      if (row.createdBy !== context.sub) throw new ForbiddenException('只有申请创建人可以撤回');
      const sources = await this.lockApplicationSources(tx, id, context);
      await this.moveApplicationAllocation(tx, sources, 'release');
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.DRAFT, submittedAt: null, reviewedBy: null, reviewedAt: null, approvalRemark: null, rejectReason: null } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_APPLICATION_REVOKE', { status: row.status }, { status: updated.status });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async confirm(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.ISSUED) return { idempotent: true, invoice: this.view(row) };
      if (![InvoiceStatus.DRAFT, InvoiceStatus.PROCESSING].includes(row.status)) throw new ConflictException('当前发票状态不允许确认开票');
      const source = await this.resolveExistingSource(tx, row, context);
      await this.assertAmountAvailable(tx, source, row.amount, context, row.id);
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.ISSUED, confirmedBy: context.sub, confirmedAt: new Date(), invoiceDate: row.invoiceDate || new Date() } });
      if (row.receiveRecordId) await this.syncReceiveInvoiceStatus(tx, row.receiveRecordId);
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_CONFIRM', { status: row.status }, { status: updated.status, amount: moneyToString(row.amount) });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async process(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.PROCESSING) return { idempotent: true, invoice: this.view(row) };
      if (row.status !== InvoiceStatus.DRAFT) throw new ConflictException('只有草稿发票可以提交开票');
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.PROCESSING } });
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_PROCESS', { status: row.status }, { status: updated.status });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async voidInvoice(id: string, dto: InvoiceVoidDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VOID');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockInvoice(tx, id, context);
      if (row.status === InvoiceStatus.VOIDED) return { idempotent: true, invoice: this.view(row) };
      const updated = await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.VOIDED, voidedBy: context.sub, voidedAt: new Date(), voidReason: dto.reason?.trim() || null } });
      if (row.receiveRecordId) await this.syncReceiveInvoiceStatus(tx, row.receiveRecordId);
      await this.audit(tx, context, row.organizationId, id, 'INVOICE_VOID', { status: row.status }, { status: updated.status, reason: updated.voidReason });
      return { idempotent: false, invoice: this.view(updated) };
    });
  }

  async getCustomerBalance(customerId: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_INVOICE_VIEW');
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, customerCode: true, agentId: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    if (customer.agentId) await this.scope.assertOrganizationAccess(customer.agentId, context);
    return this.calculateCustomerBalance(customerId, customer.agentId || undefined);
  }

  private async summary(query: InvoiceQueryDto, organizationIds?: string[]) {
    const balances = await this.calculateCustomerBalance(query.customerId, organizationIds?.length === 1 ? organizationIds[0] : undefined, { startDate: query.startDate, endDate: query.endDate });
    const where = this.invoiceWhere(query, organizationIds);
    const groups = await this.prisma.invoice.groupBy({ by: ['status'], where, _sum: { amount: true } });
    const grouped = groups.reduce((result, item) => { result[item.status] = item._sum.amount || new Prisma.Decimal(0); return result; }, {} as Record<string, Prisma.Decimal>);
    return { sourceAmount: balances.sourceAmount, invoicedAmount: balances.invoicedAmount, uninvoicedAmount: balances.uninvoicedAmount, processingAmount: grouped[InvoiceStatus.PROCESSING]?.toFixed(2) || '0.00', issuedAmount: grouped[InvoiceStatus.ISSUED]?.toFixed(2) || '0.00' };
  }

  private async calculateCustomerBalance(customerId?: string, organizationId?: string, period?: { startDate?: string; endDate?: string }) {
    const orderWhere: Prisma.PurchaseOrderWhereInput = { customerId, organizationId, status: { in: [PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.SETTLED, PurchaseOrderStatus.COMPLETED] }, businessTime: { gte: period?.startDate ? new Date(period.startDate) : undefined, lt: period?.endDate ? new Date(period.endDate) : undefined } };
    const orders = await this.prisma.purchaseOrder.findMany({ where: orderWhere, select: { id: true, customerCashAmount: true, customerReceivable: true, baseAmount: true } });
    const orderIds = orders.map((item) => item.id);
    const refunds = orderIds.length ? await this.prisma.refund.groupBy({ by: ['purchaseOrderId'], where: { purchaseOrderId: { in: orderIds }, status: RefundStatus.REFUNDED }, _sum: { refundAmount: true } }) : [];
    const refundMap = new Map(refunds.map((item) => [item.purchaseOrderId, item._sum.refundAmount || new Prisma.Decimal(0)]));
    const standaloneReceives = await this.prisma.receiveRecord.findMany({ where: { customerId, purchaseOrderId: null, status: ReceiveRecordStatus.CONFIRMED, organizationId, receivedAt: { gte: period?.startDate ? new Date(period.startDate) : undefined, lt: period?.endDate ? new Date(period.endDate) : undefined } }, select: { id: true, invoiceEligibleAmount: true, amount: true } });
    const sourceAmount = orders.reduce((sum, order) => sum.add(order.customerCashAmount || order.customerReceivable || order.baseAmount).sub(refundMap.get(order.id) || new Prisma.Decimal(0)), new Prisma.Decimal(0)).add(standaloneReceives.reduce((sum, item) => sum.add(item.invoiceEligibleAmount ?? item.amount), new Prisma.Decimal(0)));
    const invoices = await this.prisma.invoice.aggregate({ where: { customerId, organizationId, status: { not: InvoiceStatus.VOIDED }, createdAt: { gte: period?.startDate ? new Date(period.startDate) : undefined, lt: period?.endDate ? new Date(period.endDate) : undefined } }, _sum: { amount: true } });
    const invoicedAmount = invoices._sum.amount || new Prisma.Decimal(0);
    const uninvoicedAmount = sourceAmount.sub(invoicedAmount);
    return { customerId, sourceAmount: moneyToString(sourceAmount), invoicedAmount: moneyToString(invoicedAmount), uninvoicedAmount: moneyToString(uninvoicedAmount.isNegative() ? new Prisma.Decimal(0) : uninvoicedAmount) };
  }

  private invoiceWhere(query: InvoiceQueryDto, organizationIds?: string[]): Prisma.InvoiceWhereInput {
    return { organizationId: organizationIds ? { in: organizationIds } : undefined, customerId: query.customerId, accountId: query.accountId, status: query.status, invoiceNo: query.invoiceNo, invoiceNumber: query.invoiceNumber, businessNo: query.businessNo, OR: query.keyword ? [{ invoiceNo: { contains: query.keyword, mode: 'insensitive' } }, { invoiceNumber: { contains: query.keyword, mode: 'insensitive' } }, { businessNo: { contains: query.keyword, mode: 'insensitive' } }, { invoiceTitle: { contains: query.keyword, mode: 'insensitive' } }] : undefined, createdAt: { gte: query.startDate ? new Date(query.startDate) : undefined, lt: query.endDate ? new Date(query.endDate) : undefined } };
  }

  private async resolveSource(tx: Prisma.TransactionClient, dto: CreateInvoiceDto, context: AccessContext) {
    if (!dto.purchaseOrderId && !dto.receiveRecordId) throw new ConflictException('发票必须关联一个订单或一笔收款记录');
    if (dto.purchaseOrderId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "purchase_orders" WHERE "id" = ${dto.purchaseOrderId}::uuid FOR UPDATE`);
    if (dto.receiveRecordId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "receive_records" WHERE "id" = ${dto.receiveRecordId}::uuid FOR UPDATE`);
    const order = dto.purchaseOrderId ? await tx.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId } }) : null;
    const receive = dto.receiveRecordId ? await tx.receiveRecord.findUnique({ where: { id: dto.receiveRecordId } }) : null;
    if (dto.purchaseOrderId && !order) throw new NotFoundException('外采订单不存在');
    if (dto.receiveRecordId && !receive) throw new NotFoundException('收款记录不存在');
    if (order && receive && receive.purchaseOrderId !== order.id) throw new ConflictException('订单与收款记录不匹配');
    const organizationId = order?.organizationId || receive?.organizationId;
    if (!organizationId) throw new ConflictException('发票业务来源缺少组织信息');
    await this.scope.assertOrganizationAccess(organizationId, context);
    const customerId = order?.customerId || receive?.customerId || dto.customerId;
    if (!customerId) throw new ConflictException('发票业务来源缺少客户');
    if (dto.customerId && dto.customerId !== customerId) throw new ConflictException('发票客户与业务来源不匹配');
    if (receive && receive.status !== ReceiveRecordStatus.CONFIRMED) throw new ConflictException('只有已确认收款记录才能作为发票来源');
    if (order && [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_CONFIRMATION, PurchaseOrderStatus.CANCELLED].includes(order.status)) throw new ConflictException('当前订单状态不允许开票');
    return { organizationId, customerId, purchaseOrderId: order?.id || receive?.purchaseOrderId || null, receiveRecordId: receive?.id || null, accountId: order?.cashAccountId || receive?.accountId || null, businessNo: order?.orderNo || receive?.receiveNo || null, currency: 'CNY' };
  }

  private async resolveExistingSource(tx: Prisma.TransactionClient, row: any, context: AccessContext) { return this.resolveSource(tx, { customerId: row.customerId, purchaseOrderId: row.purchaseOrderId || undefined, receiveRecordId: row.receiveRecordId || undefined, amount: moneyToString(row.amount) }, context); }

  private async assertAmountAvailable(tx: Prisma.TransactionClient, source: any, amount: Prisma.Decimal, context: AccessContext, excludingInvoiceId?: string) {
    if (amount.lte(0)) throw new ConflictException('开票金额必须大于0');
    let sourceAmount = new Prisma.Decimal(0);
    if (source.receiveRecordId) {
      const receive = await tx.receiveRecord.findUnique({ where: { id: source.receiveRecordId } });
      if (!receive) throw new NotFoundException('收款记录不存在');
      sourceAmount = receive.invoiceEligibleAmount ?? receive.amount;
      if (source.purchaseOrderId) {
        const order = await tx.purchaseOrder.findUnique({ where: { id: source.purchaseOrderId } });
        if (!order) throw new NotFoundException('外采订单不存在');
        const refund = await tx.refund.aggregate({ where: { purchaseOrderId: order.id, status: RefundStatus.REFUNDED }, _sum: { refundAmount: true } });
        const orderAvailable = (order.customerCashAmount || order.customerReceivable || order.baseAmount).sub(refund._sum.refundAmount || new Prisma.Decimal(0));
        if (orderAvailable.lt(sourceAmount)) sourceAmount = orderAvailable;
      }
    } else if (source.purchaseOrderId) {
      const order = await tx.purchaseOrder.findUnique({ where: { id: source.purchaseOrderId } });
      if (!order) throw new NotFoundException('外采订单不存在');
      const refund = await tx.refund.aggregate({ where: { purchaseOrderId: order.id, status: RefundStatus.REFUNDED }, _sum: { refundAmount: true } });
      sourceAmount = (order.customerCashAmount || order.customerReceivable || order.baseAmount).sub(refund._sum.refundAmount || new Prisma.Decimal(0));
    }
    const existing = await tx.invoice.aggregate({ where: { status: { not: InvoiceStatus.VOIDED }, customerId: source.customerId, ...(source.purchaseOrderId ? { purchaseOrderId: source.purchaseOrderId } : { receiveRecordId: source.receiveRecordId }), ...(excludingInvoiceId ? { id: { not: excludingInvoiceId } } : {}) }, _sum: { amount: true } });
    const available = sourceAmount.sub(existing._sum.amount || new Prisma.Decimal(0));
    if (amount.gt(available)) throw new ConflictException(`开票金额不能超过未开票金额，当前最多可开票${moneyToString(available.isNegative() ? new Prisma.Decimal(0) : available)}元`);
  }

  private async syncReceiveInvoiceStatus(tx: Prisma.TransactionClient, receiveRecordId: string) {
    const receive = await tx.receiveRecord.findUnique({ where: { id: receiveRecordId }, select: { invoiceEligibleAmount: true } });
    if (!receive) return;
    const aggregate = await tx.invoice.aggregate({ where: { receiveRecordId, status: { not: InvoiceStatus.VOIDED } }, _sum: { amount: true } });
    const issued = aggregate._sum.amount || new Prisma.Decimal(0);
    const invoiceStatus = issued.gte(receive.invoiceEligibleAmount) ? ReceiveInvoiceStatus.ISSUED : issued.gt(0) ? ReceiveInvoiceStatus.PARTIAL : ReceiveInvoiceStatus.UNISSUED;
    await tx.receiveRecord.update({ where: { id: receiveRecordId }, data: { invoiceStatus } });
  }

  private async resolveApplicationSources(tx: Prisma.TransactionClient, ids: string[], amount: Prisma.Decimal, context: AccessContext) {
    const sourceIds = [...new Set(ids)];
    if (!sourceIds.length) throw new ConflictException('发票申请必须关联收款记录');
    const receives: any[] = [];
    for (const id of [...sourceIds].sort()) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "receive_records" WHERE "id" = ${id}::uuid FOR UPDATE`);
      const receive = await tx.receiveRecord.findUnique({ where: { id }, include: { customer: true, bankTransaction: true } });
      if (!receive) throw new NotFoundException('收款记录不存在');
      await this.scope.assertOrganizationAccess(receive.organizationId, context);
      if (receive.status !== ReceiveRecordStatus.CONFIRMED || !receive.customerId) throw new ConflictException('只有已确认且已归属客户的收款记录才能申请开票');
      receives.push(receive);
    }
    const customerId = receives[0].customerId;
    const organizationId = receives[0].organizationId;
    if (receives.some((receive) => receive.customerId !== customerId || receive.organizationId !== organizationId)) throw new ConflictException('多笔收款必须属于同一组织和客户');
    const available = [];
    let totalServiceFee = new Prisma.Decimal(0);
    for (const receive of receives) {
      const billedAmount = new Prisma.Decimal(receive.billedAmount ?? 0);
      const billingAmount = new Prisma.Decimal(receive.billingAmount ?? 0);
      const sourceAmount = new Prisma.Decimal(receive.amount);
      totalServiceFee = totalServiceFee.add(new Prisma.Decimal(receive.serviceFeeAmount ?? 0));
      available.push({ receive, available: sourceAmount.sub(billedAmount).sub(billingAmount) });
    }
    let remaining = amount;
    const result = available.map((source) => {
      if (remaining.lte(0)) return { ...source, amount: new Prisma.Decimal(0) };
      const allocation = remaining.lte(source.available) ? remaining : source.available;
      remaining = remaining.sub(allocation);
      return { ...source, amount: allocation };
    }).filter((source) => source.amount.gt(0));
    if (remaining.gt(0)) throw new ConflictException('申请开票金额不能大于可开票金额');
    return { sources: result, totalServiceFee };
  }

  private applicationItems(amount: Prisma.Decimal, items?: InvoiceApplicationItemDto[], autoSplit = true, totalServiceFee = new Prisma.Decimal(0)) {
    if (items?.length) {
      const normalized = items.map((item) => ({ amount: toMoney(item.amount, '发票明细金额'), itemType: item.itemType?.trim() || null, content: item.content?.trim() || null, remark: item.remark?.trim() || null }));
      this.assertApplicationItems(amount, normalized);
      return normalized;
    }
    if (!autoSplit) return [{ amount, itemType: null, content: null, remark: null }];
    const serviceFee = totalServiceFee.gt(amount) ? amount : totalServiceFee;
    const remaining = amount.sub(serviceFee);
    const technical = remaining.mul(new Prisma.Decimal('0.915')).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return [{ amount: serviceFee, itemType: '服务费', content: '现代服务*信息服务费', remark: null }, { amount: technical, itemType: '技术服务', content: '生产生活服务*技术服务费', remark: null }, { amount: remaining.sub(technical), itemType: '广告发布', content: '生产生活服务*广告发布费', remark: null }].filter((item) => item.amount.gt(0));
  }

  private assertApplicationItems(amount: Prisma.Decimal, items: Array<{ amount: Prisma.Decimal }>) {
    if (!items.length || items.some((item) => item.amount.lte(0))) throw new ConflictException('发票明细金额必须大于0');
    const total = items.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
    if (!total.eq(amount)) throw new ConflictException('发票明细合计必须等于申请开票金额');
  }

  private async lockInvoice(tx: Prisma.TransactionClient, id: string, context: AccessContext) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${id}::uuid FOR UPDATE`); const row = await tx.invoice.findUnique({ where: { id } }); if (!row) throw new NotFoundException('发票记录不存在'); await this.scope.assertOrganizationAccess(row.organizationId, context); return row; }
  private async lockApplicationSources(tx: Prisma.TransactionClient, invoiceId: string, context: AccessContext) {
    const links = await tx.invoiceApplicationReceiveRecord.findMany({ where: { invoiceId }, orderBy: { receiveRecordId: 'asc' } });
    const result: any[] = [];
    for (const link of links) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "receive_records" WHERE "id" = ${link.receiveRecordId}::uuid FOR UPDATE`);
      const receive = await tx.receiveRecord.findUnique({ where: { id: link.receiveRecordId }, include: { customer: true, bankTransaction: true } });
      if (!receive) throw new NotFoundException('收款记录不存在');
      await this.scope.assertOrganizationAccess(receive.organizationId, context);
      result.push({ link, receive });
    }
    return result;
  }
  private async moveApplicationAllocation(tx: Prisma.TransactionClient, sources: any[], action: 'occupy' | 'approve' | 'release') {
    for (const source of sources) {
      const allocation = new Prisma.Decimal(source.link.amount);
      const receive = source.receive;
      const unBilling = new Prisma.Decimal(receive.unBillingAmount ?? receive.amount);
      const billing = new Prisma.Decimal(receive.billingAmount ?? 0);
      const billed = new Prisma.Decimal(receive.billedAmount ?? 0);
      if (action === 'occupy') {
        const available = new Prisma.Decimal(receive.amount).sub(billed).sub(billing);
        if (allocation.gt(available)) throw new ConflictException('申请开票金额不能大于可开票金额');
        await tx.receiveRecord.update({ where: { id: receive.id }, data: { unBillingAmount: unBilling.sub(allocation), billingAmount: billing.add(allocation) } });
      } else if (action === 'approve') {
        if (allocation.gt(billing)) throw new ConflictException('开票中金额不足，无法审核通过');
        await tx.receiveRecord.update({ where: { id: receive.id }, data: { billingAmount: billing.sub(allocation), billedAmount: billed.add(allocation) } });
      } else {
        if (allocation.gt(billing)) throw new ConflictException('开票中金额不足，无法释放额度');
        await tx.receiveRecord.update({ where: { id: receive.id }, data: { unBillingAmount: unBilling.add(allocation), billingAmount: billing.sub(allocation) } });
      }
    }
  }
  private assertInvoiceDetailType(value: string) { if (!invoiceDetailTypes.has(value.trim())) throw new BadRequestException('请选择发票类型!'); }
  private assertInvoiceDetailFile(file: any) { if (!file || !invoiceFileTypes.has(file.mimetype) || !invoiceFileExtensions.has(extname(file.originalname).toLowerCase())) throw new BadRequestException('仅支持 PDF、PNG、JPG 或 JPEG 发票文件'); if (file.size > maxInvoiceFileSize) throw new BadRequestException('发票文件不能超过20MB'); }
  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作发票管理' }); }
  private async audit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, resourceId: string, action: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'INVOICE', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
  private invoiceDetailView(row: any) { return { id: row.id, invoiceId: row.invoiceId, invoiceApplyId: row.invoiceId, invoiceApplicationItemId: row.invoiceApplicationItemId, invoiceApplyInvoiceId: row.invoiceApplicationItemId, amount: moneyToString(row.amount), invoiceType: row.invoiceType, invoiceContent: row.invoiceContent, invoiceCode: row.invoiceCode, invoiceUrl: row.invoiceUrl, imageUrl: row.imageUrl, originalFileName: row.originalFileName, createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt }; }
  private view(row: any) { return { ...row, amount: moneyToString(row.amount), approvedAmount: row.approvedAmount === undefined ? row.approvedAmount : row.approvedAmount === null ? null : moneyToString(row.approvedAmount), applicationItems: row.applicationItems?.map((item: any) => ({ ...item, amount: moneyToString(item.amount) })), invoiceDetails: row.invoiceDetails?.map((detail: any) => this.invoiceDetailView(detail)), receiveSources: row.receiveSources?.map((source: any) => ({ ...source, amount: moneyToString(source.amount), receiveRecord: source.receiveRecord ? { ...source.receiveRecord, amount: source.receiveRecord.amount === undefined ? source.receiveRecord.amount : moneyToString(source.receiveRecord.amount), invoiceEligibleAmount: source.receiveRecord.invoiceEligibleAmount === undefined ? source.receiveRecord.invoiceEligibleAmount : moneyToString(source.receiveRecord.invoiceEligibleAmount), serviceFeeAmount: source.receiveRecord.serviceFeeAmount === undefined ? source.receiveRecord.serviceFeeAmount : moneyToString(source.receiveRecord.serviceFeeAmount), unBillingAmount: source.receiveRecord.unBillingAmount === undefined ? source.receiveRecord.unBillingAmount : moneyToString(source.receiveRecord.unBillingAmount), billingAmount: source.receiveRecord.billingAmount === undefined ? source.receiveRecord.billingAmount : moneyToString(source.receiveRecord.billingAmount), billedAmount: source.receiveRecord.billedAmount === undefined ? source.receiveRecord.billedAmount : moneyToString(source.receiveRecord.billedAmount) } : source.receiveRecord })) }; }
  private generateInvoiceNo() { return `INV${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
}
