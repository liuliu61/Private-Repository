import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessIdParamDto, RechargePaymentApplicationQueryDto, RejectRechargePaymentApplicationDto, SubmitRechargePaymentApplicationDto, UpdateRechargePaymentApplicationDto } from './business.dto';
import { RechargePaymentService } from './recharge-payment.service';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller('recharge-payment-applications')
@UseGuards(JwtAuthGuard)
export class RechargePaymentController {
  constructor(private readonly service: RechargePaymentService) {}
  @Get() list(@Query() query: RechargePaymentApplicationQueryDto, @Req() request: AuthenticatedRequest) { return this.service.list(query, request.user); }
  @Get(':id') getById(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getById(params.id, request.user); }
  @Post('submit') submitNew(@Body() dto: SubmitRechargePaymentApplicationDto, @Req() request: AuthenticatedRequest) { return this.service.submitNew(dto, request.user); }
  @Post(':id') update(@Param() params: BusinessIdParamDto, @Body() dto: UpdateRechargePaymentApplicationDto, @Req() request: AuthenticatedRequest) { return this.service.updateDraft(params.id, dto, request.user); }
  @Post(':id/submit') submit(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.submit(params.id, request.user); }
  @Post(':id/cancel') cancel(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.cancel(params.id, request.user); }
  @Post(':id/approve') approve(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.approve(params.id, request.user); }
  @Post(':id/reject') reject(@Param() params: BusinessIdParamDto, @Body() dto: RejectRechargePaymentApplicationDto, @Req() request: AuthenticatedRequest) { return this.service.reject(params.id, dto, request.user); }
}
