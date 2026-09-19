import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CashflowModule } from './cashflow/cashflow.module';
import { RebateModule } from './rebate/rebate.module';
import { CommonModule } from './common/common.module';
import { BusinessModule } from './business/business.module';
import { PaymentPostingModule } from './payment-posting/payment-posting.module';
import { AppController } from './app.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CommonModule, AuthModule, CashflowModule, RebateModule, BusinessModule, PaymentPostingModule],
  controllers: [AppController],
})
export class AppModule {}
