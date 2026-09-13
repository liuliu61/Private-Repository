import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BankTransactionDirection, BankTransactionStatus, Prisma, PurchasePaymentType, ReceivePaymentNature, ReceiveRecordStatus, RefundStatus, TransactionBusinessType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessContext, AccessScopeService } from '../common/access-scope.service';
import { CashflowService } from '../cashflow/cashflow.service';
import { moneyToString, toMoney } from '../cashflow/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { BankTransactionImportItemDto, BankTransactionMatchDto, BankTransactionQueryDto, CreateReceiveRecordDto, CreateReceiveRefundDto, ImportBankTransactionsDto, ReceivePostingDto, ReceiveRecordQueryDto } from './business.dto';
import { CustomerWalletService } from './customer-wallet.service';

@Injectable()
export class ReceivingService {
  constructor(private readonly prisma: PrismaService, private readonly cashflow: CashflowService, private readonly scope: AccessScopeService, private readonly customerWallet: CustomerWalletService) {}

  async listBankTransactions(query: BankTransactionQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_BANK_TRANSACTION_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const minAmount = query.minAmount === undefined ? undefined : toMoney(query.minAmount, '最小金额');
    const maxAmount = query.maxAmount === undefined ? undefined : toMoney(query.maxAmount, '最大金额');
    const where: Prisma.BankTransactionWhereInput = {
      organizationId: organizationIds ? { in: organizationIds } : undefined,
      accountId: query.accountId,
      direction: query.direction,
      status: query.status,
      counterpartyName: query.counterpartyName ? { contains: query.counterpartyName, mode: 'insensitive' } : undefined,
      OR: query.keyword ? [{ transactionNo: { contains: query.keyword, mode: 'insensitive' } }, { externalTransactionId: { contains: query.keyword, mode: 'insensitive' } }, { summary: { contains: query.keyword, mode: 'insensitive' } }] : undefined,
      occurredAt: { gte: query.startDate ? new Date(query.startDate) : undefined, lt: query.endDate ? new Date(query.endDate) : undefined },
      amount: { gte: minAmount, lte: maxAmount },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({ where, include: { account: { select: { id: true, name: true, accountCode: true, currency: true } }, matchedCustomer: { select: { id: true, name: true, customerCode: true } }, receiveRecord: { select: { id: true, receiveNo: true, status: true } } }, orderBy: [{ occurredAt: 'desc' }, { transactionNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return { items: items.map((item) => this.bankView(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async getBankTransaction(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_BANK_TRANSACTION_VIEW');
    const row = await this.prisma.bankTransaction.findUnique({ where: { id }, include: { account: true, matchedCustomer: true, matchedPurchaseOrder: { select: { id: true, orderNo: true, amount: true, status: true } }, receiveRecord: true } });
    if (!row) throw new NotFoundException('银行交易不存在');
    await this.scope.assertOrganizationAccess(row.organizationId, context);
    return this.bankView(row);
  }

  async importBankTransactions(dto: ImportBankTransactionsDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_BANK_TRANSACTION_IMPORT');
    if (!dto.items?.length) throw new BadRequestException('至少需要导入一笔银行交易');
    return this.prisma.$transaction(async (tx) => {
      const results: any[] = [];
      for (const item of dto.items) results.push(await this.importOne(tx, item, context));
      return { items: results, total: results.length };
    });
  }

  async matchBankTransaction(id: string, dto: BankTransactionMatchDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_BANK_TRANSACTION_MATCH');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockBank(tx, id, context);
      if ([BankTransactionStatus.RECEIPT_CONFIRMED, BankTransactionStatus.IGNORED].includes(row.status)) throw new ConflictException('当前银行交易状态不允许匹配');
      const customer = await tx.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, name: true, agentId: true } });
      if (!customer) throw new NotFoundException('客户不存在');
      if (customer.agentId !== row.organizationId) throw new ForbiddenException('客户不属于当前组织');
      if (dto.purchaseOrderId) await this.assertOrderMatch(tx, dto.purchaseOrderId, dto.customerId, row.organizationId);
      if (row.receiveRecord && row.receiveRecord.status !== ReceiveRecordStatus.PENDING_MATCH) {
        if (row.receiveRecord.customerId === dto.customerId && row.receiveRecord.purchaseOrderId === (dto.purchaseOrderId || null)) return { idempotent: true, bankTransaction: this.bankView(row) };
        throw new ConflictException('该银行交易已生成收款记录，不能更换已匹配客户');
      }
      if (row.status === BankTransactionStatus.MATCHED && row.matchedCustomerId === dto.customerId && row.matchedPurchaseOrderId === (dto.purchaseOrderId || null)) return { idempotent: true, bankTransaction: this.bankView(row) };
      const updated = await tx.bankTransaction.update({ where: { id }, data: { matchedCustomerId: dto.customerId, matchedPurchaseOrderId: dto.purchaseOrderId || null, status: BankTransactionStatus.MATCHED, remark: dto.remark?.trim() || row.remark } });
      if (row.receiveRecord?.status === ReceiveRecordStatus.PENDING_MATCH) await tx.receiveRecord.update({ where: { id: row.receiveRecord.id }, data: { customerId: dto.customerId, purchaseOrderId: dto.purchaseOrderId || null, status: ReceiveRecordStatus.PENDING_CONFIRMATION } });
      await this.audit(tx, context, row.organizationId, id, 'BANK_TRANSACTION_MATCH', { status: row.status, matchedCustomerId: row.matchedCustomerId, matchedPurchaseOrderId: row.matchedPurchaseOrderId }, { status: updated.status, matchedCustomerId: dto.customerId, matchedPurchaseOrderId: dto.purchaseOrderId || null });
      return { idempotent: false, bankTransaction: this.bankView(updated) };
    });
  }

  async confirmBankTransaction(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECEIVE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const bank = await this.lockBank(tx, id, context);
      if (bank.receiveRecord) return { idempotent: true, bankTransaction: this.bankView(bank), receiveRecord: this.receiveView(bank.receiveRecord) };
      if (bank.status === BankTransactionStatus.IGNORED) throw new ConflictException('已忽略的银行交易不能确认到账');
      if (bank.direction !== BankTransactionDirection.INCOME || bank.currency !== 'CNY') throw new BadRequestException('只有CNY银行收入交易才能确认到账');
      if (bank.matchedCustomerId) await this.assertCustomer(tx, bank.matchedCustomerId, bank.organizationId);
      if (bank.matchedPurchaseOrderId) await this.assertOrderMatch(tx, bank.matchedPurchaseOrderId, bank.matchedCustomerId, bank.organizationId);
      const receiveRecord = await tx.receiveRecord.create({ data: { receiveNo: this.generateReceiveNo(), organizationId: bank.organizationId, customerId: bank.matchedCustomerId, purchaseOrderId: bank.matchedPurchaseOrderId, accountId: bank.accountId, bankTransactionId: bank.id, amount: bank.amount, currency: bank.currency, receivedAt: bank.bookedAt || bank.occurredAt, status: bank.matchedCustomerId ? ReceiveRecordStatus.PENDING_CONFIRMATION : ReceiveRecordStatus.PENDING_MATCH, createdBy: context.sub } });
      const updatedBank = await tx.bankTransaction.update({ where: { id: bank.id }, data: { status: BankTransactionStatus.RECEIPT_CONFIRMED } });
      await this.audit(tx, context, bank.organizationId, receiveRecord.id, 'BANK_TRANSACTION_CONFIRM_RECEIPT', { status: bank.status }, { status: updatedBank.status, receiveNo: receiveRecord.receiveNo });
      return { idempotent: false, bankTransaction: this.bankView(updatedBank), receiveRecord: this.receiveView(receiveRecord) };
    });
  }

  async unmatchBankTransaction(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_BANK_TRANSACTION_MATCH');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockBank(tx, id, context);
      if (row.status === BankTransactionStatus.RECEIPT_CONFIRMED || row.receiveRecord?.status === ReceiveRecordStatus.CONFIRMED) throw new ConflictException('已确认收款的银行交易不能取消匹配');
      if (!row.matchedCustomerId && !row.matchedPurchaseOrderId && [BankTransactionStatus.CONFIRMING, BankTransactionStatus.UNPROCESSED].includes(row.status)) return { idempotent: true, bankTransaction: this.bankView(row) };
      if (row.receiveRecord && row.receiveRecord.status !== ReceiveRecordStatus.CANCELLED) await tx.receiveRecord.update({ where: { id: row.receiveRecord.id }, data: { status: ReceiveRecordStatus.CANCELLED, remark: '取消银行交易匹配' } });
      const updated = await tx.bankTransaction.update({ where: { id }, data: { matchedCustomerId: null, matchedPurchaseOrderId: null, status: BankTransactionStatus.CONFIRMING } });
      await this.audit(tx, context, row.organizationId, id, 'BANK_TRANSACTION_UNMATCH', { status: row.status, matchedCustomerId: row.matchedCustomerId, matchedPurchaseOrderId: row.matchedPurchaseOrderId }, { status: updated.status });
      return { idempotent: false, bankTransaction: this.bankView(updated) };
    });
  }

  async listReceiveRecords(query: ReceiveRecordQueryDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECEIVE_VIEW');
    const organizationIds = await this.scope.getOrganizationIds(context);
    const where: Prisma.ReceiveRecordWhereInput = { organizationId: organizationIds ? { in: organizationIds } : undefined, customerId: query.customerId, bankTransactionId: query.bankTransactionId, accountId: query.accountId, status: query.status, receiveNo: query.receiveNo, receivedAt: { gte: query.startDate ? new Date(query.startDate) : undefined, lt: query.endDate ? new Date(query.endDate) : undefined } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.receiveRecord.findMany({ where, include: { customer: { select: { id: true, name: true, customerCode: true } }, bankTransaction: { select: { id: true, transactionNo: true, counterpartyName: true } }, purchaseOrder: { select: { id: true, orderNo: true } }, account: { select: { id: true, name: true, accountCode: true } }, details: { orderBy: { createdAt: 'asc' } }, serviceFeeDetails: { orderBy: { createdAt: 'asc' }, include: { operator: { select: { id: true, displayName: true } } } } }, orderBy: [{ receivedAt: 'desc' }, { receiveNo: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.receiveRecord.count({ where }),
    ]);
    return { items: items.map((item) => this.receiveView(item)), total, page: query.page, pageSize: query.pageSize };
  }

  async getReceiveRecord(id: string, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECEIVE_VIEW');
    const row = await this.prisma.receiveRecord.findUnique({ where: { id }, include: { customer: true, bankTransaction: true, purchaseOrder: { select: { id: true, orderNo: true, amount: true, status: true } }, account: true, transaction: true, creator: { select: { id: true, displayName: true } }, confirmer: { select: { id: true, displayName: true } }, postings: true, details: { include: { invoiceTask: true } }, serviceFeeDetails: { include: { operator: { select: { id: true, displayName: true } } } } } });
    if (!row) throw new NotFoundException('收款记录不存在');
    await this.scope.assertOrganizationAccess(row.organizationId, context);
    return this.receiveView(row);
  }

  async createReceiveRecord(dto: CreateReceiveRecordDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_RECEIVE_CREATE');
    return this.prisma.$transaction(async (tx) => {
      const bank = await this.lockBank(tx, dto.bankTransactionId, context);
      if (bank.direction !== BankTransactionDirection.INCOME) throw new BadRequestException('只有银行收入交易才能创建收款记录');
      if (bank.status !== BankTransactionStatus.RECEIPT_CONFIRMED) throw new ConflictException('银行交易必须先确认到账后才能生成收款记录');
      if (bank.receiveRecord) {
        if (bank.receiveRecord.status !== ReceiveRecordStatus.CANCELLED) {
          return { idempotent: true, receiveRecord: this.receiveView(bank.receiveRecord), bankTransaction: this.bankView(bank) };
        }
        throw new ConflictException('该银行交易的历史收款记录已取消，不能重复创建');
      }
      const amount = dto.amount ? toMoney(dto.amount, '收款金额') : toMoney(bank.amount, '银行交易金额');
      if (!amount.eq(bank.amount)) throw new ConflictException('当前版本暂不支持一笔银行交易拆分多笔收款，收款金额必须等于银行交易金额');
      const customerId = bank.matchedCustomerId;
      const purchaseOrderId = dto.purchaseOrderId || bank.matchedPurchaseOrderId;
      if (dto.customerId && dto.customerId !== customerId) throw new ConflictException('收款记录客户来自银行流水绑定，不能修改');
      if (customerId) await this.assertCustomer(tx, customerId, bank.organizationId);
      if (purchaseOrderId) await this.assertOrderMatch(tx, purchaseOrderId, customerId, bank.organizationId);
      const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : bank.occurredAt;
      const created = await tx.receiveRecord.create({ data: { receiveNo: this.generateReceiveNo(), organizationId: bank.organizationId, customerId: customerId || null, purchaseOrderId: purchaseOrderId || null, accountId: bank.accountId, bankTransactionId: bank.id, amount, currency: bank.currency, receivedAt, status: customerId ? ReceiveRecordStatus.PENDING_CONFIRMATION : ReceiveRecordStatus.PENDING_MATCH, createdBy: context.sub, remark: dto.remark?.trim() || null } });
      const updatedBank = await tx.bankTransaction.update({ where: { id: bank.id }, data: { matchedCustomerId: customerId || null, matchedPurchaseOrderId: purchaseOrderId || null, status: BankTransactionStatus.RECEIPT_CREATED } });
      await this.audit(tx, context, bank.organizationId, created.id, 'RECEIVE_RECORD_CREATE', null, { receiveNo: created.receiveNo, bankTransactionId: bank.id, customerId, purchaseOrderId, amount: moneyToString(amount), status: created.status });
      return { idempotent: false, receiveRecord: this.receiveView(created), bankTransaction: this.bankView(updatedBank) };
    });
  }

  async confirmReceiveRecord(id: string, dto: ReceivePostingDto = new ReceivePostingDto(), context?: AccessContext) {
    if (!context && dto && typeof dto === 'object' && 'sub' in (dto as unknown as Record<string, unknown>)) { context = dto as unknown as AccessContext; dto = new ReceivePostingDto(); }
    if (!context) throw new BadRequestException('缺少当前登录用户');
    this.assertPermission(context, 'FINANCE_RECEIVE_CONFIRM');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockReceive(tx, id, context);
      if (row.status === ReceiveRecordStatus.CONFIRMED) return { idempotent: true, receiveRecord: this.receiveView(row), transaction: row.transaction ? this.transactionView(row.transaction) : null };
      if (row.status !== ReceiveRecordStatus.PENDING_CONFIRMATION || !row.customerId) throw new ConflictException('收款记录尚未匹配客户，不能确认');
      const bank = await this.lockBank(tx, row.bankTransactionId, context);
      if (bank.direction !== BankTransactionDirection.INCOME || bank.currency !== 'CNY') throw new BadRequestException('只有CNY银行收入交易才能确认收款');
      if (bank.amount.toDecimalPlaces(2).eq(row.amount.toDecimalPlaces(2)) === false) throw new ConflictException('银行交易金额与收款金额不一致');
      let order: any = null;
      if (row.purchaseOrderId) {
        order = await this.assertOrderMatch(tx, row.purchaseOrderId, row.customerId, row.organizationId);
        if (order.cashAccountId !== row.accountId) throw new ConflictException('收款账户与订单公司资金账户不一致');
        const receivable = order.customerReceivable ?? order.customerCashAmount;
        if (!receivable || order.customerPaidAmount.add(row.amount).gt(receivable)) throw new ConflictException('本次确认收款超过订单客户应收余额');
      }
      const serviceFeeAmount = toMoney(dto.serviceFeeAmount || '0.00', '服务费金额');
      if (serviceFeeAmount.lt(0) || serviceFeeAmount.gt(row.amount)) throw new BadRequestException('服务费金额不能超过付款金额');
      if (!dto.details?.length) throw new BadRequestException('至少需要填写一条入账明细');
      const details = dto.details.map((detail) => ({ type: detail.type, amount: toMoney(detail.amount, '入账明细金额') }));
      if (details.some((detail) => detail.amount.lte(0))) throw new BadRequestException('入账明细金额必须大于0');
      const detailAmount = details.reduce((total, detail) => total.add(detail.amount), new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      if (!detailAmount.eq(row.amount.toDecimalPlaces(2))) throw new ConflictException('对公款与对私款明细合计必须等于本次入账金额');
      const walletCreditAmount = row.amount.sub(serviceFeeAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const transaction = await this.cashflow.createTransactionInTransaction(tx, { accountId: row.accountId, businessType: TransactionBusinessType.CUSTOMER_PAYMENT, businessNo: row.receiveNo, changeAmount: row.amount, operatorId: context.sub, occurredAt: row.receivedAt, remark: row.remark, accessContext: context });
      const walletResult = await this.customerWallet.applyReceivePostingInTransaction(tx, { customerId: row.customerId, organizationId: row.organizationId, receiveRecordId: row.id, receiveNo: row.receiveNo, walletCreditAmount, operatorId: context.sub, remark: dto.remark || row.remark || undefined });
      if (order) {
        const paidAmount = order.customerPaidAmount.add(row.amount);
        await tx.purchaseOrderPayment.create({ data: { orderId: order.id, paymentType: PurchasePaymentType.CUSTOMER_PAYMENT, idempotencyKey: `RECEIVE:${row.id}`, businessNo: row.receiveNo, amount: row.amount, occurredAt: row.receivedAt, companyTransactionNo: transaction.transactionNo, operatorId: context.sub, remark: row.remark } });
        await tx.purchaseOrder.update({ where: { id: order.id }, data: { customerPaidAmount: paidAmount, customerPaymentStatus: paidAmount.eq(order.customerReceivable ?? order.customerCashAmount) ? 'PAID' : 'PARTIAL' } });
      }
      const posting = await tx.receivePosting.create({ data: { postingNo: this.generatePostingNo(), organizationId: row.organizationId, receiveRecordId: row.id, customerId: row.customerId, paymentAmount: row.amount, serviceFeeAmount, walletCreditAmount, invoiceEligibleAmount: new Prisma.Decimal(0), createdBy: context.sub, remark: dto.remark?.trim() || row.remark || null } });
      const createdDetails = await Promise.all(details.map((detail) => tx.receiveRecordDetail.create({ data: { receiveRecordId: row.id, customerId: row.customerId!, type: detail.type, amount: detail.amount } })));
      const publicDetails = createdDetails.filter((detail) => detail.type === ReceivePaymentNature.PUBLIC);
      await Promise.all(publicDetails.map((detail) => tx.invoiceTask.create({ data: { taskNo: this.generateInvoiceTaskNo(), organizationId: row.organizationId, customerId: row.customerId!, receiveRecordDetailId: detail.id, publicAmount: detail.amount, invoiceAmount: detail.amount, payerName: bank.counterpartyName, payerAccount: bank.counterpartyAccount, createdBy: context.sub } })));
      if (!serviceFeeAmount.isZero()) await tx.receiveServiceFee.create({ data: { receiveRecordId: row.id, businessType: 'SERVICE_FEE', amount: serviceFeeAmount, remark: dto.remark?.trim() || null, operatorId: context.sub } });
      const updated = await tx.receiveRecord.update({ where: { id }, data: { status: ReceiveRecordStatus.CONFIRMED, transactionId: transaction.id, postedAmount: walletCreditAmount, refundedAmount: new Prisma.Decimal(0), serviceFeeAmount, walletCreditAmount, invoiceEligibleAmount: new Prisma.Decimal(0), unBillingAmount: new Prisma.Decimal(0), billingAmount: new Prisma.Decimal(0), billedAmount: new Prisma.Decimal(0), confirmedBy: context.sub, confirmedAt: new Date(), remark: dto.remark?.trim() || row.remark || null }, include: { details: { include: { invoiceTask: true } } } });
      await tx.bankTransaction.update({ where: { id: bank.id }, data: { status: BankTransactionStatus.RECEIPT_CONFIRMED } });
      await this.audit(tx, context, row.organizationId, id, 'RECEIVE_RECORD_POST', { status: row.status, postedAmount: moneyToString(row.postedAmount) }, { status: updated.status, postingNo: posting.postingNo, transactionNo: transaction.transactionNo, walletCreditAmount: moneyToString(walletCreditAmount), paymentDetails: createdDetails.map((detail) => ({ type: detail.type, amount: moneyToString(detail.amount) })), publicInvoiceTasks: publicDetails.length });
      return { idempotent: false, receiveRecord: this.receiveView(updated), posting: this.postingView(posting), transaction: this.transactionView(transaction), walletTransaction: walletResult.transaction };
    });
  }

  async refundReceiveRecord(id: string, dto: CreateReceiveRefundDto, context: AccessContext) {
    this.assertPermission(context, 'FINANCE_REFUND_CREATE');
    const refundAmount = toMoney(dto.refundAmount, '退款金额');
    if (refundAmount.lte(0)) throw new BadRequestException('退款金额必须大于0');
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockReceive(tx, id, context);
      if (row.status !== ReceiveRecordStatus.CONFIRMED || !row.customerId) throw new ConflictException('收款记录尚未完成入账，不能退款');
      const existing = await tx.refund.findFirst({ where: { receiveRecordId: id, idempotencyKey: dto.idempotencyKey } });
      if (existing) return { idempotent: true, refund: this.refundView(existing) };
      const reserved = await tx.refund.aggregate({ where: { receiveRecordId: id, status: { in: [RefundStatus.PENDING, RefundStatus.APPROVED, RefundStatus.REFUNDED] } }, _sum: { refundAmount: true } });
      const refundable = row.postedAmount.sub(reserved._sum.refundAmount || new Prisma.Decimal(0));
      if (refundAmount.gt(refundable)) throw new ConflictException({ success: false, code: 'REFUND_AMOUNT_EXCEEDED', message: '可退款金额不足' });
      const refundNo = this.generateRefundNo();
      const refund = await tx.refund.create({ data: { refundNo, organizationId: row.organizationId, purchaseOrderId: row.purchaseOrderId, receiveRecordId: id, customerId: row.customerId, originalPaymentId: null, refundAmount, refundReason: dto.refundReason.trim(), status: RefundStatus.REFUNDED, idempotencyKey: dto.idempotencyKey, applicantId: context.sub, executedBy: context.sub, approvedBy: context.sub, approvedAt: new Date(), executedAt: new Date() } });
      const transaction = await this.cashflow.createTransactionInTransaction(tx, { accountId: row.accountId, businessType: TransactionBusinessType.CUSTOMER_REFUND, businessNo: refundNo, changeAmount: refundAmount.negated(), operatorId: context.sub, occurredAt: new Date(), remark: `收款退款：${dto.refundReason}`, accessContext: context });
      const walletTransaction = await this.customerWallet.applyReceiveRefundInTransaction(tx, { customerId: row.customerId, organizationId: row.organizationId, receiveRecordId: id, refundNo, refundAmount, operatorId: context.sub, idempotencyKey: dto.idempotencyKey, remark: dto.refundReason });
      const updated = await tx.receiveRecord.update({ where: { id }, data: { postedAmount: row.postedAmount.sub(refundAmount), refundedAmount: row.refundedAmount.add(refundAmount) } });
      const updatedRefund = await tx.refund.update({ where: { id: refund.id }, data: { transactionNo: transaction.transactionNo } });
      await this.audit(tx, context, row.organizationId, id, 'RECEIVE_RECORD_REFUND', { postedAmount: moneyToString(row.postedAmount) }, { postedAmount: moneyToString(updated.postedAmount), refundedAmount: moneyToString(updated.refundedAmount), refundNo, transactionNo: transaction.transactionNo });
      return { idempotent: false, refund: this.refundView(updatedRefund), receiveRecord: this.receiveView(updated), transaction: this.transactionView(transaction), walletTransaction: walletTransaction.transaction };
    });
  }

  private async importOne(tx: Prisma.TransactionClient, item: BankTransactionImportItemDto, context: AccessContext) {
    const account = await tx.account.findUnique({ where: { id: item.accountId }, select: { id: true, organizationId: true, currency: true, status: true } });
    if (!account) throw new NotFoundException('收款资金账户不存在');
    if (!account.organizationId) throw new ForbiddenException('收款资金账户未配置所属组织');
    await this.scope.assertOrganizationAccess(account.organizationId, context);
    if (account.currency !== 'CNY') throw new BadRequestException('银行收款交易只支持CNY资金账户');
    if (account.status !== 'ACTIVE') throw new BadRequestException('收款资金账户已停用');
    const amount = toMoney(item.amount, '银行交易金额');
    if (amount.lte(0)) throw new BadRequestException('银行交易金额必须大于0');
    const existing = await tx.bankTransaction.findFirst({ where: { accountId: item.accountId, externalTransactionId: item.externalTransactionId } });
    if (existing) return { idempotent: true, bankTransaction: this.bankView(existing) };
    const row = await tx.bankTransaction.create({ data: { transactionNo: this.generateBankNo(), organizationId: account.organizationId, accountId: account.id, occurredAt: new Date(item.occurredAt), bookedAt: item.bookedAt ? new Date(item.bookedAt) : null, direction: item.direction, amount, currency: 'CNY', counterpartyName: item.counterpartyName?.trim() || null, counterpartyAccount: item.counterpartyAccount?.trim() || null, summary: item.summary?.trim() || null, remark: item.remark?.trim() || null, source: item.source.trim(), externalTransactionId: item.externalTransactionId.trim(), status: BankTransactionStatus.CONFIRMING, createdBy: context.sub } });
    await this.audit(tx, context, account.organizationId, row.id, 'BANK_TRANSACTION_IMPORT', null, { transactionNo: row.transactionNo, externalTransactionId: row.externalTransactionId, amount: moneyToString(amount), direction: row.direction });
    return { idempotent: false, bankTransaction: this.bankView(row) };
  }

  private async assertCustomer(tx: Prisma.TransactionClient, customerId: string, organizationId: string) { const customer = await tx.customer.findUnique({ where: { id: customerId } }); if (!customer) throw new NotFoundException('客户不存在'); if (customer.agentId !== organizationId) throw new ForbiddenException('客户不属于当前组织'); return customer; }
  private async assertOrderMatch(tx: Prisma.TransactionClient, orderId: string, customerId: string | null | undefined, organizationId: string) { const order = await tx.purchaseOrder.findUnique({ where: { id: orderId } }); if (!order) throw new NotFoundException('外采订单不存在'); if (order.organizationId !== organizationId) throw new ForbiddenException('订单不属于当前组织'); if (customerId && order.customerId !== customerId) throw new ConflictException('订单与客户不匹配'); return order; }
  private async lockBank(tx: Prisma.TransactionClient, id: string, context: AccessContext) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "bank_transactions" WHERE "id" = ${id}::uuid FOR UPDATE`); const row = await tx.bankTransaction.findUnique({ where: { id }, include: { receiveRecord: true } }); if (!row) throw new NotFoundException('银行交易不存在'); await this.scope.assertOrganizationAccess(row.organizationId, context); return row; }
  private async lockReceive(tx: Prisma.TransactionClient, id: string, context: AccessContext) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "receive_records" WHERE "id" = ${id}::uuid FOR UPDATE`); const row = await tx.receiveRecord.findUnique({ where: { id }, include: { transaction: true, bankTransaction: true } }); if (!row) throw new NotFoundException('收款记录不存在'); await this.scope.assertOrganizationAccess(row.organizationId, context); return row; }
  private assertPermission(context: AccessContext, permission: string) { if (!this.scope.isSuperAdmin(context) && !context.roles.includes('FINANCE') && !context.permissions.includes(permission)) throw new ForbiddenException({ success: false, code: 'PERMISSION_DENIED', message: '无权操作收款管理' }); }
  private async audit(tx: Prisma.TransactionClient, context: AccessContext, organizationId: string, resourceId: string, action: string, beforeData: unknown, afterData: unknown) { await tx.auditLog.create({ data: { operatorId: context.sub, organizationId, actionType: action, businessType: 'RECEIVING', businessId: resourceId, beforeData: beforeData as Prisma.InputJsonValue, afterData: afterData as Prisma.InputJsonValue, result: 'SUCCESS' } }); }
  private bankView(row: any) { return { ...row, amount: moneyToString(row.amount) }; }
  private receiveView(row: any) { return { ...row, amount: moneyToString(row.amount), postedAmount: moneyToString(row.postedAmount ?? new Prisma.Decimal(0)), refundedAmount: moneyToString(row.refundedAmount ?? new Prisma.Decimal(0)), serviceFeeAmount: moneyToString(row.serviceFeeAmount ?? new Prisma.Decimal(0)), walletCreditAmount: moneyToString(row.walletCreditAmount ?? new Prisma.Decimal(0)), invoiceEligibleAmount: moneyToString(row.invoiceEligibleAmount ?? new Prisma.Decimal(0)), unBillingAmount: moneyToString(row.unBillingAmount ?? new Prisma.Decimal(0)), billingAmount: moneyToString(row.billingAmount ?? new Prisma.Decimal(0)), billedAmount: moneyToString(row.billedAmount ?? new Prisma.Decimal(0)), details: row.details?.map((detail: any) => ({ ...detail, amount: moneyToString(detail.amount), invoiceTask: detail.invoiceTask ? { ...detail.invoiceTask, publicAmount: moneyToString(detail.invoiceTask.publicAmount), invoiceAmount: moneyToString(detail.invoiceTask.invoiceAmount) } : undefined })), serviceFeeDetails: row.serviceFeeDetails?.map((detail: any) => ({ ...detail, amount: moneyToString(detail.amount) })), postings: row.postings?.map((posting: any) => ({ ...posting, paymentAmount: moneyToString(posting.paymentAmount), refundAmount: moneyToString(posting.refundAmount), serviceFeeAmount: moneyToString(posting.serviceFeeAmount), walletCreditAmount: moneyToString(posting.walletCreditAmount), invoiceEligibleAmount: moneyToString(posting.invoiceEligibleAmount) })), transaction: row.transaction ? this.transactionView(row.transaction) : undefined }; }
  private postingView(row: any) { return { ...row, paymentAmount: moneyToString(row.paymentAmount), refundAmount: moneyToString(row.refundAmount), serviceFeeAmount: moneyToString(row.serviceFeeAmount), walletCreditAmount: moneyToString(row.walletCreditAmount), invoiceEligibleAmount: moneyToString(row.invoiceEligibleAmount) }; }
  private refundView(row: any) { return { ...row, refundAmount: moneyToString(row.refundAmount) }; }
  private transactionView(row: any) { return { id: row.id, transactionNo: row.transactionNo, accountId: row.accountId, businessType: row.businessType, businessNo: row.businessNo, changeAmount: moneyToString(row.changeAmount), balanceBefore: moneyToString(row.balanceBefore), balanceAfter: moneyToString(row.balanceAfter), occurredAt: row.occurredAt, operatorId: row.operatorId, remark: row.remark }; }
  private generateBankNo() { return `BT${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
  private generateReceiveNo() { return `RC${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
  private generatePostingNo() { return `RP${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
  private generateInvoiceTaskNo() { return `IT${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
  private generateRefundNo() { return `RCR${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`; }
}
