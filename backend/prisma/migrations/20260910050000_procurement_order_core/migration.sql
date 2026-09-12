ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_CONFIRMATION';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'SETTLED';

ALTER TABLE "purchase_orders" ADD COLUMN "platform" "SupplierPlatform";
ALTER TABLE "purchase_orders" ADD COLUMN "business_time" TIMESTAMP(3);

CREATE INDEX "purchase_orders_created_at_order_no_idx" ON "purchase_orders"("created_at", "order_no");
CREATE INDEX "purchase_orders_business_time_idx" ON "purchase_orders"("business_time");
