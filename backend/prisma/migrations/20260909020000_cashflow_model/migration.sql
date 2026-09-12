CREATE TYPE "TransactionBusinessType" AS ENUM ('RECEIPT', 'RECHARGE', 'DEDUCTION', 'REFUND', 'REBATE', 'ADJUSTMENT', 'OTHER');

ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_opening_balance_non_negative";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_current_balance_non_negative";
ALTER TABLE "accounts" ALTER COLUMN "normal_balance" DROP NOT NULL;

ALTER TABLE "transactions" ADD COLUMN "transaction_no" VARCHAR(50);
ALTER TABLE "transactions" ADD COLUMN "business_type" "TransactionBusinessType";
ALTER TABLE "transactions" ADD COLUMN "business_no" VARCHAR(100);
ALTER TABLE "transactions" ADD COLUMN "change_amount" NUMERIC(20,2);
ALTER TABLE "transactions" ADD COLUMN "balance_before" NUMERIC(20,2);
ALTER TABLE "transactions" ALTER COLUMN "voucher_id" DROP NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "transaction_type" DROP NOT NULL;

UPDATE "transactions"
SET
  "transaction_no" = 'LEGACY-' || "id"::text,
  "business_type" = 'OTHER',
  "business_no" = 'LEGACY-' || "id"::text,
  "change_amount" = CASE WHEN "transaction_type" = 'DEBIT' THEN "amount" ELSE -"amount" END,
  "balance_before" = "balance_after" - CASE WHEN "transaction_type" = 'DEBIT' THEN "amount" ELSE -"amount" END
WHERE "transaction_no" IS NULL;

ALTER TABLE "transactions" ALTER COLUMN "transaction_no" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "business_type" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "business_no" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "change_amount" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "balance_before" SET NOT NULL;

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_amount_positive";
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_balance_after_non_negative";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_change_amount_non_zero" CHECK ("change_amount" <> 0);

CREATE UNIQUE INDEX "transactions_transaction_no_key" ON "transactions"("transaction_no");
CREATE INDEX "transactions_business_type_occurred_at_idx" ON "transactions"("business_type", "occurred_at");
CREATE INDEX "transactions_business_no_idx" ON "transactions"("business_no");
