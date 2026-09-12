import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { validate } from 'class-validator';
import { AccountsController } from './accounts.controller';
import { AccountIdParamDto } from './dto/account-id-param.dto';

const user = { sub: '00000000-0000-4000-8000-000000000001', username: 'tester', roles: [], permissions: ['SYSTEM_ACCESS'] };
const accountId = '00000000-0000-4000-8000-000000000002';

describe('AccountsController', () => {
  it('非法账户 ID 会被 DTO 校验，HTTP 层返回 400', async () => {
    const params = new AccountIdParamDto();
    params.id = 'not-a-uuid';
    const errors = await validate(params);
    assert.equal(errors.length > 0, true);
    assert.equal(errors[0].constraints?.isUuid, '账户ID格式不正确');
  });

  it('调用余额校验服务并传递账户 ID 和 JWT 上下文', async () => {
    let received: unknown;
    const service = {
      recalculateAccountBalance: async (id: string, context: unknown) => {
        received = { id, context };
        return { accountId: id, currentBalance: '10000.00', calculatedBalance: '10000.00', difference: '0.00', consistent: true };
      },
    };
    const controller = new AccountsController(service as never);
    const result = await controller.getAccountBalanceCheck({ id: accountId }, { user } as never);
    assert.deepEqual(received, { id: accountId, context: user });
    assert.equal(result.consistent, true);
    assert.equal(result.currentBalance, '10000.00');
  });

  it('余额校验返回不一致结果时不修改余额', async () => {
    let writeCalled = false;
    const service = {
      recalculateAccountBalance: async () => ({ accountId, currentBalance: '10000.00', calculatedBalance: '9000.00', difference: '1000.00', consistent: false }),
      updateAccount: async () => { writeCalled = true; },
    };
    const controller = new AccountsController(service as never);
    const result = await controller.getAccountBalanceCheck({ id: accountId }, { user } as never);
    assert.equal(result.consistent, false);
    assert.equal(writeCalled, false);
  });
});
