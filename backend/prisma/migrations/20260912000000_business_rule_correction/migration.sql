CREATE TYPE "CustomerWalletType" AS ENUM ('FINANCE_V', 'EXTERNAL_PROCUREMENT');
CREATE TYPE "ReceivePostingStatus" AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE "ReceiveInvoiceStatus" AS ENUM ('UNISSUED', 'PARTIAL', 'ISSUED');

ALTER TYPE "CustomerWalletTransactionType" ADD VALUE IF NOT EXISTS 'RECEIVE_POSTING';
ALTER TYPE "CustomerWalletTransactionType" ADD VALUE IF NOT EXISTS 'RECEIVE_REFUND';
ALTER TYPE "BankTransactionStatus" ADD VALUE IF NOT EXISTS 'CONFIRMING';

ALTER TABLE "customer_wallets" ADD COLUMN "wallet_type" "CustomerWalletType" NOT NULL DEFAULT 'FINANCE_V';
UPDATE "customer_wallets" SET "wallet_type" = 'EXTERNAL_PROCUREMENT' WHERE "unit" = 'ACCOUNT_CREDIT';
UPDATE "customer_wallets" SET "unit" = 'CNY' WHERE "wallet_type" = 'EXTERNAL_PROCUREMENT';
DROP INDEX IF EXISTS "customer_wallets_customer_id_key";
CREATE UNIQUE INDEX "customer_wallets_customer_id_wallet_type_key" ON "customer_wallets"("customer_id", "wallet_type");
CREATE INDEX "customer_wallets_customer_id_organization_id_wallet_type_idx" ON "customer_wallets"("customer_id", "organization_id", "wallet_type");

ALTER TABLE "receive_records"
  ADD COLUMN "posted_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "service_fee_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "wallet_credit_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "invoice_eligible_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "invoice_status" "ReceiveInvoiceStatus" NOT NULL DEFAULT 'UNISSUED';

CREATE TABLE "receive_postings" (
  "id" UUID NOT NULL,
  "posting_no" VARCHAR(60) NOT NULL,
  "organization_id" UUID NOT NULL,
  "receive_record_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "payment_amount" DECIMAL(20,2) NOT NULL,
  "refund_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "service_fee_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "wallet_credit_amount" DECIMAL(20,2) NOT NULL,
  "invoice_eligible_amount" DECIMAL(20,2) NOT NULL,
  "status" "ReceivePostingStatus" NOT NULL DEFAULT 'POSTED',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remark" VARCHAR(255),
  CONSTRAINT "receive_postings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "receive_postings_posting_no_key" ON "receive_postings"("posting_no");
CREATE INDEX "receive_postings_organization_id_created_at_idx" ON "receive_postings"("organization_id", "created_at");
CREATE INDEX "receive_postings_receive_record_id_created_at_idx" ON "receive_postings"("receive_record_id", "created_at");
ALTER TABLE "receive_postings" ADD CONSTRAINT "receive_postings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receive_postings" ADD CONSTRAINT "receive_postings_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receive_postings" ADD CONSTRAINT "receive_postings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receive_postings" ADD CONSTRAINT "receive_postings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "receive_service_fees" (
  "id" UUID NOT NULL,
  "receive_record_id" UUID NOT NULL,
  "business_type" VARCHAR(50) NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "remark" VARCHAR(255),
  "operator_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receive_service_fees_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "receive_service_fees_receive_record_id_created_at_idx" ON "receive_service_fees"("receive_record_id", "created_at");
ALTER TABLE "receive_service_fees" ADD CONSTRAINT "receive_service_fees_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receive_service_fees" ADD CONSTRAINT "receive_service_fees_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD COLUMN "supplier_account_id" UUID;
CREATE INDEX "purchase_orders_supplier_account_id_idx" ON "purchase_orders"("supplier_account_id");
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_account_id_fkey" FOREIGN KEY ("supplier_account_id") REFERENCES "supplier_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refunds" ALTER COLUMN "purchase_order_id" DROP NOT NULL;
ALTER TABLE "refunds" ADD COLUMN "receive_record_id" UUID;
DROP INDEX IF EXISTS "refunds_purchase_order_id_idempotency_key_key";
CREATE UNIQUE INDEX "refunds_purchase_order_id_idempotency_key_key" ON "refunds"("purchase_order_id", "idempotency_key");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
