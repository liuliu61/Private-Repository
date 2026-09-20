import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentAccountDto, UpdatePaymentAccountDto } from './business-ext.dto';

@Injectable()
export class PaymentAccountService {
  constructor(private prisma: PrismaService) {}

  async findAll(customerId?: string) {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    const items = await this.prisma.customerPaymentAccount.findMany({
      where,
      include: { customer: { select: { id: true, name: true, customerCode: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async findByAccountNumber(accountNumber: string) {
    return this.prisma.customerPaymentAccount.findFirst({
      where: { accountNumber, status: 'ACTIVE' },
      include: { customer: true },
    });
  }

  async findOne(id: string) {
    const account = await this.prisma.customerPaymentAccount.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!account) throw new NotFoundException('打款账户不存在');
    return account;
  }

  async create(dto: CreatePaymentAccountDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new BadRequestException('客户不存在');
    return this.prisma.customerPaymentAccount.create({ data: dto });
  }

  async update(id: string, dto: UpdatePaymentAccountDto) {
    const account = await this.prisma.customerPaymentAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('打款账户不存在');
    return this.prisma.customerPaymentAccount.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const account = await this.prisma.customerPaymentAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('打款账户不存在');
    await this.prisma.customerPaymentAccount.delete({ where: { id } });
    return { success: true };
  }
}
