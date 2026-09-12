import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RebateRecordStatus, TransactionBusinessType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CashflowService } from '../cashflow/cashflow.service';
import { RebateAccessContext } from './rebate.types';
import { toMoneyString } from './utils/rebate-money.util';
import { AccessScopeService } from '../common/access-scope.service';

@Injectable()
export class RebateConfirmationService {
  constructor(private readonly prisma: PrismaService, private readonly cashflowService: CashflowService, private readonly accessScope?: AccessScopeService) {}

  async confirm(rebateId: string, accessContext: RebateAccessContext) {
    this.assertConfirmPermission(accessContext);

    return this.prisma.$transaction(async (tx) => {
      const records = await tx.$queryRaw<Array<{
        id: string;
        account_id: string | null;
        rebate_amount: Prisma.Decimal;
        status: RebateRecordStatus;
      }>>(Prisma.sql`SELECT "id", "account_id", "rebate_amount", "status" FROM "rebate_records" WHERE "id" = ${rebateId}::uuid FOR UPDATE`);
      const record = records[0];
      if (!record) throw new NotFoundException('返点记录不存在。');
      if (record.status === RebateRecordStatus.CONFIRMED) throw new BadRequestException('该返点记录已确认，不能重复操作。');
      if (record.status !== RebateRecordStatus.PENDING_CONFIRMATION) throw new BadRequestException('该返点记录当前状态不允许确认。');
      if (!record.account_id) throw new BadRequestException('返点记录未关联资金账户，无法确认。');
      if (this.accessScope) await this.accessScope.assertAccountAccess(record.account_id, accessContext);

      const transaction = await this.cashflowService.createTransactionInTransaction(tx, {
        accountId: record.account_id,
        businessType: TransactionBusinessType.REBATE,
        businessNo: `REBATE-${record.id}`,
        changeAmount: record.rebate_amount,
        operatorId: accessContext.sub,
        remark: `返点记录 ${record.id} 确认入账`,
      });
      const confirmedAt = new Date();
      await tx.rebateRecord.update({
        where: { id: record.id },
        data: { status: RebateRecordStatus.CONFIRMED, confirmedAt, confirmedBy: accessContext.sub },
      });

      return {
        rebateId: record.id,
        status: RebateRecordStatus.CONFIRMED,
        rebateAmount: toMoneyString(record.rebate_amount),
        transactionNo: transaction.transactionNo,
        accountId: record.account_id,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        confirmedAt,
        confirmedBy: accessContext.sub,
      };
    });
  }

  private assertConfirmPermission(accessContext: RebateAccessContext): void {
    const allowed = accessContext.roles.includes('SUPER_ADMIN') || accessContext.permissions.includes('FINANCE_REBATE_CONFIRM');
    if (!allowed) throw new ForbiddenException('当前用户没有返点确认入账权限。');
  }
}
