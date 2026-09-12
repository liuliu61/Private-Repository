export type ContractCheckResult =
  | { status: 'VALID' }
  | { status: 'NOT_FOUND'; payer: string; payee: string }
  | { status: 'NOT_VERIFIED'; reason: string };

export abstract class RechargePaymentContractChecker {
  abstract checkValidContract(payer: string | null, payee: string | null): Promise<ContractCheckResult>;
}

export class UnavailableRechargePaymentContractChecker extends RechargePaymentContractChecker {
  async checkValidContract(): Promise<ContractCheckResult> {
    return { status: 'NOT_VERIFIED', reason: '合同主数据来源暂不可用' };
  }
}
