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
    const row = await this.prisma.promotionAccount.create({ data: { organizationId: customer.agentId, ownerType: PromotionAccountOwnerType.CUSTOMER, ownerId: customerId, customerId, accountName: dto.accountName, unit: PromotionAccountUnit.ACCOUNT_CREDIT, currentBalance: new Prisma.Decimal(0), status: AccountStatus.ACTIVE } });
    return this.view(row);
  }

  async listSupplierAccounts(supplierId: string, context: AccessContext) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { organizationId: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    await this.assertOrganizationAccess(supplier.organizationId, context);
    const rows = await this.prisma.promotionAccount.findMany({ where: { supplierId, ownerType: PromotionAccountOwnerType.SUPPLIER }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.view(row));
  }

  async createSupplierAccount(supplierId: string, dto: CreatePromotionAccountDto, context: AccessContext) {
    this.assertPermission(context, 'PROMOTION_ACCOUNT_CREATE');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { organizationId: true, status: true } });
    if (!supplier) throw new NotFoundException('供应商不存在');
    if (supplier.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('供应商已停用，不能创建推广账户');
    await this.assertOrganizationAccess(supplier.organizationId, context);
    if (!supplier.organizationId) throw new BadRequestException('供应商未配置所属组织');
    const row = await this.prisma.promotionAccount.create({ data: { organizationId: supplier.organizationId, ownerType: PromotionAccountOwnerType.SUPPLIER, ownerId: supplierId, supplierId, accountName: dto.accountName, unit: PromotionAccountUnit.ACCOUNT_CREDIT, currentBalance: new Prisma.Decimal(0), status: AccountStatus.ACTIVE } });
    return this.view(row);
  }

  async recordCustomerCredit(id: string, dto: RecordCustomerCreditDto, context: AccessContext) {
    this.assertPermission(context, 'PROMOTION_CREDIT_CONFIRM');
    const amount = toMoney(dto.creditAmount, '到账账户币金额');
    if (amount.lte(0)) throw new BadRequestException('到账账户币金额必须大于 0');
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('到账时间格式不正确');

    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, id, context);
      if (![PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.SETTLED].includes(order.status)) throw new ConflictException('订单必须已确认后才能确认账户币到账');
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
