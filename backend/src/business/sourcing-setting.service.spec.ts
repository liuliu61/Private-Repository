import assert from 'node:assert/strict';
import test from 'node:test';
import { SourcingSettingService } from './sourcing-setting.service';

test('外采配置默认关闭客户钱包联动并可审计更新', async () => {
  let row: any = null;
  const prisma: any = {
    sourcingSetting: {
      findUnique: async () => row,
      upsert: async ({ create, update }: any) => { row = { id: 'setting-1', organizationId: create.organizationId, useCustomerWallet: update.useCustomerWallet, updatedBy: update.updatedBy, createdAt: new Date(), updatedAt: new Date() }; return row; },
    },
    organization: { findFirst: async () => ({ id: 'org-a' }) },
    auditLog: { create: async () => undefined },
    $transaction: async (callback: any) => callback(prisma),
  };
  const scope: any = { isSuperAdmin: () => false, getOrganizationIds: async () => ['org-a'], assertOrganizationAccess: async () => undefined };
  const service = new SourcingSettingService(prisma, scope);
  const context: any = { sub: 'user-a', roles: ['FINANCE'], permissions: ['PROCUREMENT_SETTING_EDIT', 'PROCUREMENT_VIEW'] };
  assert.equal((await service.get({}, context)).useCustomerWallet, false);
  assert.equal((await service.update({}, { useCustomerWallet: true }, context)).useCustomerWallet, true);
});
