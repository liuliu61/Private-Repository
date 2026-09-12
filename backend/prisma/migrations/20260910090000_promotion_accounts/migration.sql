-- 推广账户币与人民币账户分离；本文件仅创建，当前任务不执行迁移。
CREATE TYPE "AccountUnit" AS ENUM ('CNY', 'ACCOUNT_CREDIT');

ALTER TABLE "supplier_accounts"
  ALTER COLUMN "currency" TYPE "AccountUnit"
  USING CASE WHEN "currency" = 'ACCOUNT_CREDIT' THEN 'ACCOUNT_CREDIT'::"AccountUnit" ELSE 'CNY'::"AccountUnit" END;

CREATE TYPE "PromotionAccountOwnerType" AS ENUM ('CUSTOMER', 'SUPPLIER');
CREATE TYPE "PromotionAccountUnit" AS ENUM ('ACCOUNT_CREDIT');
CREATE TYPE "PromotionTransactionBusinessType" AS ENUM ('CUSTOMER_CREDIT', 'SUPPLIER_CREDIT', 'ADJUSTMENT', 'OTHER');

CREATE TABLE "promotion_accounts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "owner_type" "PromotionAccountOwnerType" NOT NULL,
  "owner_id" UUID NOT NULL,
  "customer_id" UUID,
  "supplier_id" UUID,
  "account_name" VARCHAR(100) NOT NULL,
  "unit" "PromotionAccountUnit" NOT NULL DEFAULT 'ACCOUNT_CREDIT',
  "current_balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promotion_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promotion_transactions" (
  "id" UUID NOT NULL,
  "transaction_no" VARCHAR(50) NOT NULL,
  "promotion_account_id" UUID NOT NULL,
  "unit" "PromotionAccountUnit" NOT NULL DEFAULT 'ACCOUNT_CREDIT',
  "business_type" "PromotionTransactionBusinessType" NOT NULL,
  "business_no" VARCHAR(100) NOT NULL,
  "change_amount" DECIMAL(20,2) NOT NULL,
  "balance_before" DECIMAL(20,2) NOT NULL,
  "balance_after" DECIMAL(20,2) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "operator_id" UUID NOT NULL,
  "remark" VARCHAR(255),
  CONSTRAINT "promotion_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_order_credits" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "promotion_account_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "business_no" VARCHAR(100) NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "promotion_transaction_no" VARCHAR(50) NOT NULL,
  "operator_id" UUID NOT NULL,
  "remark" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_order_credits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "purchase_orders"
  ADD COLUMN "customer_promotion_account_id" UUID,
  ADD COLUMN "customer_credited_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "customer_credit_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

CREATE UNIQUE INDEX "promotion_transactions_transaction_no_key" ON "promotion_transactions"("transaction_no");
CREATE UNIQUE INDEX "purchase_order_credits_order_id_idempotency_key_key" ON "purchase_order_credits"("order_id", "idempotency_key");
CREATE INDEX "promotion_accounts_organization_id_status_idx" ON "promotion_accounts"("organization_id", "status");
CREATE INDEX "promotion_accounts_owner_type_owner_id_status_idx" ON "promotion_accounts"("owner_type", "owner_id", "status");
CREATE INDEX "promotion_accounts_customer_id_status_idx" ON "promotion_accounts"("customer_id", "status");
CREATE INDEX "promotion_accounts_supplier_id_status_idx" ON "promotion_accounts"("supplier_id", "status");
CREATE INDEX "promotion_transactions_promotion_account_id_occurred_at_idx" ON "promotion_transactions"("promotion_account_id", "occurred_at");
CREATE INDEX "promotion_transactions_business_type_occurred_at_idx" ON "promotion_transactions"("business_type", "occurred_at");
CREATE INDEX "promotion_transactions_business_no_idx" ON "promotion_transactions"("business_no");
CREATE INDEX "purchase_order_credits_promotion_account_id_occurred_at_idx" ON "purchase_order_credits"("promotion_account_id", "occurred_at");
CREATE INDEX "purchase_order_credits_business_no_idx" ON "purchase_order_credits"("business_no");

ALTER TABLE "promotion_accounts" ADD CONSTRAINT "promotion_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_accounts" ADD CONSTRAINT "promotion_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "promotion_accounts" ADD CONSTRAINT "promotion_accounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "promotion_transactions" ADD CONSTRAINT "promotion_transactions_promotion_account_id_fkey" FOREIGN KEY ("promotion_account_id") REFERENCES "promotion_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_transactions" ADD CONSTRAINT "promotion_transactions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_promotion_account_id_fkey" FOREIGN KEY ("customer_promotion_account_id") REFERENCES "promotion_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_order_credits" ADD CONSTRAINT "purchase_order_credits_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_credits" ADD CONSTRAINT "purchase_order_credits_promotion_account_id_fkey" FOREIGN KEY ("promotion_account_id") REFERENCES "promotion_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_credits" ADD CONSTRAINT "purchase_order_credits_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
