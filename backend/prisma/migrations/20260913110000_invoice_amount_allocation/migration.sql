-- 发票申请额度分段：未开票、开票中、已开票均按收款记录保存。
ALTER TABLE "receive_records"
  ADD COLUMN "un_billing_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "billing_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "billed_amount" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- 兼容迁移前已有的单收款发票记录；不改变历史发票记录本身。
UPDATE "receive_records" AS receive
SET "billed_amount" = COALESCE((
    SELECT SUM(source.amount) FROM (
      SELECT invoice.amount FROM "invoices" AS invoice
      WHERE invoice.receive_record_id = receive.id
        AND invoice.status IN ('ISSUED', 'APPROVED')
        AND NOT EXISTS (
          SELECT 1 FROM "invoice_application_receive_records" AS linked
          WHERE linked.invoice_id = invoice.id AND linked.receive_record_id = receive.id
        )
      UNION ALL
      SELECT linked.amount FROM "invoice_application_receive_records" AS linked
      JOIN "invoices" AS invoice ON invoice.id = linked.invoice_id
      WHERE linked.receive_record_id = receive.id AND invoice.status IN ('ISSUED', 'APPROVED')
    ) AS source
  ), 0),
  "billing_amount" = COALESCE((
    SELECT SUM(source.amount) FROM (
      SELECT invoice.amount FROM "invoices" AS invoice
      WHERE invoice.receive_record_id = receive.id
        AND invoice.status IN ('PROCESSING', 'REVIEWING')
        AND NOT EXISTS (
          SELECT 1 FROM "invoice_application_receive_records" AS linked
          WHERE linked.invoice_id = invoice.id AND linked.receive_record_id = receive.id
        )
      UNION ALL
      SELECT linked.amount FROM "invoice_application_receive_records" AS linked
      JOIN "invoices" AS invoice ON invoice.id = linked.invoice_id
      WHERE linked.receive_record_id = receive.id AND invoice.status IN ('PROCESSING', 'REVIEWING')
    ) AS source
  ), 0),
  "un_billing_amount" = receive.amount
    - COALESCE((
        SELECT SUM(source.amount) FROM (
          SELECT invoice.amount FROM "invoices" AS invoice
          WHERE invoice.receive_record_id = receive.id
            AND invoice.status IN ('ISSUED', 'APPROVED')
            AND NOT EXISTS (SELECT 1 FROM "invoice_application_receive_records" AS linked WHERE linked.invoice_id = invoice.id AND linked.receive_record_id = receive.id)
          UNION ALL
          SELECT linked.amount FROM "invoice_application_receive_records" AS linked
          JOIN "invoices" AS invoice ON invoice.id = linked.invoice_id
          WHERE linked.receive_record_id = receive.id AND invoice.status IN ('ISSUED', 'APPROVED')
        ) AS source
      ), 0)
    - COALESCE((
        SELECT SUM(source.amount) FROM (
          SELECT invoice.amount FROM "invoices" AS invoice
          WHERE invoice.receive_record_id = receive.id
            AND invoice.status IN ('PROCESSING', 'REVIEWING')
            AND NOT EXISTS (SELECT 1 FROM "invoice_application_receive_records" AS linked WHERE linked.invoice_id = invoice.id AND linked.receive_record_id = receive.id)
          UNION ALL
          SELECT linked.amount FROM "invoice_application_receive_records" AS linked
          JOIN "invoices" AS invoice ON invoice.id = linked.invoice_id
          WHERE linked.receive_record_id = receive.id AND invoice.status IN ('PROCESSING', 'REVIEWING')
        ) AS source
      ), 0);

ALTER TABLE "receive_records"
  ADD CONSTRAINT "receive_records_invoice_amounts_check" CHECK ("un_billing_amount" >= 0 AND "billing_amount" >= 0 AND "billed_amount" >= 0 AND "amount" = "un_billing_amount" + "billing_amount" + "billed_amount");
