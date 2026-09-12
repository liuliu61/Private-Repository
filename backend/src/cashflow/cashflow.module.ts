import { Module } from '@nestjs/common';
import { CashflowService } from './cashflow.service';
import { CashflowController } from './cashflow.controller';
import { AccountsController } from './accounts.controller';
import { CommonModule } from '../common/common.module';

@Module({ imports: [CommonModule], controllers: [CashflowController, AccountsController], providers: [CashflowService], exports: [CashflowService] })
export class CashflowModule {}
