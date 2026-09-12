import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, ValidateIf } from 'class-validator';
import { RebateCalculationMode, RebateRuleType } from '@prisma/client';

const amountPattern = /^\d+(?:\.\d{1,2})?$/;
const ratePattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const asString = ({ value }: { value: unknown }) => value === undefined || value === null ? value : String(value).trim();

export class CalculateRebateDto {
  @Transform(asString)
  @IsString({ message: '计算金额必须使用数字字符串' })
  @Matches(amountPattern, { message: '计算金额格式不正确，请输入最多两位小数的数字' })
  amount!: string;

  @ValidateIf((value) => !value.ruleId)
  @Transform(asString)
  @IsNotEmpty({ message: '未指定规则时，返点比例不能为空' })
  @IsString({ message: '返点比例必须使用数字字符串' })
  @Matches(ratePattern, { message: '返点比例格式不正确，请输入百分比数字' })
  rate?: string;

  @ValidateIf((value) => !value.ruleId)
  @IsNotEmpty({ message: '未指定规则时，返点类型不能为空' })
  @IsEnum(RebateRuleType, { message: '返点类型不受支持' })
  type?: RebateRuleType;

  @ValidateIf((value) => !value.ruleId)
  @IsNotEmpty({ message: '未指定规则时，计算方向不能为空' })
  @IsEnum(RebateCalculationMode, { message: '返点计算方向不受支持' })
  calculationMode?: RebateCalculationMode;

  @IsOptional()
  @IsUUID('4', { message: '客户 ID 格式不正确' })
  customerId?: string;

  @IsOptional()
  @IsUUID('4', { message: '返点规则 ID 格式不正确' })
  ruleId?: string;

  @IsOptional()
  @IsUUID('4', { message: '资金账户 ID 格式不正确' })
  accountId?: string;
}
