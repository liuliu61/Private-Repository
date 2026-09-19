CREATE TABLE "invoice_details" (
  "id" UUID NOT NULL,
  "invoice_apply_id" UUID NOT NULL,
  "invoice_apply_invoice_id" UUID,
  "amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "invoice_type" VARCHAR(50) NOT NULL,
  "invoice_content" VARCHAR(255),
  "invoice_code" VARCHAR(100),
  "invoice_url" VARCHAR(500),
  "image_url" VARCHAR(500),
  "file_path" VARCHAR(500),
  "original_file_name" VARCHAR(255),
  "mime_type" VARCHAR(100),
  "created_by" UUID NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_details_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_details_invoice_apply_id_create_time_idx" ON "invoice_details"("invoice_apply_id", "create_time");
CREATE INDEX "invoice_details_invoice_apply_invoice_id_idx" ON "invoice_details"("invoice_apply_invoice_id");

ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_invoice_apply_id_fkey" FOREIGN KEY ("invoice_apply_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_invoice_apply_invoice_id_fkey" FOREIGN KEY ("invoice_apply_invoice_id") REFERENCES "invoice_application_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
