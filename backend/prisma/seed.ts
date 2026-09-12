import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { code: 'SUPER_ADMIN' },
    update: {},
    create: { code: 'SUPER_ADMIN', name: '超级管理员', description: '拥有系统全部权限' },
  });

  const permission = await prisma.permission.upsert({
    where: { code: 'SYSTEM_ACCESS' },
    update: {},
    create: { code: 'SYSTEM_ACCESS', name: '系统访问', description: '允许登录系统并访问基础模块' },
  });

  const financeConfirmPermission = await prisma.permission.upsert({
    where: { code: 'FINANCE_REBATE_CONFIRM' },
    update: {},
    create: { code: 'FINANCE_REBATE_CONFIRM', name: '返点确认入账', description: '允许确认返点并生成资金流水' },
  });

  const financeViewPermission = await prisma.permission.upsert({
    where: { code: 'FINANCE_VIEW' },
    update: {},
    create: { code: 'FINANCE_VIEW', name: '财务中心查看', description: '允许查看财务概览和订单利润' },
  });

  const refundPermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'FINANCE_REFUND_VIEW' }, update: {}, create: { code: 'FINANCE_REFUND_VIEW', name: '退款记录查看', description: '允许查看退款申请和退款流水' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_REFUND_CREATE' }, update: {}, create: { code: 'FINANCE_REFUND_CREATE', name: '退款申请', description: '允许提交客户退款申请' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_REFUND_APPROVE' }, update: {}, create: { code: 'FINANCE_REFUND_APPROVE', name: '退款审批与执行', description: '允许审批、驳回和执行客户退款' } }),
  ]);

  const settlementPermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'FINANCE_SETTLEMENT_VIEW' }, update: {}, create: { code: 'FINANCE_SETTLEMENT_VIEW', name: '结算单查看', description: '允许查看客户和一级代理结算单' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_SETTLEMENT_CREATE' }, update: {}, create: { code: 'FINANCE_SETTLEMENT_CREATE', name: '结算单生成', description: '允许生成客户和一级代理结算单' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_SETTLEMENT_CONFIRM' }, update: {}, create: { code: 'FINANCE_SETTLEMENT_CONFIRM', name: '结算单确认', description: '允许确认结算单' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_SETTLEMENT_CANCEL' }, update: {}, create: { code: 'FINANCE_SETTLEMENT_CANCEL', name: '结算单取消', description: '允许取消未确认结算单' } }),
  ]);

  const reconciliationPermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'FINANCE_RECONCILIATION_VIEW' }, update: {}, create: { code: 'FINANCE_RECONCILIATION_VIEW', name: '财务对账查看', description: '允许查看财务对账记录' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_RECONCILIATION_CREATE' }, update: {}, create: { code: 'FINANCE_RECONCILIATION_CREATE', name: '财务对账生成与检查', description: '允许生成和检查财务对账' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_RECONCILIATION_CONFIRM' }, update: {}, create: { code: 'FINANCE_RECONCILIATION_CONFIRM', name: '财务对账确认', description: '允许确认通过的财务对账' } }),
  ]);

  const adjustmentPermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'FINANCE_ADJUST_VIEW' }, update: {}, create: { code: 'FINANCE_ADJUST_VIEW', name: '财务调整查看', description: '允许查看财务调整单' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_ADJUST_CREATE' }, update: {}, create: { code: 'FINANCE_ADJUST_CREATE', name: '财务调整创建', description: '允许创建财务调整单' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_ADJUST_APPROVE' }, update: {}, create: { code: 'FINANCE_ADJUST_APPROVE', name: '财务调整审核', description: '允许审核或拒绝财务调整单' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_ADJUST_EXECUTE' }, update: {}, create: { code: 'FINANCE_ADJUST_EXECUTE', name: '财务调整执行', description: '允许执行财务调整并生成资金流水' } }),
  ]);

  const walletPermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'FINANCE_WALLET_VIEW' }, update: {}, create: { code: 'FINANCE_WALLET_VIEW', name: '客户钱包查看', description: '允许查看客户钱包和钱包明细' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_WALLET_ADJUST' }, update: {}, create: { code: 'FINANCE_WALLET_ADJUST', name: '客户钱包调整', description: '允许进行客户钱包红冲、蓝补、授信和垫款配置' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_WALLET_OPENING_BALANCE' }, update: {}, create: { code: 'FINANCE_WALLET_OPENING_BALANCE', name: '客户钱包期初余额', description: '允许录入客户钱包期初余额' } }),
  ]);

  const serviceFeePermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'FINANCE_SERVICE_FEE_RECONCILIATION_VIEW' }, update: {}, create: { code: 'FINANCE_SERVICE_FEE_RECONCILIATION_VIEW', name: '服务费对账查看', description: '允许查看服务费对账数据' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_SERVICE_FEE_RECONCILIATION_EXPORT' }, update: {}, create: { code: 'FINANCE_SERVICE_FEE_RECONCILIATION_EXPORT', name: '服务费对账导出', description: '允许导出服务费对账数据' } }),
  ]);

  const receivingPermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'FINANCE_RECEIVE_VIEW' }, update: {}, create: { code: 'FINANCE_RECEIVE_VIEW', name: '收款记录查看', description: '允许查看收款记录' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_RECEIVE_CREATE' }, update: {}, create: { code: 'FINANCE_RECEIVE_CREATE', name: '收款记录创建', description: '允许创建收款记录' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_RECEIVE_CONFIRM' }, update: {}, create: { code: 'FINANCE_RECEIVE_CONFIRM', name: '收款确认入账', description: '允许确认收款并生成CNY资金流水' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_BANK_TRANSACTION_VIEW' }, update: {}, create: { code: 'FINANCE_BANK_TRANSACTION_VIEW', name: '银行交易查看', description: '允许查看银行原始交易' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_BANK_TRANSACTION_IMPORT' }, update: {}, create: { code: 'FINANCE_BANK_TRANSACTION_IMPORT', name: '银行交易导入', description: '允许导入银行原始交易' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_BANK_TRANSACTION_MATCH' }, update: {}, create: { code: 'FINANCE_BANK_TRANSACTION_MATCH', name: '银行交易匹配', description: '允许匹配或取消匹配银行交易' } }),
  ]);

  const invoicePermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'FINANCE_INVOICE_VIEW' }, update: {}, create: { code: 'FINANCE_INVOICE_VIEW', name: '发票查看', description: '允许查看发票记录和未开票金额' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_INVOICE_CREATE' }, update: {}, create: { code: 'FINANCE_INVOICE_CREATE', name: '发票创建', description: '允许创建发票草稿' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_INVOICE_EDIT' }, update: {}, create: { code: 'FINANCE_INVOICE_EDIT', name: '发票草稿编辑', description: '允许编辑发票草稿' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_INVOICE_CONFIRM' }, update: {}, create: { code: 'FINANCE_INVOICE_CONFIRM', name: '发票确认', description: '允许确认开票' } }),
    prisma.permission.upsert({ where: { code: 'FINANCE_INVOICE_VOID' }, update: {}, create: { code: 'FINANCE_INVOICE_VOID', name: '发票作废', description: '允许作废发票记录' } }),
  ]);

  const financeRebateViewPermission = await prisma.permission.upsert({
    where: { code: 'FINANCE_REBATE_VIEW' },
    update: {},
    create: { code: 'FINANCE_REBATE_VIEW', name: '客户返点政策查看', description: '允许查看客户返点政策及历史版本' },
  });

  const financeRebatePolicyEditPermission = await prisma.permission.upsert({
    where: { code: 'FINANCE_REBATE_POLICY_EDIT' },
    update: {},
    create: { code: 'FINANCE_REBATE_POLICY_EDIT', name: '客户返点政策维护', description: '允许新增版本和停用客户返点政策' },
  });

  const procurementPermissions = await Promise.all([
    prisma.permission.upsert({ where: { code: 'PROCUREMENT_VIEW' }, update: {}, create: { code: 'PROCUREMENT_VIEW', name: '外采订单查看', description: '允许查看外采订单' } }),
    prisma.permission.upsert({ where: { code: 'PROCUREMENT_CREATE' }, update: {}, create: { code: 'PROCUREMENT_CREATE', name: '外采订单创建', description: '允许创建和提交外采订单' } }),
    prisma.permission.upsert({ where: { code: 'PROCUREMENT_CONFIRM' }, update: {}, create: { code: 'PROCUREMENT_CONFIRM', name: '外采订单确认', description: '允许确认外采订单' } }),
    prisma.permission.upsert({ where: { code: 'PROCUREMENT_CANCEL' }, update: {}, create: { code: 'PROCUREMENT_CANCEL', name: '外采订单取消', description: '允许取消外采订单' } }),
    prisma.permission.upsert({ where: { code: 'PROCUREMENT_SETTLE' }, update: {}, create: { code: 'PROCUREMENT_SETTLE', name: '外采订单结算状态', description: '允许将已确认外采订单标记为已结算' } }),
    prisma.permission.upsert({ where: { code: 'PROCUREMENT_IMPORT' }, update: {}, create: { code: 'PROCUREMENT_IMPORT', name: '外采订单导入校验', description: '允许校验外采订单导入数据' } }),
    prisma.permission.upsert({ where: { code: 'PROCUREMENT_SETTING_EDIT' }, update: {}, create: { code: 'PROCUREMENT_SETTING_EDIT', name: '外采配置修改', description: '允许修改外采客户钱包联动配置' } }),
  ]);

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
    update: {},
    create: { roleId: adminRole.id, permissionId: permission.id },
  });

  for (const item of refundPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  for (const item of settlementPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  for (const item of reconciliationPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  for (const item of adjustmentPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  for (const item of walletPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  for (const item of serviceFeePermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  for (const item of receivingPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  for (const item of invoicePermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: financeConfirmPermission.id } },
    update: {},
    create: { roleId: adminRole.id, permissionId: financeConfirmPermission.id },
  });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: financeViewPermission.id } },
    update: {},
    create: { roleId: adminRole.id, permissionId: financeViewPermission.id },
  });

  for (const item of [financeRebateViewPermission, financeRebatePolicyEditPermission]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  for (const item of procurementPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: item.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: item.id },
    });
  }

  const passwordHash = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash, displayName: '系统管理员' },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });
}

main().finally(() => prisma.$disconnect());
