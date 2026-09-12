-- 第15阶段：账户与推广账户财务对账中心；本迁移文件仅创建，当前任务不执行迁移。
ALTER TYPE "ReconciliationStatus" ADD VALUE IF NOT EXISTS 'CHECKING';
ALTER TYPE "ReconciliationStatus" ADD VALUE IF NOT EXISTS 'PASSED';
ALTER TYPE "ReconciliationStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "ReconciliationStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';

ALTER TABLE "reconciliations"
  ALTER COLUMN "account_id" DROP NOT NULL,
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "promotion_account_id" UUID,
  ADD COLUMN "income_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expense_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refund_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "adjustment_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "calculated_balance" DECIMAL(20,2),
  ADD COLUMN "system_balance" DECIMAL(20,2),
  ADD COLUMN "profit_anomaly_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "profit_anomalies" JSONB,
  ADD COLUMN "confirmed_by" UUID,
  ADD COLUMN "confirmed_at" TIMESTAMP(3);

UPDATE "reconciliations" r
SET "organization_id" = a."organization_id"
FROM "accounts" a
WHERE r."account_id" = a."id" AND r."organization_id" IS NULL;

ALTER TABLE "reconciliations"
  ADD CONSTRAINT "reconciliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "reconciliations_promotion_account_id_fkey" FOREIGN KEY ("promotion_account_id") REFERENCES "promotion_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "reconciliations_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "reconciliations_promotion_account_id_period_start_period_end_key"
  ON "reconciliations" ("promotion_account_id", "period_start", "period_end");
CREATE INDEX "reconciliations_organization_status_period_idx"
  ON "reconciliations" ("organization_id", "status", "period_start", "period_end");
CREATE INDEX "reconciliations_promotion_account_period_idx"
  ON "reconciliations" ("promotion_account_id", "period_start", "period_end");
