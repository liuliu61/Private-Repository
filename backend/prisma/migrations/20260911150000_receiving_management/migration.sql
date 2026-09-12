-- 收款管理中心：银行原始交易、收款记录；本迁移文件仅创建，当前任务不执行迁移。
CREATE TYPE "BankTransactionDirection" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "BankTransactionStatus" AS ENUM ('UNPROCESSED', 'MATCHED', 'RECEIPT_CREATED', 'RECEIPT_CONFIRMED', 'IGNORED');
CREATE TYPE "ReceiveRecordStatus" AS ENUM ('PENDING_MATCH', 'PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "bank_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "transaction_no" VARCHAR(60) NOT NULL,
  "organization_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "booked_at" TIMESTAMP(3),
  "direction" "BankTransactionDirection" NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
  "counterparty_name" VARCHAR(120),
  "counterparty_account" VARCHAR(120),
  "summary" VARCHAR(255),
  "remark" VARCHAR(255),
  "source" VARCHAR(50) NOT NULL,
  "external_transaction_id" VARCHAR(150),
  "status" "BankTransactionStatus" NOT NULL DEFAULT 'UNPROCESSED',
  "matched_customer_id" UUID,
  "matched_purchase_order_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_transactions_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "receive_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "receive_no" VARCHAR(60) NOT NULL,
  "organization_id" UUID NOT NULL,
  "customer_id" UUID,
  "purchase_order_id" UUID,
  "account_id" UUID NOT NULL,
  "bank_transaction_id" UUID NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
  "received_at" TIMESTAMP(3) NOT NULL,
  "status" "ReceiveRecordStatus" NOT NULL DEFAULT 'PENDING_MATCH',
  "transaction_id" UUID,
  "created_by" UUID NOT NULL,
  "confirmed_by" UUID,
  "confirmed_at" TIMESTAMP(3),
  "remark" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receive_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receive_records_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "bank_transactions_transaction_no_key" ON "bank_transactions"("transaction_no");
CREATE UNIQUE INDEX "bank_transactions_account_external_id_key" ON "bank_transactions"("account_id", "external_transaction_id");
CREATE INDEX "bank_transactions_organization_occurred_status_idx" ON "bank_transactions"("organization_id", "occurred_at", "status");
CREATE INDEX "bank_transactions_account_occurred_idx" ON "bank_transactions"("account_id", "occurred_at");
CREATE INDEX "bank_transactions_direction_status_idx" ON "bank_transactions"("direction", "status");
CREATE INDEX "bank_transactions_counterparty_name_idx" ON "bank_transactions"("counterparty_name");
CREATE UNIQUE INDEX "receive_records_receive_no_key" ON "receive_records"("receive_no");
CREATE UNIQUE INDEX "receive_records_bank_transaction_id_key" ON "receive_records"("bank_transaction_id");
CREATE UNIQUE INDEX "receive_records_transaction_id_key" ON "receive_records"("transaction_id");
CREATE INDEX "receive_records_organization_status_received_idx" ON "receive_records"("organization_id", "status", "received_at");
CREATE INDEX "receive_records_customer_received_idx" ON "receive_records"("customer_id", "received_at");
CREATE INDEX "receive_records_purchase_order_idx" ON "receive_records"("purchase_order_id");
CREATE INDEX "receive_records_account_received_idx" ON "receive_records"("account_id", "received_at");

ALTER TABLE "bank_transactions"
  ADD CONSTRAINT "bank_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_transactions_matched_customer_id_fkey" FOREIGN KEY ("matched_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_transactions_matched_purchase_order_id_fkey" FOREIGN KEY ("matched_purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "bank_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receive_records"
  ADD CONSTRAINT "receive_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receive_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "receive_records_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "receive_records_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receive_records_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receive_records_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receive_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "receive_records_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
