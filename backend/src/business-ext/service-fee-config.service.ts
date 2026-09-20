import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceFeeConfigDto } from './business-ext.dto';

@Injectable()
export class ServiceFeeConfigService {
  constructor(private prisma: PrismaService) {}

  async findAll(customerId?: string) {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    const items = await this.prisma.serviceFeeConfig.findMany({
      where,
      include: { customer: { select: { id: true, name: true, customerCode: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async findByCustomer(customerId: string) {
    return this.prisma.serviceFeeConfig.findUnique({ where: { customerId } });
  }

  async upsert(dto: ServiceFeeConfigDto) {
    const existing = await this.prisma.serviceFeeConfig.findUnique({
      where: { customerId: dto.customerId },
    });
    if (existing) {
      return this.prisma.serviceFeeConfig.update({
        where: { customerId: dto.customerId },
        data: dto,
      });
    }
    return this.prisma.serviceFeeConfig.create({ data: dto });
  }

  async remove(id: string) {
    const config = await this.prisma.serviceFeeConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException('服务费配置不存在');
    await this.prisma.serviceFeeConfig.delete({ where: { id } });
    return { success: true };
  }
}
