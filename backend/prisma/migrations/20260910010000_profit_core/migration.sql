ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
CREATE TYPE "SupplierSettlementType" AS ENUM ('REBATE_ON_BASE', 'PAYMENT_AFTER_REBATE', 'CREDIT_AFTER_REBATE', 'FIXED_PRICE', 'OTHER');
CREATE TYPE "ProfitStatus" AS ENUM ('PROFIT', 'BREAK_EVEN', 'LOSS');

CREATE TABLE "customer_rebate_policies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "customer_id" UUID,
    "ad_subject_id" UUID,
    "ad_account_id" UUID,
    "status" "RebateRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_rebate_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_rebate_policies_scope_check" CHECK ("customer_id" IS NOT NULL OR "ad_subject_id" IS NOT NULL OR "ad_account_id" IS NOT NULL)
);

CREATE TABLE "customer_rebate_policy_versions" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "rebate_type" "RebateRuleType" NOT NULL,
    "rate" NUMERIC(10,4) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "status" "RebateRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_rebate_policy_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_rebate_policy_versions_range_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
    CONSTRAINT "customer_rebate_policy_versions_rate_check" CHECK ("rate" >= 0 AND "rate" < 100)
);

CREATE TABLE "supplier_rebate_policies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "supplier_id" UUID,
    "platform" "SupplierPlatform",
    "ad_subject_id" UUID,
    "ad_account_id" UUID,
    "status" "RebateRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_rebate_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_rebate_policies_scope_check" CHECK ("supplier_id" IS NOT NULL OR "ad_subject_id" IS NOT NULL OR "ad_account_id" IS NOT NULL)
);

CREATE TABLE "supplier_rebate_policy_versions" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "rebate_type" "RebateRuleType" NOT NULL,
    "rate" NUMERIC(10,4) NOT NULL,
    "settlement_type" "SupplierSettlementType" NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "status" "RebateRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_rebate_policy_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_rebate_policy_versions_range_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
    CONSTRAINT "supplier_rebate_policy_versions_rate_check" CHECK ("rate" >= 0 AND "rate" < 100)
);

ALTER TABLE "purchase_orders" ADD COLUMN "base_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "customer_policy_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "customer_policy_version_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "customer_rebate_type" "RebateRuleType";
ALTER TABLE "purchase_orders" ADD COLUMN "customer_rebate_rate" NUMERIC(10,4);
ALTER TABLE "purchase_orders" ADD COLUMN "customer_base_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "customer_payment_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "customer_credit_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "customer_rebate_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "ad_subject_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "ad_account_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_policy_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_policy_version_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_rebate_type" "RebateRuleType";
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_rebate_rate" NUMERIC(10,4);
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_base_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_payment_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_credit_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_rebate_amount" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "supplier_settlement_type" "SupplierSettlementType";
ALTER TABLE "purchase_orders" ADD COLUMN "gross_profit" NUMERIC(20,2);
ALTER TABLE "purchase_orders" ADD COLUMN "profit_status" "ProfitStatus";
ALTER TABLE "purchase_orders" ADD COLUMN "cash_account_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "confirmed_at" TIMESTAMP(3);
ALTER TABLE "purchase_orders" ADD COLUMN "confirmed_by" UUID;
UPDATE "purchase_orders" SET "base_amount" = "amount" WHERE "base_amount" IS NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "base_amount" SET NOT NULL;

CREATE INDEX "customer_rebate_policies_customer_id_status_idx" ON "customer_rebate_policies"("customer_id", "status");
CREATE INDEX "customer_rebate_policies_ad_subject_id_status_idx" ON "customer_rebate_policies"("ad_subject_id", "status");
CREATE INDEX "customer_rebate_policies_ad_account_id_status_idx" ON "customer_rebate_policies"("ad_account_id", "status");
CREATE UNIQUE INDEX "customer_rebate_policy_versions_policy_id_version_key" ON "customer_rebate_policy_versions"("policy_id", "version");
CREATE INDEX "customer_rebate_policy_versions_effective_from_effective_to_status_idx" ON "customer_rebate_policy_versions"("effective_from", "effective_to", "status");
CREATE INDEX "supplier_rebate_policies_supplier_id_platform_status_idx" ON "supplier_rebate_policies"("supplier_id", "platform", "status");
CREATE INDEX "supplier_rebate_policies_ad_subject_id_status_idx" ON "supplier_rebate_policies"("ad_subject_id", "status");
CREATE INDEX "supplier_rebate_policies_ad_account_id_status_idx" ON "supplier_rebate_policies"("ad_account_id", "status");
CREATE UNIQUE INDEX "supplier_rebate_policy_versions_policy_id_version_key" ON "supplier_rebate_policy_versions"("policy_id", "version");
CREATE INDEX "supplier_rebate_policy_versions_effective_from_effective_to_status_idx" ON "supplier_rebate_policy_versions"("effective_from", "effective_to", "status");
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");
CREATE INDEX "purchase_orders_ad_subject_id_idx" ON "purchase_orders"("ad_subject_id");
CREATE INDEX "purchase_orders_ad_account_id_idx" ON "purchase_orders"("ad_account_id");
CREATE INDEX "purchase_orders_customer_policy_id_customer_policy_version_id_idx" ON "purchase_orders"("customer_policy_id", "customer_policy_version_id");
CREATE INDEX "purchase_orders_supplier_policy_id_supplier_policy_version_id_idx" ON "purchase_orders"("supplier_policy_id", "supplier_policy_version_id");

ALTER TABLE "customer_rebate_policies" ADD CONSTRAINT "customer_rebate_policies_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_rebate_policies" ADD CONSTRAINT "customer_rebate_policies_ad_subject_id_fkey" FOREIGN KEY ("ad_subject_id") REFERENCES "ad_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_rebate_policies" ADD CONSTRAINT "customer_rebate_policies_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_rebate_policy_versions" ADD CONSTRAINT "customer_rebate_policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "customer_rebate_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_ad_subject_id_fkey" FOREIGN KEY ("ad_subject_id") REFERENCES "ad_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_rebate_policy_versions" ADD CONSTRAINT "supplier_rebate_policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "supplier_rebate_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_policy_id_fkey" FOREIGN KEY ("customer_policy_id") REFERENCES "customer_rebate_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_policy_version_id_fkey" FOREIGN KEY ("customer_policy_version_id") REFERENCES "customer_rebate_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ad_subject_id_fkey" FOREIGN KEY ("ad_subject_id") REFERENCES "ad_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_policy_id_fkey" FOREIGN KEY ("supplier_policy_id") REFERENCES "supplier_rebate_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_policy_version_id_fkey" FOREIGN KEY ("supplier_policy_version_id") REFERENCES "supplier_rebate_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
