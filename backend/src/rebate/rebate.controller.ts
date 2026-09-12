import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RebateService } from './rebate.service';
import { CalculateRebateDto } from './dto/calculate-rebate.dto';
import { CreateRebateRuleDto } from './dto/create-rebate-rule.dto';
import { RebateIdParamDto } from './dto/rebate-id-param.dto';
import { RebateConfirmationService } from './rebate-confirmation.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string; roles: string[]; permissions: string[] };
}

@Controller()
@UseGuards(JwtAuthGuard)
export class RebateController {
  constructor(private readonly rebateService: RebateService, private readonly confirmationService: RebateConfirmationService) {}

  @Get('rebate-rules')
  getRules(@Req() request: AuthenticatedRequest) {
    return this.rebateService.getRules(request.user);
  }

  @Post('rebate-rules')
  createRule(@Body() dto: CreateRebateRuleDto, @Req() request: AuthenticatedRequest) {
    return this.rebateService.createRule(dto, request.user);
  }

  @Post('rebates/calculate')
  calculate(@Body() dto: CalculateRebateDto, @Req() request: AuthenticatedRequest) {
    return this.rebateService.calculate(dto, request.user);
  }

  @Post('rebates/:id/confirm')
  confirm(@Param() params: RebateIdParamDto, @Req() request: AuthenticatedRequest) {
    return this.confirmationService.confirm(params.id, request.user);
  }
}
