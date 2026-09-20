import { Body, Controller, UseGuards, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }
import { ConfirmServiceOrderDto, CreateServiceOrderDto, ServiceOrderIdParamDto, ServiceOrderListQueryDto, UpdateServiceOrderDto } from './service-order.dto';
import { ServiceOrderService } from './service-order.service';

@UseGuards(JwtAuthGuard)
@Controller('service-orders')
export class ServiceOrderController {
  constructor(private readonly service: ServiceOrderService) {}

  @Get()
  list(@Query() query: ServiceOrderListQueryDto, @Req() r: AuthenticatedRequest) {
    return this.service.list(query, r.user);
  }

  @Get(':id')
  getById(@Param() params: ServiceOrderIdParamDto, @Req() r: AuthenticatedRequest) {
    return this.service.getById(params.id, r.user);
  }

  @Post()
  create(@Body() dto: CreateServiceOrderDto, @Req() r: AuthenticatedRequest) {
    return this.service.create(dto, r.user);
  }

  @Put(':id')
  update(@Param() params: ServiceOrderIdParamDto, @Body() dto: UpdateServiceOrderDto, @Req() r: AuthenticatedRequest) {
    return this.service.update(params.id, dto, r.user);
  }

  @Post(':id/submit')
  submit(@Param() params: ServiceOrderIdParamDto, @Req() r: AuthenticatedRequest) {
    return this.service.submit(params.id, r.user);
  }

  @Post(':id/confirm')
  confirm(@Param() params: ServiceOrderIdParamDto, @Body() dto: ConfirmServiceOrderDto, @Req() r: AuthenticatedRequest) {
    return this.service.confirm(params.id, dto, r.user);
  }

  @Post(':id/cancel')
  cancel(@Param() params: ServiceOrderIdParamDto, @Req() r: AuthenticatedRequest) {
    return this.service.cancel(params.id, r.user);
  }
}
