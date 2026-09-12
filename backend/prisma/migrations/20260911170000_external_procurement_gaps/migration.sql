-- 外采订单差异补齐：交易方向、账户展示字段、客户钱包联动配置。
CREATE TYPE "PurchaseOrderTransactionType" AS ENUM ('TRANSFER_IN', 'TRANSFER_OUT');

CREATE TABLE "sourcing_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "use_customer_wallet" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sourcing_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sourcing_settings" ADD CONSTRAINT "sourcing_settings_organization_id_key" UNIQUE ("organization_id");
ALTER TABLE "sourcing_settings" ADD CONSTRAINT "sourcing_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
  ADD COLUMN "transaction_type" "PurchaseOrderTransactionType" NOT NULL DEFAULT 'TRANSFER_IN',
  ADD COLUMN "business_type" VARCHAR(50),
  ADD COLUMN "inbound_account_id" VARCHAR(100),
  ADD COLUMN "inbound_account_name" VARCHAR(120),
  ADD COLUMN "outbound_account_id" VARCHAR(100),
  ADD COLUMN "outbound_account_name" VARCHAR(120);

CREATE INDEX "purchase_orders_transaction_type_business_time_idx" ON "purchase_orders"("transaction_type", "business_time");
CREATE INDEX "purchase_orders_business_type_business_time_idx" ON "purchase_orders"("business_type", "business_time");
CREATE INDEX "purchase_orders_inbound_account_id_idx" ON "purchase_orders"("inbound_account_id");
CREATE INDEX "purchase_orders_outbound_account_id_idx" ON "purchase_orders"("outbound_account_id");
