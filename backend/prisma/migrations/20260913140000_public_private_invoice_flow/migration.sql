CREATE TYPE "ReceivePaymentNature" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "InvoiceTaskStatus" AS ENUM ('PENDING', 'REVIEWING', 'APPROVED', 'REJECTED', 'COMPLETED');

CREATE TABLE "receive_record_details" (
  "id" UUID NOT NULL,
  "receive_record_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "type" "ReceivePaymentNature" NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receive_record_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_invoice_profiles" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "title_name" VARCHAR(150) NOT NULL,
  "taxpayer_code" VARCHAR(100),
  "address" VARCHAR(255),
  "phone" VARCHAR(50),
  "bank_name" VARCHAR(150),
  "bank_account" VARCHAR(100),
  "default_invoice_content" VARCHAR(255),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_invoice_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_tasks" (
  "id" UUID NOT NULL,
  "task_no" VARCHAR(60) NOT NULL,
  "organization_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "receive_record_detail_id" UUID NOT NULL,
  "invoice_profile_id" UUID,
  "public_amount" DECIMAL(20,2) NOT NULL,
  "invoice_amount" DECIMAL(20,2) NOT NULL,
  "payer_name" VARCHAR(120),
  "payer_account" VARCHAR(120),
  "title_name" VARCHAR(150),
  "taxpayer_code" VARCHAR(100),
  "address" VARCHAR(255),
  "phone" VARCHAR(50),
  "bank_name" VARCHAR(150),
  "bank_account" VARCHAR(100),
  "invoice_content" VARCHAR(255),
  "remark" VARCHAR(255),
  "status" "InvoiceTaskStatus" NOT NULL DEFAULT 'PENDING',
  "created_by" UUID NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMP(3),
  "approval_remark" VARCHAR(255),
  "reject_reason" VARCHAR(255),
  "completed_by" UUID,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_tasks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoice_details" ALTER COLUMN "invoice_apply_id" DROP NOT NULL;
ALTER TABLE "invoice_details" ADD COLUMN "invoice_task_id" UUID;
ALTER TABLE "invoice_details" ADD COLUMN "invoice_date" TIMESTAMP(3);
ALTER TABLE "invoice_details" ADD COLUMN "remark" VARCHAR(255);

CREATE UNIQUE INDEX "invoice_tasks_task_no_key" ON "invoice_tasks"("task_no");
CREATE UNIQUE INDEX "invoice_tasks_receive_record_detail_id_key" ON "invoice_tasks"("receive_record_detail_id");
CREATE INDEX "receive_record_details_receive_record_id_type_idx" ON "receive_record_details"("receive_record_id", "type");
CREATE INDEX "receive_record_details_customer_id_type_created_at_idx" ON "receive_record_details"("customer_id", "type", "created_at");
CREATE INDEX "customer_invoice_profiles_customer_id_enabled_idx" ON "customer_invoice_profiles"("customer_id", "enabled");
CREATE INDEX "invoice_tasks_organization_id_status_created_at_idx" ON "invoice_tasks"("organization_id", "status", "created_at");
CREATE INDEX "invoice_tasks_customer_id_status_created_at_idx" ON "invoice_tasks"("customer_id", "status", "created_at");
CREATE INDEX "invoice_details_invoice_task_id_create_time_idx" ON "invoice_details"("invoice_task_id", "create_time");

ALTER TABLE "receive_record_details" ADD CONSTRAINT "receive_record_details_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receive_record_details" ADD CONSTRAINT "receive_record_details_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_invoice_profiles" ADD CONSTRAINT "customer_invoice_profiles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_tasks" ADD CONSTRAINT "invoice_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_tasks" ADD CONSTRAINT "invoice_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_tasks" ADD CONSTRAINT "invoice_tasks_receive_record_detail_id_fkey" FOREIGN KEY ("receive_record_detail_id") REFERENCES "receive_record_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_tasks" ADD CONSTRAINT "invoice_tasks_invoice_profile_id_fkey" FOREIGN KEY ("invoice_profile_id") REFERENCES "customer_invoice_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_tasks" ADD CONSTRAINT "invoice_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_tasks" ADD CONSTRAINT "invoice_tasks_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_tasks" ADD CONSTRAINT "invoice_tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_invoice_task_id_fkey" FOREIGN KEY ("invoice_task_id") REFERENCES "invoice_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
