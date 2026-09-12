import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export interface AccessContext { sub: string; username: string; roles: string[]; permissions: string[]; }

@Injectable()
export class AccessScopeService {
  constructor(private readonly prisma: PrismaService) {}
  isSuperAdmin(context: AccessContext): boolean { return context.roles.includes('SUPER_ADMIN'); }
  canViewCustomerRebatePolicy(context: AccessContext): boolean { return this.isSuperAdmin(context) || context.roles.includes('FINANCE') || context.permissions.includes('FINANCE_REBATE_VIEW'); }
  canEditCustomerRebatePolicy(context: AccessContext): boolean { return this.isSuperAdmin(context) || context.roles.includes('FINANCE') || context.permissions.includes('FINANCE_REBATE_POLICY_EDIT'); }
  canFinance(context: AccessContext): boolean { return this.isSuperAdmin(context) || context.roles.includes('FINANCE') || context.permissions.includes('FINANCE_REBATE_CONFIRM'); }
  async getOrganizationIds(context: AccessContext): Promise<string[] | undefined> {
    if (this.isSuperAdmin(context)) return undefined;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE visible AS (
        SELECT organization_id AS id FROM user_organizations WHERE user_id = ${context.sub}::uuid
        UNION SELECT o.id FROM organizations o JOIN visible v ON o.parent_id = v.id
      ) SELECT id FROM visible
    `;
    if (rows.length === 0) throw new ForbiddenException('当前用户未分配可访问的组织范围');
    return rows.map((row) => row.id);
  }
  async assertOrganizationAccess(organizationId: string, context: AccessContext): Promise<void> {
    const ids = await this.getOrganizationIds(context);
    if (ids && !ids.includes(organizationId)) throw new ForbiddenException('无权访问该组织数据');
  }
  async assertAccountAccess(accountId: string, context: AccessContext): Promise<void> {
    if (this.isSuperAdmin(context)) return;
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { organizationId: true } });
    if (!account) return;
    if (!account.organizationId) throw new ForbiddenException('该资金账户尚未配置数据归属，当前用户无权访问');
    await this.assertOrganizationAccess(account.organizationId, context);
  }
}
