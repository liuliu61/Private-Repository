import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReceiveRecordStatus } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { moneyToString } from '../cashflow/utils/money.util';
import { ServiceFeeReconciliationQueryDto } from './service-fee-reconciliation.dto';

@Injectable()
export class ServiceFeeReconciliationService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async list(query: ServiceFeeReconciliationQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SERVICE_FEE_RECONCILIATION_VIEW');
    const rows = await this.findRows(query, await this.scope.getOrganizationIds(context));
    const summary = this.summarize(rows);
    const start = (query.page - 1) * query.pageSize;
    return { items: rows.slice(start, start + query.pageSize).map((row) => this.view(row)), totalCount: summary.totalCount, totalAmount: summary.totalAmount, totalServiceFee: summary.totalServiceFee, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SERVICE_FEE_RECONCILIATION_VIEW');
    const row = await this.prisma.receiveRecord.findUnique({ where: { id }, include: this.include() });
    if (!row) throw new NotFoundException('服务费对账记录不存在');
    await this.scope.assertOrganizationAccess(row.organizationId, context);
    return this.view(row);
  }

  async export(query: ServiceFeeReconciliationQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_SERVICE_FEE_RECONCILIATION_EXPORT');
    const rows = await this.findRows(query, await this.scope.getOrganizationIds(context));
    const organizationIds = [...new Set(rows.map((row) => row.organizationId))];
    for (const organizationId of organizationIds) {
      await this.prisma.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: 'SERVICE_FEE_RECONCILIATION_EXPORT', businessType: 'SERVICE_FEE_RECONCILIATION', businessId: 'EXPORT', beforeData: { tab: query.tab, transactionNo: query.transactionNo || null, dateFrom: query.dateFrom || null, dateTo: query.dateTo || null, paymentAccountId: query.paymentAccountId || null, paymentAccountKeyword: query.paymentAccountKeyword || null } as Prisma.InputJsonValue, afterData: { count: rows.filter((row) => row.organizationId === organizationId).length } as Prisma.InputJsonValue, result: 'SUCCESS' } });
    }
    const html = ['<html><head><meta charset="utf-8"></head><body><table border="1">', '<tr><th>流水号</th><th>付款账户</th><th>收款账户</th><th>交易时间</th><th>金额(元)</th><th>服务费(元)</th><th>归属客户</th><th>商务</th><th>备注</th><th>操作</th></tr>', ...rows.map((row) => { const view = this.view(row); return `<tr><td>${this.escape(view.transactionNo)}</td><td>${this.escape(view.paymentAccount?.name || view.paymentAccount?.account || '')}</td><td>${this.escape(view.receivingAccount?.name || '')}</td><td>${this.escape(view.transactionTime?.toISOString() || '')}</td><td>${view.amount}</td><td>${view.serviceFee}</td><td>${this.escape(view.customer?.name || '')}</td><td>${this.escape(view.customer?.departmentId || '')}</td><td>${this.escape(view.remark || '')}</td><td>查看详情</td></tr>`; }), '</table></body></html>'].join('');
    return { filename: '服务费对账.xls', content: html, count: rows.length };
  }

  private async findRows(query: ServiceFeeReconciliationQueryDto, organizationIds: string[] | undefined) {
    const start = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const end = query.dateTo ? new Date(query.dateTo) : undefined;
    if (start && Number.isNaN(start.getTime())) throw new BadRequestException('开始日期格式不正确');
    if (end && Number.isNaN(end.getTime())) throw new BadRequestException('结束日期格式不正确');
    if (start && end && end < start) throw new BadRequestException('日期范围不正确');
    return this.prisma.receiveRecord.findMany({
      where: {
        organizationId: organizationIds ? { in: organizationIds } : undefined,
        status: ReceiveRecordStatus.CONFIRMED,
        receivedAt: start || end ? { gte: start, lt: end } : undefined,
        bankTransaction: {
          transactionNo: query.transactionNo ? { contains: query.transactionNo.trim(), mode: 'insensitive' } : undefined,
          accountId: query.paymentAccountId,
          account: query.paymentAccountKeyword ? { OR: [{ name: { contains: query.paymentAccountKeyword.trim(), mode: 'insensitive' } }, { accountCode: { contains: query.paymentAccountKeyword.trim(), mode: 'insensitive' } }] } : undefined,
        },
        serviceFeeDetails: query.tab === 'NON_ZERO' ? { some: { amount: { not: new Prisma.Decimal(0) } } } : undefined,
      },
      include: this.include(),
      orderBy: [{ receivedAt: 'desc' }, { receiveNo: 'desc' }],
    });
  }

  private include() {
    return { customer: { select: { id: true, name: true, departmentId: true } }, bankTransaction: { include: { account: { select: { id: true, name: true, accountCode: true } } } }, serviceFeeDetails: { orderBy: { createdAt: 'asc' as const }, include: { operator: { select: { id: true, displayName: true } } } } };
  }

  private summarize(rows: any[]) {
    let totalAmount = new Prisma.Decimal(0);
    let totalServiceFee = new Prisma.Decimal(0);
    for (const row of rows) { totalAmount = totalAmount.add(row.amount); totalServiceFee = totalServiceFee.add((row.serviceFeeDetails || []).reduce((sum: Prisma.Decimal, detail: any) => sum.add(detail.amount), new Prisma.Decimal(0))); }
    return { totalCount: rows.length, totalAmount: moneyToString(totalAmount), totalServiceFee: moneyToString(totalServiceFee) };
  }

  private view(row: any) {
    const serviceFee = (row.serviceFeeDetails || []).reduce((sum: Prisma.Decimal, detail: any) => sum.add(detail.amount), new Prisma.Decimal(0));
    return { id: row.id, transactionNo: row.bankTransaction.transactionNo, paymentAccount: { name: row.bankTransaction.counterpartyName, account: row.bankTransaction.counterpartyAccount }, receivingAccount: row.bankTransaction.account, transactionTime: row.bankTransaction.occurredAt, amount: moneyToString(row.amount), serviceFee: moneyToString(serviceFee), serviceFeeDetails: (row.serviceFeeDetails || []).map((detail: any) => ({ ...detail, amount: moneyToString(detail.amount) })), customer: row.customer, business: row.customer?.departmentId || null, remark: row.remark || row.bankTransaction.remark, source: { type: 'RECEIVE_RECORD', id: row.id, receiveNo: row.receiveNo, bankTransactionId: row.bankTransactionId } };
  }

  private escape(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

  private assertPermission(context: AccessContext, permission: string) {
    const canView = context.permissions.includes('FINANCE_SERVICE_FEE_RECONCILIATION_VIEW') || context.roles.includes('FINANCE') || this.scope.isSuperAdmin(context);
    const canExport = context.permissions.includes('FINANCE_SERVICE_FEE_RECONCILIATION_EXPORT') || context.permissions.includes('FINANCE_SERVICE_FEE_RECONCILIATION_VIEW') || context.roles.includes('FINANCE') || this.scope.isSuperAdmin(context);
    if ((permission.endsWith('_EXPORT') ? !canExport : !canView)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权访问服务费对账' });
  }
}
