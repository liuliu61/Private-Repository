import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Prisma, RebateRecordStatus, TransactionBusinessType } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CashflowService } from '../cashflow/cashflow.service';
import { RebateConfirmationService } from './rebate-confirmation.service';

const rebateId = '00000000-0000-4000-8000-000000000010';
const accountId = '00000000-0000-4000-8000-000000000011';
const operatorId = '00000000-0000-4000-8000-000000000012';
const financeUser = { sub: operatorId, username: 'finance', roles: [], permissions: ['FINANCE_REBATE_CONFIRM'] };

function createFixture(options: { status?: RebateRecordStatus; accountId?: string | null; failTransaction?: boolean; missing?: boolean; rebateAmount?: string } = {}) {
  const state = {
    status: options.status ?? RebateRecordStatus.PENDING_CONFIRMATION,
    accountId: options.accountId === undefined ? accountId : options.accountId,
    accountBalance: new Prisma.Decimal('10000.00'),
    transactionCreated: 0,
    accountUpdateCount: 0,
    recordUpdateCount: 0,
    recordUpdateData: undefined as Record<string, unknown> | undefined,
    lastTransactionData: undefined as Record<string, unknown> | undefined,
  };
  let queryCount = 0;
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      if (queryCount % 2 === 1) return options.missing ? [] : [{ id: rebateId, account_id: state.accountId, rebate_amount: new Prisma.Decimal(options.rebateAmount ?? '1000.00'), status: state.status }];
      return [{ id: accountId, name: '客户资金账户', status: 'ACTIVE', current_balance: state.accountBalance }];
    },
    transaction: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (options.failTransaction) throw new Error('模拟流水写入失败');
        state.transactionCreated += 1;
        state.lastTransactionData = args.data;
        const amount = args.data.changeAmount as Prisma.Decimal;
        return {
          id: '00000000-0000-4000-8000-000000000013',
          transactionNo: 'TX202609100001',
          accountId,
          businessType: TransactionBusinessType.REBATE,
          businessNo: args.data.businessNo as string,
          changeAmount: amount,
          balanceBefore: state.accountBalance,
          balanceAfter: state.accountBalance.add(amount),
          occurredAt: new Date('2026-09-10T10:00:00.000Z'),
          operatorId,
          remark: args.data.remark as string,
        };
      },
    },
    account: {
      update: async (args: { data: { currentBalance: Prisma.Decimal } }) => {
        state.accountUpdateCount += 1;
        state.accountBalance = args.data.currentBalance;
      },
    },
    rebateRecord: {
      update: async (args: { data: Record<string, unknown> }) => {
        state.recordUpdateCount += 1;
        state.recordUpdateData = args.data;
        state.status = args.data.status as RebateRecordStatus;
      },
    },
  };
  const prisma = { $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(tx) };
  const service = new RebateConfirmationService(prisma as never, new CashflowService({} as never));
  return { service, state };
}

describe('RebateConfirmationService', () => {
  it('确认成功时创建一条 REBATE 流水并同步增加账户余额', async () => {
    const fixture = createFixture();
    const result = await fixture.service.confirm(rebateId, financeUser);
    assert.equal(result.status, RebateRecordStatus.CONFIRMED);
    assert.equal(result.rebateAmount, '1000.00');
    assert.equal(result.balanceBefore, '10000.00');
    assert.equal(result.balanceAfter, '11000.00');
    assert.equal(fixture.state.transactionCreated, 1);
    assert.equal(fixture.state.accountUpdateCount, 1);
    assert.equal(fixture.state.recordUpdateCount, 1);
    assert.equal(fixture.state.lastTransactionData?.businessType, TransactionBusinessType.REBATE);
    assert.equal(fixture.state.lastTransactionData?.businessNo, `REBATE-${rebateId}`);
    assert.equal((fixture.state.lastTransactionData?.changeAmount as Prisma.Decimal).toFixed(2), '1000.00');
    assert.equal(fixture.state.recordUpdateData?.confirmedBy, operatorId);
    assert.equal(fixture.state.recordUpdateData?.status, RebateRecordStatus.CONFIRMED);
    assert.equal(fixture.state.recordUpdateData?.confirmedAt instanceof Date, true);
  });

  it('已确认记录不能重复确认', async () => {
    const fixture = createFixture({ status: RebateRecordStatus.CONFIRMED });
    await assert.rejects(() => fixture.service.confirm(rebateId, financeUser), /该返点记录已确认，不能重复操作/);
    assert.equal(fixture.state.transactionCreated, 0);
    assert.equal(fixture.state.accountUpdateCount, 0);
  });

  it('私反返点确认使用记录中的 909.10，不重新计算金额', async () => {
    const fixture = createFixture({ rebateAmount: '909.10' });
    const result = await fixture.service.confirm(rebateId, financeUser);
    assert.equal(result.rebateAmount, '909.10');
    assert.equal(result.balanceAfter, '10909.10');
    assert.equal((fixture.state.lastTransactionData?.changeAmount as Prisma.Decimal).toFixed(2), '909.10');
  });

  it('不存在、非待确认和未关联账户的记录不能确认', async () => {
    const missing = createFixture({ missing: true });
    await assert.rejects(() => missing.service.confirm(rebateId, financeUser), (error: unknown) => error instanceof NotFoundException && error.message === '返点记录不存在。');

    const missingAccount = createFixture({ accountId: null });
    await assert.rejects(() => missingAccount.service.confirm(rebateId, financeUser), /返点记录未关联资金账户/);

    const cancelled = createFixture({ status: RebateRecordStatus.CANCELLED });
    await assert.rejects(() => cancelled.service.confirm(rebateId, financeUser), /当前状态不允许确认/);
  });

  it('无财务确认权限返回 403', async () => {
    const fixture = createFixture();
    await assert.rejects(() => fixture.service.confirm(rebateId, { ...financeUser, permissions: [], roles: [] }), (error: unknown) => error instanceof ForbiddenException);
    assert.equal(fixture.state.transactionCreated, 0);
  });

  it('流水写入失败时不更新账户和返点状态', async () => {
    const fixture = createFixture({ failTransaction: true });
    await assert.rejects(() => fixture.service.confirm(rebateId, financeUser), /模拟流水写入失败/);
    assert.equal(fixture.state.transactionCreated, 0);
    assert.equal(fixture.state.accountUpdateCount, 0);
    assert.equal(fixture.state.recordUpdateCount, 0);
    assert.equal(fixture.state.accountBalance.toFixed(2), '10000.00');
    assert.equal(fixture.state.status, RebateRecordStatus.PENDING_CONFIRMATION);
  });

  it('同一记录连续确认只能成功一次', async () => {
    const fixture = createFixture();
    await fixture.service.confirm(rebateId, financeUser);
    await assert.rejects(() => fixture.service.confirm(rebateId, financeUser), /该返点记录已确认，不能重复操作/);
    assert.equal(fixture.state.transactionCreated, 1);
    assert.equal(fixture.state.accountUpdateCount, 1);
  });
});
