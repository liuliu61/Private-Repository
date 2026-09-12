import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { CustomerWalletService } from './customer-wallet.service';

test('外采转入联动客户外采CNY钱包扣减现金', async () => {
  let balance = new Prisma.Decimal('10000.00');
  let created: any;
  const tx: any = {
    customerWallet: {
      findUnique: async () => ({ id: 'wallet-a', customerId: 'customer-a', organizationId: 'org-a', walletType: 'EXTERNAL_PROCUREMENT', unit: 'CNY', status: 'ACTIVE', cashBalance: balance, groupBalance: new Prisma.Decimal(0) }),
      update: async ({ data }: any) => { balance = data.cashBalance; return { id: 'wallet-a' }; },
    },
    customerWalletTransaction: {
      findUnique: async () => null,
      create: async ({ data }: any) => { created = data; return { ...data, id: 'wallet-tx-a' }; },
    },
    auditLog: { create: async () => undefined },
    $queryRaw: async () => [],
  };
  const service = new CustomerWalletService({} as never, { assertOrganizationAccess: async () => undefined } as never);
  const result = await service.applyProcurementChangeInTransaction(tx, { customerId: 'customer-a', organizationId: 'org-a', changeAmount: new Prisma.Decimal('-1000.00'), orderNo: 'PO-1', operatorId: 'user-a' });
  assert.equal(result.idempotent, false);
  assert.equal(created.changeAmount.toFixed(2), '-1000.00');
  assert.equal(created.businessNo, 'PO-1');
  assert.equal(balance.toFixed(2), '9000.00');
});

test('外采转出使用正向客户外采CNY钱包流水', async () => {
  let balance = new Prisma.Decimal('10000.00');
  let created: any;
  const tx: any = {
    customerWallet: { findUnique: async () => ({ id: 'wallet-a', customerId: 'customer-a', organizationId: 'org-a', walletType: 'EXTERNAL_PROCUREMENT', unit: 'CNY', status: 'ACTIVE', cashBalance: balance, groupBalance: new Prisma.Decimal(0) }), update: async ({ data }: any) => { balance = data.cashBalance; return { id: 'wallet-a' }; } },
    customerWalletTransaction: { findUnique: async () => null, create: async ({ data }: any) => { created = data; return { ...data, id: 'wallet-tx-b' }; } },
    auditLog: { create: async () => undefined },
    $queryRaw: async () => [],
  };
  const service = new CustomerWalletService({} as never, { assertOrganizationAccess: async () => undefined } as never);
  await service.applyProcurementChangeInTransaction(tx, { customerId: 'customer-a', organizationId: 'org-a', changeAmount: new Prisma.Decimal('1000.00'), orderNo: 'PO-2', operatorId: 'user-a' });
  assert.equal(created.changeAmount.toFixed(2), '1000.00');
  assert.equal(balance.toFixed(2), '11000.00');
});
