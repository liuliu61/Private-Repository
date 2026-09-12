CREATE TYPE "AccountType" AS ENUM ('BANK', 'CASH', 'RECEIVABLE', 'CUSTOMER_PREPAY', 'REBATE_COST', 'REBATE_PAYABLE', 'REVENUE', 'COST');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "AccountNormalBalance" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "VoucherStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');
CREATE TYPE "TransactionType" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "RebateRuleType" AS ENUM ('FIXED_ADD', 'PRIVATE_DIVIDE');
CREATE TYPE "RebateRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "RebateRecordStatus" AS ENUM ('CALCULATING', 'PENDING_CONFIRMATION', 'CONFIRMED', 'SETTLED', 'CANCELLED');
CREATE TYPE "RebateCalculationMode" AS ENUM ('ADD', 'DIVIDE');

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "account_code" VARCHAR(50) NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "normal_balance" "AccountNormalBalance" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
    "opening_balance" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "current_balance" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounts_opening_balance_non_negative" CHECK ("opening_balance" >= 0),
    CONSTRAINT "accounts_current_balance_non_negative" CHECK ("current_balance" >= 0)
);

CREATE TABLE "vouchers" (
    "id" UUID NOT NULL,
    "voucher_no" VARCHAR(50) NOT NULL,
    "voucher_date" DATE NOT NULL,
    "summary" VARCHAR(255) NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voucher_entries" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit_amount" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "credit_amount" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "summary" VARCHAR(255),
    "sequence" INTEGER NOT NULL,
    CONSTRAINT "voucher_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voucher_entries_amount_non_negative" CHECK ("debit_amount" >= 0 AND "credit_amount" >= 0),
    CONSTRAINT "voucher_entries_single_direction" CHECK (NOT ("debit_amount" > 0 AND "credit_amount" > 0)),
    CONSTRAINT "voucher_entries_non_zero" CHECK ("debit_amount" > 0 OR "credit_amount" > 0)
);

CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "transaction_type" "TransactionType" NOT NULL,
    "amount" NUMERIC(20,2) NOT NULL,
    "balance_after" NUMERIC(20,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operator_id" UUID NOT NULL,
    "remark" VARCHAR(255),
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "transactions_balance_after_non_negative" CHECK ("balance_after" >= 0)
);

CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "customer_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rebate_rules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "rule_type" "RebateRuleType" NOT NULL,
    "rate" NUMERIC(10,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" "RebateRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rebate_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rebate_rules_rate_range" CHECK ("rate" >= 0 AND "rate" <= 100),
    CONSTRAINT "rebate_rules_effective_range" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);

CREATE TABLE "rebate_records" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "rebate_rule_id" UUID NOT NULL,
    "source_amount" NUMERIC(20,2) NOT NULL,
    "rebate_rate" NUMERIC(10,4) NOT NULL,
    "payment_amount" NUMERIC(20,2) NOT NULL,
    "rebate_amount" NUMERIC(20,2) NOT NULL,
    "credit_amount" NUMERIC(20,2) NOT NULL,
    "calculation_mode" "RebateCalculationMode" NOT NULL,
    "status" "RebateRecordStatus" NOT NULL DEFAULT 'CALCULATING',
    "source_document_no" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    CONSTRAINT "rebate_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rebate_records_source_amount_positive" CHECK ("source_amount" >= 0),
    CONSTRAINT "rebate_records_rate_range" CHECK ("rebate_rate" >= 0 AND "rebate_rate" <= 100),
    CONSTRAINT "rebate_records_amounts_non_negative" CHECK ("payment_amount" >= 0 AND "rebate_amount" >= 0 AND "credit_amount" >= 0)
);

CREATE UNIQUE INDEX "accounts_account_code_key" ON "accounts"("account_code");
CREATE UNIQUE INDEX "vouchers_voucher_no_key" ON "vouchers"("voucher_no");
CREATE UNIQUE INDEX "voucher_entries_voucher_id_sequence_key" ON "voucher_entries"("voucher_id", "sequence");
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");
CREATE INDEX "accounts_account_type_idx" ON "accounts"("account_type");
CREATE INDEX "accounts_status_idx" ON "accounts"("status");
CREATE INDEX "vouchers_voucher_date_idx" ON "vouchers"("voucher_date");
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");
CREATE INDEX "voucher_entries_account_id_idx" ON "voucher_entries"("account_id");
CREATE INDEX "transactions_account_id_occurred_at_idx" ON "transactions"("account_id", "occurred_at");
CREATE INDEX "transactions_voucher_id_idx" ON "transactions"("voucher_id");
CREATE INDEX "transactions_operator_id_idx" ON "transactions"("operator_id");
CREATE INDEX "customers_status_idx" ON "customers"("status");
CREATE INDEX "rebate_rules_rule_type_status_idx" ON "rebate_rules"("rule_type", "status");
CREATE INDEX "rebate_rules_effective_from_effective_to_idx" ON "rebate_rules"("effective_from", "effective_to");
CREATE INDEX "rebate_records_customer_id_created_at_idx" ON "rebate_records"("customer_id", "created_at");
CREATE INDEX "rebate_records_rebate_rule_id_idx" ON "rebate_records"("rebate_rule_id");
CREATE INDEX "rebate_records_status_idx" ON "rebate_records"("status");

ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voucher_entries" ADD CONSTRAINT "voucher_entries_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voucher_entries" ADD CONSTRAINT "voucher_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rebate_records" ADD CONSTRAINT "rebate_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rebate_records" ADD CONSTRAINT "rebate_records_rebate_rule_id_fkey" FOREIGN KEY ("rebate_rule_id") REFERENCES "rebate_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rebate_records" ADD CONSTRAINT "rebate_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
