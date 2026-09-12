-- 第16阶段：财务调整中心；本迁移文件仅创建，当前任务不执行迁移。
CREATE TYPE "FinancialAdjustmentType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "FinancialAdjustmentStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'EXECUTED');

CREATE TABLE "financial_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "adjustment_no" VARCHAR(50) NOT NULL,
  "organization_id" UUID NOT NULL,
  "account_id" UUID,
  "promotion_account_id" UUID,
  "account_type" "AccountUnit" NOT NULL,
  "type" "FinancialAdjustmentType" NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "status" "FinancialAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by" UUID NOT NULL,
  "approved_by" UUID,
  "executed_by" UUID,
  "approved_at" TIMESTAMP(3),
  "executed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_adjustments_target_check" CHECK ((("account_id" IS NOT NULL)::int + ("promotion_account_id" IS NOT NULL)::int) = 1),
  CONSTRAINT "financial_adjustments_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "financial_adjustments_adjustment_no_key" ON "financial_adjustments"("adjustment_no");
CREATE INDEX "financial_adjustments_organization_id_status_created_at_idx" ON "financial_adjustments"("organization_id", "status", "created_at");
CREATE INDEX "financial_adjustments_account_id_status_idx" ON "financial_adjustments"("account_id", "status");
CREATE INDEX "financial_adjustments_promotion_account_id_status_idx" ON "financial_adjustments"("promotion_account_id", "status");

ALTER TABLE "financial_adjustments"
  ADD CONSTRAINT "financial_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_adjustments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_adjustments_promotion_account_id_fkey" FOREIGN KEY ("promotion_account_id") REFERENCES "promotion_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_adjustments_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD COLUMN "adjustment_id" UUID;
CREATE UNIQUE INDEX "transactions_adjustment_id_key" ON "transactions"("adjustment_id");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "financial_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promotion_transactions" ADD COLUMN "adjustment_id" UUID;
CREATE UNIQUE INDEX "promotion_transactions_adjustment_id_key" ON "promotion_transactions"("adjustment_id");
ALTER TABLE "promotion_transactions" ADD CONSTRAINT "promotion_transactions_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "financial_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
