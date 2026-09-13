import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AccountStatus, AccountType, AccountUnit, AdAssetStatus, BankTransactionDirection, BankTransactionStatus, CustomerWalletTransactionType, CustomerWalletType, FinancialAdjustmentStatus, FinancialAdjustmentType, InvoiceStatus, InvoiceTaskStatus, OrganizationType, PromotionTransactionBusinessType, PurchaseOrderStatus, PurchaseOrderTransactionType, ReceivePaymentNature, ReceiveRecordStatus, RebateCalculationMode, RebateRuleType, ReconciliationStatus, RefundStatus, SettlementStatus, SupplierAccountType, SupplierPlatform, SupplierSettlementType } from '@prisma/client';

const money = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const rate = /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateOrganizationDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsEnum(OrganizationType) type!: OrganizationType;
  @IsOptional() @IsUUID('4') parentId?: string;
}

export class AssignOrganizationDto { @IsUUID('4') organizationId!: string; @IsUUID('4') userId!: string; }

export class CreateAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) accountCode!: string;
  @IsEnum(AccountType) accountType!: AccountType;
  @IsOptional() @IsUUID('4') organizationId?: string;
  @IsOptional() @Matches(money) openingBalance?: string;
}

export class CreateCustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(50) customerCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(100) fullName?: string;
  @IsOptional() @IsString() @MaxLength(100) contact?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) departmentId?: string;
  @IsOptional() @IsUUID('4') agentId?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateSupplierDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsEnum(SupplierPlatform) platform!: SupplierPlatform;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(50) contactPhone?: string;
  @IsOptional() @IsUUID('4') organizationId?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateSupplierAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(100) accountName!: string;
  @IsEnum(SupplierAccountType) accountType!: SupplierAccountType;
  @IsOptional() @IsEnum(AccountUnit) currency: AccountUnit = AccountUnit.CNY;
}

export class CreatePromotionAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(100) accountName!: string;
}

export class RecordCustomerCreditDto {
  @IsUUID('4', { message: '推广账户ID格式不正确' }) promotionAccountId!: string;
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, { message: '到账账户币金额格式不正确' }) creditAmount!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) businessNo!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) idempotencyKey!: string;
  @IsDateString({}, { message: '到账时间格式不正确' }) occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class RecordCustomerPaymentDto {
  @Matches(money, { message: '实际收款金额格式不正确' }) actualAmount!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) businessNo!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) idempotencyKey!: string;
  @IsDateString({}, { message: '收款时间格式不正确' }) occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class RecordSupplierPaymentDto {
  @IsUUID('4') supplierAccountId!: string;
  @Matches(money, { message: '实际付款金额格式不正确' }) actualAmount!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) businessNo!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) idempotencyKey!: string;
  @IsDateString({}, { message: '付款时间格式不正确' }) occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateRefundDto {
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, { message: '退款金额格式不正确' }) refundAmount!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) refundReason!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) idempotencyKey!: string;
}

export class RefundQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '订单ID格式不正确' }) purchaseOrderId?: string;
  @IsOptional() @IsEnum(RefundStatus) status?: RefundStatus;
  @IsOptional() @IsString() @MaxLength(50) refundNo?: string;
  @IsOptional() @IsDateString({}, { message: '开始时间格式不正确' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: '结束时间格式不正确' }) endDate?: string;
}

export class CreateAdSubjectDto {
  @IsString() @IsNotEmpty() @MaxLength(100) subjectCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsEnum(SupplierPlatform) platform!: SupplierPlatform;
  @IsOptional() @IsUUID('4') organizationId?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateAdAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(100) externalId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsEnum(SupplierPlatform) platform!: SupplierPlatform;
  @IsUUID('4') subjectId!: string;
  @IsOptional() @IsUUID('4') customerId?: string;
}

export class CreatePurchaseOrderDto {
  @IsOptional() @IsString() @MaxLength(100) clientRequestId?: string;
  @IsUUID('4') organizationId!: string;
  @IsUUID('4') customerId!: string;
  @IsUUID('4') supplierId!: string;
  @IsOptional() @IsUUID('4') adSubjectId?: string;
  @IsOptional() @IsUUID('4') adAccountId?: string;
  @IsOptional() @IsEnum(SupplierPlatform) platform?: SupplierPlatform;
  @IsUUID('4') cashAccountId!: string;
  @IsOptional() @Matches(money) baseAmount?: string;
  @IsOptional() @Matches(money) amount?: string;
  @IsOptional() @IsDateString() orderTime?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateProcurementOrderDto {
  @IsOptional() @IsString() @MaxLength(100) clientRequestId?: string;
  @IsUUID('4') organizationId!: string;
  @IsUUID('4') customerId!: string;
  @IsUUID('4') supplierId!: string;
  @IsOptional() @IsUUID('4', { message: '伙伴CNY账户ID格式不正确' }) supplierAccountId?: string;
  @IsEnum(SupplierPlatform) platform!: SupplierPlatform;
  @IsOptional() @IsEnum(PurchaseOrderTransactionType, { message: '交易类型不正确' }) transactionType: PurchaseOrderTransactionType = PurchaseOrderTransactionType.TRANSFER_IN;
  @IsOptional() @IsString() @MaxLength(50) businessType?: string;
  @IsUUID('4') subjectId!: string;
  @IsUUID('4') accountId!: string;
  @IsUUID('4', { message: '公司资金账户ID格式不正确' }) cashAccountId!: string;
  @Matches(money, { message: '基准金额格式不正确' }) baseAmount!: string;
  @IsDateString({}, { message: '业务时间格式不正确' }) businessTime!: string;
  @IsOptional() @IsString() @MaxLength(100) inboundAccountId?: string;
  @IsOptional() @IsString() @MaxLength(120) inboundAccountName?: string;
  @IsOptional() @IsString() @MaxLength(100) outboundAccountId?: string;
  @IsOptional() @IsString() @MaxLength(120) outboundAccountName?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class PurchaseOrderQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsIn([10, 20, 50, 100], { message: '每页数量只支持10、20、50或100' }) @Type(() => Number) pageSize = 10;
  @IsOptional() @IsEnum(PurchaseOrderStatus) status?: PurchaseOrderStatus;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '供应商ID格式不正确' }) supplierId?: string;
  @IsOptional() @IsEnum(SupplierPlatform) platform?: SupplierPlatform;
  @IsOptional() @IsEnum(PurchaseOrderTransactionType) transactionType?: PurchaseOrderTransactionType;
  @IsOptional() @IsString() @MaxLength(50) businessType?: string;
  @IsOptional() @IsUUID('4', { message: '广告主体ID格式不正确' }) subjectId?: string;
  @IsOptional() @IsUUID('4', { message: '广告账户ID格式不正确' }) accountId?: string;
  @IsOptional() @IsString() @MaxLength(50) procurementNo?: string;
  @IsOptional() @IsString() @MaxLength(100) inboundAccountId?: string;
  @IsOptional() @IsString() @MaxLength(120) inboundAccountName?: string;
  @IsOptional() @IsString() @MaxLength(100) outboundAccountId?: string;
  @IsOptional() @IsString() @MaxLength(120) outboundAccountName?: string;
  @IsOptional() @IsEnum(RebateRuleType) customerPolicyType?: RebateRuleType;
  @IsOptional() @IsEnum(RebateRuleType) supplierPolicyType?: RebateRuleType;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(255) remark?: string;
  @IsOptional() @IsDateString({}, { message: '开始时间格式不正确' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: '结束时间格式不正确' }) endDate?: string;
}

export class PurchaseOrderImportRowDto extends CreateProcurementOrderDto {}

export class PurchaseOrderImportDto {
  @IsArray() @ArrayMinSize(1, { message: '导入数据不能为空' }) @ValidateNested({ each: true }) @Type(() => PurchaseOrderImportRowDto)
  rows!: PurchaseOrderImportRowDto[];
}

export class SourcingSettingDto {
  @IsBoolean({ message: '客户钱包开关必须是布尔值' }) useCustomerWallet!: boolean;
}

export class SourcingSettingQueryDto {
  @IsOptional() @IsUUID('4', { message: '组织ID格式不正确' }) organizationId?: string;
}

export class CreateCustomerPolicyDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsUUID('4') customerId?: string;
  @IsOptional() @IsUUID('4') adSubjectId?: string;
  @IsOptional() @IsUUID('4') adAccountId?: string;
  @IsEnum(RebateRuleType) rebateType!: RebateRuleType;
  @IsEnum(RebateCalculationMode) calculationMode!: RebateCalculationMode;
  @Matches(rate) rate!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CreateSupplierPolicyDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsUUID('4') supplierId?: string;
  @IsOptional() @IsEnum(SupplierPlatform) platform?: SupplierPlatform;
  @IsOptional() @IsUUID('4') adSubjectId?: string;
  @IsOptional() @IsUUID('4') adAccountId?: string;
  @IsEnum(RebateRuleType) rebateType!: RebateRuleType;
  @IsEnum(RebateCalculationMode) calculationMode!: RebateCalculationMode;
  @Matches(rate) rate!: string;
  @IsEnum(SupplierSettlementType) settlementType!: SupplierSettlementType;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class BusinessIdParamDto {
  @IsUUID('4', { message: '业务单据ID格式不正确' })
  id!: string;
}

export class CustomerIdParamDto {
  @IsUUID('4', { message: '客户ID格式不正确' })
  customerId!: string;
}

export class CustomerPolicyIdParamDto extends CustomerIdParamDto {
  @IsUUID('4', { message: '政策ID格式不正确' })
  id!: string;
}

export class CustomerPolicyAtQueryDto {
  @IsOptional() @IsDateString({}, { message: '业务时间格式不正确' }) at?: string;
}

export class CustomerPolicyListQueryDto extends CustomerPolicyAtQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreateCustomerRebatePolicyVersionDto {
  @IsEnum(RebateRuleType) rebateType!: RebateRuleType;
  @IsEnum(RebateCalculationMode) calculationMode!: RebateCalculationMode;
  @Matches(rate) rate!: string;
  @IsDateString({}, { message: '生效时间格式不正确' }) effectiveFrom!: string;
  @IsOptional() @IsDateString({}, { message: '失效时间格式不正确' }) effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class SupplierRebatePolicyQueryDto extends CustomerPolicyAtQueryDto {
  @IsOptional() @IsEnum(SupplierPlatform) platform?: SupplierPlatform;
  @IsOptional() @IsUUID('4', { message: '主体ID格式不正确' }) subjectId?: string;
  @IsOptional() @IsUUID('4', { message: '广告账户ID格式不正确' }) accountId?: string;
}

export class SupplierRebatePolicyListQueryDto extends SupplierRebatePolicyQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreateSupplierRebatePolicyVersionDto {
  @IsOptional() @IsEnum(SupplierPlatform) platform?: SupplierPlatform;
  @IsOptional() @IsUUID('4', { message: '主体ID格式不正确' }) subjectId?: string;
  @IsOptional() @IsUUID('4', { message: '广告账户ID格式不正确' }) accountId?: string;
  @IsEnum(RebateRuleType) rebateType!: RebateRuleType;
  @IsEnum(RebateCalculationMode) calculationMode!: RebateCalculationMode;
  @Matches(rate) rate!: string;
  @IsDateString({}, { message: '生效时间格式不正确' }) effectiveFrom!: string;
  @IsOptional() @IsDateString({}, { message: '失效时间格式不正确' }) effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class SupplierIdParamDto {
  @IsUUID('4', { message: '供应商ID格式不正确' })
  supplierId!: string;
}

export class SupplierPolicyIdParamDto extends SupplierIdParamDto {
  @IsUUID('4', { message: '政策ID格式不正确' })
  id!: string;
}

export class CreateSettlementDto {
  @IsUUID('4') organizationId!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsUUID('4', { each: true }) orderIds!: string[];
}

export class SettlementPeriodDto {
  @IsDateString({}, { message: '结算开始时间格式不正确' }) periodStart!: string;
  @IsDateString({}, { message: '结算结束时间格式不正确' }) periodEnd!: string;
}

export class GenerateCustomerSettlementDto extends SettlementPeriodDto {
  @IsUUID('4', { message: '客户ID格式不正确' }) customerId!: string;
}

export class GenerateSupplierSettlementDto extends SettlementPeriodDto {
  @IsUUID('4', { message: '供应商ID格式不正确' }) supplierId!: string;
}

export class SettlementQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsEnum(SettlementStatus) status?: SettlementStatus;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '供应商ID格式不正确' }) supplierId?: string;
  @IsOptional() @IsDateString({}, { message: '结算开始时间格式不正确' }) periodStart?: string;
  @IsOptional() @IsDateString({}, { message: '结算结束时间格式不正确' }) periodEnd?: string;
}

export class SettlementIdParamDto extends BusinessIdParamDto {}

export class ReconciliationQueryDto {
  @IsUUID('4') accountId!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @Matches(money) actualClosingBalance?: string;
}

export class GenerateReconciliationDto {
  @IsOptional() @IsUUID('4', { message: '资金账户ID格式不正确' }) accountId?: string;
  @IsOptional() @IsUUID('4', { message: '推广账户ID格式不正确' }) promotionAccountId?: string;
  @IsDateString({}, { message: '对账开始时间格式不正确' }) periodStart!: string;
  @IsDateString({}, { message: '对账结束时间格式不正确' }) periodEnd!: string;
}

export class ReconciliationListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsEnum(ReconciliationStatus) status?: ReconciliationStatus;
  @IsOptional() @IsUUID('4', { message: '资金账户ID格式不正确' }) accountId?: string;
  @IsOptional() @IsUUID('4', { message: '推广账户ID格式不正确' }) promotionAccountId?: string;
  @IsOptional() @IsDateString({}, { message: '对账开始时间格式不正确' }) periodStart?: string;
  @IsOptional() @IsDateString({}, { message: '对账结束时间格式不正确' }) periodEnd?: string;
}

export class CreateFinancialAdjustmentDto {
  @IsOptional() @IsUUID('4', { message: '资金账户ID格式不正确' }) accountId?: string;
  @IsOptional() @IsUUID('4', { message: '推广账户ID格式不正确' }) promotionAccountId?: string;
  @IsEnum(AccountUnit, { message: '账户类型不正确' }) accountType!: AccountUnit;
  @IsEnum(FinancialAdjustmentType, { message: '调整类型不正确' }) type!: FinancialAdjustmentType;
  @Matches(money, { message: '调整金额格式不正确，请输入最多两位小数的正数' }) amount!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) reason!: string;
}

export class FinancialAdjustmentQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsEnum(FinancialAdjustmentStatus) status?: FinancialAdjustmentStatus;
  @IsOptional() @IsEnum(AccountUnit) accountType?: AccountUnit;
  @IsOptional() @IsUUID('4', { message: '资金账户ID格式不正确' }) accountId?: string;
  @IsOptional() @IsUUID('4', { message: '推广账户ID格式不正确' }) promotionAccountId?: string;
}

export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsEnum(OrganizationType) type?: OrganizationType;
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @IsOptional() @IsEnum(AdAssetStatus) assetStatus?: AdAssetStatus;
  @IsOptional() @IsEnum(PurchaseOrderStatus) orderStatus?: PurchaseOrderStatus;
  @IsOptional() @IsEnum(SettlementStatus) settlementStatus?: SettlementStatus;
  @IsOptional() @IsEnum(ReconciliationStatus) reconciliationStatus?: ReconciliationStatus;
}

export enum WalletComparisonOperator { EQ = 'EQ', NE = 'NE', GT = 'GT', GTE = 'GTE', LT = 'LT', LTE = 'LTE' }
export enum WalletAdjustmentDirection { INCOME = 'INCOME', EXPENSE = 'EXPENSE' }

export class CreateCustomerWalletDto {
  @IsUUID('4', { message: '客户ID格式不正确' }) customerId!: string;
  @IsOptional() @IsString() @MaxLength(100) walletName?: string;
  @IsOptional() @IsEnum(CustomerWalletType, { message: '钱包类型不正确' }) walletType: CustomerWalletType = CustomerWalletType.FINANCE_V;
  @IsOptional() @IsEnum(AccountUnit, { message: '钱包单位不正确' }) unit: AccountUnit = AccountUnit.CNY;
}

export class CustomerWalletListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '组织ID格式不正确' }) organizationId?: string;
  @IsOptional() @IsEnum(CustomerWalletType, { message: '钱包类型不正确' }) walletType?: CustomerWalletType;
  @IsOptional() @IsEnum(AccountStatus, { message: '钱包状态不正确' }) status?: AccountStatus;
  @IsOptional() @IsEnum(AccountUnit, { message: '钱包单位不正确' }) unit?: AccountUnit;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsEnum(WalletComparisonOperator) totalBalanceOperator?: WalletComparisonOperator;
  @IsOptional() @Matches(money, { message: '总余额筛选金额格式不正确' }) totalBalance?: string;
  @IsOptional() @IsEnum(WalletComparisonOperator) advanceOperator?: WalletComparisonOperator;
  @IsOptional() @Matches(money, { message: '垫款筛选金额格式不正确' }) advanceOutstanding?: string;
  @IsOptional() @IsEnum(WalletComparisonOperator) creditLimitOperator?: WalletComparisonOperator;
  @IsOptional() @Matches(money, { message: '授信额度筛选金额格式不正确' }) creditLimit?: string;
}

export class CustomerWalletTransactionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsIn([10, 20, 50, 100], { message: '每页数量只支持10、20、50或100' }) @Type(() => Number) pageSize = 10;
  @IsOptional() @IsIn([...Object.values(CustomerWalletTransactionType), ...Object.values(PromotionTransactionBusinessType)], { message: '钱包流水类型不正确' }) businessType?: CustomerWalletTransactionType | PromotionTransactionBusinessType;
  @IsOptional() @IsString() @MaxLength(60) transactionNo?: string;
  @IsOptional() @IsDateString({}, { message: '开始时间格式不正确' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: '结束时间格式不正确' }) endDate?: string;
  @IsOptional() @Matches(money, { message: '最小金额格式不正确' }) minAmount?: string;
  @IsOptional() @Matches(money, { message: '最大金额格式不正确' }) maxAmount?: string;
}

export class WalletOpeningBalanceDto {
  @Matches(money, { message: '期初余额格式不正确' }) amount!: string;
  @IsOptional() @IsString() @MaxLength(100) businessNo?: string;
  @IsOptional() @IsString() @MaxLength(100) idempotencyKey?: string;
  @IsOptional() @IsDateString({}, { message: '发生时间格式不正确' }) occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class WalletAdjustmentDto {
  @IsEnum(CustomerWalletTransactionType, { message: '钱包调整类型不正确' }) type!: CustomerWalletTransactionType;
  @IsOptional() @IsEnum(WalletAdjustmentDirection, { message: '调整方向不正确' }) direction?: WalletAdjustmentDirection;
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, { message: '调整金额格式不正确，请输入最多两位小数的正数' }) amount!: string;
  @IsOptional() @IsString() @MaxLength(100) businessNo?: string;
  @IsOptional() @IsString() @MaxLength(100) idempotencyKey?: string;
  @IsOptional() @IsDateString({}, { message: '发生时间格式不正确' }) occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class WalletCreditUpdateDto {
  @IsOptional() @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, { message: '授信额度格式不正确' }) creditLimit?: string;
  @IsOptional() @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, { message: '授信已使用金额格式不正确' }) creditUsed?: string;
  @IsOptional() @IsDateString({}, { message: '生效时间格式不正确' }) effectiveAt?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class WalletAdvanceUpdateDto {
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, { message: '垫款金额格式不正确' }) advanceOutstanding!: string;
  @IsOptional() @IsDateString({}, { message: '生效时间格式不正确' }) effectiveAt?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

const positiveMoney = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export class BankTransactionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsIn([10, 20, 50, 100], { message: '每页数量只支持10、20、50或100' }) @Type(() => Number) pageSize = 20;
  @IsOptional() @IsUUID('4', { message: '资金账户ID格式不正确' }) accountId?: string;
  @IsOptional() @IsEnum(BankTransactionDirection, { message: '交易方向不正确' }) direction?: BankTransactionDirection;
  @IsOptional() @IsEnum(BankTransactionStatus, { message: '银行交易状态不正确' }) status?: BankTransactionStatus;
  @IsOptional() @IsString() @MaxLength(120) counterpartyName?: string;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsDateString({}, { message: '开始时间格式不正确' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: '结束时间格式不正确' }) endDate?: string;
  @IsOptional() @Matches(positiveMoney, { message: '最小金额格式不正确' }) minAmount?: string;
  @IsOptional() @Matches(positiveMoney, { message: '最大金额格式不正确' }) maxAmount?: string;
}

export class BankTransactionImportItemDto {
  @IsUUID('4', { message: '资金账户ID格式不正确' }) accountId!: string;
  @IsDateString({}, { message: '交易时间格式不正确' }) occurredAt!: string;
  @IsOptional() @IsDateString({}, { message: '入账时间格式不正确' }) bookedAt?: string;
  @IsEnum(BankTransactionDirection, { message: '交易方向不正确' }) direction!: BankTransactionDirection;
  @Matches(positiveMoney, { message: '交易金额格式不正确' }) amount!: string;
  @IsOptional() @IsString() @MaxLength(120) counterpartyName?: string;
  @IsOptional() @IsString() @MaxLength(120) counterpartyAccount?: string;
  @IsOptional() @IsString() @MaxLength(255) summary?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
  @IsString() @IsNotEmpty() @MaxLength(50) source!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) externalTransactionId!: string;
}

export class ImportBankTransactionsDto {
  @IsArray({ message: '银行交易列表格式不正确' })
  @ArrayMinSize(1, { message: '至少需要导入一笔银行交易' })
  @ValidateNested({ each: true })
  @Type(() => BankTransactionImportItemDto)
  items!: BankTransactionImportItemDto[];
}

export class BankTransactionMatchDto {
  @IsUUID('4', { message: '客户ID格式不正确' }) customerId!: string;
  @IsOptional() @IsUUID('4', { message: '订单ID格式不正确' }) purchaseOrderId?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateReceiveRecordDto {
  @IsUUID('4', { message: '银行交易ID格式不正确' }) bankTransactionId!: string;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '订单ID格式不正确' }) purchaseOrderId?: string;
  @IsOptional() @Matches(positiveMoney, { message: '收款金额格式不正确' }) amount?: string;
  @IsOptional() @IsDateString({}, { message: '收款时间格式不正确' }) receivedAt?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class ReceivePostingDetailDto {
  @IsEnum(ReceivePaymentNature, { message: '入账性质不正确' }) type!: ReceivePaymentNature;
  @Matches(positiveMoney, { message: '入账明细金额格式不正确' }) amount!: string;
}

export class ReceivePostingDto {
  @Matches(positiveMoney, { message: '服务费金额格式不正确' }) serviceFeeAmount = '0.00';
  @IsArray({ message: '入账明细格式不正确' }) @ArrayMinSize(1, { message: '至少需要填写一条入账明细' }) @ValidateNested({ each: true }) @Type(() => ReceivePostingDetailDto) details!: ReceivePostingDetailDto[];
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
  @IsOptional() @IsString() @MaxLength(100) idempotencyKey?: string;
}

export class CreateCustomerInvoiceProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(150) titleName!: string;
  @IsOptional() @IsString() @MaxLength(100) taxpayerCode?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) bankName?: string;
  @IsOptional() @IsString() @MaxLength(100) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(255) defaultInvoiceContent?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateCustomerInvoiceProfileDto extends CreateCustomerInvoiceProfileDto {}

export class UpdateInvoiceTaskDto {
  @Matches(positiveMoney, { message: '需开票金额格式不正确' }) invoiceAmount!: string;
  @IsOptional() @IsUUID('4', { message: '开票信息ID格式不正确' }) invoiceProfileId?: string;
  @IsOptional() @IsString() @MaxLength(150) titleName?: string;
  @IsOptional() @IsString() @MaxLength(100) taxpayerCode?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) bankName?: string;
  @IsOptional() @IsString() @MaxLength(100) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(255) invoiceContent?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class InvoiceTaskReviewDto { @IsOptional() @IsString() @MaxLength(255) approvalRemark?: string; }
export class InvoiceTaskRejectDto { @IsString() @IsNotEmpty({ message: '请填写驳回原因' }) @MaxLength(255) rejectReason!: string; }
export class CompleteInvoiceTaskDto {
  @Matches(positiveMoney, { message: '实际开票金额格式不正确' }) amount!: string;
  @IsString() @IsNotEmpty({ message: '请选择发票类型!' }) @IsIn(['增值税电子专用发票', '增值税电子普通发票', '增值税专用发票', '增值税普通发票', '形式发票'], { message: '发票类型不正确' }) invoiceType!: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceCode?: string;
  @IsOptional() @IsDateString({}, { message: '开票日期格式不正确' }) invoiceDate?: string;
  @IsOptional() @IsString() @MaxLength(255) invoiceContent?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
  @IsOptional() @IsString() @MaxLength(500) invoiceUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
}

export class InvoiceTaskQueryDto {
  @IsOptional() @IsEnum(InvoiceTaskStatus) status?: InvoiceTaskStatus;
  @IsOptional() @IsUUID('4') customerId?: string;
  @IsOptional() @IsString() @MaxLength(60) keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreateReceiveRefundDto {
  @Matches(positiveMoney, { message: '退款金额格式不正确' }) refundAmount!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) refundReason!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) idempotencyKey!: string;
}

export class ReceiveRecordQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsIn([10, 20, 50, 100], { message: '每页数量只支持10、20、50或100' }) @Type(() => Number) pageSize = 20;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '银行交易ID格式不正确' }) bankTransactionId?: string;
  @IsOptional() @IsUUID('4', { message: '账户ID格式不正确' }) accountId?: string;
  @IsOptional() @IsEnum(ReceiveRecordStatus, { message: '收款状态不正确' }) status?: ReceiveRecordStatus;
  @IsOptional() @IsString() @MaxLength(60) receiveNo?: string;
  @IsOptional() @IsDateString({}, { message: '开始时间格式不正确' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: '结束时间格式不正确' }) endDate?: string;
}

export class InvoiceQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsIn([10, 20, 50, 100], { message: '每页数量只支持10、20、50或100' }) @Type(() => Number) pageSize = 20;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '资金账户ID格式不正确' }) accountId?: string;
  @IsOptional() @IsEnum(InvoiceStatus, { message: '发票状态不正确' }) status?: InvoiceStatus;
  @IsOptional() @IsString() @MaxLength(100) invoiceNo?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) businessNo?: string;
  @IsOptional() @IsString() @MaxLength(120) keyword?: string;
  @IsOptional() @IsDateString({}, { message: '开始时间格式不正确' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: '结束时间格式不正确' }) endDate?: string;
}

export class CreateInvoiceDto {
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '订单ID格式不正确' }) purchaseOrderId?: string;
  @IsOptional() @IsUUID('4', { message: '收款记录ID格式不正确' }) receiveRecordId?: string;
  @Matches(positiveMoney, { message: '开票金额格式不正确，请输入最多两位小数的正数' }) amount!: string;
  @IsOptional() @IsDateString({}, { message: '开票日期格式不正确' }) invoiceDate?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) invoiceType?: string;
  @IsOptional() @IsString() @MaxLength(150) invoiceTitle?: string;
  @IsOptional() @IsString() @MaxLength(100) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) invoiceContent?: string;
  @IsOptional() @IsString() @MaxLength(150) issuingEntity?: string;
  @IsOptional() @IsString() @MaxLength(100) contractNo?: string;
  @IsOptional() @IsString() @MaxLength(50) invoiceNature?: string;
  @IsOptional() @IsString() @MaxLength(30) redFlushStatus?: string;
  @IsOptional() @IsString() @MaxLength(150) recipientEmail?: string;
  @IsOptional() @IsString() @MaxLength(100) clientRequestId?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class UpdateInvoiceDraftDto {
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) invoiceType?: string;
  @IsOptional() @IsString() @MaxLength(150) invoiceTitle?: string;
  @IsOptional() @IsString() @MaxLength(100) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) invoiceContent?: string;
  @IsOptional() @IsString() @MaxLength(150) issuingEntity?: string;
  @IsOptional() @IsString() @MaxLength(100) contractNo?: string;
  @IsOptional() @IsString() @MaxLength(50) invoiceNature?: string;
  @IsOptional() @IsString() @MaxLength(30) redFlushStatus?: string;
  @IsOptional() @IsString() @MaxLength(150) recipientEmail?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class InvoiceVoidDto {
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export class InvoiceApplicationItemDto {
  @Matches(positiveMoney, { message: '发票明细金额格式不正确' }) amount!: string;
  @IsOptional() @IsString() @MaxLength(50) itemType?: string;
  @IsOptional() @IsString() @MaxLength(255) content?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateInvoiceApplicationDto {
  @IsArray() @ArrayMinSize(1, { message: '至少选择一笔收款记录' }) @IsUUID('4', { each: true, message: '收款记录ID格式不正确' }) receiveRecordIds!: string[];
  @Matches(positiveMoney, { message: '申请开票金额格式不正确' }) amount!: string;
  @IsOptional() @IsDateString({}, { message: '开票日期格式不正确' }) invoiceDate?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsBoolean() autoSplit = true;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => InvoiceApplicationItemDto) @IsArray() items?: InvoiceApplicationItemDto[];
  @IsOptional() @IsString() @MaxLength(50) invoiceType?: string;
  @IsOptional() @IsString() @MaxLength(50) invoiceNature?: string;
  @IsOptional() @IsString() @MaxLength(150) invoiceTitle?: string;
  @IsOptional() @IsString() @MaxLength(100) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) invoiceContent?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
  @IsOptional() @IsString() @MaxLength(100) clientRequestId?: string;
  @IsOptional() @IsUUID('4', { message: 'OCR记录ID格式不正确' }) ocrRecordId?: string;
}

export class UpdateInvoiceApplicationDto {
  @IsOptional() @Matches(positiveMoney, { message: '申请开票金额格式不正确' }) amount?: string;
  @IsOptional() @IsDateString({}, { message: '开票日期格式不正确' }) invoiceDate?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceNumber?: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true, message: '收款记录ID格式不正确' }) receiveRecordIds?: string[];
  @IsOptional() @IsBoolean() autoSplit?: boolean;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => InvoiceApplicationItemDto) @IsArray() items?: InvoiceApplicationItemDto[];
  @IsOptional() @IsString() @MaxLength(50) invoiceNature?: string;
  @IsOptional() @IsString() @MaxLength(50) invoiceType?: string;
  @IsOptional() @IsString() @MaxLength(150) invoiceTitle?: string;
  @IsOptional() @IsString() @MaxLength(100) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) invoiceContent?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class InvoiceReviewDto {
  @IsOptional() @IsString() @MaxLength(255) approvalRemark?: string;
  @IsOptional() @IsString() @MaxLength(255) rejectReason?: string;
}

export class UploadInvoiceDetailDto {
  @IsOptional() @IsUUID('4', { message: '发票申请明细ID格式不正确' }) invoiceApplicationItemId?: string;
  @IsOptional() @Matches(money, { message: '发票金额格式不正确' }) amount?: string;
  @IsString() @IsNotEmpty({ message: '请选择发票类型!' }) @MaxLength(50) invoiceType!: string;
  @IsOptional() @IsString() @MaxLength(255) invoiceContent?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceCode?: string;
}

export class UpdateInvoiceDetailDto {
  @IsOptional() @Matches(money, { message: '发票金额格式不正确' }) amount?: string;
  @IsString() @IsNotEmpty({ message: '请选择发票类型!' }) @MaxLength(50) invoiceType!: string;
  @IsOptional() @IsString() @MaxLength(255) invoiceContent?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceCode?: string;
}

export class InvoiceOcrRequestDto {
  @IsOptional() @IsUUID('4', { message: '发票申请ID格式不正确' }) invoiceId?: string;
}
