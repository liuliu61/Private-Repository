import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ServiceFeeReconciliationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsIn([10, 20, 50, 100], { message: '每页数量只支持10、20、50或100' }) @Type(() => Number) pageSize = 10;
  @IsOptional() @IsIn(['ALL', 'NON_ZERO'], { message: '服务费筛选页签不正确' }) tab: 'ALL' | 'NON_ZERO' = 'ALL';
  @IsOptional() @IsString() transactionNo?: string;
  @IsOptional() @IsDateString({}, { message: '开始日期格式不正确' }) dateFrom?: string;
  @IsOptional() @IsDateString({}, { message: '结束日期格式不正确' }) dateTo?: string;
  @IsOptional() @IsString() paymentAccountId?: string;
  @IsOptional() @IsString() paymentAccountKeyword?: string;
}
