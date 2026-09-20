import { IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ConsumptionListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize = 50;
  @IsOptional() @IsUUID('4') customerId?: string;
  @IsOptional() @IsUUID('4') adAccountId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class CreateConsumptionDto {
  @IsUUID('4', { message: '客户ID格式不正确' }) customerId!: string;
  @IsOptional() @IsUUID('4') adAccountId?: string;
  @IsOptional() @IsUUID('4') adSubjectId?: string;
  @IsDateString({}, { message: '消耗日期格式不正确' }) consumptionDate!: string;
  @IsNumber() @Min(0) creditAmount!: number;
  @IsOptional() @IsNumber() @Min(0) cashAmount?: number;
  @IsOptional() @IsNumber() rebateAmount?: number;
  @IsOptional() @IsNumber() serviceCost?: number;
  @IsOptional() @IsNumber() grossProfit?: number;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}

export class ConsumptionIdParamDto {
  @IsUUID('4', { message: '消耗记录ID格式不正确' }) id!: string;
}
