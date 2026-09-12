import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, RebateRuleStatus, RebateRuleType, SupplierPlatform } from '@prisma/client';
import { PolicyResolverService } from './policy-resolver.service';

const context = { sub: 'user-a', username: '用户A', roles: ['FINANCE'], permissions: [] };
const at = (value: string) => new Date(value);

function scopeMock() {
  return {
    isSuperAdmin: () => false,
    assertOrganizationAccess: async () => undefined,
  } as never;
}

function version(id: string, value: string, effectiveFrom: string, effectiveTo: string | null = null, number = 1) {
  return {
    id,
    version: number,
    rebateType: RebateRuleType.FIXED_ADD,
    rate: new Prisma.Decimal(value),
    effectiveFrom: at(effectiveFrom),
    effectiveTo: effectiveTo ? at(effectiveTo) : null,
    status: RebateRuleStatus.ACTIVE,
  };
}

test('客户政策解析返回版本快照', async () => {
  const prisma = {
    customer: { findUnique: async () => ({ id: 'customer-a', agentId: 'org-a' }) },
    customerRebatePolicy: { findMany: async () => [{ id: 'customer-policy', versions: [version('customer-version-v1', '10', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')] }] },
  } as never;
  const resolver = new PolicyResolverService(prisma, scopeMock());

  const snapshot = await resolver.resolveCustomerRebatePolicy({ customerId: 'customer-a', businessTime: at('2026-09-15T00:00:00.000Z'), context });

  assert.equal(snapshot.customerPolicyId, 'customer-policy');
  assert.equal(snapshot.customerPolicyVersionId, 'customer-version-v1');
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.rate.toFixed(4), '10.0000');
});

test('供应商政策解析按账户优先级命中账户政策', async () => {
  const prisma = {
    supplier: { findUnique: async () => ({ id: 'supplier-a', organizationId: 'org-a' }) },
    adAccount: { findUnique: async () => ({ subjectId: 'subject-a', platform: SupplierPlatform.DOUYIN }) },
    adSubject: { findUnique: async () => ({ organizationId: 'org-a' }) },
    supplierRebatePolicy: { findMany: async () => [
      { id: 'supplier-default', platform: null, adSubjectId: null, adAccountId: null, versions: [version('v-default', '8', '2026-09-01T00:00:00.000Z')] },
      { id: 'supplier-platform', platform: SupplierPlatform.DOUYIN, adSubjectId: null, adAccountId: null, versions: [version('v-platform', '7', '2026-09-01T00:00:00.000Z')] },
      { id: 'supplier-account', platform: null, adSubjectId: null, adAccountId: 'account-a', versions: [version('v-account', '6', '2026-09-01T00:00:00.000Z')] },
    ] },
  } as never;
  const resolver = new PolicyResolverService(prisma, scopeMock());

  const snapshot = await resolver.resolveSupplierRebatePolicy({ supplierId: 'supplier-a', platform: SupplierPlatform.DOUYIN, subjectId: 'subject-a', accountId: 'account-a', businessTime: at('2026-09-15T00:00:00.000Z'), context });

  assert.equal(snapshot.supplierPolicyId, 'supplier-account');
  assert.equal(snapshot.supplierPolicyVersionId, 'v-account');
  assert.equal(snapshot.matchLevel, 'ACCOUNT');
  assert.equal(snapshot.rate.toFixed(4), '6.0000');
});

test('无客户政策时返回客户政策不存在错误', async () => {
  const prisma = {
    customer: { findUnique: async () => ({ id: 'customer-a', agentId: 'org-a' }) },
    customerRebatePolicy: { findMany: async () => [] },
  } as never;
  const resolver = new PolicyResolverService(prisma, scopeMock());

  await assert.rejects(
    () => resolver.resolveCustomerRebatePolicy({ customerId: 'customer-a', businessTime: at('2026-09-15T00:00:00.000Z'), context }),
    (error: any) => error?.getResponse?.().code === 'CUSTOMER_REBATE_POLICY_NOT_FOUND',
  );
});

test('无供应商政策时返回供应商政策不存在错误', async () => {
  const prisma = {
    supplier: { findUnique: async () => ({ id: 'supplier-a', organizationId: 'org-a' }) },
    supplierRebatePolicy: { findMany: async () => [] },
    adAccount: { findUnique: async () => null },
    adSubject: { findUnique: async () => null },
  } as never;
  const resolver = new PolicyResolverService(prisma, scopeMock());

  await assert.rejects(
    () => resolver.resolveSupplierRebatePolicy({ supplierId: 'supplier-a', businessTime: at('2026-09-15T00:00:00.000Z'), context }),
    (error: any) => error?.getResponse?.().code === 'SUPPLIER_REBATE_POLICY_NOT_FOUND',
  );
});

test('订单保存的客户政策快照不受后续政策变更影响', async () => {
  const firstVersion = version('customer-version-v1', '10', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  let currentVersion = firstVersion;
  const prisma = {
    customer: { findUnique: async () => ({ id: 'customer-a', agentId: 'org-a' }) },
    customerRebatePolicy: { findMany: async () => [{ id: 'customer-policy', versions: [currentVersion] }] },
  } as never;
  const resolver = new PolicyResolverService(prisma, scopeMock());
  const orderSnapshot = await resolver.resolveCustomerRebatePolicy({ customerId: 'customer-a', businessTime: at('2026-09-15T00:00:00.000Z'), context });

  currentVersion = version('customer-version-v2', '8', '2026-10-01T00:00:00.000Z', null, 2);

  assert.equal(orderSnapshot.customerPolicyVersionId, 'customer-version-v1');
  assert.equal(orderSnapshot.rate.toFixed(4), '10.0000');
});
