import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceOverviewService } from './finance-overview.service';
import { FinanceCustomerQueryDto, FinanceDateQueryDto, FinanceOrderProfitQueryDto, FinanceSupplierQueryDto } from './finance-overview.dto';
import { CustomerIdParamDto, SupplierIdParamDto } from './business.dto';

interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly service: FinanceOverviewService) {}

  @Get('overview') overview(@Query() query: FinanceDateQueryDto, @Req() request: AuthenticatedRequest) { return this.service.getOverview(query, request.user); }
  @Get('customers/:customerId') customer(@Param() params: CustomerIdParamDto, @Query() query: FinanceCustomerQueryDto, @Req() request: AuthenticatedRequest) { return this.service.getCustomer(params.customerId, query, request.user); }
  @Get('suppliers/:supplierId') supplier(@Param() params: SupplierIdParamDto, @Query() query: FinanceSupplierQueryDto, @Req() request: AuthenticatedRequest) { return this.service.getSupplier(params.supplierId, query, request.user); }
  @Get('orders/profit') orderProfit(@Query() query: FinanceOrderProfitQueryDto, @Req() request: AuthenticatedRequest) { return this.service.getOrderProfit(query, request.user); }
}
