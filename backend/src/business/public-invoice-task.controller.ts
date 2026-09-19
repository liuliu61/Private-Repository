import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessIdParamDto, CompleteInvoiceTaskDto, CreateCustomerInvoiceProfileDto, InvoiceTaskQueryDto, InvoiceTaskRejectDto, InvoiceTaskReviewDto, UpdateCustomerInvoiceProfileDto, UpdateInvoiceTaskDto } from './business.dto';
import { PublicInvoiceTaskService } from './public-invoice-task.service';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller()
@UseGuards(JwtAuthGuard)
export class PublicInvoiceTaskController {
  constructor(private readonly service: PublicInvoiceTaskService) {}

  @Get('invoice-tasks') list(@Query() query: InvoiceTaskQueryDto, @Req() request: AuthenticatedRequest) { return this.service.list(query, request.user); }
  @Get('invoice-tasks/:id') get(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.get(params.id, request.user); }
  @Patch('invoice-tasks/:id') update(@Param() params: BusinessIdParamDto, @Body() dto: UpdateInvoiceTaskDto, @Req() request: AuthenticatedRequest) { return this.service.update(params.id, dto, request.user); }
  @Post('invoice-tasks/:id/submit') submit(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.submit(params.id, request.user); }
  @Post('invoice-tasks/:id/approve') approve(@Param() params: BusinessIdParamDto, @Body() dto: InvoiceTaskReviewDto, @Req() request: AuthenticatedRequest) { return this.service.approve(params.id, dto, request.user); }
  @Post('invoice-tasks/:id/reject') reject(@Param() params: BusinessIdParamDto, @Body() dto: InvoiceTaskRejectDto, @Req() request: AuthenticatedRequest) { return this.service.reject(params.id, dto, request.user); }
  @Post('invoice-tasks/:id/revoke') revoke(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.revoke(params.id, request.user); }
  @Post('invoice-tasks/:id/complete') complete(@Param() params: BusinessIdParamDto, @Body() dto: CompleteInvoiceTaskDto, @Req() request: AuthenticatedRequest) { return this.service.complete(params.id, dto, request.user); }

  @Get('customers/:customerId/invoice-profiles') profiles(@Param('customerId') customerId: string, @Req() request: AuthenticatedRequest) { return this.service.listProfiles(customerId, request.user); }
  @Post('customers/:customerId/invoice-profiles') createProfile(@Param('customerId') customerId: string, @Body() dto: CreateCustomerInvoiceProfileDto, @Req() request: AuthenticatedRequest) { return this.service.createProfile(customerId, dto, request.user); }
  @Patch('customers/:customerId/invoice-profiles/:id') updateProfile(@Param('customerId') customerId: string, @Param('id') id: string, @Body() dto: UpdateCustomerInvoiceProfileDto, @Req() request: AuthenticatedRequest) { return this.service.updateProfile(customerId, id, dto, request.user); }
  @Delete('customers/:customerId/invoice-profiles/:id') deleteProfile(@Param('customerId') customerId: string, @Param('id') id: string, @Req() request: AuthenticatedRequest) { return this.service.deleteProfile(customerId, id, request.user); }
}
