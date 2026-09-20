import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './department.dto';

@Injectable()
export class DepartmentService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const departments = await this.prisma.department.findMany({
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { users: true, customers: true, children: true } },
      },
    });
    return { items: departments, total: departments.length };
  }

  async findTree() {
    const departments = await this.prisma.department.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    const map = new Map();
    const roots: any[] = [];
    departments.forEach((d) => {
      const node = { ...d, children: [] };
      map.set(d.id, node);
      if (d.parentId) {
        const parent = map.get(d.parentId);
        if (parent) parent.children.push(node);
        else roots.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        _count: { select: { users: true, customers: true } },
      },
    });
    if (!department) throw new NotFoundException('部门不存在');
    return department;
  }

  async create(dto: CreateDepartmentDto) {
    const exists = await this.prisma.department.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException('部门编码已存在');
    if (dto.parentId) {
      const parent = await this.prisma.department.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('上级部门不存在');
    }
    return this.prisma.department.create({ data: dto });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const department = await this.prisma.department.findUnique({ where: { id } });
    if (!department) throw new NotFoundException('部门不存在');
    if (dto.code && dto.code !== department.code) {
      const exists = await this.prisma.department.findUnique({ where: { code: dto.code } });
      if (exists) throw new BadRequestException('部门编码已存在');
    }
    if (dto.parentId === id) throw new BadRequestException('上级部门不能是自己');
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true, customers: true, children: true } } },
    });
    if (!department) throw new NotFoundException('部门不存在');
    if (department._count.users > 0) throw new BadRequestException('该部门下还有用户，无法删除');
    if (department._count.customers > 0) throw new BadRequestException('该部门下还有客户，无法删除');
    if (department._count.children > 0) throw new BadRequestException('该部门下还有子部门，无法删除');
    await this.prisma.department.delete({ where: { id } });
    return { success: true };
  }
}
