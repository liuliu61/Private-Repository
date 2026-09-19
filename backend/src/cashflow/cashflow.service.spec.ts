import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Prisma, TransactionBusinessType } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { CashflowService } from './cashflow.service';
import { AccountAccessContext, TransactionQueryInput } from './cashflow.types';

const readableUser: AccountAccessContext = {
  sub: '00000000-0000-4000-8000-000000000001',
  username: 'tester',
  roles: [],
  permissions: ['SYSTEM_ACCESS'],
};

function createTransactionRow(overrides: Partial<{
  id: string;
  transactionNo: string;
  accountId: string;
  businessType: TransactionBusinessType;
  businessNo: string;
  changeAmount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  occurredAt: Date;
  operatorId: string;
  remark: string | null;
}> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    transactionNo: 'TX202609090001',
    accountId: '00000000-0000-4000-8000-000000000002',
    businessType: TransactionBusinessType.RECHARGE,
    businessNo: 'RECHARGE202609090001',
    changeAmount: new Prisma.Decimal('10000.00'),
    balanceBefore: new Prisma.Decimal('0.00'),
    balanceAfter: new Prisma.Decimal('10000.00'),
    occurredAt: new Date('2026-09-09T10:00:00.000Z'),
    operatorId: readableUser.sub,
    remark: '客户充值',
    ...overrides,
  };
}

function createService(rows = [createTransactionRow()]) {
  const prisma = {
    transaction: {
      findMany: async (args: unknown) => {
        (prisma as { lastFindManyArgs?: unknown }).lastFindManyArgs = args;
        return rows;
      },
      count: async (args: unknown) => {
        (prisma as { lastCountArgs?: unknown }).lastCountArgs = args;
        return rows.length;
      },
    },
    $transaction: async (promises: unknown[]) => Promise.all(promises),
    lastFindManyArgs: undefined as unknown,
    lastCountArgs: undefined as unknown,
  };
  return { service: new CashflowService(prisma as never), prisma };
}

describe('CashflowService.getTransactions', () => {
  it('使用默认分页并将 Decimal 金额转换为两位小数字符串', async () => {
    const { service, prisma } = createService();
    const result = await service.getTransactions({}, readableUser);
    const args = prisma.lastFindManyArgs as { skip: number; take: number; orderBy: unknown };
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, 20);
    assert.equal(args.skip, 0);
    assert.equal(args.take, 20);
    assert.deepEqual(args.orderBy, [{ occurredAt: 'desc' }, { transactionNo: 'desc' }]);
    assert.equal(result.items[0].changeAmount, '10000.00');
    assert.equal(result.items[0].balanceBefore, '0.00');
    assert.equal(result.items[0].balanceAfter, '10000.00');
  });

  it('只加入已传入的精确查询条件', async () => {
    const { service, prisma } = createService();
    const input: TransactionQueryInput = {
      accountId: '00000000-0000-4000-8000-000000000002',
      businessType: TransactionBusinessType.RECHARGE,
      businessNo: 'RECHARGE202609090001',
      transactionNo: 'TX202609090001',
      operatorId: readableUser.sub,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T23:59:59.999Z'),
      page: 2,
      pageSize: 50,
    };
    await service.getTransactions(input, readableUser);
    const args = prisma.lastFindManyArgs as { where: Record<string, unknown>; skip: number; take: number };
    assert.deepEqual(args.where, {
      accountId: input.accountId,
      businessType: input.businessType,
      businessNo: input.businessNo,
      transactionNo: input.transactionNo,
      operatorId: input.operatorId,
      occurredAt: { gte: input.startDate, lte: input.endDate },
    });
    assert.equal(args.skip, 50);
    assert.equal(args.take, 50);
  });

  it('分别支持开始时间、结束时间和完整时间区间', async () => {
    const startDate = new Date('2026-09-01T00:00:00.000Z');
    const endDate = new Date('2026-09-30T23:59:59.999Z');

    const startCase = createService();
    await startCase.service.getTransactions({ startDate }, readableUser);
    assert.deepEqual((startCase.prisma.lastFindManyArgs as { where: Record<string, unknown> }).where, { occurredAt: { gte: startDate } });

    const endCase = createService();
    await endCase.service.getTransactions({ endDate }, readableUser);
    assert.deepEqual((endCase.prisma.lastFindManyArgs as { where: Record<string, unknown> }).where, { occurredAt: { lte: endDate } });

    const rangeCase = createService();
    await rangeCase.service.getTransactions({ startDate, endDate }, readableUser);
    assert.deepEqual((rangeCase.prisma.lastFindManyArgs as { where: Record<string, unknown> }).where, { occurredAt: { gte: startDate, lte: endDate } });
  });

  it('支持空结果并拒绝超出分页范围的请求', async () => {
    const { service } = createService([]);
    const empty = await service.getTransactions({ page: 1, pageSize: 100 }, readableUser);
    assert.deepEqual(empty.items, []);
    assert.equal(empty.total, 0);
    await assert.rejects(() => service.getTransactions({ pageSize: 101 }, readableUser), (error: unknown) => error instanceof Error && error.message === '每页数量必须是 1 到 100 之间的整数');
  });

  it('没有系统访问权限时拒绝查询流水', async () => {
    const { service } = createService();
    await assert.rejects(() => service.getTransactions({}, { ...readableUser, permissions: [], roles: [] }), (error: unknown) => error instanceof ForbiddenException && error.message === '当前用户没有查看资金账户的权限');
  });
});

describe('CashflowService.createTransaction and recalculateAccountBalance', () => {
  const accountId = '00000000-0000-4000-8000-000000000002';

  function createWriteService(balance = '0.00', failOnCreate = false) {
    let updatedBalance: Prisma.Decimal | undefined;
    let created = false;
    const transactionRow = createTransactionRow({ accountId, balanceBefore: new Prisma.Decimal(balance) });
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        $queryRaw: async () => [{ id: accountId, name: '测试账户', status: 'ACTIVE', current_balance: new Prisma.Decimal(balance) }],
        transaction: {
          create: async () => {
            if (failOnCreate) throw new Error('模拟流水写入失败');
            created = true;
            return { ...transactionRow, balanceAfter: new Prisma.Decimal(balance).add(new Prisma.Decimal('10000.00')) };
          },
        },
        account: { update: async (args: { data: { currentBalance: Prisma.Decimal } }) => { updatedBalance = args.data.currentBalance; } },
      }),
    };
    return { service: new CashflowService(prisma as never), getUpdatedBalance: () => updatedBalance, wasCreated: () => created };
  }

  it('创建正向流水后返回正确的余额变化', async () => {
    const state = createWriteService('0.00');
    const result = await state.service.createTransaction({ accountId, businessType: TransactionBusinessType.RECHARGE, businessNo: 'RECHARGE-1', changeAmount: '10000.00', operatorId: readableUser.sub });
    assert.equal(result.balanceBefore, '0.00');
    assert.equal(result.balanceAfter, '10000.00');
    assert.equal(state.getUpdatedBalance()?.toFixed(2), '10000.00');
  });

  it('创建失败时不更新账户余额', async () => {
    const state = createWriteService('10000.00', true);
    await assert.rejects(() => state.service.createTransaction({ accountId, businessType: TransactionBusinessType.REFUND, businessNo: 'REFUND-1', changeAmount: '-3000.00', operatorId: readableUser.sub }));
    assert.equal(state.wasCreated(), false);
    assert.equal(state.getUpdatedBalance(), undefined);
  });

  it('余额重新计算可以返回一致和不一致结果', async () => {
    const account = { id: accountId, openingBalance: new Prisma.Decimal('0.00'), currentBalance: new Prisma.Decimal('10000.00') };
    const prisma = {
      account: { findUnique: async () => account },
      transaction: { aggregate: async () => ({ _sum: { changeAmount: new Prisma.Decimal('10000.00') } }) },
    };
    const service = new CashflowService(prisma as never);
    const consistent = await service.recalculateAccountBalance(accountId, readableUser);
    assert.deepEqual(consistent, { accountId, currentBalance: '10000.00', calculatedBalance: '10000.00', difference: '0.00', consistent: true });

    account.currentBalance = new Prisma.Decimal('11000.00');
    const inconsistent = await service.recalculateAccountBalance(accountId, readableUser);
    assert.deepEqual(inconsistent, { accountId, currentBalance: '11000.00', calculatedBalance: '10000.00', difference: '1000.00', consistent: false });
  });
});
