-- 退款申请、审批和执行记录；本迁移文件仅创建，当前任务不执行迁移。
ALTER TYPE "TransactionBusinessType" ADD VALUE IF NOT EXISTS 'CUSTOMER_REFUND';

CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELLED');

CREATE TABLE "refunds" (
  "id" UUID NOT NULL,
  "refund_no" VARCHAR(50) NOT NULL,
  "organization_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "original_payment_id" UUID,
  "refund_amount" DECIMAL(20,2) NOT NULL,
  "refund_reason" VARCHAR(255) NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" VARCHAR(100) NOT NULL,
  "applicant_id" UUID NOT NULL,
  "approved_by" UUID,
  "approved_at" TIMESTAMP(3),
  "executed_by" UUID,
  "executed_at" TIMESTAMP(3),
  "transaction_no" VARCHAR(50),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refunds_refund_no_key" ON "refunds"("refund_no");
CREATE UNIQUE INDEX "refunds_purchase_order_id_idempotency_key_key" ON "refunds"("purchase_order_id", "idempotency_key");
CREATE INDEX "refunds_organization_id_status_created_at_idx" ON "refunds"("organization_id", "status", "created_at");
CREATE INDEX "refunds_purchase_order_id_created_at_idx" ON "refunds"("purchase_order_id", "created_at");
CREATE INDEX "refunds_customer_id_created_at_idx" ON "refunds"("customer_id", "created_at");
CREATE INDEX "refunds_original_payment_id_idx" ON "refunds"("original_payment_id");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_original_payment_id_fkey" FOREIGN KEY ("original_payment_id") REFERENCES "purchase_order_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
