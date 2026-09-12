ALTER TABLE "rebate_records" ADD COLUMN "account_id" UUID;
ALTER TABLE "rebate_records" ADD COLUMN "confirmed_at" TIMESTAMP(3);
ALTER TABLE "rebate_records" ADD COLUMN "confirmed_by" UUID;

CREATE INDEX "rebate_records_account_id_idx" ON "rebate_records"("account_id");

ALTER TABLE "rebate_records" ADD CONSTRAINT "rebate_records_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rebate_records" ADD CONSTRAINT "rebate_records_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
