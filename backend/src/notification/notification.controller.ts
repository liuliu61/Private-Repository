import { Controller, Get, Post, Query, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string; roles: string[]; permissions: string[]; departmentId?: string };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(
      req.user.sub,
      parseInt(page || '1'),
      parseInt(pageSize || '20'),
      status,
    );
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.service.countUnread(req.user.sub);
  }

  @Post('read-all')
  readAll(@Req() req: AuthenticatedRequest) {
    return this.service.markAllAsRead(req.user.sub);
  }

  @Post(':id/read')
  read(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.markAsRead(id, req.user.sub);
  }
}
