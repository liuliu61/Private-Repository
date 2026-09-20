import { Body, Controller, UseGuards, Delete, Get, Param, Put, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
interface AuthenticatedRequest extends Request { user: { sub: string; username: string; roles: string[]; permissions: string[] }; }
import { TableConfigService } from './table-config.service';

@UseGuards(JwtAuthGuard)
@Controller('table-config')
export class TableConfigController {
  constructor(private readonly service: TableConfigService) {}

  @Get(':tableKey')
  getConfig(@Param('tableKey') tableKey: string, @Req() r: AuthenticatedRequest) {
    return this.service.getConfig(tableKey, r.user);
  }

  @Put(':tableKey')
  saveConfig(@Param('tableKey') tableKey: string, @Body() body: { columns: unknown }, @Req() r: AuthenticatedRequest) {
    return this.service.saveConfig(tableKey, body.columns, r.user);
  }

  @Delete(':tableKey')
  resetConfig(@Param('tableKey') tableKey: string, @Req() r: AuthenticatedRequest) {
    return this.service.resetConfig(tableKey, r.user);
  }
}
