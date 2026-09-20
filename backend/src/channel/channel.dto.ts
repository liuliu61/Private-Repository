import { IsString, IsNotEmpty, MaxLength, IsOptional, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateChannelDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(50) code?: string;
  @IsOptional() @IsString() @MaxLength(50) platform?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultCostRebatePublic?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultCostRebatePrivate?: number;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class UpdateChannelDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(50) code?: string;
  @IsOptional() @IsString() @MaxLength(50) platform?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultCostRebatePublic?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultCostRebatePrivate?: number;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class ChannelQueryDto {
  @IsOptional() @Type(() => Number) page?: number = 1;
  @IsOptional() @Type(() => Number) pageSize?: number = 50;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() keyword?: string;
}
