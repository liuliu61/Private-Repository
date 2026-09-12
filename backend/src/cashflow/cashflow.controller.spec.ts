import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { TransactionBusinessType } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CashflowController } from './cashflow.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const user = { sub: '00000000-0000-4000-8000-000000000001', username: 'tester', roles: [], permissions: ['SYSTEM_ACCESS'] };

describe('CashflowController', () => {
  it('控制器使用 JwtAuthGuard，未登录请求由 Guard 拒绝并返回 401', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CashflowController) as unknown[];
    assert.equal(guards.includes(JwtAuthGuard), true);
  });

  it('把查询 DTO 转换为 Service 查询参数并传递 JWT 权限上下文', async () => {
    let received: unknown;
    const service = {
      getTransactions: async (query: unknown, context: unknown) => {
        received = { query, context };
        return { items: [], total: 0, page: 1, pageSize: 20 };
      },
    };
    const controller = new CashflowController(service as never);
    await controller.getTransactions({
      accountId: '00000000-0000-4000-8000-000000000002',
      businessType: TransactionBusinessType.RECHARGE,
      businessNo: 'RECHARGE-1',
      transactionNo: 'TX-1',
      operatorId: user.sub,
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-09-30T23:59:59.999Z',
      page: 2,
      pageSize: 50,
    }, { user } as never);
    const result = received as { query: Record<string, unknown>; context: unknown };
    assert.deepEqual(result.query, {
      accountId: '00000000-0000-4000-8000-000000000002',
      businessType: TransactionBusinessType.RECHARGE,
      businessNo: 'RECHARGE-1',
      transactionNo: 'TX-1',
      operatorId: user.sub,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T23:59:59.999Z'),
      page: 2,
      pageSize: 50,
    });
    assert.deepEqual(result.context, user);
  });

  it('没有删除或修改流水的方法', () => {
    const controller = new CashflowController({ getTransactions: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }) } as never);
    assert.equal('deleteTransaction' in controller, false);
    assert.equal('updateTransaction' in controller, false);
  });
});
