ALTER TABLE "supplier_rebate_policies" ADD COLUMN "created_by" UUID;
ALTER TABLE "supplier_rebate_policies" ADD COLUMN "updated_by" UUID;
ALTER TABLE "supplier_rebate_policies" ADD COLUMN "remark" VARCHAR(255);
ALTER TABLE "supplier_rebate_policy_versions" ADD COLUMN "created_by" UUID;
ALTER TABLE "supplier_rebate_policy_versions" ADD COLUMN "remark" VARCHAR(255);
ALTER TABLE "supplier_rebate_policy_versions" ALTER COLUMN "settlement_type" DROP NOT NULL;

ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_rebate_policies" ADD CONSTRAINT "supplier_rebate_policies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_rebate_policy_versions" ADD CONSTRAINT "supplier_rebate_policy_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
