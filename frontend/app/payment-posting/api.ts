import { apiRequest } from '../utils/api';

export const paymentPostingApi = {
  list: (params: Record<string, any>, token: string) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/payment-posting/applies?${qs}`, token, {});
  },
  getById: (id: string, token: string) =>
    apiRequest(`/payment-posting/applies/${id}`, token, {}),
  create: (data: any, token: string) =>
    apiRequest('/payment-posting/applies', token, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any, token: string) =>
    apiRequest(`/payment-posting/applies/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) }),
  submit: (id: string, token: string) =>
    apiRequest(`/payment-posting/applies/${id}/submit`, token, { method: 'POST' }),
  approve: (id: string, data: any, token: string) =>
    apiRequest(`/payment-posting/applies/${id}/approve`, token, { method: 'POST', body: JSON.stringify(data) }),
  reject: (id: string, data: any, token: string) =>
    apiRequest(`/payment-posting/applies/${id}/reject`, token, { method: 'POST', body: JSON.stringify(data) }),
  revoke: (id: string, token: string) =>
    apiRequest(`/payment-posting/applies/${id}/revoke`, token, { method: 'POST' }),
  pay: (id: string, data: any, token: string) =>
    apiRequest(`/payment-posting/applies/${id}/pay`, token, { method: 'POST', body: JSON.stringify(data) }),
  complete: (id: string, data: any, token: string) =>
    apiRequest(`/payment-posting/applies/${id}/complete`, token, { method: 'POST', body: JSON.stringify(data) }),
  retryOa: (id: string, token: string) =>
    apiRequest(`/payment-posting/applies/${id}/retry-oa`, token, { method: 'POST' }),
  listOaRecords: (id: string, token: string) =>
    apiRequest(`/payment-posting/applies/${id}/oa-records`, token, {}),
};

export const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  REVIEWING: { label: '审核中', color: 'processing' },
  APPROVED: { label: '审核通过', color: 'success' },
  REJECTED: { label: '审核不通过', color: 'error' },
  REVOKED: { label: '已撤销', color: 'warning' },
  PAID: { label: '已付款', color: 'cyan' },
  COMPLETED: { label: '已完成', color: 'green' },
};

export const OA_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待发起', color: 'default' },
  PROCESSING: { label: '审批中', color: 'processing' },
  APPROVED: { label: '审批通过', color: 'success' },
  REJECTED: { label: '审批驳回', color: 'error' },
  FAILED: { label: '发起失败', color: 'error' },
  RETRYING: { label: '重试中', color: 'warning' },
};

export const EXPENSE_TYPE_MAP: Record<string, string> = {
  AD_RECHARGE: '广告充值',
  SERVICE_FEE: '服务费',
  REFUND: '退款',
  OTHER: '其他',
};
