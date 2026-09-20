import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto, AssignRolesDto } from './user.dto';

@Injectable()
export class UserManagementService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, pageSize = 20, keyword?: string, departmentId?: string) {
    const where: any = {};
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { displayName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (departmentId) where.departmentId = departmentId;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          department: { select: { id: true, name: true } },
          userRoles: { include: { role: { select: { id: true, name: true, code: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        department: true,
        userRoles: { include: { role: true } },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException('用户名已存在');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { roleIds, password, ...data } = dto;
    const createData: any = { ...data, passwordHash };
    if (roleIds?.length) {
      createData.userRoles = { create: roleIds.map((roleId: string) => ({ roleId })) };
    }
    return this.prisma.user.create({
      data: createData,
      include: { userRoles: { include: { role: true } } },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const { roleIds, ...data } = dto;
    const updateData: any = { ...data };
    return this.prisma.$transaction(async (tx) => {
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (roleIds.length > 0) {
          await tx.userRole.createMany({
            data: roleIds.map((roleId) => ({ userId: id, roleId })),
          });
        }
      }
      return tx.user.update({
        where: { id },
        data: updateData,
        include: { userRoles: { include: { role: true } } },
      });
    });
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true };
  }

  async assignRoles(id: string, dto: AssignRolesDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (dto.roleIds.length > 0) {
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }
      return tx.user.findUnique({ where: { id }, include: { userRoles: { include: { role: true } } } });
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.username === 'admin') throw new BadRequestException('管理员账号不能删除');
    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
