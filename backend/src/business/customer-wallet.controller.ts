import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessIdParamDto, CreateCustomerWalletDto, CustomerWalletListQueryDto, CustomerWalletTransactionQueryDto, WalletAdvanceUpdateDto, WalletAdjustmentDto, WalletCreditUpdateDto, WalletOpeningBalanceDto } from './business.dto';
import { CustomerWalletService } from './customer-wallet.service';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller('customer-wallets')
@UseGuards(JwtAuthGuard)
export class CustomerWalletController {
  constructor(private readonly service: CustomerWalletService) {}

  @Get()
  list(@Query() query: CustomerWalletListQueryDto, @Req() request: AuthenticatedRequest) { return this.service.list(query, request.user); }

  @Post()
  create(@Body() dto: CreateCustomerWalletDto, @Req() request: AuthenticatedRequest) { return this.service.create(dto, request.user); }

  @Get(':id')
  getById(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.getById(params.id, request.user); }

  @Get(':id/transactions')
  transactions(@Param() params: BusinessIdParamDto, @Query() query: CustomerWalletTransactionQueryDto, @Req() request: AuthenticatedRequest) { return this.service.listTransactions(params.id, query, request.user); }

  @Get(':id/balance/check')
  checkBalance(@Param() params: BusinessIdParamDto, @Req() request: AuthenticatedRequest) { return this.service.checkBalance(params.id, request.user); }

  @Post(':id/opening-balance')
  openingBalance(@Param() params: BusinessIdParamDto, @Body() dto: WalletOpeningBalanceDto, @Req() request: AuthenticatedRequest) { return this.service.openingBalance(params.id, dto, request.user); }

  @Post(':id/adjust')
  adjust(@Param() params: BusinessIdParamDto, @Body() dto: WalletAdjustmentDto, @Req() request: AuthenticatedRequest) { return this.service.adjust(params.id, dto, request.user); }

  @Post(':id/credit')
  updateCredit(@Param() params: BusinessIdParamDto, @Body() dto: WalletCreditUpdateDto, @Req() request: AuthenticatedRequest) { return this.service.updateCredit(params.id, dto, request.user); }

  @Post(':id/advance')
  updateAdvance(@Param() params: BusinessIdParamDto, @Body() dto: WalletAdvanceUpdateDto, @Req() request: AuthenticatedRequest) { return this.service.updateAdvance(params.id, dto, request.user); }
}
