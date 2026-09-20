import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReceiveRefundDto, ApproveReceiveRefundDto } from './business-ext.dto';
import { generateBusinessNo } from '../common/utils/business-no';

@Injectable()
export class ReceiveRefundService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, pageSize = 20, customerId?: string, status?: string, receiveRecordId?: string) {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (receiveRecordId) where.receiveRecordId = receiveRecordId;
    const [items, total] = await Promise.all([
      this.prisma.receiveRefund.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, customerCode: true } },
          receiveRecord: { select: { id: true, receiveNo: true, amount: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.receiveRefund.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const refund = await this.prisma.receiveRefund.findUnique({
      where: { id },
      include: { customer: true, receiveRecord: true },
    });
    if (!refund) throw new NotFoundException('退款申请不存在');
    return refund;
  }

  async create(dto: CreateReceiveRefundDto, userId: string) {
    const receiveRecord = await this.prisma.receiveRecord.findUnique({
      where: { id: dto.receiveRecordId },
    });
    if (!receiveRecord) throw new BadRequestException('收款单不存在');

    const postedAmount = Number(receiveRecord.postedAmount || 0);
    const refundedAmount = Number(receiveRecord.refundedAmount || 0);
    const availableRefund = postedAmount - refundedAmount;

    if (dto.amount > availableRefund) {
      throw new BadRequestException(`退款金额不能超过已入账未退款金额 ${availableRefund}`);
    }
    if (dto.amount <= 0) throw new BadRequestException('退款金额必须大于0');

    const refundNo = generateBusinessNo('TK');
    return this.prisma.receiveRefund.create({
      data: { ...dto, refundNo, applicantId: userId },
    });
  }

  async approve(id: string, userId: string, dto: ApproveReceiveRefundDto) {
    const refund = await this.prisma.receiveRefund.findUnique({ where: { id } });
    if (!refund) throw new NotFoundException('退款申请不存在');
    if (refund.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批状态可以审批');
    return this.prisma.receiveRefund.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approverId: userId,
        approvedAt: new Date(),
        remark: dto.remark || refund.remark,
      },
    });
  }

  async reject(id: string, userId: string, reason: string) {
    const refund = await this.prisma.receiveRefund.findUnique({ where: { id } });
    if (!refund) throw new NotFoundException('退款申请不存在');
    if (refund.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批状态可以驳回');
    return this.prisma.receiveRefund.update({
      where: { id },
      data: { status: 'REJECTED', remark: reason },
    });
  }

  async execute(id: string, userId: string) {
    const refund = await this.prisma.receiveRefund.findUnique({ where: { id } });
    if (!refund) throw new NotFoundException('退款申请不存在');
    if (refund.status !== 'APPROVED') throw new BadRequestException('只有已审批状态可以执行');

    return this.prisma.$transaction(async (tx) => {
      // 更新收款单退款金额
      await tx.receiveRecord.update({
        where: { id: refund.receiveRecordId },
        data: {
          refundedAmount: { increment: refund.amount },
          invoiceEligibleAmount: { decrement: refund.amount },
          unBillingAmount: { decrement: refund.amount },
        },
      });

      // 如果需要扣减客户钱包
      if (refund.deductWallet) {
        const wallet = await tx.customerWallet.findFirst({
          where: { customerId: refund.customerId, walletType: 'FINANCE_V' },
        });
        if (wallet) {
          const newBalance = Number(wallet.cashBalance) - Number(refund.amount);
          await tx.customerWallet.update({
            where: { id: wallet.id },
            data: { cashBalance: newBalance },
          });
          await tx.customerWalletTransaction.create({
            data: {
              walletId: wallet.id,
              transactionNo: generateBusinessNo('LS'),
              businessType: 'RECEIVE_REFUND',
              changeAmount: -Number(refund.amount),
              balanceBefore: Number(wallet.cashBalance),
              balanceAfter: newBalance,
              operatorId: userId,
              remark: `收款单退款 ${refund.refundNo}`,
            },
          });
        }
      }

      return tx.receiveRefund.update({
        where: { id },
        data: { status: 'EXECUTED', executedAt: new Date() },
      });
    });
  }

  async remove(id: string) {
    const refund = await this.prisma.receiveRefund.findUnique({ where: { id } });
    if (!refund) throw new NotFoundException('退款申请不存在');
    if (refund.status === 'EXECUTED') throw new BadRequestException('已执行的退款不能删除');
    await this.prisma.receiveRefund.delete({ where: { id } });
    return { success: true };
  }
}
