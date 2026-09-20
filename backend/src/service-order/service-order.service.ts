import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceOrderStatus } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmServiceOrderDto, CreateServiceOrderDto, ServiceOrderListQueryDto, UpdateServiceOrderDto } from './service-order.dto';

@Injectable()
export class ServiceOrderService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async list(query: ServiceOrderListQueryDto, context: AccessContext) {
    this.assertViewPermission(context);
    const orgIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.ServiceOrderWhereInput = {
      ...(orgIds ? { organizationId: { in: orgIds } } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status as ServiceOrderStatus } : {}),
      ...(query.startDate || query.endDate ? {
        createdAt: {
          ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
          ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
        },
      } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.serviceOrder.findMany({
        where,
        include: { customer: { select: { id: true, name: true, customerCode: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.serviceOrder.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, context: AccessContext) {
    this.assertViewPermission(context);
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, customerCode: true } },
        creator: { select: { id: true, displayName: true } },
        confirmer: { select: { id: true, displayName: true } },
        receiveRecords: { include: { receiveRecord: { select: { id: true, receiveNo: true, amount: true, receivedAt: true } } } },
        purchaseRecords: true,
      },
    });
    if (!order) throw new NotFoundException({ success: false, code: 'SERVICE_ORDER_NOT_FOUND', message: '服务订单不存在' });
    return order;
  }

  async create(dto: CreateServiceOrderDto, context: AccessContext) {
    this.assertEditPermission(context);
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, name: true, agentId: true } });
    if (!customer) throw new NotFoundException({ success: false, code: 'CUSTOMER_NOT_FOUND', message: '客户不存在' });
    if (customer.agentId) await this.scope.assertOrganizationAccess(customer.agentId, context);

    const orderNo = await this.generateOrderNo();
    const totalReceivable = dto.totalReceivableAmount ?? (dto.receiveItems?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0);
    const credit = dto.creditAmount ?? (dto.purchaseItems?.reduce((sum, item) => sum + (item.transferAmount || 0), 0) || 0);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.create({
        data: {
          orderNo,
          customerId: dto.customerId,
          organizationId: customer.agentId,
          contractSubject: dto.contractSubject,
          transferCategory: dto.transferCategory ?? 'AD_ACCOUNT',
          deliveryType: dto.deliveryType ?? 'BIDDING',
          businessType: dto.businessType,
          totalReceivableAmount: new Prisma.Decimal(totalReceivable),
          actualReceivedAmount: new Prisma.Decimal(dto.actualReceivedAmount ?? totalReceivable),
          serviceCostAmount: new Prisma.Decimal(dto.serviceCostAmount ?? 0),
          creditAmount: new Prisma.Decimal(credit),
          serviceFeeAmount: new Prisma.Decimal(dto.serviceFeeAmount ?? 0),
          status: ServiceOrderStatus.DRAFT,
          createdBy: context.sub,
          remark: dto.remark,
        },
      });

      if (dto.receiveItems?.length) {
        await tx.serviceOrderReceiveRecord.createMany({
          data: dto.receiveItems.map((item) => ({
            serviceOrderId: order.id,
            receiveRecordId: item.receiveRecordId,
            amount: new Prisma.Decimal(item.amount),
            serviceFee: new Prisma.Decimal(item.serviceFee ?? 0),
            usedAmount: new Prisma.Decimal(item.amount),
          })),
        });
      }

      if (dto.purchaseItems?.length) {
        await tx.serviceOrderPurchaseRecord.createMany({
          data: dto.purchaseItems.map((item) => ({
            serviceOrderId: order.id,
            purchaseOrderId: item.purchaseOrderId,
            adAccountId: item.adAccountId,
            adSubjectId: item.adSubjectId,
            transferAmount: new Prisma.Decimal(item.transferAmount),
            receivableAmount: new Prisma.Decimal(item.receivableAmount ?? item.transferAmount),
            remark: item.remark,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          operatorId: context.sub,
          organizationId: customer.agentId,
          actionType: 'SERVICE_ORDER_CREATE',
          businessType: 'SERVICE_ORDER',
          businessId: order.id,
          result: 'SUCCESS',
          afterData: { orderNo, customerId: dto.customerId, totalReceivableAmount: totalReceivable.toString(), creditAmount: credit.toString() },
        },
      });

      return this.getById(order.id, context);
    });
  }

  async update(id: string, dto: UpdateServiceOrderDto, context: AccessContext) {
    this.assertEditPermission(context);
    const order = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException({ success: false, code: 'SERVICE_ORDER_NOT_FOUND', message: '服务订单不存在' });
    if (order.status !== ServiceOrderStatus.DRAFT) {
      throw new BadRequestException({ success: false, code: 'SERVICE_ORDER_NOT_EDITABLE', message: '只有草稿状态的服务订单可以修改' });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({
        where: { id },
        data: {
          contractSubject: dto.contractSubject,
          transferCategory: dto.transferCategory,
          deliveryType: dto.deliveryType,
          businessType: dto.businessType,
          totalReceivableAmount: dto.totalReceivableAmount !== undefined ? new Prisma.Decimal(dto.totalReceivableAmount) : undefined,
          actualReceivedAmount: dto.actualReceivedAmount !== undefined ? new Prisma.Decimal(dto.actualReceivedAmount) : undefined,
          serviceCostAmount: dto.serviceCostAmount !== undefined ? new Prisma.Decimal(dto.serviceCostAmount) : undefined,
          creditAmount: dto.creditAmount !== undefined ? new Prisma.Decimal(dto.creditAmount) : undefined,
          serviceFeeAmount: dto.serviceFeeAmount !== undefined ? new Prisma.Decimal(dto.serviceFeeAmount) : undefined,
          remark: dto.remark,
        },
      });

      if (dto.receiveItems) {
        await tx.serviceOrderReceiveRecord.deleteMany({ where: { serviceOrderId: id } });
        if (dto.receiveItems.length) {
          await tx.serviceOrderReceiveRecord.createMany({
            data: dto.receiveItems.map((item) => ({
              serviceOrderId: id,
              receiveRecordId: item.receiveRecordId,
              amount: new Prisma.Decimal(item.amount),
              serviceFee: new Prisma.Decimal(item.serviceFee ?? 0),
              usedAmount: new Prisma.Decimal(item.amount),
            })),
          });
        }
      }

      if (dto.purchaseItems) {
        await tx.serviceOrderPurchaseRecord.deleteMany({ where: { serviceOrderId: id } });
        if (dto.purchaseItems.length) {
          await tx.serviceOrderPurchaseRecord.createMany({
            data: dto.purchaseItems.map((item) => ({
              serviceOrderId: id,
              purchaseOrderId: item.purchaseOrderId,
              adAccountId: item.adAccountId,
              adSubjectId: item.adSubjectId,
              transferAmount: new Prisma.Decimal(item.transferAmount),
              receivableAmount: new Prisma.Decimal(item.receivableAmount ?? item.transferAmount),
              remark: item.remark,
            })),
          });
        }
      }

      return this.getById(id, context);
    });
  }

  async submit(id: string, context: AccessContext) {
    this.assertEditPermission(context);
    const order = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException({ success: false, code: 'SERVICE_ORDER_NOT_FOUND', message: '服务订单不存在' });
    if (order.status !== ServiceOrderStatus.DRAFT) {
      throw new BadRequestException({ success: false, code: 'SERVICE_ORDER_NOT_SUBMITTABLE', message: '只有草稿状态的服务订单可以提交' });
    }
    await this.prisma.serviceOrder.update({ where: { id }, data: { status: ServiceOrderStatus.PENDING_CONFIRM } });
    return this.getById(id, context);
  }

  async confirm(id: string, dto: ConfirmServiceOrderDto, context: AccessContext) {
    this.assertEditPermission(context);
    const order = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException({ success: false, code: 'SERVICE_ORDER_NOT_FOUND', message: '服务订单不存在' });
    if (order.status !== ServiceOrderStatus.PENDING_CONFIRM) {
      throw new BadRequestException({ success: false, code: 'SERVICE_ORDER_NOT_CONFIRMABLE', message: '只有待确认状态的服务订单可以确认' });
    }
    await this.prisma.serviceOrder.update({
      where: { id },
      data: { status: ServiceOrderStatus.CONFIRMED, confirmedBy: context.sub, confirmedAt: new Date(), confirmedPhone: dto.phone, confirmedIp: dto.ip },
    });
    return this.getById(id, context);
  }

  async cancel(id: string, context: AccessContext) {
    this.assertEditPermission(context);
    const order = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException({ success: false, code: 'SERVICE_ORDER_NOT_FOUND', message: '服务订单不存在' });
    if (order.status === ServiceOrderStatus.CONFIRMED) {
      throw new BadRequestException({ success: false, code: 'SERVICE_ORDER_CONFIRMED_CANNOT_CANCEL', message: '已确认的服务订单不能取消' });
    }
    await this.prisma.serviceOrder.update({ where: { id }, data: { status: ServiceOrderStatus.CANCELLED } });
    return this.getById(id, context);
  }

  private async generateOrderNo(): Promise<string> {
    const prefix = 'SO';
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.serviceOrder.count({ where: { orderNo: { startsWith: `${prefix}${dateStr}` } } });
    return `${prefix}${dateStr}${String(count + 1).padStart(4, '0')}`;
  }

  private assertViewPermission(context: AccessContext): void {
    if (!this.scope.canViewCustomerRebatePolicy(context)) this.throwPermissionDenied();
  }

  private assertEditPermission(context: AccessContext): void {
    if (!this.scope.canEditCustomerRebatePolicy(context)) this.throwPermissionDenied();
  }

  private throwPermissionDenied(): never {
    throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作服务订单' });
  }
}
