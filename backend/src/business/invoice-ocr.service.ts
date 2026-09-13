import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceOcrStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const maxFileSize = 20 * 1024 * 1024;

@Injectable()
export class InvoiceOcrService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async recognize(file: any, invoiceId: string | undefined, context: AccessContext) {
    if (!file || !allowedTypes.has(file.mimetype) || !allowedExtensions.has(extname(file.originalname).toLowerCase())) throw new BadRequestException('仅支持 JPG、JPEG、PNG 或 PDF 发票文件');
    if (file.size > maxFileSize) throw new BadRequestException('发票文件不能超过20MB');
    let organizationId: string | null = null;
    if (invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, organizationId: true } });
      if (!invoice) throw new NotFoundException('发票申请不存在');
      await this.scope.assertOrganizationAccess(invoice.organizationId, context);
      organizationId = invoice.organizationId;
    } else {
      const organizationIds = await this.scope.getOrganizationIds(context);
      organizationId = organizationIds?.[0] || null;
    }
    if (!organizationId) throw new BadRequestException('当前用户没有可用组织范围');
    const fileId = randomUUID();
    const storageRoot = resolve(process.env.INVOICE_UPLOAD_DIR || join(process.cwd(), 'storage', 'invoices'));
    await mkdir(storageRoot, { recursive: true });
    const storedPath = join(storageRoot, `${fileId}${extname(file.originalname).toLowerCase()}`);
    await writeFile(storedPath, file.buffer);
    const record = await this.prisma.invoiceOcrRecord.create({ data: { id: randomUUID(), invoiceId: invoiceId || null, organizationId, fileId, originalFileName: file.originalname, filePath: storedPath, mimeType: file.mimetype, fileSizeBytes: file.size, status: InvoiceOcrStatus.PROCESSING, provider: 'PaddleOCR', model: process.env.PADDLEOCR_MODEL || 'PP-StructureV3', createdBy: context.sub } });
    try {
      const result = await this.callLocalOcr(storedPath, file.originalname, file.mimetype);
      const parsedResult = this.normalizeResult(result.data || result.parsedResult || {});
      const updated = await this.prisma.invoiceOcrRecord.update({ where: { id: record.id }, data: { status: InvoiceOcrStatus.SUCCESS, rawResult: (result.rawResult || result.rawResultJson || {}) as Prisma.InputJsonValue, parsedResult: parsedResult as Prisma.InputJsonValue, fieldConfidence: (result.fieldConfidence || {}) as Prisma.InputJsonValue, errorMessage: null } });
      return { success: true, status: InvoiceOcrStatus.SUCCESS, data: parsedResult, rawResultId: updated.id };
    } catch (error) {
      await this.prisma.invoiceOcrRecord.update({ where: { id: record.id }, data: { status: InvoiceOcrStatus.FAILED, errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'OCR服务调用失败' } });
      return { success: false, status: InvoiceOcrStatus.FAILED, data: {}, rawResultId: record.id, message: 'AI识别失败，请手工填写' };
    }
  }

  private async callLocalOcr(filePath: string, originalName: string, mimeType: string) {
    const endpoint = (process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '') + '/ocr/invoice';
    const buffer = await (await import('node:fs/promises')).readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), originalName);
    const response = await fetch(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(Number(process.env.OCR_SERVICE_TIMEOUT_MS || 30000)) });
    if (!response.ok) throw new Error(`OCR服务返回${response.status}`);
    return await response.json() as { data?: Record<string, unknown>; rawResult?: unknown; rawResultJson?: unknown; fieldConfidence?: unknown };
  }

  private normalizeResult(data: Record<string, any>) {
    return {
      invoiceNo: this.clean(data.invoiceNo), invoiceDate: this.clean(data.invoiceDate), invoiceCode: this.clean(data.invoiceCode), checkCode: this.clean(data.checkCode), buyerName: this.clean(data.buyerName), buyerTaxNo: this.clean(data.buyerTaxNo), sellerName: this.clean(data.sellerName), sellerTaxNo: this.clean(data.sellerTaxNo), amountExcludingTax: this.normalizeMoney(data.amountExcludingTax), taxAmount: this.normalizeMoney(data.taxAmount), totalAmount: this.normalizeMoney(data.totalAmount), currency: this.clean(data.currency), invoiceType: this.clean(data.invoiceType), remark: this.clean(data.remark), items: Array.isArray(data.items) ? data.items : [], rawText: this.clean(data.rawText), rawResult: data.rawResult || {},
    };
  }

  private clean(value: unknown) { return value === undefined || value === null ? '' : String(value).replace(/[\r\n]+/g, ' ').trim(); }
  private normalizeMoney(value: unknown) { const normalized = this.clean(value).replace(/[￥¥,\s]/g, ''); return /^\d+(?:\.\d{1,2})?$/.test(normalized) ? new Prisma.Decimal(normalized).toFixed(2) : ''; }
}
