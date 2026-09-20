'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { generateWalletAdjustNo, generateWalletOpeningNo, generateCommonBusinessNo } from '../utils/businessNo';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
type Customer = { id: string; name: string; customerCode: string };
type Wallet = { id: string; customerId: string; walletName: string; unit: string; cashBalance: string; groupBalance: string; totalBalance: string; creditLimit: string; creditUsed: string; creditAvailable: string; advanceOutstanding: string; status: string; customer?: Customer };
type WalletTransaction = { id: string; transactionNo: string; businessType: string; businessNo?: string | null; changeAmount: string; balanceBefore: string; balanceAfter: string; operatorId: string; occurredAt: string; remark?: string | null };

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
  return data;
}

const typeName: Record<string, string> = {
  OPENING_BALANCE: '期初余额',
  ADJUSTMENT_RED: '红冲',
  ADJUSTMENT_BLUE: '蓝补',
  MANUAL_ADJUSTMENT: '手工调整',
  PROMOTION_ACCOUNT_CREDIT: '推广账户充值',
  PROMOTION_ACCOUNT_REFUND: '推广账户退款',
  ADVANCE_REPAY: '垫款还款',
  ADVANCE_WAIVE: '垫款豁免',
  CREDIT_UPDATE: '授信变更',
  WALLET_OPEN: '钱包开户',
  CUSTOMER_CREDIT: '账户充值',
  FINANCIAL_ADJUST: '财务调整',
  RECEIPT: '收款',
  REFUND: '退款',
  ADJUSTMENT: '调整',
  OTHER: '其他',
};

const amountColor = (v: string) => v.startsWith('-') ? '#ef4444' : '#10b981';
const amountText = (v: string) => v.startsWith('-') ? v : `+${v}`;

export default function CustomerWalletPanel({ token, customers, onError }: { token: string; customers: Customer[]; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Wallet[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string>();
  const [selected, setSelected] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState<'opening' | 'adjust' | 'credit' | 'advance'>('opening');
  const [repayOpen, setRepayOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [form] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [repayForm] = Form.useForm();
  const [waiveForm] = Form.useForm();

  async function refresh() {
    setLoading(true);
    try {
      const query = selectedCustomer ? `&customerId=${selectedCustomer}` : '';
      const result = await request<{ items: Wallet[]; total: number }>(`/customer-wallets?page=1&pageSize=100${query}`, token);
      setRows(result.items); setTotal(result.total);
    } catch (error) { onError(error instanceof Error ? error.message : '客户钱包查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [token, selectedCustomer]);

  async function create(values: { customerId: string; walletName?: string }) {
    try { await request('/customer-wallets', token, { method: 'POST', body: JSON.stringify(values) }); setCreateOpen(false); form.resetFields(); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '客户钱包创建失败'); }
  }

  async function showDetail(wallet: Wallet) {
    try { const [detail, result] = await Promise.all([request<Wallet>(`/customer-wallets/${wallet.id}`, token), request<{ items: WalletTransaction[] }>(`/customer-wallets/${wallet.id}/transactions?page=1&pageSize=20`, token)]); setSelected(detail); setTransactions(result.items); }
    catch (error) { onError(error instanceof Error ? error.message : '钱包详情查询失败'); }
  }

  async function submitAction(values: Record<string, string>) {
    if (!selected) return;
    const path = actionType === 'opening' ? 'opening-balance' : actionType === 'adjust' ? 'adjust' : actionType;
    const body = actionType === 'adjust' ? { ...values, type: values.type || 'MANUAL_ADJUSTMENT' } : values;
    try { await request(`/customer-wallets/${selected.id}/${path}`, token, { method: 'POST', body: JSON.stringify(body) }); setActionOpen(false); actionForm.resetFields(); await showDetail(selected); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '钱包操作失败'); }
  }

  const openAction = (wallet: Wallet, type: 'opening' | 'adjust' | 'credit' | 'advance') => {
    setSelected(wallet);
    setActionType(type);
    actionForm.resetFields();
    // 自动生成业务单号
    const businessNo = type === 'opening' ? generateWalletOpeningNo() : type === 'adjust' ? generateWalletAdjustNo() : generateCommonBusinessNo();
    actionForm.setFieldsValue({ businessNo });
    setActionOpen(true);
  };

  const openRepay = (wallet: Wallet) => {
    setSelected(wallet);
    repayForm.resetFields();
    repayForm.setFieldsValue({ amount: wallet.advanceOutstanding, businessNo: generateCommonBusinessNo() });
    setRepayOpen(true);
  };

  async function submitRepay(values: Record<string, string>) {
    if (!selected) return;
    try {
      await request(`/customer-wallets/${selected.id}/advance/repay`, token, { method: 'POST', body: JSON.stringify(values) });
      setRepayOpen(false); repayForm.resetFields();
      await showDetail(selected); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '垫款还款失败'); }
  }

  const openWaive = (wallet: Wallet) => {
    setSelected(wallet);
    waiveForm.resetFields();
    waiveForm.setFieldsValue({ amount: wallet.advanceOutstanding, businessNo: generateCommonBusinessNo() });
    setWaiveOpen(true);
  };

  async function submitWaive(values: Record<string, string>) {
    if (!selected) return;
    try {
      await request(`/customer-wallets/${selected.id}/advance/waive`, token, { method: 'POST', body: JSON.stringify(values) });
      setWaiveOpen(false); waiveForm.resetFields();
      await showDetail(selected); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '垫款豁免失败'); }
  }
  return <Card title="客户钱包" extra={<Space><Select allowClear value={selectedCustomer} onChange={setSelectedCustomer} placeholder="筛选客户" style={{ width: 180 }} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /><Button type="primary" onClick={() => setCreateOpen(true)}>创建钱包</Button></Space>} loading={loading}>
    <Table rowKey="id" dataSource={rows} scroll={{ x: 1200 }} pagination={{ current: 1, pageSize: 20, total, showSizeChanger: false }} columns={[
      { title: '客户名称', width: 140, render: (_: unknown, row: Wallet) => row.customer?.name || customers.find((item) => item.id === row.customerId)?.name || row.customerId },
      { title: '钱包名称', dataIndex: 'walletName', width: 140 },
      { title: '单位', dataIndex: 'unit', width: 70 },
      { title: '总余额', dataIndex: 'totalBalance', width: 110, render: (v: string) => <span style={{ fontWeight: 700, color: '#1677ff' }}>{v}</span> },
      { title: '现金余额', dataIndex: 'cashBalance', width: 100 },
      { title: '集团余额', dataIndex: 'groupBalance', width: 100 },
      { title: '垫款未还', dataIndex: 'advanceOutstanding', width: 100, render: (v: string) => <span style={{ color: Number(v) > 0 ? '#ef4444' : undefined, fontWeight: 600 }}>{v}</span> },
      { title: '授信额度', dataIndex: 'creditLimit', width: 100 },
      { title: '授信余额', dataIndex: 'creditAvailable', width: 100, render: (v: string) => <span style={{ color: '#10b981', fontWeight: 600 }}>{v}</span> },
      { title: '状态', dataIndex: 'status', width: 80, render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value === 'ACTIVE' ? '正常' : '停用'}</Tag> },
      { title: '操作', width: 280, fixed: 'right', render: (_: unknown, row: Wallet) => <Space size={4} wrap><Button type="link" size="small" onClick={() => void showDetail(row)}>详情</Button><Button type="link" size="small" onClick={() => openAction(row, 'opening')}>期初</Button><Button type="link" size="small" onClick={() => openAction(row, 'adjust')}>调整</Button><Button type="link" size="small" onClick={() => openAction(row, 'credit')}>授信</Button><Button type="link" size="small" onClick={() => openAction(row, 'advance')}>垫款</Button>{Number(row.advanceOutstanding) > 0 && <><Button type="link" size="small" style={{ color: '#1677ff' }} onClick={() => openRepay(row)}>还款</Button><Button type="link" size="small" style={{ color: '#faad14' }} onClick={() => openWaive(row)}>豁免</Button></>}</Space> },
    ]} />
    <Modal title="创建客户钱包" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消"><Form form={form} layout="vertical" onFinish={create}><Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}><Select options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} placeholder="请选择客户" /></Form.Item><Form.Item name="walletName" label="钱包名称"><Input maxLength={100} placeholder="默认使用客户名称加钱包" /></Form.Item></Form></Modal>
    <Modal title="钱包详情" open={Boolean(selected) && !actionOpen} onCancel={() => setSelected(null)} footer={null} width={1000}>{selected && <>
      <Descriptions bordered column={3} size="small" className="wallet-detail-desc">
        <Descriptions.Item label="客户">{selected.customer?.name || selected.customerId}</Descriptions.Item>
        <Descriptions.Item label="单位">{selected.unit}</Descriptions.Item>
        <Descriptions.Item label="状态"><Tag color={selected.status === 'ACTIVE' ? 'green' : 'default'}>{selected.status === 'ACTIVE' ? '正常' : '停用'}</Tag></Descriptions.Item>
        <Descriptions.Item label="总余额"><span style={{ fontWeight: 700, color: '#1677ff', fontSize: 15 }}>{selected.totalBalance}</span></Descriptions.Item>
        <Descriptions.Item label="现金余额">{selected.cashBalance}</Descriptions.Item>
        <Descriptions.Item label="集团余额">{selected.groupBalance}</Descriptions.Item>
        <Descriptions.Item label="授信额度">{selected.creditLimit}</Descriptions.Item>
        <Descriptions.Item label="授信已使用">{selected.creditUsed}</Descriptions.Item>
        <Descriptions.Item label="授信余额"><span style={{ color: '#10b981', fontWeight: 600 }}>{selected.creditAvailable}</span></Descriptions.Item>
        <Descriptions.Item label="垫款未还"><span style={{ color: Number(selected.advanceOutstanding) > 0 ? '#ef4444' : undefined, fontWeight: 600 }}>{selected.advanceOutstanding}</span></Descriptions.Item>
      </Descriptions>
      <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 600, color: '#333' }}>流水记录</div>
      <Table rowKey="id" size="small" pagination={false} dataSource={transactions} scroll={{ x: 900 }} columns={[
        { title: '流水号', dataIndex: 'transactionNo', width: 180 },
        { title: '类型', dataIndex: 'businessType', width: 120, render: (value: string) => <Tag color="blue">{typeName[value] || value}</Tag> },
        { title: '业务单号', dataIndex: 'businessNo', width: 160, render: (v: string) => v || '-' },
        { title: '变动金额', dataIndex: 'changeAmount', width: 110, render: (v: string) => <span style={{ color: amountColor(v), fontWeight: 700 }}>{amountText(v)}</span> },
        { title: '变动前', dataIndex: 'balanceBefore', width: 100 },
        { title: '变动后', dataIndex: 'balanceAfter', width: 100 },
        { title: '操作时间', dataIndex: 'occurredAt', width: 160, render: (value: string) => new Date(value).toLocaleString('zh-CN') },
        { title: '备注', dataIndex: 'remark', width: 150, ellipsis: true, render: (v: string) => v || '-' },
      ]} />
    </>}</Modal>
    <Modal title={actionType === 'opening' ? '录入期初余额' : actionType === 'adjust' ? '钱包调整' : actionType === 'credit' ? '修改授信' : '修改垫款'} open={actionOpen} onCancel={() => setActionOpen(false)} onOk={() => actionForm.submit()} okText="提交" cancelText="取消"><Form form={actionForm} layout="vertical" onFinish={submitAction}>{actionType === 'adjust' && <><Form.Item name="type" label="调整类型" initialValue="MANUAL_ADJUSTMENT"><Select options={[{ value: 'ADJUSTMENT_RED', label: '红冲（减少）' }, { value: 'ADJUSTMENT_BLUE', label: '蓝补（增加）' }, { value: 'MANUAL_ADJUSTMENT', label: '手工调整' }]} /></Form.Item><Form.Item name="direction" label="手工调整方向"><Select allowClear options={[{ value: 'INCOME', label: '增加' }, { value: 'EXPENSE', label: '减少' }]} /></Form.Item></>}{actionType === 'credit' && <><Form.Item name="creditLimit" label="授信额度"><Input placeholder="例如 10000.00" /></Form.Item><Form.Item name="creditUsed" label="授信已使用"><Input placeholder="可选" /></Form.Item></>}{actionType === 'advance' ? <Form.Item name="advanceOutstanding" label="垫款未还" rules={[{ required: true, message: '请输入垫款金额' }]}><Input /></Form.Item> : actionType !== 'credit' && <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}><Input placeholder="最多两位小数" /></Form.Item>}<Form.Item name="businessNo" label="业务单号"><Input maxLength={100} disabled /></Form.Item><Form.Item name="idempotencyKey" label="幂等键"><Input maxLength={100} placeholder="重复提交时保持一致" /></Form.Item><Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} /></Form.Item></Form></Modal>
    <Modal title="垫款还款" open={repayOpen} onCancel={() => setRepayOpen(false)} onOk={() => repayForm.submit()} okText="确认还款" cancelText="取消" width={480}>
      <Form form={repayForm} layout="vertical" onFinish={submitRepay}>
        <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          还款将从客户钱包余额中扣除，并减少垫款未还金额。
        </div>
        <Form.Item name="amount" label="还款金额" rules={[{ required: true, message: '请输入还款金额' }]}>
          <Input placeholder="最多两位小数" />
        </Form.Item>
        <Form.Item name="businessNo" label="业务单号">
          <Input maxLength={100} disabled />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea maxLength={255} placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
    <Modal title="垫款豁免" open={waiveOpen} onCancel={() => setWaiveOpen(false)} onOk={() => waiveForm.submit()} okText="确认豁免" cancelText="取消" width={480}>
      <Form form={waiveForm} layout="vertical" onFinish={submitWaive}>
        <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          豁免将减少垫款未还金额，但不扣减客户钱包余额（公司主动免除）。
        </div>
        <Form.Item name="amount" label="豁免金额" rules={[{ required: true, message: '请输入豁免金额' }]}>
          <Input placeholder="最多两位小数" />
        </Form.Item>
        <Form.Item name="reason" label="豁免原因" rules={[{ required: true, message: '请填写豁免原因' }]}>
          <Input.TextArea maxLength={255} placeholder="例如：客户合作终止、坏账核销等" />
        </Form.Item>
        <Form.Item name="businessNo" label="业务单号">
          <Input maxLength={100} disabled />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea maxLength={255} placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  </Card>;
}
