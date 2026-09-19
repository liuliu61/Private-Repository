-- CreateEnum
CREATE TYPE "PaymentPostingApplyStatus" AS ENUM ('DRAFT', 'REVIEWING', 'APPROVED', 'REJECTED', 'REVOKED', 'PAID', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentPostingOaStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "PaymentExpenseType" AS ENUM ('AD_RECHARGE', 'SERVICE_FEE', 'REFUND', 'OTHER');

-- AlterEnum
ALTER TYPE "TransactionBusinessType" ADD VALUE 'PAYMENT_POSTING';

-- CreateTable
CREATE TABLE "payment_posting_applies" (
    "id" UUID NOT NULL,
    "apply_no" VARCHAR(60) NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "apply_type" VARCHAR(50) NOT NULL DEFAULT 'RECHARGE',
    "total_amount" DECIMAL(20,2) NOT NULL,
    "paid_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "service_fee_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "actual_pay_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
    "payer_account_id" UUID,
    "payee_account_id" UUID,
    "payment_method" VARCHAR(50),
    "status" "PaymentPostingApplyStatus" NOT NULL DEFAULT 'DRAFT',
    "oa_status" "PaymentPostingOaStatus" NOT NULL DEFAULT 'PENDING',
    "oa_flow_no" VARCHAR(100),
    "contract_no" VARCHAR(100),
    "remark" VARCHAR(500),
    "attachment_url" VARCHAR(500),
    "receipt_url" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "paid_by" UUID,
    "paid_at" TIMESTAMP(3),
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(500),
    "transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_posting_applies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_posting_apply_details" (
    "id" UUID NOT NULL,
    "apply_id" UUID NOT NULL,
    "expense_type_id" VARCHAR(100),
    "expense_type" "PaymentExpenseType" NOT NULL DEFAULT 'AD_RECHARGE',
    "apply_amount" DECIMAL(20,2) NOT NULL,
    "paid_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "service_fee_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_posting_apply_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_posting_apply_receive_records" (
    "id" UUID NOT NULL,
    "apply_id" UUID NOT NULL,
    "receive_record_id" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_posting_apply_receive_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_posting_oa_applies" (
    "id" UUID NOT NULL,
    "apply_id" UUID NOT NULL,
    "oa_flow_no" VARCHAR(100) NOT NULL,
    "oa_status" "PaymentPostingOaStatus" NOT NULL DEFAULT 'PENDING',
    "oa_type" VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_APPROVAL',
    "applicant_id" UUID NOT NULL,
    "approver_id" UUID,
    "approved_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(500),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_retry_at" TIMESTAMP(3),
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_posting_oa_applies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_posting_applies_apply_no_key" ON "payment_posting_applies"("apply_no");

-- CreateIndex
CREATE UNIQUE INDEX "payment_posting_applies_transaction_id_key" ON "payment_posting_applies"("transaction_id");

-- CreateIndex
CREATE INDEX "payment_posting_applies_organization_id_status_created_at_idx" ON "payment_posting_applies"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "payment_posting_applies_customer_id_created_at_idx" ON "payment_posting_applies"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_posting_applies_oa_flow_no_idx" ON "payment_posting_applies"("oa_flow_no");

-- CreateIndex
CREATE INDEX "payment_posting_apply_details_apply_id_idx" ON "payment_posting_apply_details"("apply_id");

-- CreateIndex
CREATE INDEX "payment_posting_apply_details_expense_type_idx" ON "payment_posting_apply_details"("expense_type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_posting_apply_receive_records_apply_id_receive_record_key" ON "payment_posting_apply_receive_records"("apply_id", "receive_record_id");

-- CreateIndex
CREATE INDEX "payment_posting_apply_receive_records_receive_record_id_idx" ON "payment_posting_apply_receive_records"("receive_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_posting_oa_applies_oa_flow_no_key" ON "payment_posting_oa_applies"("oa_flow_no");

-- CreateIndex
CREATE INDEX "payment_posting_oa_applies_apply_id_idx" ON "payment_posting_oa_applies"("apply_id");

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_payer_account_id_fkey" FOREIGN KEY ("payer_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_payee_account_id_fkey" FOREIGN KEY ("payee_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_applies" ADD CONSTRAINT "payment_posting_applies_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_apply_details" ADD CONSTRAINT "payment_posting_apply_details_apply_id_fkey" FOREIGN KEY ("apply_id") REFERENCES "payment_posting_applies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_apply_receive_records" ADD CONSTRAINT "payment_posting_apply_receive_records_apply_id_fkey" FOREIGN KEY ("apply_id") REFERENCES "payment_posting_applies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_apply_receive_records" ADD CONSTRAINT "payment_posting_apply_receive_records_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_oa_applies" ADD CONSTRAINT "payment_posting_oa_applies_apply_id_fkey" FOREIGN KEY ("apply_id") REFERENCES "payment_posting_applies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_oa_applies" ADD CONSTRAINT "payment_posting_oa_applies_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_posting_oa_applies" ADD CONSTRAINT "payment_posting_oa_applies_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
