import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AccountStatus, AdAssetStatus, PaymentStatus, Prisma, PromotionAccountOwnerType, PromotionAccountUnit, PromotionTransactionBusinessType, PurchaseOrderStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionAccountDto, RecordCustomerCreditDto } from './business.dto';
import { CustomerWalletService } from './customer-wallet.service';

@Injectable()
export class PromotionAccountService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService, @Optional() private readonly customerWalletService?: CustomerWalletService) {}

  async listCustomerAccounts(customerId: string, context: AccessContext) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { agentId: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    await this.assertOrganizationAccess(customer.agentId, context);
    const rows = await this.prisma.promotionAccount.findMany({ where: { customerId, ownerType: PromotionAccountOwnerType.CUSTOMER }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.view(row));
  }

  async createCustomerAccount(customerId: string, dto: CreatePromotionAccountDto, context: AccessContext) {
    this.assertPermission(context, 'PROMOTION_ACCOUNT_CREATE');
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { agentId: true, status: true } });
    if (!customer) throw new NotFoundException('客户不存在');
    if (customer.status !== 'ACTIVE') throw new BadRequestException('客户已停用，不能创建推广账户');
    await this.assertOrganizationAccess(customer.agentId, context);
    if (!customer.agentId) throw new BadRequestException('客户未配置所属组织');
    const row = await this.prisma.promotionAccount.create({ data: { organizationId: customer.agentId, ownerType: PromotionAccountOwnerType.CUSTOMER, ownerId: customerId, customerId, accountName: dto.accountName, platform: dto.platform, platformAccountId: dto.platformAccountId, accountCategory: dto.accountCategory, channelName: dto.channelName, unit: PromotionAccountUnit.ACCOUNT_CREDIT, currentBalance: new Prisma.Decimal(0), status: AccountStatus.ACTIVE } });
    return this.view(row);
  }

  async listSupplierAccounts(supplierId: string, context: AccessContext) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { organizationId: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    const orgId = supplier.organizationId || (await this.scope.getOrganizationIds(context))?.[0];
    if (orgId) await this.scope.assertOrganizationAccess(orgId, context);
    const rows = await this.prisma.promotionAccount.findMany({ where: { supplierId, ownerType: PromotionAccountOwnerType.SUPPLIER }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.view(row));
  }

  async createSupplierAccount(supplierId: string, dto: CreatePromotionAccountDto, context: AccessContext) {
    this.assertPermission(context, 'PROMOTION_ACCOUNT_CREATE');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { organizationId: true, status: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    if (supplier.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('供应商已停用，不能创建推广账户');
    const orgId = supplier.organizationId || (await this.scope.getOrganizationIds(context))?.[0];
    if (!orgId) throw new BadRequestException('无法确定所属组织');
    await this.scope.assertOrganizationAccess(orgId, context);
    const row = await this.prisma.promotionAccount.create({ data: { organizationId: orgId, ownerType: PromotionAccountOwnerType.SUPPLIER, ownerId: supplierId, supplierId, accountName: dto.accountName, platform: dto.platform, platformAccountId: dto.platformAccountId, accountCategory: dto.accountCategory, channelName: dto.channelName, unit: PromotionAccountUnit.ACCOUNT_CREDIT, currentBalance: new Prisma.Decimal(0), status: AccountStatus.ACTIVE } });
    return this.view(row);
  }

  async getAccountById(id: string, context: AccessContext) {
    const account = await this.prisma.promotionAccount.findUnique({ where: { id }, include: { customer: true, supplier: true } });
    if (!account) throw new NotFoundException('推广账户不存在');
    await this.assertOrganizationAccess(account.organizationId, context);
    return this.view(account);
  }

  async listTransactions(id: string, query: { page?: number; pageSize?: number }, context: AccessContext) {
    const account = await this.prisma.promotionAccount.findUnique({ where: { id }, select: { organizationId: true } });
    if (!account) throw new NotFoundException('推广账户不存在');
    await this.assertOrganizationAccess(account.organizationId, context);
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const [total, items] = await Promise.all([
      this.prisma.promotionTransaction.count({ where: { promotionAccountId: id } }),
      this.prisma.promotionTransaction.findMany({ where: { promotionAccountId: id }, orderBy: { occurredAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { operator: { select: { username: true, displayName: true } } } }),
    ]);
    return { total, page, pageSize, items: items.map((t) => ({ ...t, changeAmount: moneyToString(t.changeAmount), balanceBefore: moneyToString(t.balanceBefore), balanceAfter: moneyToString(t.balanceAfter), operatorName: t.operator?.displayName || t.operator?.username })) };
  }

  async creditAccount(id: string, dto: { amount: string; customerRebate?: string; costRebate?: string; remitAmount?: string; additionalFee?: string; operateFee?: string; profit?: string; accountCategory?: string; channelName?: string; paymentNature?: string; customerWalletId?: string; remark?: string }, context: AccessContext) {
    this.assertPermission(context, 'PROMOTION_ACCOUNT_CREATE');
    const amount = toMoney(dto.amount, '充值金额');
    if (amount.lte(0)) throw new BadRequestException('充值金额必须大于 0');
    const account = await this.prisma.promotionAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('推广账户不存在');
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能充值');
    await this.assertOrganizationAccess(account.organizationId, context);

    // 如果指定了客户钱包，先检查并锁定客户钱包
    let wallet: any = null;
    if (dto.customerWalletId) {
      wallet = await this.prisma.customerWallet.findUnique({ where: { id: dto.customerWalletId } });
      if (!wallet) throw new NotFoundException('客户钱包不存在');
      if (wallet.customerId !== account.customerId) throw new BadRequestException('客户钱包不属于该推广账户的客户');
      if (wallet.status !== AccountStatus.ACTIVE) throw new BadRequestException('客户钱包已停用');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "promotion_accounts" WHERE "id" = ${id}::uuid FOR UPDATE`);
      if (!locked || (locked as any[]).length === 0) throw new NotFoundException('推广账户不存在');
      const current = await tx.promotionAccount.findUnique({ where: { id } });
      const balanceBefore = current!.currentBalance;
      const balanceAfter = balanceBefore.add(amount);
      const transactionNo = this.generateTransactionNo();

      // 如果指定了客户钱包，从客户钱包扣款
      let walletBalanceAfter: any = null;
      if (dto.customerWalletId && wallet) {
        const walletLocked = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "customer_wallets" WHERE "id" = ${dto.customerWalletId}::uuid FOR UPDATE`);
        if (!walletLocked || (walletLocked as any[]).length === 0) throw new NotFoundException('客户钱包不存在');
        const walletCurrent = await tx.customerWallet.findUnique({ where: { id: dto.customerWalletId } });
        if (walletCurrent!.cashBalance.lt(amount)) throw new BadRequestException(`客户钱包余额不足，当前余额：${moneyToString(walletCurrent!.cashBalance)}`);
        const walletBalanceBefore = walletCurrent!.cashBalance;
        walletBalanceAfter = walletBalanceBefore.sub(amount);
        // 创建客户钱包交易记录（扣款）
        const walletTxNo = 'WT' + Date.now() + randomUUID().slice(0, 6).toUpperCase();
        await tx.customerWalletTransaction.create({ data: {
          transactionNo: walletTxNo, walletId: dto.customerWalletId, unit: wallet.unit,
          businessType: 'PROMOTION_ACCOUNT_CREDIT' as any, businessNo: transactionNo,
          changeAmount: amount.negated(), balanceBefore: walletBalanceBefore, balanceAfter: walletBalanceAfter,
          operatorId: context.sub, remark: `推广账户充值扣款：${account.accountName}`,
        }});
        // 更新客户钱包余额
        await tx.customerWallet.update({ where: { id: dto.customerWalletId }, data: { cashBalance: walletBalanceAfter } });
      }

      const txn = await tx.promotionTransaction.create({ data: {
        transactionNo, promotionAccountId: id, unit: account.unit,
        businessType: PromotionTransactionBusinessType.CUSTOMER_CREDIT,
        businessNo: transactionNo, changeAmount: amount, balanceBefore, balanceAfter,
        operatorId: context.sub, remark: dto.remark || '手工充值',
        customerRebate: dto.customerRebate ? new Prisma.Decimal(dto.customerRebate) : undefined,
        costRebate: dto.costRebate ? new Prisma.Decimal(dto.costRebate) : undefined,
        remitAmount: dto.remitAmount ? new Prisma.Decimal(dto.remitAmount) : undefined,
        additionalFee: dto.additionalFee ? new Prisma.Decimal(dto.additionalFee) : undefined,
        operateFee: dto.operateFee ? new Prisma.Decimal(dto.operateFee) : undefined,
        profit: dto.profit ? new Prisma.Decimal(dto.profit) : undefined,
        accountCategory: dto.accountCategory,
        channelName: dto.channelName,
        paymentNature: dto.paymentNature,
      } });
      await tx.promotionAccount.update({ where: { id }, data: { currentBalance: balanceAfter } });
      return { transaction: txn, balanceAfter, walletBalanceAfter };
    });
    return { success: true, transactionNo: result.transaction.transactionNo, balanceAfter: moneyToString(result.balanceAfter), walletBalanceAfter: result.walletBalanceAfter ? moneyToString(result.walletBalanceAfter) : undefined };
  }

  async refundAccount(id: string, dto: { amount: string; customerWalletId: string; remark?: string }, context: AccessContext) {
    this.assertPermission(context, 'PROMOTION_ACCOUNT_CREATE');
    const amount = toMoney(dto.amount, '退款金额');
    if (amount.lte(0)) throw new BadRequestException('退款金额必须大于 0');
    const account = await this.prisma.promotionAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('推广账户不存在');
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能退款');
    await this.assertOrganizationAccess(account.organizationId, context);

    const wallet = await this.prisma.customerWallet.findUnique({ where: { id: dto.customerWalletId } });
    if (!wallet) throw new NotFoundException('客户钱包不存在');
    if (wallet.customerId !== account.customerId) throw new BadRequestException('客户钱包不属于该推广账户的客户');
    if (wallet.status !== AccountStatus.ACTIVE) throw new BadRequestException('客户钱包已停用');

    const result = await this.prisma.$transaction(async (tx) => {
      // 锁定推广账户
      const locked = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "promotion_accounts" WHERE "id" = ${id}::uuid FOR UPDATE`);
      if (!locked || (locked as any[]).length === 0) throw new NotFoundException('推广账户不存在');
      const current = await tx.promotionAccount.findUnique({ where: { id } });
      if (current!.currentBalance.lt(amount)) throw new BadRequestException(`推广账户余额不足，当前余额：${moneyToString(current!.currentBalance)}`);
      const balanceBefore = current!.currentBalance;
      const balanceAfter = balanceBefore.sub(amount);
      const transactionNo = this.generateTransactionNo();

      // 锁定客户钱包并加款
      const walletLocked = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "customer_wallets" WHERE "id" = ${dto.customerWalletId}::uuid FOR UPDATE`);
      if (!walletLocked || (walletLocked as any[]).length === 0) throw new NotFoundException('客户钱包不存在');
      const walletCurrent = await tx.customerWallet.findUnique({ where: { id: dto.customerWalletId } });
      const walletBalanceBefore = walletCurrent!.cashBalance;
      const walletBalanceAfter = walletBalanceBefore.add(amount);
      // 创建客户钱包交易记录（加款）
      const walletTxNo = 'WT' + Date.now() + randomUUID().slice(0, 6).toUpperCase();
      await tx.customerWalletTransaction.create({ data: {
        transactionNo: walletTxNo, walletId: dto.customerWalletId, unit: wallet.unit,
        businessType: 'PROMOTION_ACCOUNT_REFUND' as any, businessNo: transactionNo,
        changeAmount: amount, balanceBefore: walletBalanceBefore, balanceAfter: walletBalanceAfter,
        operatorId: context.sub, remark: `推广账户退款加款：${account.accountName}`,
      }});
      // 更新客户钱包余额
      await tx.customerWallet.update({ where: { id: dto.customerWalletId }, data: { cashBalance: walletBalanceAfter } });

      // 创建推广账户交易记录（退款）
      const txn = await tx.promotionTransaction.create({ data: {
        transactionNo, promotionAccountId: id, unit: account.unit,
        businessType: PromotionTransactionBusinessType.REFUND,
        businessNo: transactionNo, changeAmount: amount.negated(), balanceBefore, balanceAfter,
        operatorId: context.sub, remark: dto.remark || '账户退款',
      } });
      await tx.promotionAccount.update({ where: { id }, data: { currentBalance: balanceAfter } });
      return { transaction: txn, balanceAfter, walletBalanceAfter };
    });
    return { success: true, transactionNo: result.transaction.transactionNo, balanceAfter: moneyToString(result.balanceAfter), walletBalanceAfter: moneyToString(result.walletBalanceAfter) };
  }

  async recordCustomerCredit(id: string, dto: RecordCustomerCreditDto, context: AccessContext) {
    this.assertPermission(context, 'PROMOTION_CREDIT_CONFIRM');
    const amount = toMoney(dto.creditAmount, '到账账户币金额');
    if (amount.lte(0)) throw new BadRequestException('到账账户币金额必须大于 0');
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('到账时间格式不正确');

    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, id, context);
      const creditStatuses: PurchaseOrderStatus[] = [PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.SETTLED];
      if (!creditStatuses.includes(order.status)) throw new ConflictException('订单必须已确认后才能确认账户币到账');
      if (!order.customerId || !order.organizationId || !order.customerCreditAmount) throw new BadRequestException({ success: false, code: 'PURCHASE_ORDER_CALCULATION_INCOMPLETE', message: '订单客户账户币金额未完成计算' });
      const existing = await tx.purchaseOrderCredit.findUnique({ where: { orderId_idempotencyKey: { orderId: id, idempotencyKey: dto.idempotencyKey } } });
      if (existing) return { idempotent: true, order: this.viewOrder(order), credit: this.creditView(existing) };

      const customer = await tx.customer.findUnique({ where: { id: order.customerId }, select: { agentId: true } });
      if (!customer || customer.agentId !== order.organizationId) throw new ForbiddenException('客户不属于订单组织');
      const accountRows = await tx.$queryRaw<Array<{ id: string; customer_id: string | null; organization_id: string; unit: PromotionAccountUnit; status: AccountStatus; current_balance: Prisma.Decimal }>>(
        Prisma.sql`SELECT "id", "customer_id", "organization_id", "unit", "status", "current_balance" FROM "promotion_accounts" WHERE "id" = ${dto.promotionAccountId}::uuid FOR UPDATE`,
      );
      const account = accountRows[0];
      if (!account) throw new NotFoundException('推广账户不存在');
      if (account.customer_id !== order.customerId || account.organization_id !== order.organizationId) throw new ForbiddenException('推广账户不属于当前客户或订单组织');
      if (account.unit !== PromotionAccountUnit.ACCOUNT_CREDIT) throw new BadRequestException('推广账户单位不正确');
      if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('推广账户已停用，不能确认到账');
      if (order.customerPromotionAccountId && order.customerPromotionAccountId !== dto.promotionAccountId) throw new ConflictException('同一订单不能使用多个推广账户');
      const creditedAmount = order.customerCreditedAmount.add(amount);
      if (creditedAmount.gt(order.customerCreditAmount)) throw new ConflictException({ success: false, code: 'CREDIT_AMOUNT_EXCEEDED', message: '推广账户到账金额超过订单应到账金额' });

      const balanceBefore = toMoney(account.current_balance, '推广账户当前余额');
      const balanceAfter = balanceBefore.add(amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const promotionTransaction = await tx.promotionTransaction.create({ data: { transactionNo: this.generateTransactionNo(), promotionAccountId: dto.promotionAccountId, unit: PromotionAccountUnit.ACCOUNT_CREDIT, businessType: PromotionTransactionBusinessType.CUSTOMER_CREDIT, businessNo: dto.businessNo.trim(), changeAmount: amount, balanceBefore, balanceAfter, occurredAt, operatorId: context.sub, remark: dto.remark?.trim() || null } });
      await tx.promotionAccount.update({ where: { id: dto.promotionAccountId }, data: { currentBalance: balanceAfter } });
      await this.customerWalletService?.syncGroupBalanceInTransaction(tx, order.customerId);
      const paymentStatus = creditedAmount.eq(order.customerCreditAmount) ? PaymentStatus.PAID : PaymentStatus.PARTIAL;
      const credit = await tx.purchaseOrderCredit.create({ data: { orderId: id, promotionAccountId: dto.promotionAccountId, idempotencyKey: dto.idempotencyKey, businessNo: dto.businessNo.trim(), amount, occurredAt, promotionTransactionNo: promotionTransaction.transactionNo, operatorId: context.sub, remark: dto.remark?.trim() || null } });
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { customerPromotionAccountId: dto.promotionAccountId, customerCreditedAmount: creditedAmount, customerCreditStatus: paymentStatus } });
      await tx.auditLog.create({ data: { operatorId: context.sub, organizationId: order.organizationId, actionType: 'PURCHASE_ORDER_CUSTOMER_CREDIT', businessType: 'PURCHASE_ORDER', businessId: id, beforeData: { customerCreditedAmount: moneyToString(order.customerCreditedAmount), customerCreditStatus: order.customerCreditStatus } as Prisma.InputJsonValue, afterData: { amount: moneyToString(amount), customerCreditedAmount: moneyToString(creditedAmount), customerCreditStatus: paymentStatus, promotionAccountId: dto.promotionAccountId, promotionTransactionNo: promotionTransaction.transactionNo } as Prisma.InputJsonValue, result: 'SUCCESS' } });
      return { idempotent: false, order: this.viewOrder(updated), credit: this.creditView(credit) };
    });
  }

  private async lockOrder(tx: Prisma.TransactionClient, id: string, context: AccessContext) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const order = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('外采订单不存在');
    await this.scope.assertOrganizationAccess(order.organizationId, context);
    return order;
  }

  private async assertOrganizationAccess(organizationId: string | null, context: AccessContext) {
    if (!organizationId) throw new ForbiddenException('数据未配置所属组织');
    await this.scope.assertOrganizationAccess(organizationId, context);
  }

  private assertPermission(context: AccessContext, permission: string) {
    if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作推广账户' });
  }

  private generateTransactionNo() { return `PTX${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`; }
  private view(row: any) { return { ...row, currentBalance: moneyToString(row.currentBalance), unit: row.unit ?? PromotionAccountUnit.ACCOUNT_CREDIT }; }
  private viewOrder(row: any) { return { ...row, customerCreditAmount: row.customerCreditAmount ? moneyToString(row.customerCreditAmount) : null, customerCreditedAmount: moneyToString(row.customerCreditedAmount), customerCreditRemaining: row.customerCreditAmount ? moneyToString(row.customerCreditAmount.sub(row.customerCreditedAmount)) : null }; }
  private creditView(row: any) { return { ...row, amount: moneyToString(row.amount) }; }
}
