import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TransactionBusinessType } from '@prisma/client';
import { CashflowService } from './cashflow.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { GetTransactionsDto } from './dto/get-transactions.dto';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    username: string;
    roles: string[];
    permissions: string[];
  };
}

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class CashflowController {
  constructor(private readonly cashflowService: CashflowService) {}

  @Post()
  createTransaction(@Body() dto: CreateTransactionDto, @Req() request: AuthenticatedRequest) {
    return this.cashflowService.createTransaction({
      accountId: dto.accountId,
      businessType: dto.businessType as TransactionBusinessType,
      businessNo: dto.businessNo,
      changeAmount: dto.changeAmount,
      operatorId: request.user.sub,
      remark: dto.remark,
      accessContext: request.user,
    });
  }

  @Get()
  getTransactions(@Query() query: GetTransactionsDto, @Req() request: AuthenticatedRequest) {
    return this.cashflowService.getTransactions({
      accountId: query.accountId,
      businessType: query.businessType,
      businessNo: query.businessNo,
      transactionNo: query.transactionNo,
      operatorId: query.operatorId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    }, request.user);
  }
}
