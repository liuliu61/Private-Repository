import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, page = 1, pageSize = 20, status?: string) {
    const where: any = { userId };
    if (status === 'UNREAD' || status === 'READ') where.status = status;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async countUnread(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, status: NotificationStatus.UNREAD },
    });
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { status: NotificationStatus.READ },
    });
    return { success: true };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, status: NotificationStatus.UNREAD },
      data: { status: NotificationStatus.READ },
    });
    return { success: true };
  }

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    content?: string,
    link?: string,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, content, link },
    });
  }

  /**
   * 给所有拥有指定角色的用户批量创建通知
   */
  async createForRoles(
    roleCodes: string[],
    type: NotificationType,
    title: string,
    content?: string,
    link?: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        userRoles: { some: { role: { code: { in: roleCodes } } } },
      },
      select: { id: true },
    });
    if (users.length === 0) return;
    await this.prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type, title, content, link })),
    });
  }
}
