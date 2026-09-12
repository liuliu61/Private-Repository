'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

type Customer = { id: string; name: string; customerCode: string };
type Policy = { id: string; policyId: string; customerId: string; version: number; rebateType: 'FIXED_ADD' | 'PRIVATE_DIVIDE'; calculationMode: 'CASH_TO_CREDIT' | 'CREDIT_TO_CASH'; rate: string; effectiveFrom: string; effectiveTo: string | null; status: string; policyStatus: string; createdAt: string; createdBy: string | null; remark: string | null };

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || '请求失败');
  return data;
}

function formatType(type: Policy['rebateType']) { return type === 'FIXED_ADD' ? '固定返点' : '私反客户政策'; }
function formatMode(mode: Policy['calculationMode']) { return mode === 'CASH_TO_CREDIT' ? '人民币 → 账户币' : '账户币 → 人民币'; }
function formatTime(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN') : '长期有效'; }

export default function RebatePolicyPanel({ token, customers, onError }: { token: string; customers: Customer[]; onError: (message: string) => void }) {
  const [customerId, setCustomerId] = useState<string>();
  const [current, setCurrent] = useState<Policy | null>(null);
  const [history, setHistory] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { if (!customerId && customers[0]) setCustomerId(customers[0].id); }, [customerId, customers]);

  async function refresh(id = customerId) {
    if (!id) return;
    setLoading(true);
    try {
      const rows = await request<{ items: Policy[] }>(`/customers/${id}/rebate-policies?page=1&pageSize=100`, token);
      setHistory(rows.items);
      try { setCurrent(await request<Policy>(`/customers/${id}/rebate-policy`, token)); } catch { setCurrent(null); }
    } catch (error) { onError(error instanceof Error ? error.message : '返点政策查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [customerId]);

  const selectedCustomer = useMemo(() => customers.find((item) => item.id === customerId), [customers, customerId]);

  async function createPolicy(values: { rebateType: Policy['rebateType']; calculationMode: Policy['calculationMode']; rate: string; effectiveFrom: string; effectiveTo?: string; remark?: string }) {
    if (!customerId) return;
    try {
      await request(`/customers/${customerId}/rebate-policies`, token, { method: 'POST', body: JSON.stringify({ ...values, rate: values.rate.trim(), effectiveFrom: new Date(values.effectiveFrom).toISOString(), effectiveTo: values.effectiveTo ? new Date(values.effectiveTo).toISOString() : undefined }) });
      setModalOpen(false); form.resetFields(); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '返点政策保存失败'); }
  }

  async function disablePolicy(policyId: string) {
    if (!customerId) return;
    try { await request(`/customers/${customerId}/rebate-policies/${policyId}/disable`, token, { method: 'POST' }); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '返点政策停用失败'); }
  }

  return <Card title="客户返点政策" extra={<Button type="primary" disabled={!customerId} onClick={() => setModalOpen(true)}>新增政策版本</Button>} loading={loading}>
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Select style={{ width: 320 }} placeholder="请选择客户" value={customerId} onChange={setCustomerId} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} />
      {!selectedCustomer && <Alert type="info" message="暂无可访问客户" />}
      {selectedCustomer && <Card size="small" title={`当前政策：${selectedCustomer.name}`}>
        {current ? <Space direction="vertical"><Typography.Text>返点类型：{formatType(current.rebateType)}</Typography.Text><Typography.Text>计算方向：{formatMode(current.calculationMode)}</Typography.Text><Typography.Text>返点比例：{current.rate}%</Typography.Text><Typography.Text>有效期：{formatTime(current.effectiveFrom)} 至 {formatTime(current.effectiveTo)}</Typography.Text><Tag color={current.policyStatus === 'ACTIVE' ? 'green' : 'default'}>{current.policyStatus === 'ACTIVE' ? '启用' : '停用'}</Tag></Space> : <Alert type="warning" message="该客户当前没有有效返点政策" />}
      </Card>}
      <Table rowKey="id" dataSource={history} pagination={false} columns={[{ title: '版本', dataIndex: 'version' }, { title: '返点类型', dataIndex: 'rebateType', render: formatType }, { title: '计算方向', dataIndex: 'calculationMode', render: formatMode }, { title: '返点比例', dataIndex: 'rate', render: (value: string) => `${value}%` }, { title: '生效时间', dataIndex: 'effectiveFrom', render: formatTime }, { title: '失效时间', dataIndex: 'effectiveTo', render: formatTime }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value === 'ACTIVE' ? '有效' : '已停用'}</Tag> }, { title: '操作人', dataIndex: 'createdBy', render: (value: string | null) => value || '历史数据' }, { title: '操作', key: 'action', render: (_: unknown, row: Policy) => row.policyStatus === 'ACTIVE' ? <Button danger type="link" onClick={() => void disablePolicy(row.policyId)}>停用</Button> : null }]} />
    </Space>
    <Modal title="新增客户返点政策版本" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消">
      <Form form={form} layout="vertical" onFinish={createPolicy} initialValues={{ rebateType: 'FIXED_ADD', calculationMode: 'CASH_TO_CREDIT' }}>
        <Form.Item name="rebateType" label="返点类型" rules={[{ required: true, message: '请选择返点类型' }]}><Select options={[{ value: 'FIXED_ADD', label: '固定返点' }, { value: 'PRIVATE_DIVIDE', label: '私反客户政策' }]} /></Form.Item>
        <Form.Item name="calculationMode" label="计算方向" rules={[{ required: true, message: '请选择计算方向' }]}><Select options={[{ value: 'CASH_TO_CREDIT', label: '人民币 → 账户币' }, { value: 'CREDIT_TO_CASH', label: '账户币 → 人民币' }]} /></Form.Item>
        <Form.Item name="rate" label="返点比例（%）" rules={[{ required: true, message: '请输入返点比例' }, { pattern: /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, message: '请输入大于 -100 且小于 100 的比例' }]}><Input placeholder="例如 10、6.5 或 -5" /></Form.Item>
        <Form.Item name="effectiveFrom" label="生效时间" rules={[{ required: true, message: '请选择生效时间' }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="effectiveTo" label="失效时间"><Input type="datetime-local" /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} showCount /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}
