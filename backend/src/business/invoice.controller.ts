import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessIdParamDto, CreateInvoiceDto, CustomerIdParamDto, InvoiceQueryDto, InvoiceVoidDto, UpdateInvoiceDraftDto } from './business.dto';
import { InvoiceService } from './invoice.service';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller()
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get('invoices') list(@Query() query: InvoiceQueryDto, @Req() request: AuthenticatedRequest) { return this.service.list(query, request.user); }
  @Get('invoices/:id') getById(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getById(params.id, request.user); }
  @Post('invoices') create(@Body() dto: CreateInvoiceDto, @Req() request: AuthenticatedRequest) { return this.service.create(dto, request.user); }
  @Post('invoices/:id') updateDraft(@Param() params: BusinessIdParamDto, @Body() dto: UpdateInvoiceDraftDto, @Req() request: AuthenticatedRequest) { return this.service.updateDraft(params.id, dto, request.user); }
  @Post('invoices/:id/process') process(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.process(params.id, request.user); }
  @Post('invoices/:id/confirm') confirm(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.confirm(params.id, request.user); }
  @Post('invoices/:id/void') voidInvoice(@Param() params: BusinessIdParamDto, @Body() dto: InvoiceVoidDto, @Req() request: AuthenticatedRequest) { return this.service.voidInvoice(params.id, dto, request.user); }
  @Get('customers/:customerId/invoice-balance') getCustomerBalance(@Param() params: CustomerIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getCustomerBalance(params.customerId, request.user); }
}
