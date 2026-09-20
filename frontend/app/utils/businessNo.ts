/**
 * 业务单号生成工具
 * 格式：前缀 + 日期时间 + 3位随机数
 * 例如：WALLET-20260919153045-ABC
 */

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function getDateTimeStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getRandomStr(len = 3): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成业务单号
 * @param prefix 业务前缀，如 WALLET、PO-PAY、PO-CR
 * @returns 业务单号，如 WALLET-20260919153045-ABC
 */
export function generateBusinessNo(prefix: string): string {
  return `${prefix}-${getDateTimeStr()}-${getRandomStr()}`;
}

/** 钱包调整业务单号 */
export function generateWalletAdjustNo(): string {
  return generateBusinessNo('WALLET-ADJ');
}

/** 钱包期初余额业务单号 */
export function generateWalletOpeningNo(): string {
  return generateBusinessNo('WALLET-OPEN');
}

/** 外采订单付款业务单号 */
export function generatePurchaseOrderPayNo(): string {
  return generateBusinessNo('PO-PAY');
}

/** 外采订单充值业务单号 */
export function generatePurchaseOrderCreditNo(): string {
  return generateBusinessNo('PO-CR');
}

/** 财务调整业务单号 */
export function generateFinancialAdjustNo(): string {
  return generateBusinessNo('FIN-ADJ');
}

/** 通用业务单号 */
export function generateCommonBusinessNo(): string {
  return generateBusinessNo('BN');
}
