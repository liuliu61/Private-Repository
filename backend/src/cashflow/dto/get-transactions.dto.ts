import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { TransactionBusinessType } from '@prisma/client';

function trimQueryValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class GetTransactionsDto {
  @IsOptional()
  @IsUUID('4', { message: '账户ID格式不正确' })
  accountId?: string;

  @IsOptional()
  @IsEnum(TransactionBusinessType, { message: '业务类型不受支持' })
  businessType?: TransactionBusinessType;

  @IsOptional()
  @Transform(({ value }) => trimQueryValue(value))
  @IsString({ message: '业务单号必须是文本' })
  @MaxLength(100, { message: '业务单号不能超过 100 个字符' })
  businessNo?: string;

  @IsOptional()
  @Transform(({ value }) => trimQueryValue(value))
  @IsString({ message: '流水号必须是文本' })
  @MaxLength(50, { message: '流水号不能超过 50 个字符' })
  transactionNo?: string;

  @IsOptional()
  @IsUUID('4', { message: '操作人 ID 格式不正确' })
  operatorId?: string;

  @IsOptional()
  @Transform(({ value }) => trimQueryValue(value))
  @IsDateString({}, { message: '开始时间格式不正确' })
  startDate?: string;

  @IsOptional()
  @Transform(({ value }) => trimQueryValue(value))
  @IsDateString({}, { message: '结束时间格式不正确' })
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '页码必须是大于等于 1 的整数' })
  @Min(1, { message: '页码必须是大于等于 1 的整数' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '每页数量必须是整数' })
  @Min(1, { message: '每页数量必须是 1 到 100 之间的整数' })
  @Max(100, { message: '每页数量不能超过 100' })
  pageSize?: number;
}
