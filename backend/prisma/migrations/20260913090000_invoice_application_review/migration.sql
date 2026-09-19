-- 发票申请与审核第一阶段：复用 invoices，增加审核字段、明细及多收款来源关系。
ALTER TYPE "InvoiceStatus" ADD VALUE 'REVIEWING';
ALTER TYPE "InvoiceStatus" ADD VALUE 'APPROVED';
ALTER TYPE "InvoiceStatus" ADD VALUE 'REJECTED';

ALTER TABLE "invoices"
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "approval_remark" VARCHAR(255),
  ADD COLUMN "reject_reason" VARCHAR(255),
  ADD COLUMN "approved_amount" DECIMAL(20,2);

CREATE TABLE "invoice_application_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id" UUID NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "item_type" VARCHAR(50),
  "content" VARCHAR(255),
  "remark" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_application_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_application_items_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "invoice_application_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "invoice_application_items_invoice_id_created_at_idx" ON "invoice_application_items"("invoice_id", "created_at");

CREATE TABLE "invoice_application_receive_records" (
  "invoice_id" UUID NOT NULL,
  "receive_record_id" UUID NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  CONSTRAINT "invoice_application_receive_records_pkey" PRIMARY KEY ("invoice_id", "receive_record_id"),
  CONSTRAINT "invoice_application_receive_records_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "invoice_application_receive_records_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invoice_application_receive_records_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "invoice_application_receive_records_receive_record_id_idx" ON "invoice_application_receive_records"("receive_record_id");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
