import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { CustomerContractService } from './customer-contract.service';
import { CreateCustomerContractDto, UpdateCustomerContractDto, ApproveContractDto } from './customer-contract.dto';

@Controller('customer-contracts')
export class CustomerContractController {
  constructor(private readonly contractService: CustomerContractService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.contractService.findAll(
      parseInt(page || '1'),
      parseInt(pageSize || '20'),
      customerId,
      status,
      keyword,
    );
  }

  @Get('expiring')
  findExpiring(@Query('days') days?: string) {
    return this.contractService.findExpiring(parseInt(days || '30'));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerContractDto, @Req() req: any) {
    return this.contractService.create(dto, req.user?.userId || req.user?.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerContractDto) {
    return this.contractService.update(id, dto);
  }

  @Post(':id/submit')
  submitForApproval(@Param('id') id: string) {
    return this.contractService.submitForApproval(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveContractDto, @Req() req: any) {
    return this.contractService.approve(id, req.user?.userId || req.user?.id, dto);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: any) {
    return this.contractService.reject(id, req.user?.userId || req.user?.id, body.reason);
  }

  @Post(':id/terminate')
  terminate(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.contractService.terminate(id, body.reason);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contractService.remove(id);
  }
}
