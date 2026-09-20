'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, Tabs } from 'antd';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

type Customer = { id: string; name: string; customerCode: string };
type AdSubject = { id: string; name: string; subjectId?: string };
type AdAccount = { id: string; name: string; accountId?: string; adSubjectId?: string };
type Policy = {
  id: string; policyId: string; customerId: string; version: number;
  subjectId: string | null; accountId: string | null; dimension: 'customer' | 'subject' | 'account';
  rebateType: 'FIXED_ADD' | 'PRIVATE_DIVIDE';
  calculationMode: 'CASH_TO_CREDIT' | 'CREDIT_TO_CASH';
  rate: string; effectiveFrom: string; effectiveTo: string | null;
  status: string; policyStatus: string; createdAt: string; createdBy: string | null; remark: string | null;
};

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || '请求失败');
  return data;
}

function formatType(type: Policy['rebateType']) { return type === 'FIXED_ADD' ? '固定返点' : '私反客户政策'; }
function formatMode(mode: Policy['calculationMode']) { return mode === 'CASH_TO_CREDIT' ? '人民币 → 账户币' : '账户币 → 人民币'; }
function formatTime(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN') : '长期有效'; }
function formatDimension(dim: Policy['dimension']) {
  if (dim === 'account') return <Tag color="purple">账户维度</Tag>;
  if (dim === 'subject') return <Tag color="blue">主体维度</Tag>;
  return <Tag color="green">客户维度</Tag>;
}

export default function RebatePolicyPanel({ token, customers: propCustomers, onError }: { token: string; customers: Customer[]; onError: (message: string) => void }) {
  const [customerId, setCustomerId] = useState<string>();
  const [dimension, setDimension] = useState<'customer' | 'subject' | 'account'>('customer');
  const [subjectId, setSubjectId] = useState<string>();
  const [accountId, setAccountId] = useState<string>();
  const [current, setCurrent] = useState<Policy | null>(null);
  const [history, setHistory] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(propCustomers);
  const [subjects, setSubjects] = useState<AdSubject[]>([]);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await request<{ items: Customer[] } | Customer[]>('/customers?page=1&pageSize=100', token);
        const list = Array.isArray(res) ? res : (res.items || []);
        setLocalCustomers(list);
      } catch { /* 加载失败时用 props 里的 */ }
    }
    void loadCustomers();
  }, [token]);

  const customers = localCustomers.length > 0 ? localCustomers : propCustomers;

  useEffect(() => { if (!customerId && customers[0]) setCustomerId(customers[0].id); }, [customerId, customers]);

  // 加载广告主体列表
  useEffect(() => {
    async function loadSubjects() {
      try {
        const res = await request<{ items: AdSubject[] } | AdSubject[]>('/ad-subjects?page=1&pageSize=200', token);
        const list = Array.isArray(res) ? res : (res.items || []);
        setSubjects(list);
      } catch { setSubjects([]); }
    }
    void loadSubjects();
  }, [token]);

  // 加载广告账户列表
  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await request<{ items: AdAccount[] } | AdAccount[]>('/ad-accounts?page=1&pageSize=200', token);
        const list = Array.isArray(res) ? res : (res.items || []);
        setAccounts(list);
      } catch { setAccounts([]); }
    }
    void loadAccounts();
  }, [token]);

  const filteredAccounts = useMemo(() => {
    if (!subjectId) return accounts;
    return accounts.filter((a) => a.adSubjectId === subjectId);
  }, [accounts, subjectId]);

  async function refresh(id = customerId) {
    if (!id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100', allDimensions: 'true' });
      const rows = await request<{ items: Policy[] }>(`/customers/${id}/rebate-policies?${params.toString()}`, token);
      setHistory(rows.items);
      // 当前政策按维度查询
      const currentParams = new URLSearchParams();
      if (dimension === 'subject' && subjectId) currentParams.set('subjectId', subjectId);
      if (dimension === 'account' && subjectId) currentParams.set('subjectId', subjectId);
      if (dimension === 'account' && accountId) currentParams.set('accountId', accountId);
      try { setCurrent(await request<Policy>(`/customers/${id}/rebate-policy?${currentParams.toString()}`, token)); } catch { setCurrent(null); }
    } catch (error) { onError(error instanceof Error ? error.message : '返点政策查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [customerId, dimension, subjectId, accountId]);

  const selectedCustomer = useMemo(() => customers.find((item) => item.id === customerId), [customers, customerId]);
  const selectedSubject = useMemo(() => subjects.find((s) => s.id === subjectId), [subjects, subjectId]);
  const selectedAccount = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);

  async function createPolicy(values: {
    rebateType: Policy['rebateType']; calculationMode: Policy['calculationMode'];
    rate: string; effectiveFrom: string; effectiveTo?: string; remark?: string;
  }) {
    if (!customerId) return;
    try {
      const body: Record<string, unknown> = {
        ...values,
        rate: values.rate.trim(),
        effectiveFrom: new Date(values.effectiveFrom).toISOString(),
        effectiveTo: values.effectiveTo ? new Date(values.effectiveTo).toISOString() : undefined,
      };
      if (dimension === 'subject' && subjectId) body.subjectId = subjectId;
      if (dimension === 'account') {
        if (subjectId) body.subjectId = subjectId;
        if (accountId) body.accountId = accountId;
      }
      await request(`/customers/${customerId}/rebate-policies`, token, { method: 'POST', body: JSON.stringify(body) });
      setModalOpen(false); form.resetFields(); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '返点政策保存失败'); }
  }

  async function disablePolicy(policyId: string) {
    if (!customerId) return;
    try { await request(`/customers/${customerId}/rebate-policies/${policyId}/disable`, token, { method: 'POST' }); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '返点政策停用失败'); }
  }

  const dimensionLabel = dimension === 'account' ? '账户维度' : dimension === 'subject' ? '主体维度' : '客户维度';

  return <Card title="客户返点政策（三维度）" extra={<Button type="primary" disabled={!customerId || (dimension === 'subject' && !subjectId) || (dimension === 'account' && (!subjectId || !accountId))} onClick={() => setModalOpen(true)}>新增{dimensionLabel}政策</Button>} loading={loading}>
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space wrap>
        <Select style={{ width: 240 }} placeholder="请选择客户" value={customerId} onChange={setCustomerId} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} />
        <Select style={{ width: 140 }} value={dimension} onChange={(v) => { setDimension(v); setSubjectId(undefined); setAccountId(undefined); }} options={[{ value: 'customer', label: '客户维度' }, { value: 'subject', label: '主体维度' }, { value: 'account', label: '账户维度' }]} />
        {dimension !== 'customer' && <Select style={{ width: 220 }} placeholder="请选择广告主体" value={subjectId} onChange={(v) => { setSubjectId(v); setAccountId(undefined); }} allowClear options={subjects.map((s) => ({ value: s.id, label: s.name }))} />}
        {dimension === 'account' && <Select style={{ width: 220 }} placeholder="请选择广告账户" value={accountId} onChange={setAccountId} allowClear options={filteredAccounts.map((a) => ({ value: a.id, label: a.name }))} />}
      </Space>

      {!selectedCustomer && <Alert type="info" message="暂无可访问客户" />}

      {selectedCustomer && <Card size="small" title={`当前有效政策：${selectedCustomer.name}${selectedSubject ? ` / ${selectedSubject.name}` : ''}${selectedAccount ? ` / ${selectedAccount.name}` : ''}`}>
        {current ? <Space direction="vertical">
          {formatDimension(current.dimension)}
          <Typography.Text>返点类型：{formatType(current.rebateType)}</Typography.Text>
          <Typography.Text>计算方向：{formatMode(current.calculationMode)}</Typography.Text>
          <Typography.Text>返点比例：{current.rate}%</Typography.Text>
          <Typography.Text>有效期：{formatTime(current.effectiveFrom)} 至 {formatTime(current.effectiveTo)}</Typography.Text>
          <Tag color={current.policyStatus === 'ACTIVE' ? 'green' : 'default'}>{current.policyStatus === 'ACTIVE' ? '启用' : '停用'}</Tag>
        </Space> : <Alert type="warning" message={`该${dimensionLabel}当前没有有效返点政策`} />}
      </Card>}

      <Table rowKey="id" dataSource={history} pagination={false} columns={[
        { title: '维度', dataIndex: 'dimension', render: formatDimension, width: 100 },
        { title: '版本', dataIndex: 'version', width: 60 },
        { title: '返点类型', dataIndex: 'rebateType', render: formatType },
        { title: '计算方向', dataIndex: 'calculationMode', render: formatMode },
        { title: '返点比例', dataIndex: 'rate', render: (value: string) => `${value}%` },
        { title: '生效时间', dataIndex: 'effectiveFrom', render: formatTime },
        { title: '失效时间', dataIndex: 'effectiveTo', render: formatTime },
        { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value === 'ACTIVE' ? '有效' : '已停用'}</Tag> },
        { title: '操作', key: 'action', render: (_: unknown, row: Policy) => row.policyStatus === 'ACTIVE' ? <Button danger type="link" onClick={() => void disablePolicy(row.policyId)}>停用</Button> : null },
      ]} />
    </Space>

    <Modal title={`新增${dimensionLabel}返点政策版本`} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消" width={600}>
      <Alert type="info" message={`客户：${selectedCustomer?.name || ''}${selectedSubject ? ` / 主体：${selectedSubject.name}` : ''}${selectedAccount ? ` / 账户：${selectedAccount.name}` : ''}`} style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical" onFinish={createPolicy} initialValues={{ rebateType: 'FIXED_ADD', calculationMode: 'CASH_TO_CREDIT' }}>
        <Form.Item name="rebateType" label="返点类型" rules={[{ required: true, message: '请选择返点类型' }]}><Select options={[{ value: 'FIXED_ADD', label: '固定返点（常规/对公）' }, { value: 'PRIVATE_DIVIDE', label: '私反客户政策（激励/对私）' }]} /></Form.Item>
        <Form.Item name="calculationMode" label="计算方向" rules={[{ required: true, message: '请选择计算方向' }]}><Select options={[{ value: 'CASH_TO_CREDIT', label: '人民币 → 账户币（币=现金×(1+返点)）' }, { value: 'CREDIT_TO_CASH', label: '账户币 → 人民币（现金=币/(1+返点)）' }]} /></Form.Item>
        <Form.Item name="rate" label="返点比例（%）" rules={[{ required: true, message: '请输入返点比例' }, { pattern: /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, message: '请输入大于 -100 且小于 100 的比例' }]}><Input placeholder="例如 10、6.5 或 -5（代运营服务费扣除用负数）" /></Form.Item>
        <Form.Item name="effectiveFrom" label="生效时间" rules={[{ required: true, message: '请选择生效时间' }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="effectiveTo" label="失效时间"><Input type="datetime-local" /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} showCount /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}
