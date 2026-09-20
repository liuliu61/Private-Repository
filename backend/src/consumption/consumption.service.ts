import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumptionListQueryDto, CreateConsumptionDto } from './consumption.dto';

@Injectable()
export class ConsumptionService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async list(query: ConsumptionListQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const orgIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.ConsumptionRecordWhereInput = {
      ...(orgIds ? { organizationId: { in: orgIds } } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.adAccountId ? { adAccountId: query.adAccountId } : {}),
      ...(query.startDate || query.endDate ? {
        consumptionDate: {
          ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
          ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
        },
      } : {}),
    };
    const [items, total, summary] = await this.prisma.$transaction([
      this.prisma.consumptionRecord.findMany({
        where,
        include: { customer: { select: { id: true, name: true, customerCode: true } } },
        orderBy: { consumptionDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.consumptionRecord.count({ where }),
      this.prisma.consumptionRecord.aggregate({
        where,
        _sum: { creditAmount: true, cashAmount: true, rebateAmount: true, serviceCost: true, profitAmount: true },
      }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary: {
        totalCredit: summary._sum.creditAmount?.toString() || '0',
        totalCash: summary._sum.cashAmount?.toString() || '0',
        totalRebate: summary._sum.rebateAmount?.toString() || '0',
        totalServiceCost: summary._sum.serviceCost?.toString() || '0',
        totalProfit: summary._sum.profitAmount?.toString() || '0',
      },
    };
  }

  async overview(context: AccessContext) {
    this.assertViewPermission(context);
    const orgIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.ConsumptionRecordWhereInput = orgIds ? { organizationId: { in: orgIds } } : {};

    const [totalSummary, customerTop, dailyTrend] = await this.prisma.$transaction([
      this.prisma.consumptionRecord.aggregate({
        where,
        _sum: { creditAmount: true, cashAmount: true, rebateAmount: true, serviceCost: true, profitAmount: true },
        _count: true,
      }),
      this.prisma.consumptionRecord.groupBy({
        by: ['customerId'],
        where,
        _sum: { creditAmount: true, profitAmount: true },
        orderBy: { _sum: { creditAmount: 'desc' } },
        take: 10,
      }),
      this.prisma.consumptionRecord.groupBy({
        by: ['consumptionDate'],
        where,
        _sum: { creditAmount: true, profitAmount: true },
        orderBy: { consumptionDate: 'desc' },
        take: 30,
      }),
    ]);

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerTop.map((item) => item.customerId) } },
      select: { id: true, name: true },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c.name]));

    return {
      totalCredit: totalSummary._sum.creditAmount?.toString() || '0',
      totalCash: totalSummary._sum.cashAmount?.toString() || '0',
      totalRebate: totalSummary._sum.rebateAmount?.toString() || '0',
      totalServiceCost: totalSummary._sum.serviceCost?.toString() || '0',
      totalProfit: totalSummary._sum.profitAmount?.toString() || '0',
      recordCount: totalSummary._count,
      topCustomers: customerTop.map((item) => ({
        customerId: item.customerId,
        customerName: customerMap.get(item.customerId) || '未知客户',
        creditAmount: item._sum?.creditAmount?.toString() || '0',
        profitAmount: item._sum?.profitAmount?.toString() || '0',
      })),
      dailyTrend: dailyTrend.map((item) => ({
        date: item.consumptionDate.toISOString().split('T')[0],
        creditAmount: item._sum?.creditAmount?.toString() || '0',
        profitAmount: item._sum?.profitAmount?.toString() || '0',
      })).reverse(),
    };
  }

  async create(dto: CreateConsumptionDto, context: AccessContext) {
    this.assertEditPermission(context);
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, name: true, agentId: true } });
    if (!customer) throw new NotFoundException({ success: false, code: 'CUSTOMER_NOT_FOUND', message: '客户不存在' });
    if (customer.agentId) await this.scope.assertOrganizationAccess(customer.agentId, context);

    const recordNo = await this.generateRecordNo();
    const profitAmount = dto.grossProfit ?? (dto.cashAmount || 0) - (dto.serviceCost || 0);

    return this.prisma.consumptionRecord.create({
      data: {
        recordNo,
        customerId: dto.customerId,
        organizationId: customer.agentId,
        adAccountId: dto.adAccountId,
        adSubjectId: dto.adSubjectId,
        consumptionDate: new Date(dto.consumptionDate),
        creditAmount: new Prisma.Decimal(dto.creditAmount),
        cashAmount: new Prisma.Decimal(dto.cashAmount ?? 0),
        rebateAmount: new Prisma.Decimal(dto.rebateAmount ?? 0),
        serviceCost: new Prisma.Decimal(dto.serviceCost ?? 0),
        profitAmount: new Prisma.Decimal(profitAmount),
        remark: dto.remark,
        createdBy: context.sub,
      },
      include: { customer: { select: { id: true, name: true, customerCode: true } } },
    });
  }

  async delete(id: string, context: AccessContext) {
    this.assertEditPermission(context);
    const record = await this.prisma.consumptionRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException({ success: false, code: 'CONSUMPTION_NOT_FOUND', message: '消耗记录不存在' });
    await this.prisma.consumptionRecord.delete({ where: { id } });
    return { success: true, id };
  }

  private async generateRecordNo(): Promise<string> {
    const prefix = 'CR';
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.consumptionRecord.count({ where: { recordNo: { startsWith: `${prefix}${dateStr}` } } });
    return `${prefix}${dateStr}${String(count + 1).padStart(4, '0')}`;
  }

  private assertViewPermission(context: AccessContext): void {
    if (!this.scope.canViewCustomerRebatePolicy(context)) this.throwPermissionDenied();
  }

  private assertEditPermission(context: AccessContext): void {
    if (!this.scope.canEditCustomerRebatePolicy(context)) this.throwPermissionDenied();
  }

  private throwPermissionDenied(): never {
    throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作消耗分析' });
  }
}
