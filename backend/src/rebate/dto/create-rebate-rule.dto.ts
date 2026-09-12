import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { RebateCalculationMode, RebateRuleStatus, RebateRuleType } from '@prisma/client';

const ratePattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const trimValue = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateRebateRuleDto {
  @Transform(trimValue)
  @IsString({ message: '规则名称必须是文本' })
  @IsNotEmpty({ message: '规则名称不能为空' })
  @MaxLength(100, { message: '规则名称不能超过 100 个字符' })
  name!: string;

  @IsEnum(RebateRuleType, { message: '返点类型不受支持' })
  ruleType!: RebateRuleType;

  @IsEnum(RebateCalculationMode, { message: '返点计算方向不受支持' })
  calculationMode!: RebateCalculationMode;

  @Transform(({ value }) => value === undefined || value === null ? value : String(value).trim())
  @IsString({ message: '返点比例必须使用数字字符串' })
  @Matches(ratePattern, { message: '返点比例格式不正确，请输入百分比数字' })
  rate!: string;

  @IsDateString({}, { message: '生效时间格式不正确' })
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString({}, { message: '失效时间格式不正确' })
  effectiveTo?: string;

  @IsOptional()
  @IsEnum(RebateRuleStatus, { message: '规则状态不受支持' })
  status?: RebateRuleStatus;

  @Transform(trimValue)
  @IsOptional()
  @IsString({ message: '备注必须是文本' })
  @MaxLength(255, { message: '备注不能超过 255 个字符' })
  remark?: string;
}
