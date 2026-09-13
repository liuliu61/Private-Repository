import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvoiceOcrService } from './invoice-ocr.service';

function service() { return new InvoiceOcrService({} as any, {} as any) as any; }

test('OCR金额标准化去除货币符号、逗号和空格', () => {
  const result = service().normalizeResult({ amountExcludingTax: '¥10,000.00', taxAmount: ' 850 ', totalAmount: '￥10,850.00' });
  assert.equal(result.amountExcludingTax, '10000.00');
  assert.equal(result.taxAmount, '850.00');
  assert.equal(result.totalAmount, '10850.00');
});

test('OCR缺失字段保留为空，不阻止表单继续手工填写', () => {
  const result = service().normalizeResult({ invoiceNo: ' 12345678\n', items: [] });
  assert.equal(result.invoiceNo, '12345678');
  assert.equal(result.sellerName, '');
  assert.deepEqual(result.items, []);
});

test('OCR结果只返回辅助数据，不修改发票申请字段', () => {
  const result = service().normalizeResult({ totalAmount: '100.00', rawResult: { source: 'local-paddleocr' } });
  assert.equal(result.totalAmount, '100.00');
  assert.deepEqual(result.rawResult, { source: 'local-paddleocr' });
});

test('OCR服务不可用时由调用层抛出可被业务层转换的错误', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'invoice-ocr-'));
  const filePath = join(directory, 'invoice.png');
  await writeFile(filePath, 'test');
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('OCR timeout'); }) as typeof fetch;
  try { await assert.rejects(() => service().callLocalOcr(filePath, 'invoice.png', 'image/png'), /OCR timeout/); }
  finally { globalThis.fetch = previousFetch; await rm(directory, { recursive: true, force: true }); }
});
