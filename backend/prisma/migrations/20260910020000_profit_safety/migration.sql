ALTER TABLE "rebate_rules" DROP CONSTRAINT IF EXISTS "rebate_rules_rate_range";
ALTER TABLE "rebate_rules" ADD CONSTRAINT "rebate_rules_rate_range" CHECK ("rate" >= 0 AND "rate" < 100);

ALTER TABLE "rebate_records" DROP CONSTRAINT IF EXISTS "rebate_records_rate_range";
ALTER TABLE "rebate_records" ADD CONSTRAINT "rebate_records_rate_range" CHECK ("rebate_rate" >= 0 AND "rebate_rate" < 100);

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_rebate_rate_range" CHECK ("customer_rebate_rate" IS NULL OR ("customer_rebate_rate" >= 0 AND "customer_rebate_rate" < 100));
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_rebate_rate_range" CHECK ("supplier_rebate_rate" IS NULL OR ("supplier_rebate_rate" >= 0 AND "supplier_rebate_rate" < 100));
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_legacy_rebate_rate_range" CHECK ("rebate_rate" IS NULL OR ("rebate_rate" >= 0 AND "rebate_rate" < 100));
