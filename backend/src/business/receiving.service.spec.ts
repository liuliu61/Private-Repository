import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BankTransactionDirection, BankTransactionStatus, Prisma, ReceiveRecordStatus } from '@prisma/client';
import { ReceivingService } from './receiving.service';

const ids = { organization: '00000000-0000-4000-8000-000000000001', account: '00000000-0000-4000-8000-000000000002', customer: '00000000-0000-4000-8000-000000000003', user: '00000000-0000-4000-8000-000000000004' };
const context: any = { sub: ids.user, username: '财务人员', roles: ['FINANCE'], permissions: ['FINANCE_BANK_TRANSACTION_IMPORT', 'FINANCE_BANK_TRANSACTION_MATCH', 'FINANCE_RECEIVE_CONFIRM', 'FINANCE_RECEIVE_VIEW', 'FINANCE_RECEIVE_CREATE'] };

function fixture() {
  const banks: any[] = [];
  const receives: any[] = [];
  const cashflowCalls: any[] = [];
  const account = { id: ids.account, organizationId: ids.organization, currency: 'CNY', status: 'ACTIVE' };
  const customer = { id: ids.customer, name: '客户A', customerCode: 'C001', agentId: ids.organization };
  const tx: any = {
    $queryRaw: async () => [],
    account: { findUnique: async () => account },
    customer: { findUnique: async ({ where: { id } }: any) => id === ids.customer ? customer : null },
    purchaseOrder: { findUnique: async () => null },
    bankTransaction: {
      findFirst: async ({ where }: any) => banks.find((row) => row.accountId === where.accountId && row.externalTransactionId === where.externalTransactionId) || null,
      findUnique: async ({ where: { id } }: any) => { const row = banks.find((item) => item.id === id); return row ? { ...row, receiveRecord: receives.find((item) => item.bankTransactionId === id) || null } : null; },
      create: async ({ data }: any) => { const row = { id: `bank-${banks.length + 1}`, transactionNo: `BT-${banks.length + 1}`, ...data }; banks.push(row); return row; },
      update: async ({ where: { id }, data }: any) => { const row = banks.find((item) => item.id === id); Object.assign(row, data); return row; },
    },
    receiveRecord: {
      findUnique: async ({ where: { id } }: any) => { const row = receives.find((item) => item.id === id); return row ? { ...row, transaction: row.transaction || null, bankTransaction: banks.find((item) => item.id === row.bankTransactionId) } : null; },
      create: async ({ data }: any) => { const row = { id: `receive-${receives.length + 1}`, receiveNo: `RC-${receives.length + 1}`, postedAmount: new Prisma.Decimal(0), refundedAmount: new Prisma.Decimal(0), ...data }; receives.push(row); return row; },
      update: async ({ where: { id }, data }: any) => { const row = receives.find((item) => item.id === id); Object.assign(row, data); return row; },
    },
    receivePosting: { create: async ({ data }: any) => ({ id: 'posting-1', postingNo: 'RP-1', ...data }) },
    receiveServiceFee: { create: async ({ data }: any) => ({ id: 'fee-1', ...data }) },
    auditLog: { create: async () => undefined },
  };
  const prisma: any = { ...tx, $transaction: async (callback: any) => callback(tx) };
  const scope: any = { isSuperAdmin: () => false, getOrganizationIds: async () => [ids.organization], assertOrganizationAccess: async (id: string) => { if (id !== ids.organization) throw new Error('PERMISSION_DENIED'); } };
  const cashflow: any = { createTransactionInTransaction: async (_tx: unknown, input: any) => { cashflowCalls.push(input); return { id: 'transaction-1', transactionNo: 'TX-1', accountId: input.accountId, businessType: input.businessType, businessNo: input.businessNo, changeAmount: input.changeAmount, balanceBefore: new Prisma.Decimal('0.00'), balanceAfter: new Prisma.Decimal('30000.00'), occurredAt: input.occurredAt, operatorId: input.operatorId, remark: input.remark }; } };
  const wallet: any = { applyReceivePostingInTransaction: async () => ({ idempotent: false, transaction: { transactionNo: 'CWTX-1' } }) };
  return { service: new ReceivingService(prisma, cashflow, scope, wallet), banks, receives, cashflowCalls };
}

async function importAndConfirm(f: ReturnType<typeof fixture>) {
  const imported = await f.service.importBankTransactions({ items: [{ accountId: ids.account, occurredAt: '2026-09-11T10:00:00.000Z', direction: BankTransactionDirection.INCOME, amount: '30000.00', source: 'BANK_IMPORT', externalTransactionId: 'bank-source-001' }] }, context);
  const bankId = imported.items[0].bankTransaction.id;
  await f.service.matchBankTransaction(bankId, { customerId: ids.customer }, context);
  return { bankId, confirmed: await f.service.confirmBankTransaction(bankId, context) };
}

test('保存银行流水不生成收款，确认到账后才幂等生成收款记录', async () => {
  const f = fixture();
  const imported = await f.service.importBankTransactions({ items: [{ accountId: ids.account, occurredAt: '2026-09-11T10:00:00.000Z', direction: BankTransactionDirection.INCOME, amount: '30000.00', source: 'BANK_IMPORT', externalTransactionId: 'bank-source-001' }] }, context);
  assert.equal(f.receives.length, 0);
  await f.service.matchBankTransaction(imported.items[0].bankTransaction.id, { customerId: ids.customer }, context);
  const first = await f.service.confirmBankTransaction(imported.items[0].bankTransaction.id, context);
  const second = await f.service.confirmBankTransaction(imported.items[0].bankTransaction.id, context);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(f.receives.length, 1);
  assert.equal(f.banks[0].status, BankTransactionStatus.RECEIPT_CONFIRMED);
});

test('付款30000、服务费2000时V钱包只入账28000，开票口径保存30000', async () => {
  const f = fixture();
  const { confirmed } = await importAndConfirm(f);
  const posted = await f.service.confirmReceiveRecord(confirmed.receiveRecord.id, { serviceFeeAmount: '2000.00' }, context);
  assert.equal(posted.receiveRecord.walletCreditAmount, '28000.00');
  assert.equal(posted.receiveRecord.invoiceEligibleAmount, '30000.00');
  assert.equal(posted.receiveRecord.unBillingAmount, '30000.00');
  assert.equal(posted.receiveRecord.billingAmount, '0.00');
  assert.equal(posted.receiveRecord.billedAmount, '0.00');
  assert.equal(posted.receiveRecord.postedAmount, '28000.00');
  assert.equal(f.cashflowCalls.length, 1);
  assert.equal(f.receives[0].status, ReceiveRecordStatus.CONFIRMED);
});

test('收款确认失败时不应提前改变收款状态', async () => {
  const f = fixture();
  const { confirmed } = await importAndConfirm(f);
  const failing = new ReceivingService((f.service as any).prisma, { createTransactionInTransaction: async () => { throw new Error('模拟流水写入失败'); } } as any, (f.service as any).scope, (f.service as any).customerWallet);
  await assert.rejects(() => failing.confirmReceiveRecord(confirmed.receiveRecord.id, { serviceFeeAmount: '0.00' }, context), /模拟流水写入失败/);
  assert.equal(f.receives[0].status, ReceiveRecordStatus.PENDING_CONFIRMATION);
});
