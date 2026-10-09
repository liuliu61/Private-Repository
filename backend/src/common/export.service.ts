import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessContext, AccessScopeService } from './access-scope.service';
import { exportToExcel } from './export.util';

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
  ) {}

  /** 客户列表导出（遵守组织 + 部门隔离） */
  async exportCustomers(context: AccessContext): Promise<Buffer> {
    const ids = await this.scope.getOrganizationIds(context);
    const isAdmin = this.scope.isSuperAdmin(context);
    const where: any = { agentId: ids ? { in: ids } : undefined };
    if (!isAdmin && context.departmentId) where.departmentId = context.departmentId;
    const items = await this.prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } });
    return exportToExcel(items, [
      { key: 'customerCode', label: '客户编码' },
      { key: 'name', label: '客户名称' },
      { key: 'fullName', label: '客户全称' },
      { key: 'contact', label: '联系人' },
      { key: 'phone', label: '联系电话' },
      { key: 'status', label: '状态' },
      { key: 'remark', label: '备注' },
    ], '客户列表');
  }

  /** 客户合同导出（按客户部门隔离） */
  async exportCustomerContracts(context: AccessContext): Promise<Buffer> {
    const isAdmin = this.scope.isSuperAdmin(context);
    const where: any = {};
    if (!isAdmin && context.departmentId) where.customer = { departmentId: context.departmentId };
    const items = await this.prisma.customerContract.findMany({
      where,
      include: { customer: { select: { name: true, customerCode: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return exportToExcel(items, [
      { key: 'contractNo', label: '合同编号' },
      { key: 'name', label: '合同名称' },
      { key: 'customer.name', label: '客户名称' },
      { key: 'customer.customerCode', label: '客户编码' },
      { key: 'amount', label: '合同金额' },
      { key: 'effectiveDate', label: '生效日期' },
      { key: 'expiryDate', label: '到期日期' },
      { key: 'status', label: '状态' },
      { key: 'remark', label: '备注' },
    ], '客户合同');
  }

  /** 收款记录导出（按组织 + 客户部门隔离） */
  async exportReceiveRecords(context: AccessContext): Promise<Buffer> {
    const organizationIds = await this.scope.getOrganizationIds(context);
    const isAdmin = this.scope.isSuperAdmin(context);
    const where: any = {
      organizationId: organizationIds ? { in: organizationIds } : undefined,
    };
    if (!isAdmin && context.departmentId) where.customer = { departmentId: context.departmentId };
    const items = await this.prisma.receiveRecord.findMany({
      where,
      include: {
        customer: { select: { name: true, customerCode: true } },
        account: { select: { name: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });
    return exportToExcel(items, [
      { key: 'receiveNo', label: '收款编号' },
      { key: 'customer.name', label: '客户名称' },
      { key: 'account.name', label: '资金账户' },
      { key: 'amount', label: '收款金额' },
      { key: 'status', label: '状态' },
      { key: 'receivedAt', label: '收款时间' },
      { key: 'remark', label: '备注' },
    ], '收款记录');
  }

  /** 打款账户导出（按客户部门隔离） */
  async exportPaymentAccounts(context: AccessContext): Promise<Buffer> {
    const isAdmin = this.scope.isSuperAdmin(context);
    const where: any = {};
    if (!isAdmin && context.departmentId) where.customer = { departmentId: context.departmentId };
    const items = await this.prisma.customerPaymentAccount.findMany({
      where,
      include: { customer: { select: { name: true, customerCode: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return exportToExcel(items, [
      { key: 'customer.name', label: '客户名称' },
      { key: 'customer.customerCode', label: '客户编码' },
      { key: 'accountName', label: '账户名称' },
      { key: 'accountNumber', label: '银行账号' },
      { key: 'bankName', label: '开户行' },
      { key: 'status', label: '状态' },
      { key: 'remark', label: '备注' },
    ], '打款账户');
  }
}
