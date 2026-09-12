import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CashflowModule } from './cashflow/cashflow.module';
import { RebateModule } from './rebate/rebate.module';
import { CommonModule } from './common/common.module';
import { BusinessModule } from './business/business.module';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CommonModule, AuthModule, CashflowModule, RebateModule, BusinessModule] })
export class AppModule {}
