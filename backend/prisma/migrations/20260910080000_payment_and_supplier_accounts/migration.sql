ALTER TYPE "TransactionBusinessType" ADD VALUE IF NOT EXISTS 'CUSTOMER_PAYMENT';
ALTER TYPE "TransactionBusinessType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT';

CREATE TYPE "SupplierAccountType" AS ENUM ('BANK', 'CASH', 'OTHER');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');
CREATE TYPE "PurchasePaymentType" AS ENUM ('CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT');

CREATE TABLE "supplier_accounts" (
  "id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "account_name" VARCHAR(100) NOT NULL,
  "account_type" "SupplierAccountType" NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
  "current_balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_accounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier_accounts" ADD CONSTRAINT "supplier_accounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "supplier_accounts_supplier_id_status_idx" ON "supplier_accounts"("supplier_id", "status");
CREATE INDEX "supplier_accounts_currency_status_idx" ON "supplier_accounts"("currency", "status");

ALTER TABLE "transactions" ALTER COLUMN "account_id" DROP NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "supplier_account_id" UUID;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_supplier_account_id_fkey" FOREIGN KEY ("supplier_account_id") REFERENCES "supplier_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "transactions_supplier_account_id_occurred_at_idx" ON "transactions"("supplier_account_id", "occurred_at");

ALTER TABLE "purchase_orders" ADD COLUMN "cost_difference" DECIMAL(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "customer_receivable" DECIMAL(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "customer_paid_amount" DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_orders" ADD COLUMN "customer_payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_payable" DECIMAL(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_paid_amount" DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

CREATE TABLE "purchase_order_payments" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "payment_type" "PurchasePaymentType" NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "business_no" VARCHAR(100) NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "company_transaction_no" VARCHAR(50),
  "supplier_transaction_no" VARCHAR(50),
  "operator_id" UUID NOT NULL,
  "remark" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_order_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "purchase_order_payments" ADD CONSTRAINT "purchase_order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_payments" ADD CONSTRAINT "purchase_order_payments_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "purchase_order_payments_order_id_payment_type_idempotency_key_key" ON "purchase_order_payments"("order_id", "payment_type", "idempotency_key");
CREATE INDEX "purchase_order_payments_order_id_payment_type_occurred_at_idx" ON "purchase_order_payments"("order_id", "payment_type", "occurred_at");
CREATE INDEX "purchase_order_payments_business_no_idx" ON "purchase_order_payments"("business_no");
