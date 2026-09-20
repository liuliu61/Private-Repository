-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('DRAFT', 'PENDING_CONFIRM', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceOrderTransferCategory" AS ENUM ('AD_ACCOUNT', 'SHARED_WALLET');

-- CreateEnum
CREATE TYPE "ServiceOrderDeliveryType" AS ENUM ('BIDDING', 'NON_BIDDING');

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "order_no" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "organization_id" UUID,
    "contract_subject" VARCHAR(200),
    "transfer_category" "ServiceOrderTransferCategory" NOT NULL DEFAULT 'AD_ACCOUNT',
    "delivery_type" "ServiceOrderDeliveryType" NOT NULL DEFAULT 'BIDDING',
    "business_type" VARCHAR(50),
    "total_receivable_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "actual_received_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "service_cost_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "service_fee_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_phone" VARCHAR(20),
    "confirmed_ip" VARCHAR(50),
    "created_by" UUID,
    "remark" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_receive_records" (
    "id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "receive_record_id" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "service_fee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "used_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_receive_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_purchase_records" (
    "id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "purchase_order_id" UUID,
    "ad_account_id" UUID,
    "ad_subject_id" UUID,
    "transfer_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "receivable_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_purchase_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumption_records" (
    "id" UUID NOT NULL,
    "record_no" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "organization_id" UUID,
    "ad_account_id" UUID,
    "ad_subject_id" UUID,
    "consumption_date" TIMESTAMP(3) NOT NULL,
    "credit_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cash_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rebate_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "service_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "profit_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "remark" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumption_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_order_no_key" ON "service_orders"("order_no");

-- CreateIndex
CREATE INDEX "service_orders_customer_id_status_idx" ON "service_orders"("customer_id", "status");

-- CreateIndex
CREATE INDEX "service_orders_organization_id_created_at_idx" ON "service_orders"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_order_receive_records_service_order_id_receive_record_key" ON "service_order_receive_records"("service_order_id", "receive_record_id");

-- CreateIndex
CREATE INDEX "service_order_receive_records_receive_record_id_idx" ON "service_order_receive_records"("receive_record_id");

-- CreateIndex
CREATE INDEX "service_order_purchase_records_service_order_id_idx" ON "service_order_purchase_records"("service_order_id");

-- CreateIndex
CREATE INDEX "service_order_purchase_records_purchase_order_id_idx" ON "service_order_purchase_records"("purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "consumption_records_record_no_key" ON "consumption_records"("record_no");

-- CreateIndex
CREATE INDEX "consumption_records_customer_id_consumption_date_idx" ON "consumption_records"("customer_id", "consumption_date");

-- CreateIndex
CREATE INDEX "consumption_records_organization_id_consumption_date_idx" ON "consumption_records"("organization_id", "consumption_date");

-- CreateIndex
CREATE INDEX "consumption_records_ad_account_id_consumption_date_idx" ON "consumption_records"("ad_account_id", "consumption_date");

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_receive_records" ADD CONSTRAINT "service_order_receive_records_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_receive_records" ADD CONSTRAINT "service_order_receive_records_receive_record_id_fkey" FOREIGN KEY ("receive_record_id") REFERENCES "receive_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_purchase_records" ADD CONSTRAINT "service_order_purchase_records_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_purchase_records" ADD CONSTRAINT "service_order_purchase_records_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_records" ADD CONSTRAINT "consumption_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_records" ADD CONSTRAINT "consumption_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
