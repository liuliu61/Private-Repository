import { Module } from '@nestjs/common';
import { RebateCalculator } from './rebate.calculator';
import { RebateController } from './rebate.controller';
import { RebateService } from './rebate.service';
import { CashflowModule } from '../cashflow/cashflow.module';
import { RebateConfirmationService } from './rebate-confirmation.service';
import { CommonModule } from '../common/common.module';

@Module({ imports: [CashflowModule, CommonModule], controllers: [RebateController], providers: [RebateCalculator, RebateService, RebateConfirmationService], exports: [RebateService, RebateCalculator, RebateConfirmationService] })
export class RebateModule {}
