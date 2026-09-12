import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CashflowService } from './cashflow.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountIdParamDto } from './dto/account-id-param.dto';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    username: string;
    roles: string[];
    permissions: string[];
  };
}

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly cashflowService: CashflowService) {}

  @Get(':id/balance')
  async getAccountBalance(@Param() params: AccountIdParamDto, @Req() request: AuthenticatedRequest) {
    const result = await this.cashflowService.getAccountBalance(params.id, request.user);
    return { accountId: result.accountId, balance: result.currentBalance };
  }

  @Get(':id/balance/check')
  getAccountBalanceCheck(@Param() params: AccountIdParamDto, @Req() request: AuthenticatedRequest) {
    return this.cashflowService.recalculateAccountBalance(params.id, request.user);
  }
}
