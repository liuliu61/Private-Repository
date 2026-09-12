import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccountUnit, AdAssetStatus, PaymentStatus, Prisma, PurchasePaymentType, PurchaseOrderStatus, PurchaseOrderTransactionType, TransactionBusinessType } from '@prisma/client';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { CashflowService } from '../cashflow/cashflow.service';
import { PrismaService } from '../prisma/prisma.service';
import { RebateCalculator } from '../rebate/rebate.calculator';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { CreateProcurementOrderDto, PurchaseOrderQueryDto, RecordCustomerPaymentDto, RecordSupplierPaymentDto } from './business.dto';
import { GrossProfitCalculator } from './gross-profit.calculator';
import { PolicyResolverService } from './policy-resolver.service';
import { SupplierCostCalculator } from './supplier-cost.calculator';
import { CustomerWalletService } from './customer-wallet.service';

const purchaseOrderTransitions: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus[]>> = {
  [PurchaseOrderStatus.DRAFT]: [PurchaseOrderStatus.PENDING_CONFIRMATION, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.PENDING_CONFIRMATION]: [PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.CONFIRMED]: [PurchaseOrderStatus.SETTLED],
};

export function isPurchaseOrderTransitionAllowed(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return purchaseOrderTransitions[from]?.includes(to) ?? false;
}

@Injectable()
export class ProcurementOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly policyResolver: PolicyResolverService,
    private readonly rebateCalculator: RebateCalculator,
    private readonly supplierCostCalculator: SupplierCostCalculator,
    private readonly grossProfitCalculator: GrossProfitCalculator,
    private readonly cashflowService: CashflowService,
    private readonly customerWalletService?: CustomerWalletService,
  ) {}

  async create(dto: CreateProcurementOrderDto, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_CREATE');
    await this.scope.assertOrganizationAccess(dto.organizationId, context);
    if (dto.clientRequestId) {
      const existing = await this.prisma.purchaseOrder.findUnique({ where: { clientRequestId: dto.clientRequestId } });
      if (existing) {
        await this.assertOrderAccess(existing.organizationId, context);
        return this.view(existing);
      }
    }

    const baseAmount = toMoney(dto.baseAmount, '订单基准金额');
    if (baseAmount.lte(0)) throw new BadRequestException('订单基准金额必须大于 0');
    const businessTime = new Date(dto.businessTime);
    this.assertDate(businessTime, '业务时间格式不正确');
    const assets = await this.validateAssets(dto, context);
    const customerPolicy = await this.policyResolver.resolveCustomerRebatePolicy({ customerId: dto.customerId, businessTime, context });
    const supplierPolicy = await this.policyResolver.resolveSupplierRebatePolicy({ supplierId: dto.supplierId, platform: dto.platform, subjectId: dto.subjectId, accountId: dto.accountId, businessTime, context });
    const customerResult = this.rebateCalculator.calculate({ amount: baseAmount, rate: customerPolicy.rate, type: customerPolicy.rebateType, calculationMode: customerPolicy.calculationMode });
    const supplierBaseAmount = customerResult.creditAmount;
    const supplierResult = this.supplierCostCalculator.calculate({ amount: supplierBaseAmount, rate: supplierPolicy.rate, type: supplierPolicy.rebateType, calculationMode: supplierPolicy.calculationMode });
    const operatingFeeAmount = new Prisma.Decimal(0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const profitResult = this.grossProfitCalculator.calculate({ customerCashAmount: customerResult.cashAmount, supplierCashAmount: supplierResult.cashAmount, operatingFeeAmount });
    const costDifference = supplierResult.cashAmount.sub(customerResult.cashAmount).add(operatingFeeAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const orderNo = this.generateOrderNo();

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          orderNo,
          clientRequestId: dto.clientRequestId,
          organizationId: dto.organizationId,
          customerId: dto.customerId,
          supplierId: dto.supplierId,
          supplierAccountId: dto.supplierAccountId || null,
          platform: dto.platform,
          transactionType: dto.transactionType,
          businessType: dto.businessType?.trim() || null,
          businessTime,
          inboundAccountId: dto.inboundAccountId?.trim() || null,
          inboundAccountName: dto.inboundAccountName?.trim() || null,
          outboundAccountId: dto.outboundAccountId?.trim() || null,
          outboundAccountName: dto.outboundAccountName?.trim() || null,
          adSubjectId: assets.subject.id,
          adAccountId: assets.account.id,
          cashAccountId: assets.cashAccount.id,
          amount: baseAmount,
          baseAmount,
          customerPolicyId: customerPolicy.customerPolicyId,
          customerPolicyVersionId: customerPolicy.customerPolicyVersionId,
          customerRebateType: customerPolicy.rebateType,
          customerRebateRate: customerPolicy.rate,
          customerCalculationMode: customerPolicy.calculationMode,
          customerBaseAmount: baseAmount,
          customerPaymentAmount: customerResult.paymentAmount,
          customerCashAmount: customerResult.cashAmount,
          customerCreditAmount: customerResult.creditAmount,
          customerRebateAmount: customerResult.rebateAmount,
          supplierPolicyId: supplierPolicy.supplierPolicyId,
          supplierPolicyVersionId: supplierPolicy.supplierPolicyVersionId,
          supplierRebateType: supplierPolicy.rebateType,
          supplierRebateRate: supplierPolicy.rate,
          supplierCostRate: supplierPolicy.rate,
          supplierCalculationMode: supplierPolicy.calculationMode,
          supplierBaseAmount,
          supplierPaymentAmount: supplierResult.paymentAmount,
          supplierCashAmount: supplierResult.cashAmount,
          supplierCreditAmount: supplierResult.creditAmount,
          supplierRebateAmount: supplierResult.rebateAmount,
          operatingFeeRate: new Prisma.Decimal(0),
          operatingFeeAmount,
          supplierSettlementType: null,
          grossProfit: profitResult.grossProfit,
          profitStatus: profitResult.profitStatus,
          costDifference,
          customerReceivable: customerResult.cashAmount,
          customerPaidAmount: new Prisma.Decimal(0),
          customerPaymentStatus: PaymentStatus.PENDING,
          supplierPayable: supplierResult.cashAmount,
          supplierPaidAmount: new Prisma.Decimal(0),
          supplierPaymentStatus: PaymentStatus.PENDING,
          status: PurchaseOrderStatus.DRAFT,
          remark: dto.remark,
          createdBy: context.sub,
        },
      });
      await this.writeAudit(tx, context, dto.organizationId, 'PURCHASE_ORDER_CREATE', order.id, null, { status: order.status, orderNo: order.orderNo });
      return this.view(order);
    });
  }

  async list(query: PurchaseOrderQueryDto, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const startDate = query.startDate ? this.parseDate(query.startDate, '开始时间格式不正确') : undefined;
    const endDate = query.endDate ? this.parseDate(query.endDate, '结束时间格式不正确') : undefined;
    if (startDate && endDate && endDate < startDate) throw new BadRequestException('时间范围不正确');
    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId: organizationIds ? { in: organizationIds } : undefined,
      status: query.status,
      customerId: query.customerId,
      supplierId: query.supplierId,
      platform: query.platform,
      transactionType: query.transactionType,
      businessType: query.businessType,
      adSubjectId: query.subjectId,
      adAccountId: query.accountId,
      orderNo: query.procurementNo,
      customerRebateType: query.customerPolicyType,
      supplierRebateType: query.supplierPolicyType,
      inboundAccountId: query.inboundAccountId,
      inboundAccountName: query.inboundAccountName ? { contains: query.inboundAccountName, mode: 'insensitive' } : undefined,
      outboundAccountId: query.outboundAccountId,
      outboundAccountName: query.outboundAccountName ? { contains: query.outboundAccountName, mode: 'insensitive' } : undefined,
      remark: query.remark ? { contains: query.remark, mode: 'insensitive' } : undefined,
      businessTime: startDate || endDate ? { gte: startDate, lte: endDate } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({ where, orderBy: [{ businessTime: 'desc' }, { orderNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_VIEW');
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('外采订单不存在');
    await this.assertOrderAccess(order.organizationId, context);
    return this.view(order);
  }

  async submit(id: string, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_CREATE');
    return this.transition(id, context, 'PURCHASE_ORDER_SUBMIT', [PurchaseOrderStatus.DRAFT], PurchaseOrderStatus.PENDING_CONFIRMATION, async (tx, order) => {
      await this.validateSubmission(tx, order, context);
    });
  }

  async confirm(id: string, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_CONFIRM');
    return this.transition(id, context, 'PURCHASE_ORDER_CONFIRM', [PurchaseOrderStatus.PENDING_CONFIRMATION], PurchaseOrderStatus.CONFIRMED, async (tx, order) => {
      if (!order.customerPolicyId || !order.customerPolicyVersionId || !order.supplierPolicyId || !order.supplierPolicyVersionId) throw new BadRequestException('订单政策快照不完整，不能确认');
      this.assertCalculationComplete(order);
      const setting = await tx.sourcingSetting.findUnique({ where: { organizationId: order.organizationId } });
      if (setting?.useCustomerWallet) {
        if (!this.customerWalletService) throw new BadRequestException('客户钱包联动服务未配置');
        const customerCashAmount = order.customerCashAmount ?? order.customerPaymentAmount;
        const supplierCashAmount = order.supplierCashAmount ?? order.supplierPaymentAmount;
        if (!customerCashAmount || !supplierCashAmount) throw new BadRequestException('订单缺少客户或伙伴实际现金金额');
        const customerChange = order.transactionType === PurchaseOrderTransactionType.TRANSFER_IN ? customerCashAmount.negated() : customerCashAmount;
        await this.customerWalletService.applyProcurementChangeInTransaction(tx, { customerId: order.customerId!, organizationId: order.organizationId, changeAmount: customerChange, orderNo: order.orderNo, operatorId: context.sub, remark: order.remark || undefined });
        if (!order.supplierAccountId) throw new BadRequestException('订单未配置伙伴CNY钱包账户');
        const supplierAccount = await tx.supplierAccount.findUnique({ where: { id: order.supplierAccountId }, select: { id: true, supplierId: true, currency: true } });
        if (!supplierAccount || supplierAccount.supplierId !== order.supplierId) throw new ForbiddenException('伙伴钱包账户与订单伙伴不匹配');
        if (supplierAccount.currency !== AccountUnit.CNY) throw new BadRequestException('伙伴钱包必须使用CNY');
        const supplierChange = order.transactionType === PurchaseOrderTransactionType.TRANSFER_IN ? supplierCashAmount : supplierCashAmount.negated();
        await this.cashflowService.createSupplierAccountTransactionInTransaction(tx, { supplierAccountId: supplierAccount.id, expectedUnit: AccountUnit.CNY, businessType: TransactionBusinessType.ADJUSTMENT, businessNo: order.orderNo, changeAmount: supplierChange, operatorId: context.sub, occurredAt: order.businessTime || new Date(), remark: '外采订单伙伴钱包联动' });
      }
    }, PurchaseOrderStatus.CONFIRMED);
  }

  async cancel(id: string, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_CANCEL');
    return this.transition(id, context, 'PURCHASE_ORDER_CANCEL', [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_CONFIRMATION], PurchaseOrderStatus.CANCELLED);
  }

  async settle(id: string, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_SETTLE');
    return this.transition(id, context, 'PURCHASE_ORDER_SETTLE', [PurchaseOrderStatus.CONFIRMED], PurchaseOrderStatus.SETTLED);
  }

  async validateImport(dto: { rows: CreateProcurementOrderDto[] }, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_IMPORT');
    const errors: Array<{ row: number; messages: string[] }> = [];
    const requestIds = new Set<string>();
    for (const [index, row] of dto.rows.entries()) {
      const messages: string[] = [];
      try { await this.scope.assertOrganizationAccess(row.organizationId, context); } catch { messages.push('无权访问该订单组织'); }
      try {
        const amount = toMoney(row.baseAmount, '基准金额');
        if (amount.lte(0)) messages.push('基准金额必须大于0');
      } catch {
        messages.push('基准金额格式不正确');
      }
      if (Number.isNaN(new Date(row.businessTime).getTime())) messages.push('业务时间格式不正确');
      if (row.clientRequestId) {
        if (requestIds.has(row.clientRequestId)) messages.push('业务幂等号在导入文件中重复');
        requestIds.add(row.clientRequestId);
        const existing = await this.prisma.purchaseOrder.findUnique({ where: { clientRequestId: row.clientRequestId }, select: { orderNo: true } });
        if (existing) messages.push(`业务幂等号已存在：${existing.orderNo}`);
      }
      if (messages.length) errors.push({ row: index + 1, messages });
    }
    return { valid: errors.length === 0, total: dto.rows.length, errors };
  }

  async recordCustomerPayment(id: string, dto: RecordCustomerPaymentDto, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_CONFIRM');
    const amount = toMoney(dto.actualAmount, '实际收款金额');
    if (amount.lte(0)) throw new BadRequestException('实际收款金额必须大于 0');
    const occurredAt = this.parseDate(dto.occurredAt, '收款时间格式不正确');
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, id, context);
      this.assertPaymentOrderStatus(order);
      const existing = await tx.purchaseOrderPayment.findUnique({ where: { orderId_paymentType_idempotencyKey: { orderId: id, paymentType: PurchasePaymentType.CUSTOMER_PAYMENT, idempotencyKey: dto.idempotencyKey } } });
      if (existing) return { idempotent: true, order: this.view(order), payment: this.paymentView(existing) };
      if (!order.cashAccountId) throw new BadRequestException('订单未配置公司人民币资金账户');
      const receivable = order.customerReceivable ?? order.customerCashAmount;
      if (!receivable) throw new BadRequestException({ success: false, code: 'PURCHASE_ORDER_CALCULATION_INCOMPLETE', message: '订单客户应收金额未完成计算' });
      const paidAmount = order.customerPaidAmount.add(amount);
      if (paidAmount.gt(receivable)) throw new ConflictException({ success: false, code: 'PAYMENT_EXCEEDS_RECEIVABLE', message: '本次收款超过客户应收余额' });
      const transaction = await this.cashflowService.createTransactionInTransaction(tx, { accountId: order.cashAccountId, businessType: TransactionBusinessType.CUSTOMER_PAYMENT, businessNo: dto.businessNo, changeAmount: amount, operatorId: context.sub, occurredAt, remark: dto.remark, accessContext: context });
      const payment = await tx.purchaseOrderPayment.create({ data: { orderId: id, paymentType: PurchasePaymentType.CUSTOMER_PAYMENT, idempotencyKey: dto.idempotencyKey, businessNo: dto.businessNo, amount, occurredAt, companyTransactionNo: transaction.transactionNo, operatorId: context.sub, remark: dto.remark } });
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { customerPaidAmount: paidAmount, customerPaymentStatus: paidAmount.eq(receivable) ? PaymentStatus.PAID : PaymentStatus.PARTIAL } });
      await this.writeAudit(tx, context, order.organizationId, 'PURCHASE_ORDER_CUSTOMER_PAYMENT', id, { customerPaidAmount: moneyToString(order.customerPaidAmount), paymentStatus: order.customerPaymentStatus }, { amount: moneyToString(amount), customerPaidAmount: moneyToString(paidAmount), paymentStatus: updated.customerPaymentStatus, companyTransactionNo: transaction.transactionNo });
      return { idempotent: false, order: this.view(updated), payment: this.paymentView(payment) };
    });
  }

  async recordSupplierPayment(id: string, dto: RecordSupplierPaymentDto, context: AccessContext) {
    this.assertPermission(context, 'PROCUREMENT_CONFIRM');
    const amount = toMoney(dto.actualAmount, '实际付款金额');
    if (amount.lte(0)) throw new BadRequestException('实际付款金额必须大于 0');
    const occurredAt = this.parseDate(dto.occurredAt, '付款时间格式不正确');
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, id, context);
      this.assertPaymentOrderStatus(order);
      const existing = await tx.purchaseOrderPayment.findUnique({ where: { orderId_paymentType_idempotencyKey: { orderId: id, paymentType: PurchasePaymentType.SUPPLIER_PAYMENT, idempotencyKey: dto.idempotencyKey } } });
      if (existing) return { idempotent: true, order: this.view(order), payment: this.paymentView(existing) };
      if (!order.cashAccountId) throw new BadRequestException('订单未配置公司人民币资金账户');
      const payable = order.supplierPayable ?? order.supplierCashAmount;
      if (!payable) throw new BadRequestException({ success: false, code: 'PURCHASE_ORDER_CALCULATION_INCOMPLETE', message: '订单供应商应付金额未完成计算' });
      const paidAmount = order.supplierPaidAmount.add(amount);
      if (paidAmount.gt(payable)) throw new ConflictException({ success: false, code: 'PAYMENT_EXCEEDS_PAYABLE', message: '本次付款超过一级代理应付余额' });
      const supplierAccount = await tx.supplierAccount.findUnique({ where: { id: dto.supplierAccountId } });
      if (!supplierAccount || supplierAccount.supplierId !== order.supplierId) throw new ForbiddenException('一级代理商资金账户与订单供应商不匹配');
      if (supplierAccount.currency !== 'CNY') throw new BadRequestException('实际付款只支持 CNY 供应商资金账户');
      const companyTransaction = await this.cashflowService.createTransactionInTransaction(tx, { accountId: order.cashAccountId, businessType: TransactionBusinessType.SUPPLIER_PAYMENT, businessNo: dto.businessNo, changeAmount: amount.neg(), operatorId: context.sub, occurredAt, remark: dto.remark, accessContext: context });
      const supplierTransaction = await this.cashflowService.createSupplierAccountTransactionInTransaction(tx, { supplierAccountId: dto.supplierAccountId, expectedUnit: AccountUnit.CNY, businessType: TransactionBusinessType.SUPPLIER_PAYMENT, businessNo: dto.businessNo, changeAmount: amount, operatorId: context.sub, occurredAt, remark: dto.remark });
      const payment = await tx.purchaseOrderPayment.create({ data: { orderId: id, paymentType: PurchasePaymentType.SUPPLIER_PAYMENT, idempotencyKey: dto.idempotencyKey, businessNo: dto.businessNo, amount, occurredAt, companyTransactionNo: companyTransaction.transactionNo, supplierTransactionNo: supplierTransaction.transactionNo, operatorId: context.sub, remark: dto.remark } });
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { supplierPaidAmount: paidAmount, supplierPaymentStatus: paidAmount.eq(payable) ? PaymentStatus.PAID : PaymentStatus.PARTIAL } });
      await this.writeAudit(tx, context, order.organizationId, 'PURCHASE_ORDER_SUPPLIER_PAYMENT', id, { supplierPaidAmount: moneyToString(order.supplierPaidAmount), paymentStatus: order.supplierPaymentStatus }, { amount: moneyToString(amount), supplierPaidAmount: moneyToString(paidAmount), paymentStatus: updated.supplierPaymentStatus, companyTransactionNo: companyTransaction.transactionNo, supplierTransactionNo: supplierTransaction.transactionNo, supplierAccountId: dto.supplierAccountId });
      return { idempotent: false, order: this.view(updated), payment: this.paymentView(payment) };
    });
  }

  private async transition(
    id: string,
    context: AccessContext,
    action: string,
    allowedStatuses: PurchaseOrderStatus[],
    nextStatus: PurchaseOrderStatus,
    validate?: (tx: Prisma.TransactionClient, order: Prisma.PurchaseOrderGetPayload<{}>) => Promise<void>,
    idempotentStatus?: PurchaseOrderStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`);
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('外采订单不存在');
      await this.assertOrderAccess(order.organizationId, context);
      if (idempotentStatus && order.status === idempotentStatus) return this.view(order);
      if (!allowedStatuses.includes(order.status) || !isPurchaseOrderTransitionAllowed(order.status, nextStatus)) throw new ConflictException(`订单当前状态为 ${order.status}，不允许执行该操作`);
      if (validate) await validate(tx, order);
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: nextStatus, confirmedAt: nextStatus === PurchaseOrderStatus.CONFIRMED ? new Date() : undefined, confirmedBy: nextStatus === PurchaseOrderStatus.CONFIRMED ? context.sub : undefined } });
      await this.writeAudit(tx, context, order.organizationId, action, order.id, { status: order.status }, { status: updated.status, orderNo: updated.orderNo });
      return this.view(updated);
    });
  }

  private async lockOrder(tx: Prisma.TransactionClient, id: string, context: AccessContext) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`);
    const order = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('外采订单不存在');
    await this.assertOrderAccess(order.organizationId, context);
    return order;
  }

  private assertPaymentOrderStatus(order: Prisma.PurchaseOrderGetPayload<{}>): void {
    if (![PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.SETTLED].includes(order.status)) throw new ConflictException('订单必须已确认后才能录入实际收付款');
  }

  private paymentView(payment: { id: string; paymentType: PurchasePaymentType; businessNo: string; amount: Prisma.Decimal; occurredAt: Date; companyTransactionNo: string | null; supplierTransactionNo: string | null; idempotencyKey: string }) {
    return { id: payment.id, paymentType: payment.paymentType, businessNo: payment.businessNo, amount: moneyToString(payment.amount), occurredAt: payment.occurredAt, companyTransactionNo: payment.companyTransactionNo, supplierTransactionNo: payment.supplierTransactionNo, idempotencyKey: payment.idempotencyKey };
  }

  private async validateSubmission(tx: Prisma.TransactionClient, order: Prisma.PurchaseOrderGetPayload<{}>, context: AccessContext) {
    if (!order.customerId || !order.supplierId || !order.platform || !order.adSubjectId || !order.adAccountId || !order.businessTime) throw new BadRequestException('订单基础信息不完整，不能提交确认');
    if (!order.customerPolicyId || !order.customerPolicyVersionId || !order.supplierPolicyId || !order.supplierPolicyVersionId) throw new BadRequestException('订单政策快照不完整，不能提交确认');
    if (order.baseAmount.lte(0)) throw new BadRequestException('订单基准金额必须大于 0');
    this.assertCalculationComplete(order);
    const assets = await tx.adAccount.findUnique({ where: { id: order.adAccountId }, select: { subjectId: true, customerId: true, platform: true, status: true, subject: { select: { organizationId: true, platform: true, status: true } } } });
    if (!assets || assets.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('广告账户不存在或已停用');
    if (assets.subjectId !== order.adSubjectId || assets.platform !== order.platform || assets.subject.platform !== order.platform) throw new BadRequestException('广告账户、主体与平台信息不一致');
    if (assets.customerId !== order.customerId) throw new BadRequestException('广告账户不属于当前客户');
    if (assets.subject.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('广告主体已停用');
    if (assets.subject.organizationId !== order.organizationId) throw new BadRequestException('广告主体不属于订单组织');
    const [customer, supplier] = await Promise.all([
      tx.customer.findUnique({ where: { id: order.customerId }, select: { status: true, agentId: true } }),
      tx.supplier.findUnique({ where: { id: order.supplierId }, select: { status: true, organizationId: true, platform: true } }),
    ]);
    if (!customer || customer.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('客户不存在或已停用');
    if (!supplier || supplier.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('供应商不存在或已停用');
    if (customer.agentId !== order.organizationId || supplier.organizationId !== order.organizationId) throw new BadRequestException('客户或供应商不属于订单组织');
    if (supplier.platform !== order.platform) throw new BadRequestException('订单平台与供应商平台不一致');
    await this.scope.assertOrganizationAccess(order.organizationId, context);
  }

  private assertCalculationComplete(order: Prisma.PurchaseOrderGetPayload<{}>): void {
    if (!order.customerCalculationMode || !order.customerCashAmount || !order.customerCreditAmount || !order.customerRebateAmount || !order.supplierCalculationMode || !order.supplierCashAmount || !order.supplierCreditAmount || !order.grossProfit || !order.profitStatus) {
      throw new BadRequestException({ success: false, code: 'PURCHASE_ORDER_CALCULATION_INCOMPLETE', message: '订单金额计算未完成，不能提交确认' });
    }
  }

  private async validateAssets(dto: CreateProcurementOrderDto, context: AccessContext) {
    const [customer, supplier, subject, account, cashAccount] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, agentId: true, status: true } }),
      this.prisma.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true, organizationId: true, status: true, platform: true } }),
      this.prisma.adSubject.findUnique({ where: { id: dto.subjectId }, select: { id: true, organizationId: true, platform: true, status: true } }),
      this.prisma.adAccount.findUnique({ where: { id: dto.accountId }, select: { id: true, subjectId: true, customerId: true, platform: true, status: true } }),
      this.prisma.account.findUnique({ where: { id: dto.cashAccountId }, select: { id: true, organizationId: true, currency: true, status: true } }),
    ]);
    if (!customer || customer.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('客户不存在或已停用');
    if (!supplier || supplier.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('供应商不存在或已停用');
    if (!subject || subject.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('广告主体不存在或已停用');
    if (!account || account.status !== AdAssetStatus.ACTIVE) throw new BadRequestException('广告账户不存在或已停用');
    if (!cashAccount || cashAccount.status !== 'ACTIVE' || cashAccount.currency !== 'CNY') throw new BadRequestException('公司人民币资金账户不存在、已停用或币种不正确');
    if (customer.agentId !== dto.organizationId || supplier.organizationId !== dto.organizationId || subject.organizationId !== dto.organizationId || cashAccount.organizationId !== dto.organizationId) throw new ForbiddenException('客户、供应商、广告主体或公司资金账户不属于订单组织');
    if (account.subjectId !== subject.id) throw new BadRequestException('广告账户不属于指定广告主体');
    if (account.customerId !== customer.id) throw new BadRequestException('广告账户不属于指定客户');
    if (subject.platform !== dto.platform || account.platform !== dto.platform || supplier.platform !== dto.platform) throw new BadRequestException('平台与广告资源信息不一致');
    await this.scope.assertOrganizationAccess(dto.organizationId, context);
    await this.scope.assertAccountAccess(dto.cashAccountId, context);
    return { subject, account, cashAccount };
  }

  private async writeAudit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, action: string, resourceId: string, beforeData: unknown, afterData: unknown) {
    await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'PURCHASE_ORDER', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } });
  }

  private async assertOrderAccess(organizationId: string, context: AccessContext) { await this.scope.assertOrganizationAccess(organizationId, context); }
  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作外采订单' }); }
  private assertDate(value: Date, message: string) { if (Number.isNaN(value.getTime())) throw new BadRequestException(message); }
  private parseDate(value: string, message: string) { const date = new Date(value); this.assertDate(date, message); return date; }
  private generateOrderNo() { const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14); return `PO${timestamp}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`; }
  private view(row: any) {
    const optionalMoney = (value: Prisma.Decimal | null | undefined) => value === null || value === undefined ? null : moneyToString(value);
    const optionalRate = (value: Prisma.Decimal | null | undefined) => value === null || value === undefined ? null : value.toFixed(4);
    const customerReceivable = row.customerReceivable ?? row.customerCashAmount;
    const supplierPayable = row.supplierPayable ?? row.supplierCashAmount;
    const customerPaidAmount = row.customerPaidAmount ?? new Prisma.Decimal(0);
    const supplierPaidAmount = row.supplierPaidAmount ?? new Prisma.Decimal(0);
    const customerCreditedAmount = row.customerCreditedAmount ?? new Prisma.Decimal(0);
    const customerCreditAmount = row.customerCreditAmount ?? null;
    return { ...row, procurementNo: row.orderNo, subjectId: row.adSubjectId, accountId: row.adAccountId, amount: moneyToString(row.amount), baseAmount: moneyToString(row.baseAmount), baseCreditAmount: optionalMoney(customerCreditAmount ?? row.baseAmount), customerRebateRate: optionalRate(row.customerRebateRate), customerBaseAmount: optionalMoney(row.customerBaseAmount), customerPaymentAmount: optionalMoney(row.customerPaymentAmount), customerCashAmount: optionalMoney(row.customerCashAmount ?? row.customerPaymentAmount), customerCreditAmount: optionalMoney(customerCreditAmount), customerRebateAmount: optionalMoney(row.customerRebateAmount), customerReceivable: optionalMoney(customerReceivable), customerPaidAmount: moneyToString(customerPaidAmount), customerReceivableRemaining: customerReceivable ? moneyToString(customerReceivable.sub(customerPaidAmount)) : null, customerPaymentStatus: row.customerPaymentStatus ?? PaymentStatus.PENDING, customerPromotionAccountId: row.customerPromotionAccountId ?? null, customerCreditedAmount: moneyToString(customerCreditedAmount), customerCreditRemaining: customerCreditAmount ? moneyToString(customerCreditAmount.sub(customerCreditedAmount)) : null, customerCreditStatus: row.customerCreditStatus ?? PaymentStatus.PENDING, supplierRebateRate: optionalRate(row.supplierRebateRate), supplierCostRate: optionalRate(row.supplierCostRate ?? row.supplierRebateRate), supplierBaseAmount: optionalMoney(row.supplierBaseAmount), supplierPaymentAmount: optionalMoney(row.supplierPaymentAmount), supplierCashAmount: optionalMoney(row.supplierCashAmount ?? row.supplierPaymentAmount), supplierCreditAmount: optionalMoney(row.supplierCreditAmount), supplierRebateAmount: optionalMoney(row.supplierRebateAmount), supplierPayable: optionalMoney(supplierPayable), supplierPaidAmount: moneyToString(supplierPaidAmount), supplierPayableRemaining: supplierPayable ? moneyToString(supplierPayable.sub(supplierPaidAmount)) : null, supplierPaymentStatus: row.supplierPaymentStatus ?? PaymentStatus.PENDING, operatingFeeRate: optionalRate(row.operatingFeeRate), operatingFeeAmount: optionalMoney(row.operatingFeeAmount), grossProfit: optionalMoney(row.grossProfit), costDifference: optionalMoney(row.costDifference) };
  }
}
