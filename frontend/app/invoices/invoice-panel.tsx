'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Modal, Select, Space, Statistic, Table, Tag } from 'antd';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
type Customer = { id: string; name: string; customerCode: string };
type Invoice = { id: string; invoiceNo: string; invoiceNumber?: string; amount: string; status: string; redFlushStatus?: string; customer?: { name: string; customerCode: string }; purchaseOrder?: { orderNo: string }; receiveRecord?: { receiveNo: string }; businessNo?: string; invoiceDate?: string; createdAt: string; remark?: string };
type Balance = { sourceAmount: string; invoicedAmount: string; uninvoicedAmount: string };

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
  return data;
}

const statusName: Record<string, string> = { DRAFT: '草稿', PROCESSING: '开票中', ISSUED: '已开票', VOIDED: '已作废' };

export default function InvoicePanel({ token, customers, onError }: { token: string; customers: Customer[]; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<{ sourceAmount: string; invoicedAmount: string; uninvoicedAmount: string; processingAmount: string; issuedAmount: string }>({ sourceAmount: '0.00', invoicedAmount: '0.00', uninvoicedAmount: '0.00', processingAmount: '0.00', issuedAmount: '0.00' });
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();

  async function refresh(values: Record<string, string | undefined> = {}) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
      const result = await request<{ items: Invoice[]; summary: typeof summary }>(`/invoices?${params.toString()}`, token);
      setRows(result.items); setSummary(result.summary);
    } catch (error) { onError(error instanceof Error ? error.message : '发票查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [token]);

  async function loadBalance(customerId?: string) {
    if (!customerId) { setBalance(null); return; }
    try { setBalance(await request<Balance>(`/customers/${customerId}/invoice-balance`, token)); }
    catch (error) { onError(error instanceof Error ? error.message : '未开票金额查询失败'); }
  }

  async function create(values: Record<string, string>) {
    try { await request('/invoices', token, { method: 'POST', body: JSON.stringify(values) }); setCreateOpen(false); form.resetFields(); setBalance(null); await refresh(filterForm.getFieldsValue()); }
    catch (error) { onError(error instanceof Error ? error.message : '发票创建失败'); }
  }

  async function action(path: string, message: string, body?: unknown) {
    try { await request(path, token, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); await refresh(filterForm.getFieldsValue()); }
    catch (error) { onError(error instanceof Error ? error.message : message); }
  }

  async function showDetail(id: string) {
    try { setDetail(await request(`/invoices/${id}`, token)); setDetailOpen(true); }
    catch (error) { onError(error instanceof Error ? error.message : '发票详情查询失败'); }
  }

  return <Card title="发票管理" loading={loading} extra={<Button type="primary" onClick={() => setCreateOpen(true)}>新建发票</Button>}>
    <Space wrap style={{ marginBottom: 16 }}><Card size="small"><Statistic title="收款/业务金额" value={summary.sourceAmount} suffix="元" /></Card><Card size="small"><Statistic title="已开票金额" value={summary.issuedAmount} suffix="元" /></Card><Card size="small"><Statistic title="开票中金额" value={summary.processingAmount} suffix="元" /></Card><Card size="small"><Statistic title="未开票金额" value={summary.uninvoicedAmount} suffix="元" /></Card></Space>
    <Form form={filterForm} layout="inline" onFinish={(values) => void refresh(values)} style={{ marginBottom: 16 }}><Form.Item name="customerId"><Select allowClear showSearch optionFilterProp="label" placeholder="客户" style={{ width: 200 }} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item><Form.Item name="status"><Select allowClear placeholder="发票状态" style={{ width: 130 }} options={Object.entries(statusName).map(([value, label]) => ({ value, label }))} /></Form.Item><Form.Item name="invoiceNo"><Input placeholder="发票编号" /></Form.Item><Form.Item name="businessNo"><Input placeholder="业务单号" /></Form.Item><Button htmlType="submit" type="primary">查询</Button><Button onClick={() => { filterForm.resetFields(); void refresh(); }}>重置</Button></Form>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }} columns={[
      { title: '发票编号', dataIndex: 'invoiceNo' }, { title: '发票号码', dataIndex: 'invoiceNumber', render: (value: string) => value || '-' }, { title: '客户', render: (_: unknown, row: Invoice) => row.customer?.name || '-' }, { title: '开票金额', dataIndex: 'amount' }, { title: '开票日期', dataIndex: 'invoiceDate', render: (value: string) => value ? new Date(value).toLocaleDateString('zh-CN') : '-' }, { title: '关联业务', render: (_: unknown, row: Invoice) => row.purchaseOrder?.orderNo || row.receiveRecord?.receiveNo || row.businessNo || '-' }, { title: '红冲状态', dataIndex: 'redFlushStatus', render: (value: string) => value || '未红冲' }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{statusName[value] || value}</Tag> }, { title: '操作', render: (_: unknown, row: Invoice) => <Space><Button type="link" onClick={() => void showDetail(row.id)}>详情</Button>{row.status === 'DRAFT' && <Button type="link" onClick={() => void action(`/invoices/${row.id}/process`, '提交开票失败')}>提交开票</Button>}{row.status === 'PROCESSING' && <Button type="link" onClick={() => void action(`/invoices/${row.id}/confirm`, '发票确认失败')}>确认开票</Button>}{row.status !== 'VOIDED' && <Button type="link" danger onClick={() => void action(`/invoices/${row.id}/void`, '发票作废失败', { reason: '后台操作作废' })}>作废</Button>}</Space> },
    ]} />
    <Modal title="新建发票" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()} okText="保存草稿" cancelText="取消"><Form form={form} layout="vertical" onFinish={create} onValuesChange={(changed) => { if (changed.customerId) void loadBalance(changed.customerId); }}><Form.Item name="customerId" label="客户"><Select showSearch optionFilterProp="label" options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item><Form.Item name="purchaseOrderId" label="订单ID" rules={[{ required: true, message: '请输入订单ID；无水单开票按订单关联' }]}><Input placeholder="请输入单一订单ID" /></Form.Item><Form.Item label="当前未开票金额"><Input value={balance?.uninvoicedAmount || '请选择客户查询'} readOnly /></Form.Item><Form.Item name="amount" label="本次开票金额" rules={[{ required: true, message: '请输入开票金额' }]}><Input placeholder="只能由后端校验可开票额度" /></Form.Item><Form.Item name="invoiceNumber" label="发票号码"><Input /></Form.Item><Form.Item name="invoiceType" label="发票类型"><Input placeholder="按业务实际填写" /></Form.Item><Form.Item name="invoiceTitle" label="发票抬头"><Input /></Form.Item><Form.Item name="taxNumber" label="纳税人识别号"><Input /></Form.Item><Form.Item name="invoiceContent" label="发票内容"><Input /></Form.Item><Form.Item name="redFlushStatus" label="红冲状态"><Input placeholder="当前仅保存状态，不提供红冲操作" /></Form.Item><Form.Item name="recipientEmail" label="接收邮箱"><Input /></Form.Item><Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} showCount /></Form.Item></Form></Modal>
    <Modal title="发票详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null}>{detail && <Descriptions bordered column={1}><Descriptions.Item label="发票编号">{detail.invoiceNo}</Descriptions.Item><Descriptions.Item label="发票号码">{detail.invoiceNumber || '-'}</Descriptions.Item><Descriptions.Item label="客户">{detail.customer?.name || '-'}</Descriptions.Item><Descriptions.Item label="金额">{detail.amount} {detail.currency}</Descriptions.Item><Descriptions.Item label="关联订单">{detail.purchaseOrder?.orderNo || '-'}</Descriptions.Item><Descriptions.Item label="关联收款">{detail.receiveRecord?.receiveNo || '-'}</Descriptions.Item><Descriptions.Item label="红冲状态">{detail.redFlushStatus || '未红冲'}</Descriptions.Item><Descriptions.Item label="状态">{statusName[detail.status] || detail.status}</Descriptions.Item><Descriptions.Item label="创建人">{detail.creator?.displayName || '-'}</Descriptions.Item><Descriptions.Item label="审计记录">{detail.auditLogs?.length || 0} 条</Descriptions.Item></Descriptions>}</Modal>
  </Card>;
}
