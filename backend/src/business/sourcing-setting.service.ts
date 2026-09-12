import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { SourcingSettingDto, SourcingSettingQueryDto } from './business.dto';

@Injectable()
export class SourcingSettingService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService) {}

  async get(query: SourcingSettingQueryDto, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_VIEW');
    const organizationId = await this.resolveOrganization(query.organizationId, context);
    const setting = await this.prisma.sourcingSetting.findUnique({ where: { organizationId } });
    return setting ? this.view(setting) : { organizationId, useCustomerWallet: false, createdAt: null, updatedAt: null, updatedBy: null };
  }

  async update(query: SourcingSettingQueryDto, dto: SourcingSettingDto, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_SETTING_EDIT');
    const organizationId = await this.resolveOrganization(query.organizationId, context);
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.sourcingSetting.findUnique({ where: { organizationId } });
      const row = await tx.sourcingSetting.upsert({
        where: { organizationId },
        create: { organizationId, useCustomerWallet: dto.useCustomerWallet, updatedBy: context.sub },
        update: { useCustomerWallet: dto.useCustomerWallet, updatedBy: context.sub },
      });
      await tx.auditLog.create({
        data: {
          operatorId: context.sub,
          organizationId,
          actionType: 'SOURCING_SETTING_UPDATE',
          businessType: 'SOURCING_SETTING',
          businessId: row.id,
          beforeData: (before ? { useCustomerWallet: before.useCustomerWallet } : null) as Prisma.InputJsonValue,
          afterData: { useCustomerWallet: row.useCustomerWallet } as Prisma.InputJsonValue,
          result: 'SUCCESS',
        },
      });
      return row;
    });
    return this.view(updated);
  }

  private async resolveOrganization(requested: string | undefined, context: AccessContext) {
    const organizationIds = await this.scope.getOrganizationIds(context);
    if (requested) {
      if (organizationIds && !organizationIds.includes(requested)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权访问该组织的外采配置' });
      return requested;
    }
    if (!organizationIds || organizationIds.length === 1) {
      if (organizationIds?.[0]) return organizationIds[0];
      const organization = await this.prisma.organization.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
      if (organization) return organization.id;
    }
    throw new BadRequestException('当前用户可访问多个组织，请指定组织ID');
  }

  private view(row: { id: string; organizationId: string; useCustomerWallet: boolean; updatedBy: string | null; createdAt: Date; updatedAt: Date }) {
    return { id: row.id, organizationId: row.organizationId, useCustomerWallet: row.useCustomerWallet, updatedBy: row.updatedBy, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  private assertPermission(context: AccessContext, permission: string) {
    if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作外采配置' });
  }
}
