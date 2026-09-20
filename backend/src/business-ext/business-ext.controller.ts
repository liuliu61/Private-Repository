import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { PaymentAccountService } from './payment-account.service';
import { ServiceFeeConfigService } from './service-fee-config.service';
import { PolicyChangeRequestService } from './policy-change.service';
import { ReceiveRefundService } from './receive-refund.service';
import {
  CreatePaymentAccountDto,
  UpdatePaymentAccountDto,
  ServiceFeeConfigDto,
  CreatePolicyChangeRequestDto,
  ApprovePolicyChangeDto,
  CreateReceiveRefundDto,
  ApproveReceiveRefundDto,
} from './business-ext.dto';

// 打款账户
@Controller('customer-payment-accounts')
export class PaymentAccountController {
  constructor(private readonly service: PaymentAccountService) {}

  @Get()
  findAll(@Query('customerId') customerId?: string) {
    return this.service.findAll(customerId);
  }

  @Get('match')
  matchByAccountNumber(@Query('accountNumber') accountNumber: string) {
    return this.service.findByAccountNumber(accountNumber);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePaymentAccountDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentAccountDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// 服务费配置
@Controller('service-fee-configs')
export class ServiceFeeConfigController {
  constructor(private readonly service: ServiceFeeConfigService) {}

  @Get()
  findAll(@Query('customerId') customerId?: string) {
    return this.service.findAll(customerId);
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.service.findByCustomer(customerId);
  }

  @Post()
  upsert(@Body() dto: ServiceFeeConfigDto) {
    return this.service.upsert(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// 政策变更申请
@Controller('policy-change-requests')
export class PolicyChangeRequestController {
  constructor(private readonly service: PolicyChangeRequestService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(parseInt(page || '1'), parseInt(pageSize || '20'), customerId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePolicyChangeRequestDto, @Req() req: any) {
    return this.service.create(dto, req.user?.userId || req.user?.id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApprovePolicyChangeDto, @Req() req: any) {
    return this.service.approve(id, req.user?.userId || req.user?.id, dto);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: any) {
    return this.service.reject(id, req.user?.userId || req.user?.id, body.reason);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// 收款单退款
@Controller('receive-refunds')
export class ReceiveRefundController {
  constructor(private readonly service: ReceiveRefundService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('receiveRecordId') receiveRecordId?: string,
  ) {
    return this.service.findAll(
      parseInt(page || '1'),
      parseInt(pageSize || '20'),
      customerId,
      status,
      receiveRecordId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateReceiveRefundDto, @Req() req: any) {
    return this.service.create(dto, req.user?.userId || req.user?.id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveReceiveRefundDto, @Req() req: any) {
    return this.service.approve(id, req.user?.userId || req.user?.id, dto);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: any) {
    return this.service.reject(id, req.user?.userId || req.user?.id, body.reason);
  }

  @Post(':id/execute')
  execute(@Param('id') id: string, @Req() req: any) {
    return this.service.execute(id, req.user?.userId || req.user?.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
