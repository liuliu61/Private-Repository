import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { MoneyInput } from '../cashflow.types';

export function toMoney(value: MoneyInput, fieldName = '金额'): Prisma.Decimal {
  try {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite()) throw new Error('金额必须是有限数值');
    return decimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  } catch {
    throw new BadRequestException(`${fieldName}格式不正确，必须使用字符串金额，例如 100.00`);
  }
}

export function moneyToString(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}
