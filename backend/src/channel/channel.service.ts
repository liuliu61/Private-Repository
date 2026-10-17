import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { CreateChannelDto, UpdateChannelDto, ChannelQueryDto } from './channel.dto';

@Injectable()
export class ChannelService {
  constructor(private prisma: PrismaService, private readonly scope: AccessScopeService) {}

  private async getOrgId(context: AccessContext): Promise<string> {
    const orgIds = await this.scope.getOrganizationIds(context);
    let orgId = orgIds?.[0];
    // 超级管理员可能没有关联组织，自动取第一个可用组织
    if (!orgId && this.scope.isSuperAdmin(context)) {
      const firstOrg = await this.prisma.organization.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (firstOrg) orgId = firstOrg.id;
    }
    if (!orgId) throw new BadRequestException('无法确定所属组织');
    return orgId;
  }

  async list(query: ChannelQueryDto, context: AccessContext) {
    const orgId = await this.getOrgId(context);
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const where: any = { organizationId: orgId };
    if (query.platform) where.platform = query.platform;
    if (query.status) where.status = query.status;
    if (query.keyword) where.OR = [
      { name: { contains: query.keyword } },
      { code: { contains: query.keyword } },
    ];
    const [items, total] = await Promise.all([
      this.prisma.channel.findMany({ where, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.channel.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async listAll(context: AccessContext) {
    const orgId = await this.getOrgId(context);
    return this.prisma.channel.findMany({ where: { organizationId: orgId, status: 'ACTIVE' }, orderBy: { name: 'asc' } });
  }

  async getById(id: string, context: AccessContext) {
    const orgId = await this.getOrgId(context);
    const channel = await this.prisma.channel.findFirst({ where: { id, organizationId: orgId } });
    if (!channel) throw new NotFoundException('端口不存在');
    return channel;
  }

  async detail(id: string, context: AccessContext) {
    const orgId = await this.getOrgId(context);
    const channel = await this.prisma.channel.findFirst({ where: { id, organizationId: orgId } });
    if (!channel) throw new NotFoundException('端口不存在');
    const [promotionAccounts, rechargeAgg] = await Promise.all([
      this.prisma.promotionAccount.findMany({ where: { channelId: id }, include: { customer: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.rechargeRequest.aggregate({ where: { portId: id }, _count: true, _sum: { amount: true }, _max: { amount: true } }),
    ]);
    const confirmedAgg = await this.prisma.rechargeRequest.aggregate({ where: { portId: id, status: 'CONFIRMED' }, _count: true, _sum: { amount: true } });
    const paIds = promotionAccounts.map((a: any) => a.id);
    const paRechargeAgg = paIds.length > 0 ? await this.prisma.rechargeRequest.groupBy({
      by: ['promotionAccountId'],
      where: { promotionAccountId: { in: paIds }, status: 'CONFIRMED' },
      _sum: { amount: true },
    }) : [];
    const paRechargeMap = new Map<string, number>(paRechargeAgg.map((g: any) => [g.promotionAccountId, g._sum.amount ?? 0]));
    return {
      channel,
      promotionAccounts: promotionAccounts.map((a: any) => ({
        id: a.id, accountName: a.accountName, platform: a.platform, platformAccountId: a.platformAccountId,
        label: a.label, status: a.status, ownerName: a.customer?.name || a.supplier?.name || null,
        currentBalance: (a.currentBalance ?? 0).toString(),
        cumulativeRecharge: (paRechargeMap.get(a.id) ?? 0).toString(),
        customerRebatePublic: a.customerRebatePublic ? (a.customerRebatePublic as any).toString() : null,
        customerRebatePrivate: a.customerRebatePrivate ? (a.customerRebatePrivate as any).toString() : null,
      })),
      recharge: { totalCount: rechargeAgg._count, totalAmount: (rechargeAgg._sum.amount ?? 0).toString(), confirmedCount: confirmedAgg._count, confirmedAmount: (confirmedAgg._sum.amount ?? 0).toString() },
    };
  }

  async setPinned(id: string, pinned: boolean, context: AccessContext) {
    const orgId = await this.getOrgId(context);
    const channel = await this.prisma.channel.findFirst({ where: { id, organizationId: orgId } });
    if (!channel) throw new NotFoundException('端口不存在');
    return this.prisma.channel.update({ where: { id }, data: { isPinned: pinned } });
  }

  async create(dto: CreateChannelDto, context: AccessContext) {
    const orgId = await this.getOrgId(context);
    // 检查名称是否重复
    const exist = await this.prisma.channel.findFirst({ where: { organizationId: orgId, name: dto.name } });
    if (exist) throw new BadRequestException('端口名称已存在');
    return this.prisma.channel.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        code: dto.code,
        platform: dto.platform,
        defaultCostRebatePublic: dto.defaultCostRebatePublic ?? 0,
        defaultCostRebatePrivate: dto.defaultCostRebatePrivate ?? 0,
        remark: dto.remark,
      },
    });
  }

  async update(id: string, dto: UpdateChannelDto, context: AccessContext) {
    const orgId = await this.getOrgId(context);
    const channel = await this.prisma.channel.findFirst({ where: { id, organizationId: orgId } });
    if (!channel) throw new NotFoundException('端口不存在');
    // 如果修改名称，检查是否重复
    if (dto.name && dto.name !== channel.name) {
      const exist = await this.prisma.channel.findFirst({ where: { organizationId: orgId, name: dto.name, id: { not: id } } });
      if (exist) throw new BadRequestException('端口名称已存在');
    }
    const updateData: any = { ...dto };
    if (dto.status) updateData.status = dto.status as any;
    return this.prisma.channel.update({ where: { id }, data: updateData });
  }

  async remove(id: string, context: AccessContext) {
    const orgId = await this.getOrgId(context);
    const channel = await this.prisma.channel.findFirst({ where: { id, organizationId: orgId } });
    if (!channel) throw new NotFoundException('端口不存在');
    await this.prisma.channel.delete({ where: { id } });
    return { success: true };
  }
}
