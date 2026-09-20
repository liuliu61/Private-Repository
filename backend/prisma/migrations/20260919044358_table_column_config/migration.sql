/*
  Warnings:

  - You are about to drop the column `customer_id` on the `receive_postings` table. All the data in the column will be lost.
  - You are about to drop the column `service_fee` on the `service_order_receive_records` table. All the data in the column will be lost.
  - Added the required column `customerId` to the `receive_postings` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "ad_accounts" DROP CONSTRAINT "ad_accounts_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "ad_subjects" DROP CONSTRAINT "ad_subjects_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_rebate_policies" DROP CONSTRAINT "customer_rebate_policies_ad_account_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_rebate_policies" DROP CONSTRAINT "customer_rebate_policies_ad_subject_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_rebate_policies" DROP CONSTRAINT "customer_rebate_policies_created_by_fkey";

-- DropForeignKey
ALTER TABLE "customer_rebate_policies" DROP CONSTRAINT "customer_rebate_policies_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_rebate_policy_versions" DROP CONSTRAINT "customer_rebate_policy_versions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "financial_adjustments" DROP CONSTRAINT "financial_adjustments_account_id_fkey";

-- DropForeignKey
ALTER TABLE "financial_adjustments" DROP CONSTRAINT "financial_adjustments_promotion_account_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_account_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_purchase_order_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_receive_record_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_reviewed_by_fkey";

-- DropForeignKey
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_ad_account_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_ad_subject_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_cash_account_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_confirmed_by_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_customer_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_customer_policy_version_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_rule_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_policy_version_id_fkey";

-- DropForeignKey
ALTER TABLE "rebate_records" DROP CONSTRAINT "rebate_records_account_id_fkey";

-- DropForeignKey
ALTER TABLE "rebate_records" DROP CONSTRAINT "rebate_records_confirmed_by_fkey";

-- DropForeignKey
ALTER TABLE "receive_postings" DROP CONSTRAINT "receive_postings_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "receive_records" DROP CONSTRAINT "receive_records_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "reconciliations" DROP CONSTRAINT "reconciliations_account_id_fkey";

-- DropForeignKey
ALTER TABLE "reconciliations" DROP CONSTRAINT "reconciliations_completed_by_fkey";

-- DropForeignKey
ALTER TABLE "reconciliations" DROP CONSTRAINT "reconciliations_confirmed_by_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_purchase_order_id_fkey";

-- DropForeignKey
ALTER TABLE "settlement_items" DROP CONSTRAINT "settlement_items_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "settlement_items" DROP CONSTRAINT "settlement_items_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_confirmed_by_fkey";

-- DropForeignKey
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_rebate_policies" DROP CONSTRAINT "supplier_rebate_policies_ad_account_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_rebate_policies" DROP CONSTRAINT "supplier_rebate_policies_ad_subject_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_rebate_policies" DROP CONSTRAINT "supplier_rebate_policies_created_by_fkey";

-- DropForeignKey
ALTER TABLE "supplier_rebate_policies" DROP CONSTRAINT "supplier_rebate_policies_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_rebate_policies" DROP CONSTRAINT "supplier_rebate_policies_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "supplier_rebate_policy_versions" DROP CONSTRAINT "supplier_rebate_policy_versions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_account_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_supplier_account_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_voucher_id_fkey";

-- DropIndex
DROP INDEX "purchase_orders_supplier_account_id_idx";

-- AlterTable
ALTER TABLE "bank_transactions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "customer_wallet_transactions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "customer_wallets" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "financial_adjustments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "invoice_application_items" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "invoice_ocr_records" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "receive_postings" DROP COLUMN "customer_id",
ADD COLUMN     "customerId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "receive_records" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "service_order_receive_records" DROP COLUMN "service_fee",
ADD COLUMN     "serviceFee" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "amount" DROP NOT NULL;

-- CreateTable
CREATE TABLE "table_column_configs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "table_key" VARCHAR(100) NOT NULL,
    "columns" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_column_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "table_column_configs_user_id_idx" ON "table_column_configs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "table_column_configs_user_id_table_key_key" ON "table_column_configs"("user_id", "table_key");

-- CreateIndex
CREATE INDEX "payment_posting_oa_applies_oa_status_created_at_idx" ON "payment_posting_oa_applies"("oa_status", "created_at");

-- CreateIndex
CREATE INDEX "settlements_customer_id_period_start_period_end_idx" ON "settlements"("customer_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "settlements_supplier_id_period_start_period_end_idx" ON "settlements"("supplier_id", "period_start", "period_end");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_supplier_account_id_fkey" FOREIGN KEY ("supplier_account_id") REFERENCES "supplier_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rebate_policies" ADD CONSTRAINT "customer_rebate_policies_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rebate_policies" ADD CONSTRAINT "customer_rebate_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rebate_policies" ADD CONSTRAINT "customer_rebate_policies_ad_subject_id_fkey" FOREIGN KEY ("ad_subject_id") REFERENCES "ad_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rebate_policies" ADD CONSTRAINT "customer_rebate_policies_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rebate_policy_versions" ADD CONSTRAINT "customer_rebate_policy_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_ad_subject_id_fkey" FOREIGN KEY ("ad_subject_id") REFERENCES "ad_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_rebate_policy_versions" ADD CONSTRAINT "supplier_rebate_policy_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rebate_records" ADD CONSTRAINT "rebate_records_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rebate_records" ADD CONSTRAINT "rebate_records_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_promotion_account_id_fkey" FOREIGN KEY ("promotion_account_id") REFERENCES "promotion_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receive_records" ADD CONSTRAINT "receive_records_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receive_postings" ADD CONSTRAINT "receive_postings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_subjects" ADD CONSTRAINT "ad_subjects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_policy_id_fkey" FOREIGN KEY ("customer_policy_id") REFERENCES "customer_rebate_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_policy_version_id_fkey" FOREIGN KEY ("customer_policy_version_id") REFERENCES "customer_rebate_policy_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ad_subject_id_fkey" FOREIGN KEY ("ad_subject_id") REFERENCES "ad_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_policy_id_fkey" FOREIGN KEY ("supplier_policy_id") REFERENCES "supplier_rebate_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_policy_version_id_fkey" FOREIGN KEY ("supplier_policy_version_id") REFERENCES "supplier_rebate_policy_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rebate_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_column_configs" ADD CONSTRAINT "table_column_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "bank_transactions_account_external_id_key" RENAME TO "bank_transactions_account_id_external_transaction_id_key";

-- RenameIndex
ALTER INDEX "bank_transactions_account_occurred_idx" RENAME TO "bank_transactions_account_id_occurred_at_idx";

-- RenameIndex
ALTER INDEX "bank_transactions_organization_occurred_status_idx" RENAME TO "bank_transactions_organization_id_occurred_at_status_idx";

-- RenameIndex
ALTER INDEX "customer_rebate_policy_versions_effective_from_effective_to_sta" RENAME TO "customer_rebate_policy_versions_effective_from_effective_to_idx";

-- RenameIndex
ALTER INDEX "invoices_account_idx" RENAME TO "invoices_account_id_idx";

-- RenameIndex
ALTER INDEX "invoices_customer_status_created_idx" RENAME TO "invoices_customer_id_status_created_at_idx";

-- RenameIndex
ALTER INDEX "invoices_organization_status_created_idx" RENAME TO "invoices_organization_id_status_created_at_idx";

-- RenameIndex
ALTER INDEX "invoices_purchase_order_idx" RENAME TO "invoices_purchase_order_id_idx";

-- RenameIndex
ALTER INDEX "invoices_receive_record_idx" RENAME TO "invoices_receive_record_id_idx";

-- RenameIndex
ALTER INDEX "payment_posting_apply_receive_records_apply_id_receive_record_k" RENAME TO "payment_posting_apply_receive_records_apply_id_receive_reco_key";

-- RenameIndex
ALTER INDEX "purchase_order_payments_order_id_payment_type_idempotency_key_k" RENAME TO "purchase_order_payments_order_id_payment_type_idempotency_k_key";

-- RenameIndex
ALTER INDEX "purchase_orders_customer_policy_id_customer_policy_version_id_i" RENAME TO "purchase_orders_customer_policy_id_customer_policy_version__idx";

-- RenameIndex
ALTER INDEX "purchase_orders_supplier_policy_id_supplier_policy_version_id_i" RENAME TO "purchase_orders_supplier_policy_id_supplier_policy_version__idx";

-- RenameIndex
ALTER INDEX "receive_records_account_received_idx" RENAME TO "receive_records_account_id_received_at_idx";

-- RenameIndex
ALTER INDEX "receive_records_customer_received_idx" RENAME TO "receive_records_customer_id_received_at_idx";

-- RenameIndex
ALTER INDEX "receive_records_organization_status_received_idx" RENAME TO "receive_records_organization_id_status_received_at_idx";

-- RenameIndex
ALTER INDEX "receive_records_purchase_order_idx" RENAME TO "receive_records_purchase_order_id_idx";

-- RenameIndex
ALTER INDEX "reconciliations_organization_status_period_idx" RENAME TO "reconciliations_organization_id_status_period_start_period__idx";

-- RenameIndex
ALTER INDEX "reconciliations_promotion_account_id_period_start_period_end_ke" RENAME TO "reconciliations_promotion_account_id_period_start_period_en_key";

-- RenameIndex
ALTER INDEX "reconciliations_promotion_account_period_idx" RENAME TO "reconciliations_promotion_account_id_period_start_period_en_idx";

-- RenameIndex
ALTER INDEX "service_order_receive_records_service_order_id_receive_record_k" RENAME TO "service_order_receive_records_service_order_id_receive_reco_key";

-- RenameIndex
ALTER INDEX "settlements_organization_id_settlement_type_customer_period_idx" RENAME TO "settlements_organization_id_settlement_type_customer_id_per_idx";

-- RenameIndex
ALTER INDEX "settlements_organization_id_settlement_type_status_period_idx" RENAME TO "settlements_organization_id_settlement_type_status_period_s_idx";

-- RenameIndex
ALTER INDEX "settlements_organization_id_settlement_type_supplier_period_idx" RENAME TO "settlements_organization_id_settlement_type_supplier_id_per_idx";

-- RenameIndex
ALTER INDEX "supplier_rebate_policy_versions_effective_from_effective_to_sta" RENAME TO "supplier_rebate_policy_versions_effective_from_effective_to_idx";
