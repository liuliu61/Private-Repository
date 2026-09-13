'use client';

import { useEffect, useState } from 'react';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
type Customer = { id: string; name: string; customerCode: string };
type BankTransaction = { id: string; transactionNo: string; account?: { name: string; accountCode: string }; occurredAt: string; direction: string; amount: string; counterpartyName?: string; status: string; matchedCustomer?: { name: string }; receiveRecord?: { id: string; receiveNo: string; status: string } };
type ReceiveDetail = { id: string; type: 'PUBLIC' | 'PRIVATE'; amount: string };
type ReceiveRecord = { id: string; receiveNo: string; amount: string; invoiceEligibleAmount?: string; receivedAt: string; status: string; customer?: { name: string; customerCode: string }; bankTransaction?: { transactionNo: string }; purchaseOrder?: { orderNo: string }; transaction?: { transactionNo: string }; details?: ReceiveDetail[] };

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
  return data;
}

const bankStatus: Record<string, string> = { UNPROCESSED: '未处理', MATCHED: '已匹配', RECEIPT_CREATED: '已生成收款', RECEIPT_CONFIRMED: '已确认收款', IGNORED: '已忽略' };
const receiveStatus: Record<string, string> = { PENDING_MATCH: '待匹配', PENDING_CONFIRMATION: '待确认', CONFIRMED: '已确认', CANCELLED: '已取消' };
const directionName: Record<string, string> = { INCOME: '收入', EXPENSE: '支出' };
const amountToCents = (value?: string) => {
  const [integer = '0', decimal = ''] = String(value || '').trim().replace(/^\+/, '').split('.');
  if (!/^\d+$/.test(integer) || (decimal && !/^\d{1,2}$/.test(decimal))) return null;
  return Number(integer) * 100 + Number((decimal + '00').slice(0, 2));
};
const centsToAmount = (value: number) => `${Math.trunc(value / 100)}.${Math.abs(value % 100).toString().padStart(2, '0')}`;

export default function ReceivingPanel({ token, customers, onError }: { token: string; customers: Customer[]; onError: (message: string) => void }) {
  const [tab, setTab] = useState('bank');
  const [banks, setBanks] = useState<BankTransaction[]>([]);
  const [receives, setReceives] = useState<ReceiveRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [postingOpen, setPostingOpen] = useState(false);
  const [detail, setDetail] = useState<ReceiveRecord | null>(null);
  const [selectedBank, setSelectedBank] = useState<BankTransaction | null>(null);
  const [selectedReceive, setSelectedReceive] = useState<ReceiveRecord | null>(null);
  const [form] = Form.useForm();
  const [bankFilterForm] = Form.useForm();
  const [receiveFilterForm] = Form.useForm();
  const [postingForm] = Form.useForm();
  const postingDetails = Form.useWatch('details', postingForm) as { type?: 'PUBLIC' | 'PRIVATE'; amount?: string }[] | undefined;
  const allocatedCents = (postingDetails || []).reduce((total, item) => total + (amountToCents(item.amount) || 0), 0);
  const receiveCents = amountToCents(selectedReceive?.amount) || 0;
  const remainingCents = receiveCents - allocatedCents;

  async function refresh(bankQuery = '', receiveQuery = '') {
    setLoading(true);
    try {
      const [bankResult, receiveResult] = await Promise.all([
        request<{ items: BankTransaction[] }>(`/bank-transactions?page=1&pageSize=100${bankQuery ? `&${bankQuery}` : ''}`, token),
        request<{ items: ReceiveRecord[] }>(`/receive-records?page=1&pageSize=100${receiveQuery ? `&${receiveQuery}` : ''}`, token),
      ]);
      setBanks(bankResult.items);
      setReceives(receiveResult.items);
    } catch (error) { onError(error instanceof Error ? error.message : '收款数据查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [token]);

  async function importBank(values: { accountId: string; occurredAt: string; direction: string; amount: string; source: string; externalTransactionId: string; counterpartyName?: string; summary?: string }) {
    try {
      await request('/bank-transactions/import', token, { method: 'POST', body: JSON.stringify({ items: [values] }) });
      setImportOpen(false); form.resetFields(); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '银行交易导入失败'); }
  }

  async function matchBank(values: { customerId: string; purchaseOrderId?: string; remark?: string }) {
    if (!selectedBank) return;
    try { await request(`/bank-transactions/${selectedBank.id}/match`, token, { method: 'POST', body: JSON.stringify(values) }); setMatchOpen(false); form.resetFields(); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '银行交易匹配失败'); }
  }

  async function createReceive(values: { bankTransactionId: string; customerId?: string; purchaseOrderId?: string; remark?: string }) {
    try { await request('/receive-records', token, { method: 'POST', body: JSON.stringify(values) }); setReceiveOpen(false); form.resetFields(); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '收款记录创建失败'); }
  }

  async function action(path: string, successMessage: string) {
    try { await request(path, token, { method: 'POST' }); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : successMessage); }
  }

  async function confirmReceive(values: { serviceFeeAmount?: string; remark?: string; details: { type: 'PUBLIC' | 'PRIVATE'; amount: string }[] }) {
    if (!selectedReceive) return;
    if (remainingCents !== 0) { onError('入账明细金额合计必须等于本次流水金额'); return; }
    try {
      await request(`/receive-records/${selectedReceive.id}/confirm`, token, { method: 'POST', body: JSON.stringify(values) });
      setPostingOpen(false); postingForm.resetFields(); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '确认收款失败'); }
  }

  function openPosting(row: ReceiveRecord) {
    setSelectedReceive(row);
    postingForm.setFieldsValue({ serviceFeeAmount: '0.00', details: [{ type: 'PUBLIC', amount: row.amount }] });
    setPostingOpen(true);
  }

  async function showReceiveDetail(id: string) {
    try { setDetail(await request<ReceiveRecord>(`/receive-records/${id}`, token)); setDetailOpen(true); }
    catch (error) { onError(error instanceof Error ? error.message : '收款详情查询失败'); }
  }

  async function filterBank(values: Record<string, string | undefined>) {
    const params = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
    const receiveParams = new URLSearchParams(Object.entries(receiveFilterForm.getFieldsValue()).filter((entry): entry is [string, string] => Boolean(entry[1])));
    await refresh(params.toString(), receiveParams.toString());
  }

  async function filterReceive(values: Record<string, string | undefined>) {
    const params = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
    const bankParams = new URLSearchParams(Object.entries(bankFilterForm.getFieldsValue()).filter((entry): entry is [string, string] => Boolean(entry[1])));
    await refresh(bankParams.toString(), params.toString());
  }

  return <Card title="收款管理" loading={loading}>
    <Tabs activeKey={tab} onChange={setTab} items={[{ key: 'bank', label: '银行交易' }, { key: 'receive', label: '收款记录' }]} />
    {tab === 'bank' && <>
      <Form form={bankFilterForm} layout="inline" onFinish={filterBank} style={{ marginBottom: 16 }}><Form.Item name="accountId"><Input placeholder="银行账户ID" /></Form.Item><Form.Item name="direction"><Select allowClear placeholder="交易方向" style={{ width: 120 }} options={[{ value: 'INCOME', label: '收入' }, { value: 'EXPENSE', label: '支出' }]} /></Form.Item><Form.Item name="status"><Select allowClear placeholder="交易状态" style={{ width: 150 }} options={Object.entries(bankStatus).map(([value, label]) => ({ value, label }))} /></Form.Item><Form.Item name="counterpartyName"><Input placeholder="对方名称" /></Form.Item><Form.Item name="keyword"><Input placeholder="交易编号/摘要" /></Form.Item><Form.Item name="startDate"><Input placeholder="开始时间ISO" /></Form.Item><Form.Item name="endDate"><Input placeholder="结束时间ISO" /></Form.Item><Form.Item name="minAmount"><Input placeholder="最小金额" /></Form.Item><Form.Item name="maxAmount"><Input placeholder="最大金额" /></Form.Item><Button htmlType="submit" type="primary">查询</Button><Button onClick={() => { bankFilterForm.resetFields(); void refresh('', ''); }}>重置</Button></Form>
      <Space style={{ marginBottom: 16 }}><Button type="primary" onClick={() => setImportOpen(true)}>导入银行交易</Button><Button onClick={() => setReceiveOpen(true)}>创建收款记录</Button></Space>
      <Table rowKey="id" dataSource={banks} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }} columns={[
        { title: '交易编号', dataIndex: 'transactionNo' },
        { title: '交易时间', dataIndex: 'occurredAt', render: (value: string) => new Date(value).toLocaleString('zh-CN') },
        { title: '方向', dataIndex: 'direction', render: (value: string) => directionName[value] || value },
        { title: '金额', dataIndex: 'amount' },
        { title: '对公/对私', render: (_: unknown, row: ReceiveRecord) => row.details?.length ? row.details.map((detail) => `${detail.type === 'PUBLIC' ? '对公' : '对私'} ${detail.amount}`).join(' / ') : '-' },
        { title: '对方名称', dataIndex: 'counterpartyName' },
        { title: '客户', render: (_: unknown, row: BankTransaction) => row.matchedCustomer?.name || '待匹配' },
        { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{bankStatus[value] || value}</Tag> },
        { title: '操作', render: (_: unknown, row: BankTransaction) => <Space>{row.status !== 'RECEIPT_CONFIRMED' && row.status !== 'RECEIPT_CREATED' && <Button type="link" onClick={() => { setSelectedBank(row); setMatchOpen(true); }}>匹配</Button>}{row.status === 'MATCHED' && <Button type="link" onClick={() => void action(`/bank-transactions/${row.id}/unmatch`, '取消匹配失败')}>取消匹配</Button>}</Space> },
      ]} />
    </>}
    {tab === 'receive' && <>
      <Form form={receiveFilterForm} layout="inline" onFinish={filterReceive} style={{ marginBottom: 16 }}><Form.Item name="customerId"><Select allowClear showSearch optionFilterProp="label" placeholder="客户" style={{ width: 200 }} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item><Form.Item name="status"><Select allowClear placeholder="收款状态" style={{ width: 150 }} options={Object.entries(receiveStatus).map(([value, label]) => ({ value, label }))} /></Form.Item><Button htmlType="submit" type="primary">查询</Button><Button onClick={() => { receiveFilterForm.resetFields(); void refresh('', ''); }}>重置</Button></Form>
      <Table rowKey="id" dataSource={receives} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }} columns={[
        { title: '收款编号', dataIndex: 'receiveNo' },
        { title: '客户', render: (_: unknown, row: ReceiveRecord) => row.customer?.name || '待匹配' },
        { title: '金额', dataIndex: 'amount' },
        { title: '收款时间', dataIndex: 'receivedAt', render: (value: string) => new Date(value).toLocaleString('zh-CN') },
        { title: '银行交易', render: (_: unknown, row: ReceiveRecord) => row.bankTransaction?.transactionNo || '-' },
        { title: '关联订单', render: (_: unknown, row: ReceiveRecord) => row.purchaseOrder?.orderNo || '-' },
        { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{receiveStatus[value] || value}</Tag> },
        { title: '操作', render: (_: unknown, row: ReceiveRecord) => <Space><Button type="link" onClick={() => void showReceiveDetail(row.id)}>详情</Button>{row.status === 'PENDING_CONFIRMATION' && <Button type="link" onClick={() => openPosting(row)}>确认入账</Button>}{row.transaction ? <span>{row.transaction.transactionNo}</span> : null}</Space> },
      ]} />
    </>}
    <Modal title="导入银行交易" open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => form.submit()} okText="导入" cancelText="取消"><Form form={form} layout="vertical" onFinish={importBank}><Form.Item name="accountId" label="银行账户ID" rules={[{ required: true, message: '请输入银行账户ID' }]}><Input placeholder="请输入账户ID" /></Form.Item><Form.Item name="occurredAt" label="交易时间" rules={[{ required: true, message: '请输入ISO时间' }]}><Input placeholder="2026-09-11T10:00:00+08:00" /></Form.Item><Form.Item name="direction" label="交易方向" initialValue="INCOME"><Select options={[{ value: 'INCOME', label: '收入' }, { value: 'EXPENSE', label: '支出' }]} /></Form.Item><Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}><Input /></Form.Item><Form.Item name="source" label="来源" initialValue="MANUAL" rules={[{ required: true, message: '请输入来源' }]}><Input /></Form.Item><Form.Item name="externalTransactionId" label="原始交易编号" rules={[{ required: true, message: '请输入原始交易编号' }]}><Input /></Form.Item><Form.Item name="counterpartyName" label="对方名称"><Input /></Form.Item><Form.Item name="summary" label="摘要"><Input /></Form.Item></Form></Modal>
    <Modal title="匹配银行交易" open={matchOpen} onCancel={() => setMatchOpen(false)} onOk={() => form.submit()} okText="保存匹配" cancelText="取消"><Form form={form} layout="vertical" onFinish={matchBank}><Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}><Select showSearch optionFilterProp="label" options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item><Form.Item name="purchaseOrderId" label="订单ID（可选）"><Input placeholder="可选，输入订单ID" /></Form.Item><Form.Item name="remark" label="备注"><Input /></Form.Item></Form></Modal>
    <Modal title="创建收款记录" open={receiveOpen} onCancel={() => setReceiveOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消"><Form form={form} layout="vertical" onFinish={createReceive}><Form.Item name="bankTransactionId" label="银行交易ID" rules={[{ required: true, message: '请输入银行交易ID' }]}><Input placeholder="请输入银行交易ID" /></Form.Item><Form.Item name="customerId" label="客户（可选）"><Select allowClear showSearch optionFilterProp="label" options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item><Form.Item name="purchaseOrderId" label="订单ID（可选）"><Input placeholder="可选，输入订单ID" /></Form.Item><Form.Item name="remark" label="备注"><Input /></Form.Item></Form></Modal>
    <Modal title={selectedReceive ? `确认入账：${selectedReceive.receiveNo}` : '确认入账'} open={postingOpen} onCancel={() => setPostingOpen(false)} onOk={() => postingForm.submit()} okText="确认入账" cancelText="取消"><Form form={postingForm} layout="vertical" onFinish={confirmReceive}><Descriptions size="small" bordered column={1}><Descriptions.Item label="本次流水金额">{selectedReceive?.amount}</Descriptions.Item><Descriptions.Item label="已分配金额">{centsToAmount(allocatedCents)}</Descriptions.Item><Descriptions.Item label="剩余未分配金额"><Typography.Text type={remainingCents === 0 ? 'success' : 'danger'}>{centsToAmount(remainingCents)}</Typography.Text></Descriptions.Item></Descriptions><Form.Item name="serviceFeeAmount" label="服务费"><Input /></Form.Item><Form.List name="details" rules={[{ validator: async (_, value) => { if (!value?.length) return Promise.reject(new Error('至少需要一条入账明细')); return Promise.resolve(); } }]}>{(fields, { add, remove }) => <><div style={{ marginBottom: 8 }}>入账明细（对公款自动生成发票任务；对私款不生成）</div>{fields.map(({ key, name, ...restField }) => <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}><Form.Item {...restField} name={[name, 'type']} rules={[{ required: true, message: '请选择入账类型' }]}><Select style={{ width: 130 }} options={[{ value: 'PUBLIC', label: 'PUBLIC（对公）' }, { value: 'PRIVATE', label: 'PRIVATE（对私）' }]} /></Form.Item><Form.Item {...restField} name={[name, 'amount']} rules={[{ required: true, message: '请输入金额' }]}><Input placeholder="金额" /></Form.Item>{fields.length > 1 && <MinusCircleOutlined onClick={() => remove(name)} />}</Space>)}<Button type="dashed" onClick={() => add({ type: 'PRIVATE', amount: centsToAmount(remainingCents > 0 ? remainingCents : 0) })} icon={<PlusOutlined />}>添加明细</Button></>}</Form.List><Form.Item name="remark" label="备注"><Input /></Form.Item></Form></Modal>
    <Modal title="收款详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null}>{detail && <Descriptions bordered column={1}><Descriptions.Item label="收款编号">{detail.receiveNo}</Descriptions.Item><Descriptions.Item label="客户">{detail.customer?.name || '待匹配'}</Descriptions.Item><Descriptions.Item label="金额">{detail.amount}</Descriptions.Item><Descriptions.Item label="入账性质">{detail.details?.map((item) => `${item.type === 'PUBLIC' ? '对公' : '对私'} ${item.amount}`).join(' / ') || '-'}</Descriptions.Item><Descriptions.Item label="收款时间">{new Date(detail.receivedAt).toLocaleString('zh-CN')}</Descriptions.Item><Descriptions.Item label="银行交易">{detail.bankTransaction?.transactionNo || '-'}</Descriptions.Item><Descriptions.Item label="关联订单">{detail.purchaseOrder?.orderNo || '-'}</Descriptions.Item><Descriptions.Item label="状态">{receiveStatus[detail.status] || detail.status}</Descriptions.Item><Descriptions.Item label="资金流水">{detail.transaction?.transactionNo || '尚未入账'}</Descriptions.Item></Descriptions>}</Modal>
  </Card>;
}
