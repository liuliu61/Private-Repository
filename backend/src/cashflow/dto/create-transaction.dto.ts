import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { TransactionBusinessType } from '@prisma/client';

const decimalAmountPattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export class CreateTransactionDto {
  @IsUUID('4', { message: '账户 ID 格式不正确' })
  @IsNotEmpty({ message: '账户 ID 不能为空' })
  accountId!: string;

  @IsEnum(TransactionBusinessType, { message: '业务类型不受支持' })
  businessType!: TransactionBusinessType;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: '业务单号必须是文本' })
  @IsNotEmpty({ message: '业务单号不能为空' })
  @MaxLength(100, { message: '业务单号不能超过 100 个字符' })
  businessNo!: string;

  @IsString({ message: '金额必须使用字符串格式' })
  @Matches(decimalAmountPattern, { message: '金额格式不正确，请输入最多两位小数的数字' })
  changeAmount!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString({ message: '备注必须是文本' })
  @MaxLength(255, { message: '备注不能超过 255 个字符' })
  remark?: string;
}
