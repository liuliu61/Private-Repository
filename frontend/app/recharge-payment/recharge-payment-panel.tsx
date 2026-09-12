'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
type Customer = { id: string; name: string; customerCode: string };
type Receive = { id: string; receiveNo: string; amount: string; status: string; receivedAt: string };
type Application = { id: string; applicationNo: string; amount: string; status: string; appliedAt: string; remark?: string; rejectReason?: string; customer?: Customer; receiveRecord?: Receive; applicant?: { displayName: string }; reviewer?: { displayName: string } };

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
  return data;
}

const statuses: Record<string, string> = { DRAFT: '草稿', PENDING_REVIEW: '审核中', APPROVED: '已通过', REJECTED: '已退回', CANCELLED: '已取消' };
const tabs = [{ key: 'ALL', label: '全部' }, ...Object.entries(statuses).map(([key, label]) => ({ key, label })), { key: 'MINE', label: '我的申请' }];

export default function RechargePaymentPanel({ token, customers, onError, initialReceiveId }: { token: string; customers: Customer[]; onError: (message: string) => void; initialReceiveId?: string }) {
  const [tab, setTab] = useState('ALL');
  const [items, setItems] = useState<Application[]>([]);
  const [receives, setReceives] = useState<Receive[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Application | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  async function refresh(nextPage = page, nextFilters = filters, nextTab = tab) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: '10' });
      if (nextTab !== 'ALL' && nextTab !== 'MINE') params.set('status', nextTab);
      if (nextTab === 'MINE') params.set('mine', 'true');
      Object.entries(nextFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const result = await request<{ items: Application[]; total: number }>(`/recharge-payment-applications?${params.toString()}`, token);
      setItems(result.items); setTotal(result.total); setPage(nextPage);
    } catch (error) { onError(error instanceof Error ? error.message : '充值付款申请查询失败'); }
    finally { setLoading(false); }
  }

  async function loadReceives() {
    try { const result = await request<{ items: Receive[] }>('/receive-records?page=1&pageSize=100', token); setReceives(result.items); }
    catch (error) { onError(error instanceof Error ? error.message : '收款记录查询失败'); }
  }

  useEffect(() => { void refresh(1); void loadReceives(); }, [token]);
  useEffect(() => { if (initialReceiveId) { createForm.setFieldValue('receiveRecordId', initialReceiveId); setCreateOpen(true); } }, [initialReceiveId]);

  async function create(values: { receiveRecordId: string; amount: string; remark?: string }) {
    try { await request('/recharge-payment-applications', token, { method: 'POST', body: JSON.stringify({ ...values, clientRequestId: `web-${crypto.randomUUID()}` }) }); setCreateOpen(false); createForm.resetFields(); await refresh(1); }
    catch (error) { onError(error instanceof Error ? error.message : '创建申请失败'); }
  }
  async function action(id: string, actionName: string, body?: unknown) {
    try { await request(`/recharge-payment-applications/${id}/${actionName}`, token, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '操作失败'); }
  }
  async function update(id: string, values: { amount: string; remark?: string }) { try { await request(`/recharge-payment-applications/${id}`, token, { method: 'POST', body: JSON.stringify(values) }); await refresh(); } catch (error) { onError(error instanceof Error ? error.message : '修改申请失败'); } }
  async function showDetail(id: string) { try { setDetail(await request<Application>(`/recharge-payment-applications/${id}`, token)); setDetailOpen(true); } catch (error) { onError(error instanceof Error ? error.message : '详情查询失败'); } }

  return <Card title="充值付款流程" extra={<Button type="primary" onClick={() => { createForm.resetFields(); setCreateOpen(true); }}>新建申请</Button>}>
    <Form form={filterForm} layout="inline" onFinish={(values) => { const next = Object.fromEntries(Object.entries(values).filter(([, value]) => Boolean(value))) as Record<string, string>; setFilters(next); void refresh(1, next); }} style={{ marginBottom: 16 }}>
      <Form.Item name="applicationNo"><Input placeholder="申请单号" /></Form.Item>
      <Form.Item name="customerId"><Select allowClear showSearch optionFilterProp="label" placeholder="客户" style={{ width: 190 }} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item>
      <Form.Item name="applicantId"><Input placeholder="申请人ID" /></Form.Item>
      <Form.Item name="startDate"><Input type="date" /></Form.Item><Form.Item name="endDate"><Input type="date" /></Form.Item>
      <Button htmlType="submit" type="primary">查询</Button><Button onClick={() => { filterForm.resetFields(); setFilters({}); void refresh(1, {}); }}>重置</Button>
    </Form>
    <Tabs activeKey={tab} items={tabs} onChange={(key) => { setTab(key); void refresh(1, filters, key); }} />
    <Table rowKey="id" loading={loading} dataSource={items} pagination={{ current: page, pageSize: 10, total, showSizeChanger: false, showTotal: (value, range) => `第 ${range[0]}-${range[1]} 条 / 总共 ${value} 条`, onChange: (nextPage) => void refresh(nextPage) }} columns={[
      { title: '申请单号', dataIndex: 'applicationNo' }, { title: '来源收款', render: (_: unknown, row: Application) => row.receiveRecord?.receiveNo || '-' }, { title: '客户', render: (_: unknown, row: Application) => row.customer?.name || '-' }, { title: '申请金额', dataIndex: 'amount' }, { title: '申请人', render: (_: unknown, row: Application) => row.applicant?.displayName || '-' }, { title: '申请时间', dataIndex: 'appliedAt', render: (value: string) => new Date(value).toLocaleString('zh-CN') }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{statuses[value] || value}</Tag> },
      { title: '操作', render: (_: unknown, row: Application) => <Space><Button type="link" onClick={() => void showDetail(row.id)}>详情</Button>{row.status === 'DRAFT' && <><Button type="link" onClick={() => { setEditing(row); editForm.setFieldsValue({ amount: row.amount, remark: row.remark }); setEditOpen(true); }}>修改</Button><Button type="link" onClick={() => { Modal.confirm({ title: '提交审核', content: '提交后将不能直接修改申请金额。', onOk: () => action(row.id, 'submit') }); }}>提交审核</Button><Button type="link" onClick={() => action(row.id, 'cancel')}>取消</Button></>}{row.status === 'PENDING_REVIEW' && <><Button type="link" onClick={() => action(row.id, 'approve')}>通过</Button><Button type="link" onClick={() => { const reason = window.prompt('请输入退回原因'); if (reason) void action(row.id, 'reject', { rejectReason: reason }); }}>退回</Button></>}</Space> },
    ]} />
    <Modal title="新建充值付款申请" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} okText="保存草稿" cancelText="取消"><Form form={createForm} layout="vertical" onFinish={create}><Form.Item name="receiveRecordId" label="来源收款记录" rules={[{ required: true, message: '请选择收款记录' }]}><Select showSearch optionFilterProp="label" options={receives.map((item) => ({ value: item.id, label: `${item.receiveNo} / ${item.amount}` }))} /></Form.Item><Form.Item name="amount" label="申请金额" rules={[{ required: true, message: '请输入申请金额' }]}><Input placeholder="Decimal金额" /></Form.Item><Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item></Form></Modal>
    <Modal title="修改草稿申请" open={editOpen} onCancel={() => { setEditOpen(false); setEditing(null); }} onOk={() => editForm.submit()} okText="保存" cancelText="取消"><Form form={editForm} layout="vertical" onFinish={(values) => { if (editing) { void update(editing.id, values); setEditOpen(false); setEditing(null); } }}><Form.Item name="amount" label="申请金额" rules={[{ required: true, message: '请输入申请金额' }]}><Input /></Form.Item><Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item></Form></Modal>
    <Modal title="充值付款申请详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null}>{detail && <Descriptions bordered column={1}><Descriptions.Item label="申请单号">{detail.applicationNo}</Descriptions.Item><Descriptions.Item label="来源收款">{detail.receiveRecord?.receiveNo || '-'}</Descriptions.Item><Descriptions.Item label="客户">{detail.customer?.name || '-'}</Descriptions.Item><Descriptions.Item label="申请金额">{detail.amount}</Descriptions.Item><Descriptions.Item label="状态">{statuses[detail.status] || detail.status}</Descriptions.Item><Descriptions.Item label="申请人">{detail.applicant?.displayName || '-'}</Descriptions.Item><Descriptions.Item label="审核人">{detail.reviewer?.displayName || '-'}</Descriptions.Item><Descriptions.Item label="退回原因">{detail.rejectReason || '-'}</Descriptions.Item><Descriptions.Item label="备注">{detail.remark || '-'}</Descriptions.Item></Descriptions>}</Modal>
  </Card>;
}
