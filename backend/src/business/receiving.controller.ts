import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BankTransactionMatchDto, BankTransactionQueryDto, BusinessIdParamDto, CreateReceiveRecordDto, CreateReceiveRefundDto, ImportBankTransactionsDto, ReceivePostingDto, ReceiveRecordQueryDto } from './business.dto';
import { ReceivingService } from './receiving.service';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller()
@UseGuards(JwtAuthGuard)
export class ReceivingController {
  constructor(private readonly service: ReceivingService) {}

  @Get('bank-transactions') listBankTransactions(@Query() query: BankTransactionQueryDto, @Req() request: AuthenticatedRequest) { return this.service.listBankTransactions(query, request.user); }
  @Get('bank-transactions/:id') getBankTransaction(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getBankTransaction(params.id, request.user); }
  @Post('bank-transactions/import') importBankTransactions(@Body() dto: ImportBankTransactionsDto, @Req() request: AuthenticatedRequest) { return this.service.importBankTransactions(dto, request.user); }
  @Post('bank-transactions/:id/confirm') confirmBankTransaction(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.confirmBankTransaction(params.id, request.user); }
  @Post('bank-transactions/:id/match') matchBankTransaction(@Param() params: BusinessIdParamDto, @Body() dto: BankTransactionMatchDto, @Req() request: AuthenticatedRequest) { return this.service.matchBankTransaction(params.id, dto, request.user); }
  @Post('bank-transactions/:id/unmatch') unmatchBankTransaction(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.unmatchBankTransaction(params.id, request.user); }

  @Get('receive-records') listReceiveRecords(@Query() query: ReceiveRecordQueryDto, @Req() request: AuthenticatedRequest) { return this.service.listReceiveRecords(query, request.user); }
  @Get('receive-records/:id') getReceiveRecord(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getReceiveRecord(params.id, request.user); }
  @Post('receive-records') createReceiveRecord(@Body() dto: CreateReceiveRecordDto, @Req() request: AuthenticatedRequest) { return this.service.createReceiveRecord(dto, request.user); }
  @Post('receive-records/:id/confirm') confirmReceiveRecord(@Param() params: BusinessIdParamDto, @Body() dto: ReceivePostingDto, @Req() request: AuthenticatedRequest) { return this.service.confirmReceiveRecord(params.id, dto, request.user); }
  @Post('receive-records/:id/refund') refundReceiveRecord(@Param() params: BusinessIdParamDto, @Body() dto: CreateReceiveRefundDto, @Req() request: AuthenticatedRequest) { return this.service.refundReceiveRecord(params.id, dto, request.user); }
}
