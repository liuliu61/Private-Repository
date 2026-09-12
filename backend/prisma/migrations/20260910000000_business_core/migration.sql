CREATE TYPE "OrganizationType" AS ENUM ('PLATFORM', 'PRIMARY_AGENT', 'SECONDARY_AGENT');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "ReconciliationStatus" AS ENUM ('DRAFT', 'COMPLETED', 'HAS_DIFFERENCE');
CREATE TYPE "SupplierPlatform" AS ENUM ('DOUYIN', 'KUAISHOU', 'XIAOHONGSHU', 'TENCENT', 'OTHER');
CREATE TYPE "AdAssetStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "parent_id" UUID,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_organizations" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("user_id", "organization_id")
);

ALTER TABLE "accounts" ADD COLUMN "organization_id" UUID;
ALTER TABLE "customers" ADD COLUMN "full_name" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN "contact" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN "phone" VARCHAR(50);
ALTER TABLE "customers" ADD COLUMN "department_id" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN "agent_id" UUID;
ALTER TABLE "rebate_rules" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "reconciliations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "opening_balance" NUMERIC(20,2) NOT NULL,
    "total_receipt" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "total_rebate" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "total_expense" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "total_refund" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "total_adjustment" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "system_closing_balance" NUMERIC(20,2) NOT NULL,
    "actual_closing_balance" NUMERIC(20,2),
    "difference" NUMERIC(20,2),
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "platform" "SupplierPlatform" NOT NULL,
    "contact_name" VARCHAR(100),
    "contact_phone" VARCHAR(50),
    "organization_id" UUID,
    "status" "AdAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_subjects" (
    "id" UUID NOT NULL,
    "subject_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "platform" "SupplierPlatform" NOT NULL,
    "organization_id" UUID,
    "status" "AdAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_subjects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_accounts" (
    "id" UUID NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "platform" "SupplierPlatform" NOT NULL,
    "subject_id" UUID NOT NULL,
    "customer_id" UUID,
    "status" "AdAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "order_no" VARCHAR(50) NOT NULL,
    "client_request_id" VARCHAR(100),
    "organization_id" UUID NOT NULL,
    "customer_id" UUID,
    "supplier_id" UUID,
    "amount" NUMERIC(20,2) NOT NULL,
    "payment_amount" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "rebate_amount" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "credit_amount" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "rule_id" UUID,
    "rule_version" VARCHAR(50),
    "rule_type" "RebateRuleType",
    "rebate_rate" NUMERIC(10,4),
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "remark" VARCHAR(255),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "amount" NUMERIC(20,2) NOT NULL,
    "quantity" NUMERIC(20,4) NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "settlement_no" VARCHAR(50) NOT NULL,
    "organization_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_amount" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "total_rebate" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "payable_amount" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settlement_items" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" NUMERIC(20,2) NOT NULL,
    "payment_amount" NUMERIC(20,2) NOT NULL,
    "rebate_amount" NUMERIC(20,2) NOT NULL,
    "payable_amount" NUMERIC(20,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settlement_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "action_type" VARCHAR(100) NOT NULL,
    "business_type" VARCHAR(100),
    "business_id" VARCHAR(100),
    "before_data" JSONB,
    "after_data" JSONB,
    "result" "AuditResult" NOT NULL,
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");
CREATE INDEX "organizations_parent_id_idx" ON "organizations"("parent_id");
CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");
CREATE INDEX "accounts_organization_id_idx" ON "accounts"("organization_id");
CREATE INDEX "customers_agent_id_status_idx" ON "customers"("agent_id", "status");
CREATE INDEX "reconciliations_period_start_period_end_idx" ON "reconciliations"("period_start", "period_end");
CREATE UNIQUE INDEX "reconciliations_account_id_period_start_period_end_key" ON "reconciliations"("account_id", "period_start", "period_end");
CREATE INDEX "suppliers_organization_id_status_idx" ON "suppliers"("organization_id", "status");
CREATE UNIQUE INDEX "ad_subjects_platform_subject_code_key" ON "ad_subjects"("platform", "subject_code");
CREATE UNIQUE INDEX "ad_accounts_platform_external_id_key" ON "ad_accounts"("platform", "external_id");
CREATE INDEX "ad_accounts_customer_id_idx" ON "ad_accounts"("customer_id");
CREATE UNIQUE INDEX "purchase_orders_order_no_key" ON "purchase_orders"("order_no");
CREATE UNIQUE INDEX "purchase_orders_client_request_id_key" ON "purchase_orders"("client_request_id");
CREATE INDEX "purchase_orders_organization_id_status_idx" ON "purchase_orders"("organization_id", "status");
CREATE INDEX "purchase_orders_customer_id_idx" ON "purchase_orders"("customer_id");
CREATE INDEX "purchase_order_items_order_id_idx" ON "purchase_order_items"("order_id");
CREATE UNIQUE INDEX "settlements_settlement_no_key" ON "settlements"("settlement_no");
CREATE UNIQUE INDEX "settlements_organization_id_period_start_period_end_key" ON "settlements"("organization_id", "period_start", "period_end");
CREATE UNIQUE INDEX "settlement_items_settlement_id_order_id_key" ON "settlement_items"("settlement_id", "order_id");
CREATE UNIQUE INDEX "settlement_items_order_id_key" ON "settlement_items"("order_id");
CREATE INDEX "audit_logs_operator_id_created_at_idx" ON "audit_logs"("operator_id", "created_at");
CREATE INDEX "audit_logs_business_type_business_id_idx" ON "audit_logs"("business_type", "business_id");

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ad_subjects" ADD CONSTRAINT "ad_subjects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "ad_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rebate_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
