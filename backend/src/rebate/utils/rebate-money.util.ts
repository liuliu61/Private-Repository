import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DecimalInput } from '../rebate.types';

export function toDecimal(value: DecimalInput, fieldName: string): Prisma.Decimal {
  try {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite()) throw new Error('非有限数值');
    return decimal;
  } catch {
    throw new BadRequestException(`${fieldName}格式不正确，请输入数字`);
  }
}

export function toMoneyString(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

export function toRateString(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
}
