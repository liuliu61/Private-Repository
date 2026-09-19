const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function request(path: string, options: RequestInit = {}, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `请求失败 ${res.status}`);
  }
  return res.json();
}

export const paymentPostingApi = {
  list: (params: Record<string, any>, token: string) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/payment-posting/applies?${qs}`, {}, token);
  },
  getById: (id: string, token: string) =>
    request(`/payment-posting/applies/${id}`, {}, token),
  create: (data: any, token: string) =>
    request('/payment-posting/applies', { method: 'POST', body: JSON.stringify(data) }, token),
  update: (id: string, data: any, token: string) =>
    request(`/payment-posting/applies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  submit: (id: string, token: string) =>
    request(`/payment-posting/applies/${id}/submit`, { method: 'POST' }, token),
  approve: (id: string, data: any, token: string) =>
    request(`/payment-posting/applies/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }, token),
  reject: (id: string, data: any, token: string) =>
    request(`/payment-posting/applies/${id}/reject`, { method: 'POST', body: JSON.stringify(data) }, token),
  revoke: (id: string, token: string) =>
    request(`/payment-posting/applies/${id}/revoke`, { method: 'POST' }, token),
  pay: (id: string, data: any, token: string) =>
    request(`/payment-posting/applies/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }, token),
  complete: (id: string, data: any, token: string) =>
    request(`/payment-posting/applies/${id}/complete`, { method: 'POST', body: JSON.stringify(data) }, token),
  retryOa: (id: string, token: string) =>
    request(`/payment-posting/applies/${id}/retry-oa`, { method: 'POST' }, token),
  listOaRecords: (id: string, token: string) =>
    request(`/payment-posting/applies/${id}/oa-records`, {}, token),
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
