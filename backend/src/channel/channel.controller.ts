import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { ChannelService } from './channel.service';
import { CreateChannelDto, UpdateChannelDto, ChannelQueryDto } from './channel.dto';
import { AccessContext } from '../common/access-scope.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: AccessContext;
}

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelController {
  constructor(private readonly service: ChannelService) {}

  @Get()
  list(@Query() query: ChannelQueryDto, @Req() r: AuthenticatedRequest) {
    return this.service.list(query, r.user);
  }

  @Get('all')
  listAll(@Req() r: AuthenticatedRequest) {
    return this.service.listAll(r.user);
  }

  @Get(':id')
  getById(@Param('id') id: string, @Req() r: AuthenticatedRequest) {
    return this.service.getById(id, r.user);
  }

  @Post()
  create(@Body() dto: CreateChannelDto, @Req() r: AuthenticatedRequest) {
    return this.service.create(dto, r.user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChannelDto, @Req() r: AuthenticatedRequest) {
    return this.service.update(id, dto, r.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() r: AuthenticatedRequest) {
    return this.service.remove(id, r.user);
  }
}
