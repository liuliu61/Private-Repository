-- 第17阶段：客户钱包与钱包明细；本迁移文件仅创建，当前任务不执行迁移。
CREATE TYPE "CustomerWalletTransactionType" AS ENUM ('OPENING_BALANCE', 'ADJUSTMENT_RED', 'ADJUSTMENT_BLUE', 'MANUAL_ADJUSTMENT');

CREATE TABLE "customer_wallets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "wallet_name" VARCHAR(100) NOT NULL,
  "unit" "AccountUnit" NOT NULL DEFAULT 'ACCOUNT_CREDIT',
  "cash_balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "group_balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "credit_limit" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "credit_used" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "advance_outstanding" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_wallets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_wallets_credit_limit_check" CHECK ("credit_limit" >= 0),
  CONSTRAINT "customer_wallets_credit_used_check" CHECK ("credit_used" >= 0),
  CONSTRAINT "customer_wallets_advance_outstanding_check" CHECK ("advance_outstanding" >= 0)
);

CREATE TABLE "customer_wallet_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "transaction_no" VARCHAR(60) NOT NULL,
  "wallet_id" UUID NOT NULL,
  "unit" "AccountUnit" NOT NULL DEFAULT 'ACCOUNT_CREDIT',
  "business_type" "CustomerWalletTransactionType" NOT NULL,
  "business_no" VARCHAR(100),
  "change_amount" DECIMAL(20,2) NOT NULL,
  "balance_before" DECIMAL(20,2) NOT NULL,
  "balance_after" DECIMAL(20,2) NOT NULL,
  "operator_id" UUID NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remark" VARCHAR(255),
  "idempotency_key" VARCHAR(100),
  CONSTRAINT "customer_wallet_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_wallet_transactions_change_amount_check" CHECK ("change_amount" <> 0)
);

CREATE UNIQUE INDEX "customer_wallets_customer_id_key" ON "customer_wallets"("customer_id");
CREATE INDEX "customer_wallets_organization_id_status_idx" ON "customer_wallets"("organization_id", "status");
CREATE INDEX "customer_wallets_unit_status_idx" ON "customer_wallets"("unit", "status");
CREATE INDEX "customer_wallets_advance_outstanding_idx" ON "customer_wallets"("advance_outstanding");
CREATE UNIQUE INDEX "customer_wallet_transactions_transaction_no_key" ON "customer_wallet_transactions"("transaction_no");
CREATE UNIQUE INDEX "customer_wallet_transactions_idempotency_key_key" ON "customer_wallet_transactions"("idempotency_key");
CREATE INDEX "customer_wallet_transactions_wallet_id_occurred_at_idx" ON "customer_wallet_transactions"("wallet_id", "occurred_at");
CREATE INDEX "customer_wallet_transactions_business_type_occurred_at_idx" ON "customer_wallet_transactions"("business_type", "occurred_at");
CREATE INDEX "customer_wallet_transactions_business_no_idx" ON "customer_wallet_transactions"("business_no");
CREATE INDEX "customer_wallet_transactions_operator_id_idx" ON "customer_wallet_transactions"("operator_id");

ALTER TABLE "customer_wallets"
  ADD CONSTRAINT "customer_wallets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_wallets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_wallet_transactions"
  ADD CONSTRAINT "customer_wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "customer_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_wallet_transactions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
