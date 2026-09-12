import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PurchaseOrderStatus } from '@prisma/client';

export class FinanceDateQueryDto {
  @IsOptional() @IsDateString({}, { message: '开始时间格式不正确' }) startDate?: string;
  @IsOptional() @IsDateString({}, { message: '结束时间格式不正确' }) endDate?: string;
}

export class FinanceCustomerQueryDto extends FinanceDateQueryDto {}

export class FinanceSupplierQueryDto extends FinanceDateQueryDto {}

export class FinanceOrderProfitQueryDto extends FinanceDateQueryDto {
  @IsOptional() @Type(() => Number) @IsInt({ message: '页码必须是整数' }) @Min(1, { message: '页码必须大于等于 1' }) page = 1;
  @IsOptional() @Type(() => Number) @IsInt({ message: '每页数量必须是整数' }) @Min(1, { message: '每页数量必须大于等于 1' }) @Max(100, { message: '每页数量不能超过 100' }) pageSize = 20;
  @IsOptional() @IsEnum(PurchaseOrderStatus, { message: '订单状态不正确' }) status?: PurchaseOrderStatus;
  @IsOptional() @IsUUID('4', { message: '客户ID格式不正确' }) customerId?: string;
  @IsOptional() @IsUUID('4', { message: '供应商ID格式不正确' }) supplierId?: string;
  @IsOptional() @IsIn(['PROFIT', 'LOSS', 'PENDING'], { message: '利润状态不正确' }) profitStatus?: 'PROFIT' | 'LOSS' | 'PENDING';
}
