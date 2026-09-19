import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Prisma, RebateRuleStatus, RebateRuleType } from '@prisma/client';
import { RebateCalculator } from './rebate.calculator';
import { RebateService } from './rebate.service';

const context = { sub: '00000000-0000-4000-8000-000000000001', username: 'tester', roles: [], permissions: ['SYSTEM_ACCESS'] };
const customerId = '00000000-0000-4000-8000-000000000002';
const ruleId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000004';
const activeRule = {
  id: ruleId,
  name: '固定返点规则',
  ruleType: RebateRuleType.FIXED_ADD,
  rate: new Prisma.Decimal('10.0000'),
  effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
  effectiveTo: null,
  status: RebateRuleStatus.ACTIVE,
  remark: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('RebateService', () => {
  it('无规则 ID 时按请求参数计算，但不伪造返点记录', async () => {
    let recordCreated = false;
    const prisma = {
      rebateRule: { findUnique: async () => null },
      customer: { findUnique: async () => null },
      rebateRecord: { create: async () => { recordCreated = true; } },
    };
    const service = new RebateService(prisma as never, new RebateCalculator());
    const result = await service.calculate({ amount: '10000.00', rate: '10.00', type: RebateRuleType.PRIVATE_DIVIDE }, context);
    // 生产计算接口额外返回 cashAmount / calculationMode；金额按 ROUND_HALF_UP 四舍五入到分
    assert.equal(result.paymentAmount, '9090.91');
    assert.equal(result.rebateAmount, '909.09');
    assert.equal(result.creditAmount, '10000.00');
    assert.equal(recordCreated, false);
  });

  it('指定规则时规则比例和类型优先，并保存 RebateRecord', async () => {
    let savedData: Record<string, unknown> | undefined;
    const prisma = {
      rebateRule: { findUnique: async () => activeRule },
      customer: { findUnique: async () => ({ id: customerId, status: 'ACTIVE' }) },
      account: { findUnique: async () => ({ id: accountId, status: 'ACTIVE' }) },
      rebateRecord: { create: async (args: { data: Record<string, unknown> }) => { savedData = args.data; } },
    };
    const service = new RebateService(prisma as never, new RebateCalculator());
    const result = await service.calculate({ amount: '10000.00', rate: '5.00', type: RebateRuleType.PRIVATE_DIVIDE, customerId, ruleId, accountId }, context);
    assert.equal(result.paymentAmount, '10000.00');
    assert.equal(result.rebateAmount, '1000.00');
    assert.equal(result.creditAmount, '11000.00');
    assert.equal((savedData?.rebateRate as Prisma.Decimal).toFixed(4), '10.0000');
    assert.equal(savedData?.customerId, customerId);
    assert.equal(savedData?.rebateRuleId, ruleId);
    assert.equal(savedData?.createdBy, context.sub);
  });

  it('客户 ID 没有对应规则时拒绝保存正式记录', async () => {
    const prisma = { rebateRule: { findUnique: async () => null }, customer: { findUnique: async () => null }, rebateRecord: { create: async () => undefined } };
    const service = new RebateService(prisma as never, new RebateCalculator());
    await assert.rejects(() => service.calculate({ amount: '10000.00', rate: '10.00', type: RebateRuleType.FIXED_ADD, customerId }, context), /保存返点记录必须关联返点规则/);
  });

  it('拒绝非法金额和负金额', async () => {
    const prisma = { rebateRule: { findUnique: async () => null }, customer: { findUnique: async () => null }, rebateRecord: { create: async () => undefined } };
    const service = new RebateService(prisma as never, new RebateCalculator());
    await assert.rejects(() => service.calculate({ amount: 'abc', rate: '10.00', type: RebateRuleType.FIXED_ADD }, context), /计算金额格式不正确/);
    await assert.rejects(() => service.calculate({ amount: '-1.00', rate: '10.00', type: RebateRuleType.FIXED_ADD }, context), /计算金额必须大于 0/);
  });
});
