import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from './role.dto';

@Injectable()
export class RoleService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: {
        _count: { select: { userRoles: true, permissions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { items: roles, total: roles.length };
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        userRoles: { include: { user: true } },
      },
    });
    if (!role) throw new NotFoundException('角色不存在');
    return role;
  }

  async create(dto: CreateRoleDto) {
    const exists = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException('角色编码已存在');
    const { permissionIds, ...data } = dto;
    return this.prisma.role.create({
      data: {
        ...data,
        permissions: permissionIds?.length
          ? { create: permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    const { permissionIds, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          });
        }
      }
      return tx.role.update({ where: { id }, data });
    });
  }

  async assignPermissions(id: string, dto: AssignPermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
      return tx.role.findUnique({ where: { id }, include: { permissions: true } });
    });
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { userRoles: true } } },
    });
    if (!role) throw new NotFoundException('角色不存在');
    if (role._count.userRoles > 0) throw new BadRequestException('该角色下还有用户，无法删除');
    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.role.delete({ where: { id } });
    return { success: true };
  }

  async getAllPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ menuCode: 'asc' }, { sort: 'asc' }],
    });
    const grouped: Record<string, any[]> = {};
    permissions.forEach((p) => {
      const key = p.menuCode || 'other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });
    return grouped;
  }

  async initDefaultPermissions() {
    const menus = [
      { code: 'dashboard', name: '工作台' },
      { code: 'customers', name: '客户管理' },
      { code: 'customer-wallets', name: '客户钱包' },
      { code: 'promotion-accounts', name: '推广账户' },
      { code: 'receiving', name: '收款管理' },
      { code: 'invoices', name: '发票管理' },
      { code: 'service-orders', name: '服务订单' },
      { code: 'service-fee', name: '服务费对账' },
      { code: 'consumption', name: '消耗分析' },
      { code: 'sourcing', name: '外采管理' },
      { code: 'suppliers', name: '供应商管理' },
      { code: 'purchase-orders', name: '采购订单' },
      { code: 'settlements', name: '结算管理' },
      { code: 'financial-adjustments', name: '财务调整' },
      { code: 'channels', name: '端口管理' },
      { code: 'rebates', name: '返点管理' },
      { code: 'payment-posting', name: '付款过账' },
      { code: 'contracts', name: '客户合同' },
      { code: 'departments', name: '部门管理' },
      { code: 'roles', name: '角色管理' },
      { code: 'users', name: '用户管理' },
      { code: 'settings', name: '系统设置' },
    ];
    const actions = [
      { code: 'VIEW', name: '查看' },
      { code: 'CREATE', name: '新增' },
      { code: 'UPDATE', name: '编辑' },
      { code: 'DELETE', name: '删除' },
      { code: 'EXPORT', name: '导出' },
      { code: 'APPROVE', name: '审批' },
    ];
    const existing = await this.prisma.permission.findMany();
    const existingCodes = new Set(existing.map((p) => p.code));
    const toCreate: any[] = [];
    menus.forEach((menu) => {
      actions.forEach((action) => {
        const code = `${menu.code}:${action.code.toLowerCase()}`;
        if (!existingCodes.has(code)) {
          toCreate.push({
            code,
            name: `${menu.name}-${action.name}`,
            menuCode: menu.code,
            actionType: action.code,
          });
        }
      });
    });
    if (toCreate.length > 0) {
      await this.prisma.permission.createMany({ data: toCreate });
    }
    return { created: toCreate.length, total: existing.length + toCreate.length };
  }
}
