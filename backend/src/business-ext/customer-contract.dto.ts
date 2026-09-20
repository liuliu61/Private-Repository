import { IsString, IsOptional, IsUUID, IsDateString, IsDecimal, IsArray } from 'class-validator';

export class CreateCustomerContractDto {
  @IsUUID()
  customerId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  partyA?: string;

  @IsOptional()
  @IsString()
  partyB?: string;

  @IsOptional()
  @IsDateString()
  signDate?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  amount?: number;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsArray()
  attachments?: Array<{ fileName: string; fileUrl: string; fileSize?: number; fileType?: string }>;
}

export class UpdateCustomerContractDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  partyA?: string;

  @IsOptional()
  @IsString()
  partyB?: string;

  @IsOptional()
  @IsDateString()
  signDate?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  amount?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class ApproveContractDto {
  @IsOptional()
  @IsString()
  remark?: string;
}
