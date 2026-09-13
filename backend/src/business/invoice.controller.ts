import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessIdParamDto, CreateInvoiceApplicationDto, CreateInvoiceDto, CustomerIdParamDto, InvoiceQueryDto, InvoiceReviewDto, InvoiceVoidDto, UpdateInvoiceApplicationDto, UpdateInvoiceDraftDto } from './business.dto';
import { InvoiceService } from './invoice.service';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller()
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get('invoices/applications') listApplications(@Query() query: InvoiceQueryDto, @Req() request: AuthenticatedRequest) { return this.service.listApplications(query, request.user); }
  @Get('invoices/applications/:id') getApplication(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getApplicationById(params.id, request.user); }
  @Post('invoices/applications') createApplication(@Body() dto: CreateInvoiceApplicationDto, @Req() request: AuthenticatedRequest) { return this.service.createApplication(dto, request.user); }
  @Patch('invoices/applications/:id') updateApplication(@Param() params: BusinessIdParamDto, @Body() dto: UpdateInvoiceApplicationDto, @Req() request: AuthenticatedRequest) { return this.service.updateApplication(params.id, dto, request.user); }
  @Post('invoices/applications/:id/submit') submitApplication(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.submitApplication(params.id, request.user); }
  @Post('invoices/applications/:id/approve') approveApplication(@Param() params: BusinessIdParamDto, @Body() dto: InvoiceReviewDto, @Req() request: AuthenticatedRequest) { return this.service.approveApplication(params.id, dto, request.user); }
  @Post('invoices/applications/:id/reject') rejectApplication(@Param() params: BusinessIdParamDto, @Body() dto: InvoiceReviewDto, @Req() request: AuthenticatedRequest) { return this.service.rejectApplication(params.id, dto, request.user); }
  @Post('invoices/applications/:id/revoke') revokeApplication(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.revokeApplication(params.id, request.user); }
  @Get('invoices') list(@Query() query: InvoiceQueryDto, @Req() request: AuthenticatedRequest) { return this.service.list(query, request.user); }
  @Get('invoices/:id') getById(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getById(params.id, request.user); }
  @Post('invoices') create(@Body() dto: CreateInvoiceDto, @Req() request: AuthenticatedRequest) { return this.service.create(dto, request.user); }
  @Post('invoices/:id') updateDraft(@Param() params: BusinessIdParamDto, @Body() dto: UpdateInvoiceDraftDto, @Req() request: AuthenticatedRequest) { return this.service.updateDraft(params.id, dto, request.user); }
  @Post('invoices/:id/process') process(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.process(params.id, request.user); }
  @Post('invoices/:id/confirm') confirm(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.confirm(params.id, request.user); }
  @Post('invoices/:id/void') voidInvoice(@Param() params: BusinessIdParamDto, @Body() dto: InvoiceVoidDto, @Req() request: AuthenticatedRequest) { return this.service.voidInvoice(params.id, dto, request.user); }
  @Get('customers/:customerId/invoice-balance') getCustomerBalance(@Param() params: CustomerIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getCustomerBalance(params.customerId, request.user); }
}
