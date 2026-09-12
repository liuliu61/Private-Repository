-- 充值付款流程第一阶段：申请、审核状态与审计关联；不产生资金动作。
CREATE TYPE "RechargePaymentStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "recharge_payment_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_no" VARCHAR(60) NOT NULL,
  "organization_id" UUID NOT NULL,
  "receive_record_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
  "status" "RechargePaymentStatus" NOT NULL DEFAULT 'DRAFT',
  "applicant_id" UUID NOT NULL,
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMP(3),
  "reviewer_id" UUID,
  "reviewed_at" TIMESTAMP(3),
  "reject_reason" VARCHAR(255),
  "client_request_id" VARCHAR(100),
  "remark" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recharge_payment_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recharge_payment_applications_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "recharge_payment_applications_application_no_key" ON "recharge_payment_applications"("application_no");
CREATE UNIQUE INDEX "recharge_payment_applications_client_request_id_key" ON "recharge_payment_applications"("client_request_id");
CREATE INDEX "recharge_payment_applications_organization_status_created_idx" ON "recharge_payment_applications"("organization_id", "status", "created_at");
CREATE INDEX "recharge_payment_applications_receive_record_created_idx" ON "recharge_payment_applications"("receive_record_id", "created_at");
CREATE INDEX "recharge_payment_applications_customer_created_idx" ON "recharge_payment_applications"("customer_id", "created_at");
CREATE INDEX "recharge_payment_applications_applicant_created_idx" ON "recharge_payment_applications"("applicant_id", "created_at");

ALTER TABLE "recharge_payment_applications"
  ADD CONSTRAINT "recharge_payment_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "recharge_payment_applications_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "recharge_payment_applications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "recharge_payment_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "recharge_payment_applications_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
