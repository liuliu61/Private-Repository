-- 发票 OCR 辅助识别记录；原始文件保存在应用本地存储，数据库保存引用与结果。
CREATE TYPE "InvoiceOcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');

CREATE TABLE "invoice_ocr_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id" UUID,
  "organization_id" UUID NOT NULL,
  "file_id" UUID NOT NULL,
  "original_file_name" VARCHAR(255) NOT NULL,
  "file_path" VARCHAR(500) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "status" "InvoiceOcrStatus" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(50) NOT NULL,
  "model" VARCHAR(100),
  "raw_result" JSONB,
  "parsed_result" JSONB,
  "field_confidence" JSONB,
  "error_message" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_ocr_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_ocr_records_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "invoice_ocr_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_ocr_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "invoice_ocr_records_invoice_id_created_at_idx" ON "invoice_ocr_records"("invoice_id", "created_at");
CREATE INDEX "invoice_ocr_records_status_created_at_idx" ON "invoice_ocr_records"("status", "created_at");
