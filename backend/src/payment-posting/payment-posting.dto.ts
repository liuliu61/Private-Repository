import { IsString, IsNumber, IsOptional, IsArray, IsEnum, IsUUID, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class ListPaymentPostingQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  applyNo?: string;

  @IsOptional()
  @IsString()
  oaFlowNo?: string;
}

export class PaymentPostingDetailDto {
  @IsOptional()
  @IsString()
  expenseTypeId?: string;

  @IsOptional()
  @IsEnum(['AD_RECHARGE', 'SERVICE_FEE', 'REFUND', 'OTHER'])
  expenseType?: 'AD_RECHARGE' | 'SERVICE_FEE' | 'REFUND' | 'OTHER' = 'AD_RECHARGE';

  @IsNumber()
  @Min(0.01)
  applyAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceFeeAmount?: number = 0;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreatePaymentPostingApplyDto {
  @IsUUID()
  customerId: string;

  @IsOptional()
  @IsString()
  applyType?: string = 'RECHARGE';

  @IsArray()
  @Type(() => PaymentPostingDetailDto)
  details: PaymentPostingDetailDto[];

  @IsArray()
  @IsUUID('4', { each: true })
  paymentRecordIds: string[];

  @IsOptional()
  @IsUUID()
  payerAccountId?: string;

  @IsOptional()
  @IsUUID()
  payeeAccountId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  contractNo?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

export class UpdatePaymentPostingApplyDto {
  @IsOptional()
  @IsArray()
  @Type(() => PaymentPostingDetailDto)
  details?: PaymentPostingDetailDto[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  paymentRecordIds?: string[];

  @IsOptional()
  @IsUUID()
  payerAccountId?: string;

  @IsOptional()
  @IsUUID()
  payeeAccountId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

export class PaymentPostingReviewDto {
  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  rejectReason?: string;
}

export class PaymentPostingPayDto {
  @IsOptional()
  @IsUUID()
  payerAccountId?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class PaymentPostingCompleteDto {
  @IsOptional()
  @IsString()
  remark?: string;
}

export class PaymentPostingOaRetryDto {
  @IsOptional()
  @IsString()
  remark?: string;
}
