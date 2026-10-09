import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerContractDto, UpdateCustomerContractDto, ApproveContractDto } from './customer-contract.dto';
import { generateBusinessNo } from '../common/utils/business-no';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType, NotificationStatus } from '@prisma/client';

@Injectable()
export class CustomerContractService {
  constructor(private prisma: PrismaService, private notificationService: NotificationService) {}

  /**
   * 自动更新合同到期状态
   * - ACTIVE 且 30 天内到期 → EXPIRING
   * - ACTIVE/EXPIRING 且已过期 → EXPIRED
   */
  private async updateExpiryStatuses() {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // ACTIVE → EXPIRING（30天内到期）
    await this.prisma.customerContract.updateMany({
      where: { status: 'ACTIVE', expiryDate: { lte: thirtyDaysLater, gte: now } },
      data: { status: 'EXPIRING' },
    });

    // ACTIVE/EXPIRING → EXPIRED（已过到期日）
    await this.prisma.customerContract.updateMany({
      where: { status: { in: ['ACTIVE', 'EXPIRING'] }, expiryDate: { lt: now } },
      data: { status: 'EXPIRED' },
    });
  }

  /**
   * 合同到期提醒：给财务/管理员角色用户发送到期通知
   * 去重：同一天、同一用户、同一合同只通知一次
   */
  private async notifyExpiringContracts() {
    try {
      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const contracts = await this.prisma.customerContract.findMany({
        where: {
          status: { in: ['ACTIVE', 'EXPIRING'] },
          expiryDate: { lte: thirtyDaysLater, gte: now },
        },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { expiryDate: 'asc' },
      });
      if (contracts.length === 0) return;

      // 查询目标用户（财务/管理员）
      const users = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          userRoles: { some: { role: { code: { in: ['FINANCE', 'ADMIN', 'SUPER_ADMIN'] } } } },
        },
        select: { id: true },
      });
      if (users.length === 0) return;

      // 今日已发送的合同到期通知，用于去重
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const existing = await this.prisma.notification.findMany({
        where: { type: NotificationType.CONTRACT_EXPIRY, createdAt: { gte: todayStart } },
        select: { userId: true, content: true },
      });
      const sentSet = new Set<string>();
      for (const ex of existing) {
        // content 中包含 contractNo，用 userId|contractNo 标识
        const m = ex.content?.match(/合同编号：([A-Z0-9]+)/);
        if (m) sentSet.add(`${ex.userId}|${m[1]}`);
      }

      const toCreate: Array<{ userId: string; type: NotificationType; title: string; content: string; link: string }> = [];
      for (const c of contracts) {
        const days = Math.ceil((new Date(c.expiryDate!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        const content = `合同：${c.name}（编号：${c.contractNo}），客户：${c.customer?.name || '—'}，到期日：${new Date(c.expiryDate!).toISOString().slice(0, 10)}，剩余 ${days} 天。`;
        for (const u of users) {
          const key = `${u.id}|${c.contractNo}`;
          if (sentSet.has(key)) continue;
          toCreate.push({
            userId: u.id,
            type: NotificationType.CONTRACT_EXPIRY,
            title: '合同即将到期',
            content,
            link: 'customer-contracts',
          });
          sentSet.add(key);
        }
      }
      if (toCreate.length > 0) {
        await this.prisma.notification.createMany({ data: toCreate });
      }
    } catch (e) {
      console.warn('发送合同到期通知失败:', e);
    }
  }

  async findAll(page = 1, pageSize = 20, customerId?: string, status?: string, keyword?: string, departmentId?: string) {
    // 查询前自动更新到期状态
    await this.updateExpiryStatuses();
    // 异步触发到期通知（不阻塞查询响应）
    void this.notifyExpiringContracts();

    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (keyword) where.name = { contains: keyword };
    // 部门数据隔离：按客户的 departmentId 过滤
    if (departmentId) where.customer = { departmentId };
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
    // 先更新状态
    await this.updateExpiryStatuses();

    const now = new Date();
    const expiryDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.customerContract.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING'] },
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

  /**
   * 上传合同附件
   * 文件保存到 uploads/contracts/{yyyy}/{mm}/{uuid}_{filename}
   */
  async uploadAttachment(contractId: string, file: any, userId: string) {
    const contract = await this.prisma.customerContract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合同不存在');
    if (!file || !file.buffer) throw new BadRequestException('未接收到文件');

    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    // 创建目录
    const uploadDir = path.join(process.cwd(), 'uploads', 'contracts', yyyy, mm);
    fs.mkdirSync(uploadDir, { recursive: true });

    // 生成文件名：uuid + 原始扩展名
    const ext = path.extname(file.originalname);
    const storedName = `${randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, storedName);

    // 写入文件
    fs.writeFileSync(filePath, file.buffer);

    // 相对 URL
    const fileUrl = `/uploads/contracts/${yyyy}/${mm}/${storedName}`;

    const attachment = await this.prisma.customerContractAttachment.create({
      data: {
        contractId,
        fileName: file.originalname,
        fileUrl,
        fileSize: file.size,
        fileType: file.mimetype,
        uploadedBy: userId,
      },
    });

    return attachment;
  }

  /**
   * 删除合同附件
   */
  async deleteAttachment(contractId: string, attachmentId: string) {
    const attachment = await this.prisma.customerContractAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException('附件不存在');
    if (attachment.contractId !== contractId) throw new BadRequestException('附件不属于该合同');

    // 删除磁盘文件（最佳努力，失败不阻塞DB删除）
    try {
      const filePath = path.join(process.cwd(), attachment.fileUrl.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.warn('删除附件磁盘文件失败:', e);
    }

    await this.prisma.customerContractAttachment.delete({ where: { id: attachmentId } });
    return { success: true };
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
