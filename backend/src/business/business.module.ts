import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { RebateModule } from '../rebate/rebate.module';
import { CashflowModule } from '../cashflow/cashflow.module';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { CustomerRebatePolicyService } from './customer-rebate-policy.service';
import { ProfitCalculator } from './profit.calculator';
import { SupplierRebatePolicyService } from './supplier-rebate-policy.service';
import { PolicyResolverService } from './policy-resolver.service';
import { ProcurementOrderService } from './procurement-order.service';
import { GrossProfitCalculator } from './gross-profit.calculator';
import { SupplierCostCalculator } from './supplier-cost.calculator';
import { PromotionAccountService } from './promotion-account.service';
import { FinanceController } from './finance.controller';
import { FinanceOverviewService } from './finance-overview.service';
import { RefundService } from './refund.service';
import { SettlementCenterService } from './settlement-center.service';
import { ReconciliationCenterService } from './reconciliation-center.service';
import { FinancialAdjustmentService } from './financial-adjustment.service';
import { CustomerWalletController } from './customer-wallet.controller';
import { CustomerWalletService } from './customer-wallet.service';
import { ReceivingController } from './receiving.controller';
import { ReceivingService } from './receiving.service';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { SourcingSettingService } from './sourcing-setting.service';
import { ServiceFeeReconciliationController } from './service-fee-reconciliation.controller';
import { ServiceFeeReconciliationService } from './service-fee-reconciliation.service';
import { InvoiceOcrController } from './invoice-ocr.controller';
import { InvoiceOcrService } from './invoice-ocr.service';

@Module({ imports: [PrismaModule, CommonModule, RebateModule, CashflowModule], controllers: [BusinessController, FinanceController, CustomerWalletController, ReceivingController, InvoiceController, InvoiceOcrController, ServiceFeeReconciliationController], providers: [BusinessService, CustomerRebatePolicyService, SupplierRebatePolicyService, PolicyResolverService, ProcurementOrderService, ProfitCalculator, GrossProfitCalculator, SupplierCostCalculator, PromotionAccountService, FinanceOverviewService, RefundService, SettlementCenterService, ReconciliationCenterService, FinancialAdjustmentService, CustomerWalletService, ReceivingService, InvoiceService, InvoiceOcrService, SourcingSettingService, ServiceFeeReconciliationService] })
export class BusinessModule {}
