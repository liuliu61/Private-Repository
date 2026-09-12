import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RebateRecordStatus, RebateRuleStatus, RebateRuleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeCalculationMode, RebateCalculator } from './rebate.calculator';
import { RebateAccessContext } from './rebate.types';
import { CalculateRebateDto } from './dto/calculate-rebate.dto';
import { CreateRebateRuleDto } from './dto/create-rebate-rule.dto';
import { toDecimal, toMoneyString, toRateString } from './utils/rebate-money.util';
import { AccessScopeService } from '../common/access-scope.service';

@Injectable()
export class RebateService {
  constructor(private readonly prisma: PrismaService, private readonly calculator: RebateCalculator, private readonly accessScope?: AccessScopeService) {}

  async getRules(accessContext: RebateAccessContext) {
    this.assertReadable(accessContext);
    const rules = await this.prisma.rebateRule.findMany({ orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] });
    return rules.map((rule) => this.toRuleView(rule));
  }

  async createRule(dto: CreateRebateRuleDto, accessContext: RebateAccessContext) {
    this.assertWritable(accessContext);
    const rate = toDecimal(dto.rate, '返点比例');
    this.validateRate(rate);
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom) throw new BadRequestException('失效时间不能早于生效时间');
    const rule = await this.prisma.rebateRule.create({ data: { name: dto.name, ruleType: dto.ruleType, calculationMode: dto.calculationMode, rate, effectiveFrom, effectiveTo, status: dto.status ?? RebateRuleStatus.ACTIVE, remark: dto.remark || null } });
    return this.toRuleView(rule);
  }

  async calculate(dto: CalculateRebateDto, accessContext: RebateAccessContext) {
    this.assertWritable(accessContext);
    const rule = dto.ruleId ? await this.prisma.rebateRule.findUnique({ where: { id: dto.ruleId } }) : null;
    if (dto.ruleId && !rule) throw new NotFoundException('返点规则不存在');
    if (rule) {
      if (rule.status !== RebateRuleStatus.ACTIVE) throw new BadRequestException('返点规则未启用');
      const today = new Date();
      if (rule.effectiveFrom > today || (rule.effectiveTo && rule.effectiveTo < today)) throw new BadRequestException('返点规则当前不在生效期内');
    }
    if (dto.customerId && !dto.ruleId) throw new BadRequestException('保存返点记录必须关联返点规则，请提供 ruleId');
    if (dto.customerId && !dto.accountId) throw new BadRequestException('保存返点记录必须关联资金账户，请提供 accountId');
    const customer = dto.customerId ? await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, status: true } }) : null;
    if (dto.customerId && !customer) throw new NotFoundException('客户不存在');
    if (customer && customer.status !== 'ACTIVE') throw new BadRequestException('客户已停用，不能进行返点计算');
    if (dto.customerId) {
      const customerScope = await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { agentId: true } });
      if (customerScope?.agentId && this.accessScope) await this.accessScope.assertOrganizationAccess(customerScope.agentId, accessContext);
    }
    const account = dto.accountId ? await this.prisma.account.findUnique({ where: { id: dto.accountId }, select: { id: true, status: true } }) : null;
    if (dto.accountId && !account) throw new NotFoundException('资金账户不存在');
    if (account && account.status !== 'ACTIVE') throw new BadRequestException('资金账户已停用，不能关联返点记录');
    if (dto.accountId && this.accessScope) await this.accessScope.assertAccountAccess(dto.accountId, accessContext);
    const sourceAmount = toDecimal(dto.amount, '计算金额');
    const rate = rule?.rate ?? toDecimal(dto.rate!, '返点比例');
    const type = rule?.ruleType ?? dto.type!;
    const result = this.calculator.calculate({ amount: sourceAmount, rate, type, calculationMode: rule?.calculationMode ?? dto.calculationMode });
    if (customer && rule && account) await this.prisma.rebateRecord.create({
      data: {
        customerId: customer.id,
        rebateRuleId: rule.id,
        accountId: account.id,
        sourceAmount,
        rebateRate: rate,
        paymentAmount: result.paymentAmount,
        rebateAmount: result.rebateAmount,
        creditAmount: result.creditAmount,
        calculationMode: result.calculationMode,
        status: RebateRecordStatus.PENDING_CONFIRMATION,
        createdBy: accessContext.sub,
      },
    });

    return {
      cashAmount: toMoneyString(result.cashAmount),
      paymentAmount: toMoneyString(result.paymentAmount),
      rebateAmount: toMoneyString(result.rebateAmount),
      creditAmount: toMoneyString(result.creditAmount),
      calculationMode: result.calculationMode,
    };
  }

  private assertReadable(accessContext: RebateAccessContext): void {
    if (!accessContext.roles.includes('SUPER_ADMIN') && !accessContext.permissions.includes('SYSTEM_ACCESS')) throw new ForbiddenException('当前用户没有查看返点的权限');
  }

  private assertWritable(accessContext: RebateAccessContext): void {
    if (!accessContext.roles.includes('SUPER_ADMIN') && !accessContext.permissions.includes('SYSTEM_ACCESS')) throw new ForbiddenException('当前用户没有操作返点的权限');
  }

  private validateRate(rate: Prisma.Decimal): void {
    if (rate.lte(-100) || rate.gte(100)) throw new BadRequestException('返点比例必须大于 -100% 且小于 100%');
  }

  private toRuleView(rule: { id: string; name: string; version?: number; ruleType: RebateRuleType; calculationMode?: import('@prisma/client').RebateCalculationMode | null; rate: Prisma.Decimal; effectiveFrom: Date; effectiveTo: Date | null; status: RebateRuleStatus; remark: string | null; createdAt: Date; updatedAt: Date }) {
    return { id: rule.id, name: rule.name, version: rule.version ?? 1, ruleType: rule.ruleType, calculationMode: rule.calculationMode ?? normalizeCalculationMode(rule.ruleType), rate: toRateString(rule.rate), effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo, status: rule.status, remark: rule.remark, createdAt: rule.createdAt, updatedAt: rule.updatedAt };
  }
}
