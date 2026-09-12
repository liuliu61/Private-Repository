import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessScopeService } from './access-scope.service';

@Module({ imports: [PrismaModule], providers: [AccessScopeService], exports: [AccessScopeService] })
export class CommonModule {}
