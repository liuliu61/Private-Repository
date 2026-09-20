-- 为channels表添加对公/对私成本返点字段
ALTER TABLE "channels" ADD COLUMN "default_cost_rebate_public" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "channels" ADD COLUMN "default_cost_rebate_private" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- 将原有的default_cost_rebate值迁移到对公字段（如果存在）
-- 注意：原字段default_cost_rebate保留但不再使用，后续可删除
