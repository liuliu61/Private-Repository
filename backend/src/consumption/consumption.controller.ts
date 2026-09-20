import { Body, Controller, UseGuards, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }
import { ConsumptionIdParamDto, ConsumptionListQueryDto, CreateConsumptionDto } from './consumption.dto';
import { ConsumptionService } from './consumption.service';

@UseGuards(JwtAuthGuard)
@Controller('consumption')
export class ConsumptionController {
  constructor(private readonly service: ConsumptionService) {}

  @Get('overview')
  overview(@Req() r: AuthenticatedRequest) {
    return this.service.overview(r.user);
  }

  @Get('records')
  list(@Query() query: ConsumptionListQueryDto, @Req() r: AuthenticatedRequest) {
    return this.service.list(query, r.user);
  }

  @Post('records')
  create(@Body() dto: CreateConsumptionDto, @Req() r: AuthenticatedRequest) {
    return this.service.create(dto, r.user);
  }

  @Delete('records/:id')
  delete(@Param() params: ConsumptionIdParamDto, @Req() r: AuthenticatedRequest) {
    return this.service.delete(params.id, r.user);
  }
}
