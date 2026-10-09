import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessScopeService } from './access-scope.service';
import { ExportService } from './export.service';

@Module({ imports: [PrismaModule], providers: [AccessScopeService, ExportService], exports: [AccessScopeService, ExportService] })
export class CommonModule {}
