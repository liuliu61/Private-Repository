ALTER TABLE "customer_rebate_policies" ADD COLUMN "created_by" UUID;
ALTER TABLE "customer_rebate_policies" ADD COLUMN "remark" VARCHAR(255);
ALTER TABLE "customer_rebate_policy_versions" ADD COLUMN "created_by" UUID;
ALTER TABLE "customer_rebate_policy_versions" ADD COLUMN "remark" VARCHAR(255);
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" UUID;

CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

ALTER TABLE "customer_rebate_policies" ADD CONSTRAINT "customer_rebate_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_rebate_policy_versions" ADD CONSTRAINT "customer_rebate_policy_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
