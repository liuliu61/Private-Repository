-- 发票管理中心：发票草稿、确认、作废及业务来源关联。
-- 本迁移文件仅创建，本任务不执行数据库迁移。
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PROCESSING', 'ISSUED', 'VOIDED');

CREATE TABLE "invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoice_no" VARCHAR(60) NOT NULL,
  "invoice_number" VARCHAR(100),
  "organization_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "purchase_order_id" UUID,
  "receive_record_id" UUID,
  "account_id" UUID,
  "business_no" VARCHAR(100),
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
  "invoice_date" TIMESTAMP(3),
  "invoice_type" VARCHAR(50),
  "invoice_title" VARCHAR(150),
  "tax_number" VARCHAR(100),
  "invoice_content" VARCHAR(255),
  "issuing_entity" VARCHAR(150),
  "contract_no" VARCHAR(100),
  "invoice_nature" VARCHAR(50),
  "red_flush_status" VARCHAR(30),
  "recipient_email" VARCHAR(150),
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "client_request_id" VARCHAR(100),
  "created_by" UUID NOT NULL,
  "confirmed_by" UUID,
  "confirmed_at" TIMESTAMP(3),
  "voided_by" UUID,
  "voided_at" TIMESTAMP(3),
  "void_reason" VARCHAR(255),
  "remark" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "invoices_invoice_no_key" ON "invoices"("invoice_no");
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
CREATE UNIQUE INDEX "invoices_client_request_id_key" ON "invoices"("client_request_id");
CREATE INDEX "invoices_organization_status_created_idx" ON "invoices"("organization_id", "status", "created_at");
CREATE INDEX "invoices_customer_status_created_idx" ON "invoices"("customer_id", "status", "created_at");
CREATE INDEX "invoices_purchase_order_idx" ON "invoices"("purchase_order_id");
CREATE INDEX "invoices_receive_record_idx" ON "invoices"("receive_record_id");
CREATE INDEX "invoices_account_idx" ON "invoices"("account_id");
CREATE INDEX "invoices_business_no_idx" ON "invoices"("business_no");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
