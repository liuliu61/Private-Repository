ALTER TYPE "RebateCalculationMode" ADD VALUE IF NOT EXISTS 'CASH_TO_CREDIT';
ALTER TYPE "RebateCalculationMode" ADD VALUE IF NOT EXISTS 'CREDIT_TO_CASH';

ALTER TABLE "rebate_rules" ADD COLUMN "calculation_mode" "RebateCalculationMode";
ALTER TABLE "customer_rebate_policy_versions" ADD COLUMN "calculation_mode" "RebateCalculationMode";
ALTER TABLE "supplier_rebate_policy_versions" ADD COLUMN "calculation_mode" "RebateCalculationMode";

ALTER TABLE "purchase_orders" ADD COLUMN "customer_calculation_mode" "RebateCalculationMode";
ALTER TABLE "purchase_orders" ADD COLUMN "customer_cash_amount" DECIMAL(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_calculation_mode" "RebateCalculationMode";
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_cash_amount" DECIMAL(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "operating_fee_rate" DECIMAL(10,4);
ALTER TABLE "purchase_orders" ADD COLUMN "operating_fee_amount" DECIMAL(20,2);
