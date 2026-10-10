-- 客户现金钱包分对公/对私资金
-- 2026-10-10

-- 1. 客户钱包：加对公/对私余额列（存量现金归对私）
ALTER TABLE customer_wallets
  ADD COLUMN cash_balance_public DECIMAL(20,2) NOT NULL DEFAULT 0.00 COMMENT '对公资金' AFTER cash_balance,
  ADD COLUMN cash_balance_private DECIMAL(20,2) NOT NULL DEFAULT 0.00 COMMENT '对私资金' AFTER cash_balance_public;
UPDATE customer_wallets SET cash_balance_private = cash_balance WHERE cash_balance_private = 0 AND cash_balance > 0;

-- 2. 充值申请：加资金类型（客户提交时选择）
ALTER TABLE recharge_requests
  ADD COLUMN fund_type ENUM('PUBLIC','PRIVATE') NOT NULL DEFAULT 'PRIVATE' COMMENT '资金类型：PUBLIC对公/PRIVATE对私' AFTER amount;

-- 3. 客户钱包流水：加资金类型
ALTER TABLE customer_wallet_transactions
  ADD COLUMN fund_type ENUM('PUBLIC','PRIVATE') NOT NULL DEFAULT 'PRIVATE' COMMENT '资金类型' AFTER balance_after;
