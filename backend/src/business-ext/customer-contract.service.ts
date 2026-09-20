import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerContractDto, UpdateCustomerContractDto, ApproveContractDto } from './customer-contract.dto';
import { generateBusinessNo } from '../common/utils/business-no';

@Injectable()
export class CustomerContractService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, pageSize = 20, customerId?: string, status?: string, keyword?: string) {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (keyword) where.name = { contains: keyword };
    const [items, total] = await Promise.all([
      this.prisma.customerContract.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, customerCode: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerContract.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findExpiring(days = 30) {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.customerContract.findMany({
      where: {
        status: 'ACTIVE',
        expiryDate: { lte: expiryDate, gte: now },
      },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const contract = await this.prisma.customerContract.findUnique({
      where: { id },
      include: {
        customer: true,
        attachments: true,
      },
    });
    if (!contract) throw new NotFoundException('合同不存在');
    return contract;
  }

  async create(dto: CreateCustomerContractDto, userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new BadRequestException('客户不存在');
    const contractNo = generateBusinessNo('HT');
    const { attachments, ...data } = dto;
    return this.prisma.customerContract.create({
      data: {
        ...data,
        contractNo,
        createdBy: userId,
        attachments: attachments?.length
          ? { create: attachments.map((a) => ({ ...a, uploadedBy: userId })) }
          : undefined,
      },
      include: { attachments: true },
    });
  }

  async update(id: string, dto: UpdateCustomerContractDto) {
    const contract = await this.prisma.customerContract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('合同不存在');
    if (contract.status === 'ACTIVE' || contract.status === 'EXPIRING' || contract.status === 'EXPIRED') {
      throw new BadRequestException('合同已审批，不能修改，请发起变更');
    }
    const data: any = { ...dto };
    return this.prisma.customerContract.update({ where: { id }, data });
  }

  async submitForApproval(id: string) {
    const contract = await this.prisma.customerContract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('合同不存在');
    if (contract.status !== 'DRAFT') throw new BadRequestException('只有草稿状态可以提交审批');
    return this.prisma.customerContract.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    });
  }

  async approve(id: string, userId: string, dto: ApproveContractDto) {
    const contract = await this.prisma.customerContract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('合同不存在');
    if (contract.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批状态可以审批');
    return this.prisma.customerContract.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approvedBy: userId,
        approvedAt: new Date(),
        remark: dto.remark || contract.remark,
      },
    });
  }

  async reject(id: string, userId: string, reason: string) {
    const contract = await this.prisma.customerContract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('合同不存在');
    if (contract.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批状态可以驳回');
    return this.prisma.customerContract.update({
      where: { id },
      data: { status: 'DRAFT', remark: reason },
    });
  }

  async terminate(id: string, reason: string) {
    const contract = await this.prisma.customerContract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('合同不存在');
    return this.prisma.customerContract.update({
      where: { id },
      data: { status: 'TERMINATED', remark: reason },
    });
  }

  async remove(id: string) {
    const contract = await this.prisma.customerContract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('合同不存在');
    if (contract.status === 'ACTIVE') throw new BadRequestException('生效中的合同不能删除');
    await this.prisma.customerContractAttachment.deleteMany({ where: { contractId: id } });
    await this.prisma.customerContract.delete({ where: { id } });
    return { success: true };
  }
}
