-- AlterTable
ALTER TABLE "promotion_transactions" ADD COLUMN "customer_rebate" DECIMAL(5,2),
ADD COLUMN "cost_rebate" DECIMAL(5,2),
ADD COLUMN "remit_amount" DECIMAL(20,2),
ADD COLUMN "additional_fee" DECIMAL(20,2),
ADD COLUMN "operate_fee" DECIMAL(20,2),
ADD COLUMN "profit" DECIMAL(20,2),
ADD COLUMN "account_category" VARCHAR(50),
ADD COLUMN "channel_name" VARCHAR(100);
