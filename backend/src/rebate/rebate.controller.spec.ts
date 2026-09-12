import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RebateController } from './rebate.controller';

describe('RebateController', () => {
  it('返点接口统一使用 JWT 保护', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RebateController) as unknown[];
    assert.equal(guards.includes(JwtAuthGuard), true);
  });

  it('控制器只委托规则和计算服务，不直接修改账户余额', async () => {
    const calls: string[] = [];
    const service = {
      getRules: async () => { calls.push('getRules'); return []; },
      createRule: async () => { calls.push('createRule'); return {}; },
      calculate: async () => { calls.push('calculate'); return { paymentAmount: '10000.00', rebateAmount: '1000.00', creditAmount: '11000.00' }; },
    };
    const controller = new RebateController(service as never, { confirm: async () => ({}) } as never);
    await controller.getRules({ user: {} } as never);
    await controller.calculate({ amount: '10000.00', rate: '10.00', type: 'FIXED_ADD' } as never, { user: {} } as never);
    assert.deepEqual(calls, ['getRules', 'calculate']);
    assert.equal('updateAccountBalance' in controller, false);
  });
});
