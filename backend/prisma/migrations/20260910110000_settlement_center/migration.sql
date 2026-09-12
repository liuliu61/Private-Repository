-- 客户/一级代理结算中心；本迁移文件仅创建，当前任务不执行迁移。
CREATE TYPE "SettlementType" AS ENUM ('CUSTOMER', 'SUPPLIER');
ALTER TYPE "SettlementStatus" ADD VALUE IF NOT EXISTS 'GENERATED';
ALTER TYPE "SettlementStatus" ADD VALUE IF NOT EXISTS 'SETTLED';

ALTER TABLE "settlements"
  ADD COLUMN "settlement_type" "SettlementType" NOT NULL DEFAULT 'SUPPLIER',
  ADD COLUMN "customer_id" UUID,
  ADD COLUMN "supplier_id" UUID,
  ADD COLUMN "order_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customer_cash_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "customer_paid_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "customer_refund_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "net_customer_cash_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "customer_credit_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "supplier_cash_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "supplier_paid_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "supplier_credit_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "supplier_payable" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "gross_profit" DECIMAL(20,2),
  ADD COLUMN "realized_profit" DECIMAL(20,2);

DROP INDEX IF EXISTS "settlements_organization_id_period_start_period_end_key";
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "settlements_organization_id_settlement_type_status_period_idx" ON "settlements"("organization_id", "settlement_type", "status", "period_start", "period_end");
CREATE INDEX "settlements_organization_id_settlement_type_customer_period_idx" ON "settlements"("organization_id", "settlement_type", "customer_id", "period_start", "period_end");
CREATE INDEX "settlements_organization_id_settlement_type_supplier_period_idx" ON "settlements"("organization_id", "settlement_type", "supplier_id", "period_start", "period_end");
CREATE UNIQUE INDEX "settlements_customer_period_key" ON "settlements"("organization_id", "customer_id", "period_start", "period_end") WHERE "settlement_type" = 'CUSTOMER' AND "customer_id" IS NOT NULL;
CREATE UNIQUE INDEX "settlements_supplier_period_key" ON "settlements"("organization_id", "supplier_id", "period_start", "period_end") WHERE "settlement_type" = 'SUPPLIER' AND "supplier_id" IS NOT NULL;

ALTER TABLE "settlement_items"
  ADD COLUMN "settlement_type" "SettlementType" NOT NULL DEFAULT 'SUPPLIER',
  ADD COLUMN "customer_id" UUID,
  ADD COLUMN "supplier_id" UUID,
  ADD COLUMN "base_amount" DECIMAL(20,2),
  ADD COLUMN "cash_amount" DECIMAL(20,2),
  ADD COLUMN "credit_amount" DECIMAL(20,2),
  ADD COLUMN "refund_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "gross_profit" DECIMAL(20,2);

DROP INDEX IF EXISTS "settlement_items_order_id_key";
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "settlement_items_settlement_type_order_id_key" ON "settlement_items"("settlement_type", "order_id");
CREATE INDEX "settlement_items_customer_id_settlement_type_idx" ON "settlement_items"("customer_id", "settlement_type");
CREATE INDEX "settlement_items_supplier_id_settlement_type_idx" ON "settlement_items"("supplier_id", "settlement_type");
