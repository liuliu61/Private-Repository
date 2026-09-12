import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ServiceFeeReconciliationQueryDto } from './service-fee-reconciliation.dto';
import { ServiceFeeReconciliationService } from './service-fee-reconciliation.service';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller('service-fee-reconciliation')
@UseGuards(JwtAuthGuard)
export class ServiceFeeReconciliationController {
  constructor(private readonly service: ServiceFeeReconciliationService) {}
  @Get() list(@Query() query: ServiceFeeReconciliationQueryDto, @Req() request: AuthenticatedRequest) { return this.service.list(query, request.user); }
  @Get('export') async export(@Query() query: ServiceFeeReconciliationQueryDto, @Req() request: AuthenticatedRequest, @Res() response: Response) { const result = await this.service.export(query, request.user); response.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8'); response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`); response.send(result.content); }
  @Get(':id') detail(@Param('id') id: string, @Req() request: AuthenticatedRequest) { return this.service.getById(id, request.user); }
}
