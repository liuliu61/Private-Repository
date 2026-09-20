import { IsString, IsOptional, IsUUID, IsBoolean, IsNumber, IsArray, IsDecimal } from 'class-validator';

// 打款账户
export class CreatePaymentAccountDto {
  @IsUUID()
  customerId: string;
  @IsString()
  accountName: string;
  @IsString()
  accountNumber: string;
  @IsString()
  bankName: string;
  @IsOptional()
  @IsBoolean()
  autoPost?: boolean;
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdatePaymentAccountDto {
  @IsOptional()
  @IsString()
  accountName?: string;
  @IsOptional()
  @IsString()
  accountNumber?: string;
  @IsOptional()
  @IsString()
  bankName?: string;
  @IsOptional()
  @IsBoolean()
  autoPost?: boolean;
  @IsOptional()
  @IsString()
  status?: string;
  @IsOptional()
  @IsString()
  remark?: string;
}

// 服务费配置
export class ServiceFeeConfigDto {
  @IsUUID()
  customerId: string;
  @IsOptional()
  rate?: number;
  @IsOptional()
  defaultAmount?: number;
  @IsOptional()
  @IsBoolean()
  needInvoice?: boolean;
  @IsOptional()
  @IsString()
  status?: string;
  @IsOptional()
  @IsString()
  remark?: string;
}

// 政策变更申请
export class CreatePolicyChangeRequestDto {
  @IsUUID()
  policyId: string;
  @IsUUID()
  customerId: string;
  @IsString()
  changeData: string;
  @IsOptional()
  @IsString()
  remark?: string;
}

export class ApprovePolicyChangeDto {
  @IsOptional()
  @IsString()
  remark?: string;
}

// 收款单退款
export class CreateReceiveRefundDto {
  @IsUUID()
  receiveRecordId: string;
  @IsUUID()
  customerId: string;
  amount: number;
  @IsOptional()
  @IsString()
  feeType?: string;
  @IsOptional()
  @IsString()
  reason?: string;
  @IsOptional()
  @IsBoolean()
  deductWallet?: boolean;
  @IsOptional()
  @IsString()
  remark?: string;
}

export class ApproveReceiveRefundDto {
  @IsOptional()
  @IsString()
  remark?: string;
}
