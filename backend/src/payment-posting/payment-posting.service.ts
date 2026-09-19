import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentPostingApplyDto,
  UpdatePaymentPostingApplyDto,
  PaymentPostingReviewDto,
  PaymentPostingPayDto,
  PaymentPostingCompleteDto,
  ListPaymentPostingQueryDto,
} from './payment-posting.dto';

interface AccessContext {
  sub: string;
  organizationId: string;
  roles: string[];
}

@Injectable()
export class PaymentPostingService {
  constructor(private prisma: PrismaService) {}

  private generateApplyNo(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PP${dateStr}${random}`;
  }

  private generateOaFlowNo(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `OA${dateStr}${random}`;
  }

  async list(query: ListPaymentPostingQueryDto, context: AccessContext) {
    const { page = 1, pageSize = 10, status, customerId, applyNo, oaFlowNo } = query;
    const where: any = { organizationId: context.organizationId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (applyNo) where.applyNo = { contains: applyNo };
    if (oaFlowNo) where.oaFlowNo = { contains: oaFlowNo };

    const [total, items] = await Promise.all([
      this.prisma.paymentPostingApply.count({ where }),
      this.prisma.paymentPostingApply.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, customerCode: true } },
          creator: { select: { id: true, displayName: true, username: true } },
          details: true,
          receiveRecords: { include: { receiveRecord: { select: { id: true, receiveNo: true, amount: true } } } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: items.map((item) => this.view(item)),
    };
  }

  async getById(id: string, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
      include: {
        customer: true,
        creator: { select: { id: true, displayName: true, username: true } },
        submitter: { select: { id: true, displayName: true } },
        approver: { select: { id: true, displayName: true } },
        payer: { select: { id: true, displayName: true } },
        completer: { select: { id: true, displayName: true } },
        details: true,
        receiveRecords: { include: { receiveRecord: true } },
        oaRecords: { orderBy: { createdAt: 'desc' } },
        payerAccount: true,
        payeeAccount: true,
      },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    return this.view(apply);
  }

  async create(dto: CreatePaymentPostingApplyDto, context: AccessContext) {
    // 校验客户
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, agentId: context.organizationId },
    });
    if (!customer) throw new BadRequestException('客户不存在或不属于当前组织');

    // 校验收款记录
    const receiveRecords = await this.prisma.receiveRecord.findMany({
      where: {
        id: { in: dto.paymentRecordIds },
        organizationId: context.organizationId,
        customerId: dto.customerId,
      },
    });
    if (receiveRecords.length !== dto.paymentRecordIds.length) {
      throw new BadRequestException('部分收款记录不存在或不属于该客户');
    }

    // 计算总金额
    const totalAmount = dto.details.reduce((sum, d) => sum + d.applyAmount, 0);
    const totalServiceFee = dto.details.reduce((sum, d) => sum + (d.serviceFeeAmount || 0), 0);

    // 校验可补款金额（已入账金额 - 已补款金额）
    const totalPosted = receiveRecords.reduce((sum, r) => sum + Number(r.postedAmount), 0);
    // 查询已补款金额
    const existingApplies = await this.prisma.paymentPostingApply.findMany({
      where: {
        organizationId: context.organizationId,
        customerId: dto.customerId,
        status: { in: ['REVIEWING', 'APPROVED', 'PAID', 'COMPLETED'] },
        receiveRecords: { some: { receiveRecordId: { in: dto.paymentRecordIds } } },
      },
      include: { receiveRecords: true },
    });
    const alreadyApplied = existingApplies.reduce((sum, a) => sum + Number(a.totalAmount), 0);
    const availableAmount = totalPosted - alreadyApplied;
    if (totalAmount > availableAmount) {
      throw new BadRequestException(`补款金额 ${totalAmount} 超过可补款金额 ${availableAmount}`);
    }

    const applyNo = this.generateApplyNo();

    const apply = await this.prisma.paymentPostingApply.create({
      data: {
        applyNo,
        organizationId: context.organizationId,
        customerId: dto.customerId,
        applyType: dto.applyType || 'RECHARGE',
        totalAmount,
        serviceFeeAmount: totalServiceFee,
        currency: 'CNY',
        payerAccountId: dto.payerAccountId,
        payeeAccountId: dto.payeeAccountId,
        paymentMethod: dto.paymentMethod,
        contractNo: dto.contractNo,
        remark: dto.remark,
        attachmentUrl: dto.attachmentUrl,
        status: 'DRAFT',
        createdBy: context.sub,
        details: {
          create: dto.details.map((d) => ({
            expenseTypeId: d.expenseTypeId,
            expenseType: d.expenseType || 'AD_RECHARGE',
            applyAmount: d.applyAmount,
            serviceFeeAmount: d.serviceFeeAmount || 0,
            remark: d.remark,
          })),
        },
        receiveRecords: {
          create: dto.paymentRecordIds.map((rid) => {
            const rr = receiveRecords.find((r) => r.id === rid);
            return {
              receiveRecordId: rid,
              amount: rr ? Number(rr.amount) : 0,
            };
          }),
        },
      },
      include: { details: true, receiveRecords: true },
    });

    return this.view(apply);
  }

  async update(id: string, dto: UpdatePaymentPostingApplyDto, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    if (apply.status !== 'DRAFT') throw new BadRequestException('只有草稿状态可以修改');
    if (apply.createdBy !== context.sub) throw new ForbiddenException('只能修改自己创建的申请');

    const updateData: any = {};
    if (dto.payerAccountId !== undefined) updateData.payerAccountId = dto.payerAccountId;
    if (dto.payeeAccountId !== undefined) updateData.payeeAccountId = dto.payeeAccountId;
    if (dto.paymentMethod !== undefined) updateData.paymentMethod = dto.paymentMethod;
    if (dto.remark !== undefined) updateData.remark = dto.remark;
    if (dto.attachmentUrl !== undefined) updateData.attachmentUrl = dto.attachmentUrl;

    if (dto.details) {
      const totalAmount = dto.details.reduce((sum, d) => sum + d.applyAmount, 0);
      const totalServiceFee = dto.details.reduce((sum, d) => sum + (d.serviceFeeAmount || 0), 0);
      updateData.totalAmount = totalAmount;
      updateData.serviceFeeAmount = totalServiceFee;

      await this.prisma.paymentPostingApplyDetail.deleteMany({ where: { applyId: id } });
      updateData.details = {
        create: dto.details.map((d) => ({
          expenseTypeId: d.expenseTypeId,
          expenseType: d.expenseType || 'AD_RECHARGE',
          applyAmount: d.applyAmount,
          serviceFeeAmount: d.serviceFeeAmount || 0,
          remark: d.remark,
        })),
      };
    }

    if (dto.paymentRecordIds) {
      await this.prisma.paymentPostingApplyReceiveRecord.deleteMany({ where: { applyId: id } });
      const receiveRecords = await this.prisma.receiveRecord.findMany({
        where: { id: { in: dto.paymentRecordIds } },
      });
      updateData.receiveRecords = {
        create: dto.paymentRecordIds.map((rid) => {
          const rr = receiveRecords.find((r) => r.id === rid);
          return { receiveRecordId: rid, amount: rr ? Number(rr.amount) : 0 };
        }),
      };
    }

    const updated = await this.prisma.paymentPostingApply.update({
      where: { id },
      data: updateData,
      include: { details: true, receiveRecords: true },
    });
    return this.view(updated);
  }

  async submit(id: string, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
      include: { details: true },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    if (apply.status !== 'DRAFT') throw new BadRequestException('只有草稿状态可以提交');
    if (apply.details.length === 0) throw new BadRequestException('请至少添加一条补款明细');

    const oaFlowNo = this.generateOaFlowNo();

    const [updated, oaRecord] = await this.prisma.$transaction([
      this.prisma.paymentPostingApply.update({
        where: { id },
        data: {
          status: 'REVIEWING',
          oaStatus: 'PROCESSING',
          oaFlowNo,
          submittedBy: context.sub,
          submittedAt: new Date(),
        },
        include: { details: true, receiveRecords: true },
      }),
      this.prisma.paymentPostingOaApply.create({
        data: {
          applyId: id,
          oaFlowNo,
          oaStatus: 'PROCESSING',
          oaType: 'PAYMENT_APPROVAL',
          applicantId: context.sub,
        },
      }),
    ]);

    return this.view(updated);
  }

  async approve(id: string, dto: PaymentPostingReviewDto, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    if (apply.status !== 'REVIEWING') throw new BadRequestException('只有审核中状态可以审核');

    const updated = await this.prisma.paymentPostingApply.update({
      where: { id },
      data: {
        status: 'APPROVED',
        oaStatus: 'APPROVED',
        approvedBy: context.sub,
        approvedAt: new Date(),
      },
      include: { details: true, receiveRecords: true },
    });

    // 更新OA记录
    await this.prisma.paymentPostingOaApply.updateMany({
      where: { applyId: id, oaStatus: 'PROCESSING' },
      data: { oaStatus: 'APPROVED', approverId: context.sub, approvedAt: new Date() },
    });

    return this.view(updated);
  }

  async reject(id: string, dto: PaymentPostingReviewDto, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    if (apply.status !== 'REVIEWING') throw new BadRequestException('只有审核中状态可以驳回');

    const updated = await this.prisma.paymentPostingApply.update({
      where: { id },
      data: {
        status: 'REJECTED',
        oaStatus: 'REJECTED',
        approvedBy: context.sub,
        approvedAt: new Date(),
        rejectReason: dto.rejectReason || dto.remark,
      },
      include: { details: true, receiveRecords: true },
    });

    await this.prisma.paymentPostingOaApply.updateMany({
      where: { applyId: id, oaStatus: 'PROCESSING' },
      data: { oaStatus: 'REJECTED', approverId: context.sub, approvedAt: new Date(), rejectReason: dto.rejectReason },
    });

    return this.view(updated);
  }

  async revoke(id: string, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    if (!['DRAFT', 'REVIEWING', 'REJECTED'].includes(apply.status)) {
      throw new BadRequestException('当前状态不允许撤销');
    }
    if (apply.createdBy !== context.sub) throw new ForbiddenException('只能撤销自己创建的申请');

    const updated = await this.prisma.paymentPostingApply.update({
      where: { id },
      data: { status: 'REVOKED', oaStatus: 'PENDING' },
      include: { details: true, receiveRecords: true },
    });
    return this.view(updated);
  }

  async pay(id: string, dto: PaymentPostingPayDto, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    if (apply.status !== 'APPROVED') throw new BadRequestException('只有审核通过状态可以付款');

    const actualPayAmount = Number(apply.totalAmount) - Number(apply.serviceFeeAmount);

    // 创建资金流水（公司账户扣款）
    let transactionId: string | undefined;
    if (dto.payerAccountId || apply.payerAccountId) {
      const accountId = dto.payerAccountId || apply.payerAccountId!;
      const account = await this.prisma.account.findUnique({ where: { id: accountId } });
      if (!account) throw new BadRequestException('付款账户不存在');

      const balanceBefore = Number(account.currentBalance);
      if (balanceBefore < actualPayAmount) {
        throw new BadRequestException(`账户余额不足，当前余额 ${balanceBefore}，需要支付 ${actualPayAmount}`);
      }

      const transactionNo = `TX${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const transaction = await this.prisma.transaction.create({
        data: {
          transactionNo,
          accountId,
          businessType: 'PAYMENT_POSTING',
          businessNo: apply.applyNo,
          changeAmount: -actualPayAmount,
          balanceBefore,
          balanceAfter: balanceBefore - actualPayAmount,
          operatorId: context.sub,
          remark: `补款申请付款 ${apply.applyNo}`,
        },
      });
      transactionId = transaction.id;

      // 更新账户余额
      await this.prisma.account.update({
        where: { id: accountId },
        data: { currentBalance: balanceBefore - actualPayAmount },
      });
    }

    const updated = await this.prisma.paymentPostingApply.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAmount: apply.totalAmount,
        actualPayAmount,
        paidBy: context.sub,
        paidAt: new Date(),
        receiptUrl: dto.receiptUrl,
        payerAccountId: dto.payerAccountId || apply.payerAccountId,
        transactionId,
      },
      include: { details: true, receiveRecords: true },
    });

    return this.view(updated);
  }

  async complete(id: string, dto: PaymentPostingCompleteDto, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    if (apply.status !== 'PAID') throw new BadRequestException('只有已付款状态可以完成');

    const updated = await this.prisma.paymentPostingApply.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedBy: context.sub,
        completedAt: new Date(),
      },
      include: { details: true, receiveRecords: true },
    });
    return this.view(updated);
  }

  async retryOa(id: string, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');
    if (apply.status !== 'REVIEWING') throw new BadRequestException('只有审核中状态可以重试OA');

    const oaFlowNo = this.generateOaFlowNo();
    const updated = await this.prisma.paymentPostingApply.update({
      where: { id },
      data: { oaFlowNo, oaStatus: 'RETRYING' },
      include: { details: true },
    });

    await this.prisma.paymentPostingOaApply.create({
      data: {
        applyId: id,
        oaFlowNo,
        oaStatus: 'RETRYING',
        oaType: 'PAYMENT_APPROVAL',
        applicantId: context.sub,
        retryCount: 1,
        lastRetryAt: new Date(),
      },
    });

    return this.view(updated);
  }

  async listOaRecords(applyId: string, context: AccessContext) {
    const apply = await this.prisma.paymentPostingApply.findFirst({
      where: { id: applyId, organizationId: context.organizationId },
    });
    if (!apply) throw new NotFoundException('补款申请不存在');

    const records = await this.prisma.paymentPostingOaApply.findMany({
      where: { applyId },
      orderBy: { createdAt: 'desc' },
      include: {
        applicant: { select: { id: true, displayName: true } },
        approver: { select: { id: true, displayName: true } },
      },
    });
    return records;
  }

  private view(row: any) {
    const result: any = { ...row };
    if (row.totalAmount) result.totalAmount = row.totalAmount.toString();
    if (row.paidAmount) result.paidAmount = row.paidAmount.toString();
    if (row.serviceFeeAmount) result.serviceFeeAmount = row.serviceFeeAmount.toString();
    if (row.actualPayAmount) result.actualPayAmount = row.actualPayAmount.toString();
    if (row.details) {
      result.details = row.details.map((d: any) => ({
        ...d,
        applyAmount: d.applyAmount?.toString(),
        paidAmount: d.paidAmount?.toString(),
        serviceFeeAmount: d.serviceFeeAmount?.toString(),
      }));
    }
    if (row.receiveRecords) {
      result.receiveRecords = row.receiveRecords.map((r: any) => ({
        ...r,
        amount: r.amount?.toString(),
      }));
    }
    return result;
  }
}
