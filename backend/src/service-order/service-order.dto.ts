import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ServiceOrderListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString({}, { message: '开始时间格式不正确' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: '结束时间格式不正确' }) endDate?: string;
}

export class ServiceOrderReceiveItemDto {
  @IsUUID('4', { message: '收款记录ID格式不正确' }) receiveRecordId!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsNumber() @Min(0) serviceFee?: number;
}

export class ServiceOrderPurchaseItemDto {
  @IsOptional() @IsUUID('4', { message: '采购订单ID格式不正确' }) purchaseOrderId?: string;
  @IsOptional() @IsUUID('4', { message: '广告账户ID格式不正确' }) adAccountId?: string;
  @IsOptional() @IsUUID('4', { message: '广告主体ID格式不正确' }) adSubjectId?: string;
  @IsNumber() @Min(0) transferAmount!: number;
  @IsOptional() @IsNumber() @Min(0) receivableAmount?: number;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateServiceOrderDto {
  @IsUUID('4', { message: '客户ID格式不正确' }) customerId!: string;
  @IsOptional() @IsString() @MaxLength(200) contractSubject?: string;
  @IsOptional() @IsEnum(['AD_ACCOUNT', 'SHARED_WALLET']) transferCategory?: 'AD_ACCOUNT' | 'SHARED_WALLET';
  @IsOptional() @IsEnum(['BIDDING', 'NON_BIDDING']) deliveryType?: 'BIDDING' | 'NON_BIDDING';
  @IsOptional() @IsString() @MaxLength(50) businessType?: string;
  @IsOptional() @IsNumber() @Min(0) totalReceivableAmount?: number;
  @IsOptional() @IsNumber() @Min(0) actualReceivedAmount?: number;
  @IsOptional() @IsNumber() @Min(0) serviceCostAmount?: number;
  @IsOptional() @IsNumber() @Min(0) creditAmount?: number;
  @IsOptional() @IsNumber() @Min(0) serviceFeeAmount?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ServiceOrderReceiveItemDto) receiveItems?: ServiceOrderReceiveItemDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ServiceOrderPurchaseItemDto) purchaseItems?: ServiceOrderPurchaseItemDto[];
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}

export class UpdateServiceOrderDto extends CreateServiceOrderDto {}

export class ConfirmServiceOrderDto {
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(50) ip?: string;
}

export class ServiceOrderIdParamDto {
  @IsUUID('4', { message: '服务订单ID格式不正确' }) id!: string;
}
