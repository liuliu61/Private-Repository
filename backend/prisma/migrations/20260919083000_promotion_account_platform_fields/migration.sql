-- AlterTable
ALTER TABLE "promotion_accounts" ADD COLUMN "platform" VARCHAR(50),
ADD COLUMN "platform_account_id" VARCHAR(100),
ADD COLUMN "account_category" VARCHAR(50),
ADD COLUMN "channel_name" VARCHAR(100);
