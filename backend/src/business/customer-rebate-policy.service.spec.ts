import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RebateRuleStatus, RebateRuleType } from '@prisma/client';
import { CustomerRebatePolicyService, policyRangesOverlap, selectEffectivePolicyVersion } from './customer-rebate-policy.service';

const at = (value: string) => new Date(`${value}T00:00:00.000Z`);
const activeVersion = (effectiveFrom: string, effectiveTo: string | null, rate: string) => ({ status: RebateRuleStatus.ACTIVE, effectiveFrom: at(effectiveFrom), effectiveTo: effectiveTo ? at(effectiveTo) : null, rate, rebateType: RebateRuleType.FIXED_ADD });

describe('CustomerRebatePolicyService', () => {
  it('不同客户可以分别命中 10%、8%、6.5% 和 12% 政策', () => {
    const policies = new Map([
      ['A', [activeVersion('2026-09-01', null, '10.0000')]],
      ['B', [activeVersion('2026-09-01', null, '8.0000')]],
      ['C', [activeVersion('2026-09-01', null, '6.5000')]],
      ['D', [activeVersion('2026-09-01', null, '12.0000')]],
    ]);
    assert.equal(selectEffectivePolicyVersion(policies.get('A')!, at('2026-09-10'))?.rate, '10.0000');
    assert.equal(selectEffectivePolicyVersion(policies.get('B')!, at('2026-09-10'))?.rate, '8.0000');
    assert.equal(selectEffectivePolicyVersion(policies.get('C')!, at('2026-09-10'))?.rate, '6.5000');
    assert.equal(selectEffectivePolicyVersion(policies.get('D')!, at('2026-09-10'))?.rate, '12.0000');
  });

  it('按 [start, end) 选择历史版本', () => {
    const versions = [activeVersion('2026-09-01', '2026-10-01', '10.0000'), activeVersion('2026-10-01', null, '8.0000')];
    assert.equal(selectEffectivePolicyVersion(versions, at('2026-09-30'))?.rate, '10.0000');
    assert.equal(selectEffectivePolicyVersion(versions, at('2026-10-01'))?.rate, '8.0000');
    assert.equal(selectEffectivePolicyVersion(versions, at('2026-08-31')), null);
  });

  it('重叠政策被识别为冲突', () => {
    assert.equal(policyRangesOverlap(at('2026-09-01'), at('2026-10-01'), at('2026-09-15'), at('2026-11-01')), true);
    assert.equal(policyRangesOverlap(at('2026-09-01'), at('2026-10-01'), at('2026-10-01'), null), false);
  });

  it('没有有效政策时返回 CUSTOMER_REBATE_POLICY_NOT_FOUND', async () => {
    const service = new CustomerRebatePolicyService(
      { customer: { findUnique: async () => ({ id: 'customer-a', name: '客户A', agentId: 'org-a' }) }, customerRebatePolicy: { findMany: async () => [] } } as never,
      { canViewCustomerRebatePolicy: () => true, isSuperAdmin: () => false, assertOrganizationAccess: async () => undefined } as never,
    );
    await assert.rejects(() => service.getCurrent('customer-a', {}, { sub: 'user-a', username: 'user-a', roles: [], permissions: [] }), (error: unknown) => error instanceof NotFoundException && (error.getResponse() as { code: string }).code === 'CUSTOMER_REBATE_POLICY_NOT_FOUND');
  });

  it('跨组织访问被拒绝', async () => {
    const service = new CustomerRebatePolicyService(
      { customer: { findUnique: async () => ({ id: 'customer-b', name: '客户B', agentId: 'org-b' }) } } as never,
      { canViewCustomerRebatePolicy: () => true, isSuperAdmin: () => false, assertOrganizationAccess: async () => { throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作该客户返点政策' }); } } as never,
    );
    await assert.rejects(() => service.getCurrent('customer-b', {}, { sub: 'user-a', username: 'user-a', roles: [], permissions: [] }), ForbiddenException);
  });
});
