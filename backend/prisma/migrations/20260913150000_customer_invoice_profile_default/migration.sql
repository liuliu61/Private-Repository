ALTER TABLE "customer_invoice_profiles"
ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "customer_invoice_profiles_customer_id_is_default_idx"
ON "customer_invoice_profiles"("customer_id", "is_default");
