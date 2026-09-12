import { AccountStatus, AccountUnit, PromotionTransactionBusinessType, TransactionBusinessType } from '@prisma/client';
import { Prisma } from '@prisma/client';

export type MoneyInput = string | Prisma.Decimal;

export interface CreateTransactionInput {
  accountId: string;
  businessType: TransactionBusinessType;
  businessNo?: string;
  changeAmount: MoneyInput;
  operatorId: string;
  remark?: string;
  occurredAt?: Date;
  accessContext?: AccountAccessContext;
  adjustmentId?: string;
}

export interface CreatePromotionTransactionInput {
  promotionAccountId: string;
  businessType: PromotionTransactionBusinessType;
  businessNo?: string;
  changeAmount: MoneyInput;
  operatorId: string;
  remark?: string;
  occurredAt?: Date;
  adjustmentId?: string;
}

export interface CreateSupplierAccountTransactionInput {
  supplierAccountId: string;
  expectedUnit?: AccountUnit;
  businessType: TransactionBusinessType;
  businessNo?: string;
  changeAmount: MoneyInput;
  operatorId: string;
  remark?: string;
  occurredAt?: Date;
}

export interface AccountAccessContext {
  sub: string;
  username: string;
  roles: string[];
  permissions: string[];
}

export interface TransactionQueryInput {
  accountId?: string;
  businessType?: TransactionBusinessType;
  businessNo?: string;
  transactionNo?: string;
  operatorId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface TransactionView {
  id: string;
  transactionNo: string;
  accountId: string | null;
  supplierAccountId: string | null;
  businessType: TransactionBusinessType;
  businessNo: string;
  changeAmount: string;
  balanceBefore: string;
  balanceAfter: string;
  occurredAt: Date;
  operatorId: string;
  remark: string | null;
  adjustmentId?: string | null;
}

export interface AccountBalanceView {
  accountId: string;
  currentBalance: string;
}

export interface AccountBalanceCheckView {
  accountId: string;
  currentBalance: string;
  calculatedBalance: string;
  difference: string;
  consistent: boolean;
}

export interface AccountSummaryView {
  accountId: string;
  accountName: string;
  currentBalance: string;
  periodIncome: string;
  periodExpense: string;
  periodRebate: string;
  periodRefund: string;
  periodAdjustment: string;
  periodOther: string;
}

export interface PaginatedTransactionsView {
  items: TransactionView[];
  total: number;
  page: number;
  pageSize: number;
}

export { AccountStatus };
