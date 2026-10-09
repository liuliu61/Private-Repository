import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePolicyChangeRequestDto, ApprovePolicyChangeDto } from './business-ext.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class PolicyChangeRequestService {
  constructor(private prisma: PrismaService, private notificationService: NotificationService) {}

  async findAll(page = 1, pageSize = 20, customerId?: string, status?: string) {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      this.prisma.customerRebatePolicyChangeRequest.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          policy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerRebatePolicyChangeRequest.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const request = await this.prisma.customerRebatePolicyChangeRequest.findUnique({
      where: { id },
      include: { customer: true, policy: true },
    });
    if (!request) throw new NotFoundException('政策变更申请不存在');
    return request;
  }

  async create(dto: CreatePolicyChangeRequestDto, userId: string) {
    const policy = await this.prisma.customerRebatePolicy.findUnique({ where: { id: dto.policyId } });
    if (!policy) throw new BadRequestException('政策不存在');
    const created = await this.prisma.customerRebatePolicyChangeRequest.create({
      data: { ...dto, applicantId: userId },
    });
    // 给财务/管理员角色用户发送审批待办通知（失败不阻塞主流程）
    try {
      const customer = dto.customerId
        ? await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { name: true } })
        : null;
      const customerName = customer?.name || '未知客户';
      const policyName = (policy as any).name || '—';
      const content = `客户：${customerName}，政策：${policyName}，请及时审批。`;
      await this.notificationService.createForRoles(
        ['FINANCE', 'ADMIN', 'SUPER_ADMIN'],
        NotificationType.APPROVAL_TODO,
        '政策变更待审批',
        content,
        'policy-changes',
      );
    } catch (e) {
      console.warn('发送政策变更通知失败:', e);
    }
    return created;
  }

  async approve(id: string, userId: string, dto: ApprovePolicyChangeDto) {
    const request = await this.prisma.customerRebatePolicyChangeRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('政策变更申请不存在');
    if (request.status !== 'PENDING') throw new BadRequestException('只有待审批状态可以审批');

    return this.prisma.$transaction(async (tx) => {
      const changeData = JSON.parse(request.changeData);
      await tx.customerRebatePolicy.update({
        where: { id: request.policyId },
        data: { ...changeData, updatedAt: new Date() },
      });
      return tx.customerRebatePolicyChangeRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approverId: userId,
          approvedAt: new Date(),
          remark: dto.remark || request.remark,
        },
      });
    });
  }

  async reject(id: string, userId: string, reason: string) {
    const request = await this.prisma.customerRebatePolicyChangeRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('政策变更申请不存在');
    if (request.status !== 'PENDING') throw new BadRequestException('只有待审批状态可以驳回');
    return this.prisma.customerRebatePolicyChangeRequest.update({
      where: { id },
      data: { status: 'REJECTED', approverId: userId, rejectReason: reason },
    });
  }

  async remove(id: string) {
    const request = await this.prisma.customerRebatePolicyChangeRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('政策变更申请不存在');
    if (request.status === 'APPROVED') throw new BadRequestException('已审批的申请不能删除');
    await this.prisma.customerRebatePolicyChangeRequest.delete({ where: { id } });
    return { success: true };
  }
}
