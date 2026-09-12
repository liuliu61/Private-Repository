-- 充值付款补款拆分明细，仅记录申请内容，不执行资金动作。
CREATE TYPE "RechargePaymentDetailStatus" AS ENUM ('DRAFT');

CREATE TABLE "recharge_payment_application_details" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "business_type" VARCHAR(100),
  "amount" DECIMAL(20,2) NOT NULL,
  "operator_id" UUID NOT NULL,
  "status" "RechargePaymentDetailStatus" NOT NULL DEFAULT 'DRAFT',
  "remark" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recharge_payment_application_details_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recharge_payment_application_details_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "recharge_payment_application_details_application_created_idx" ON "recharge_payment_application_details"("application_id", "created_at");

ALTER TABLE "recharge_payment_application_details"
  ADD CONSTRAINT "recharge_payment_application_details_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "recharge_payment_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "recharge_payment_application_details_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
