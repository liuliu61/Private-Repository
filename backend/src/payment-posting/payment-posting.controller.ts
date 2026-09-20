import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PaymentPostingService } from './payment-posting.service';
import { AccessContext } from '../common/access-scope.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreatePaymentPostingApplyDto,
  UpdatePaymentPostingApplyDto,
  PaymentPostingReviewDto,
  PaymentPostingPayDto,
  PaymentPostingCompleteDto,
  ListPaymentPostingQueryDto,
} from './payment-posting.dto';

interface AuthenticatedRequest extends Request {
  user: AccessContext;
}

@Controller('payment-posting')
@UseGuards(JwtAuthGuard)
export class PaymentPostingController {
  constructor(private readonly service: PaymentPostingService) {}

  @Get('applies')
  list(@Query() query: ListPaymentPostingQueryDto, @Req() req: AuthenticatedRequest) {
    return this.service.list(query, req.user);
  }

  @Get('applies/:id')
  getById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getById(id, req.user);
  }

  @Post('applies')
  create(@Body() dto: CreatePaymentPostingApplyDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(dto, req.user);
  }

  @Patch('applies/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentPostingApplyDto, @Req() req: AuthenticatedRequest) {
    return this.service.update(id, dto, req.user);
  }

  @Post('applies/:id/submit')
  submit(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.submit(id, req.user);
  }

  @Post('applies/:id/approve')
  approve(@Param('id') id: string, @Body() dto: PaymentPostingReviewDto, @Req() req: AuthenticatedRequest) {
    return this.service.approve(id, dto, req.user);
  }

  @Post('applies/:id/reject')
  reject(@Param('id') id: string, @Body() dto: PaymentPostingReviewDto, @Req() req: AuthenticatedRequest) {
    return this.service.reject(id, dto, req.user);
  }

  @Post('applies/:id/revoke')
  revoke(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.revoke(id, req.user);
  }

  @Post('applies/:id/pay')
  pay(@Param('id') id: string, @Body() dto: PaymentPostingPayDto, @Req() req: AuthenticatedRequest) {
    return this.service.pay(id, dto, req.user);
  }

  @Post('applies/:id/complete')
  complete(@Param('id') id: string, @Body() dto: PaymentPostingCompleteDto, @Req() req: AuthenticatedRequest) {
    return this.service.complete(id, dto, req.user);
  }

  @Post('applies/:id/retry-oa')
  retryOa(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.retryOa(id, req.user);
  }

  @Get('applies/:id/oa-records')
  listOaRecords(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.listOaRecords(id, req.user);
  }
}
