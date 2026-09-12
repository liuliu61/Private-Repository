import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, RebateCalculationMode, RebateRuleType, SupplierPlatform } from '@prisma/client';
import { selectBestSupplierPolicy, SupplierPolicyCandidate, SupplierRebatePolicyService } from './supplier-rebate-policy.service';

const date = (value: string) => new Date(value);

function candidate(overrides: Partial<SupplierPolicyCandidate> = {}): SupplierPolicyCandidate {
  return {
    supplierId: 'supplier-a',
    policyId: `policy-${Math.random()}`,
    policyVersionId: `version-${Math.random()}`,
    platform: null,
    subjectId: null,
    accountId: null,
    rebateType: RebateRuleType.FIXED_ADD,
    calculationMode: RebateCalculationMode.CASH_TO_CREDIT,
    rate: new Prisma.Decimal('8'),
    effectiveFrom: date('2026-09-01T00:00:00.000Z'),
    effectiveTo: null,
    version: 1,
    ...overrides,
  };
}

test('成本政策按账户、主体、平台到供应商默认的精度选择', () => {
  const result = selectBestSupplierPolicy([
    candidate({ policyId: 'supplier', rate: new Prisma.Decimal('8') }),
    candidate({ policyId: 'platform', platform: SupplierPlatform.DOUYIN, rate: new Prisma.Decimal('7.5') }),
    candidate({ policyId: 'subject', subjectId: 'subject-a', rate: new Prisma.Decimal('7') }),
    candidate({ policyId: 'account', accountId: 'account-a', rate: new Prisma.Decimal('6.5') }),
  ], {
    supplierId: 'supplier-a',
    platform: SupplierPlatform.DOUYIN,
    subjectId: 'subject-a',
    accountId: 'account-a',
    at: date('2026-09-10T00:00:00.000Z'),
  });

  assert.equal(result?.policyId, 'account');
  assert.equal(result?.matchLevel, 'ACCOUNT');
  assert.equal(result?.rate.toFixed(4), '6.5000');
});

test('成本政策使用左闭右开时间范围并按版本切换', () => {
  const policies = [
    candidate({ policyId: 'v1', version: 1, rate: new Prisma.Decimal('8'), effectiveTo: date('2026-10-01T00:00:00.000Z') }),
    candidate({ policyId: 'v2', version: 2, rate: new Prisma.Decimal('7'), effectiveFrom: date('2026-10-01T00:00:00.000Z') }),
  ];
  const before = selectBestSupplierPolicy(policies, { supplierId: 'supplier-a', at: date('2026-09-15T00:00:00.000Z') });
  const after = selectBestSupplierPolicy(policies, { supplierId: 'supplier-a', at: date('2026-10-01T00:00:00.000Z') });

  assert.equal(before?.policyId, 'v1');
  assert.equal(after?.policyId, 'v2');
});

test('没有有效成本政策时返回空结果', () => {
  const result = selectBestSupplierPolicy([candidate({ effectiveFrom: date('2026-10-01T00:00:00.000Z') })], { supplierId: 'supplier-a', at: date('2026-09-10T00:00:00.000Z') });
  assert.equal(result, null);
});

test('同一匹配范围存在重叠有效政策时返回冲突', () => {
  assert.throws(
    () => selectBestSupplierPolicy([
      candidate({ policyId: 'one', rate: new Prisma.Decimal('8') }),
      candidate({ policyId: 'two', rate: new Prisma.Decimal('7') }),
    ], { supplierId: 'supplier-a', at: date('2026-09-10T00:00:00.000Z') }),
    (error: unknown) => {
      if (!(error instanceof ConflictException)) return false;
      const response = error.getResponse();
      return typeof response === 'object' && response !== null && 'code' in response && response.code === 'SUPPLIER_REBATE_POLICY_CONFLICT';
    },
  );
});

test('跨组织访问供应商时由服务层拒绝', async () => {
  const prisma = {
    supplier: { findUnique: async () => ({ id: 'supplier-b', name: '供应商B', organizationId: 'org-b', status: 'ACTIVE' }) },
  } as never;
  const scope = {
    canViewCustomerRebatePolicy: () => true,
    isSuperAdmin: () => false,
    assertOrganizationAccess: async () => { throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权访问该组织数据' }); },
  } as never;
  const service = new SupplierRebatePolicyService(prisma, scope);

  await assert.rejects(() => service.getCurrent('supplier-b', { at: '2026-09-10T00:00:00.000Z' }, { sub: 'user-a', username: '用户A', roles: [], permissions: [] }), ForbiddenException);
});
