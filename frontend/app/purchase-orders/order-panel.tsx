'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Descriptions, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { generatePurchaseOrderPayNo, generatePurchaseOrderCreditNo } from '../utils/businessNo';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ColumnConfig { key: string; title: string; visible: boolean; width?: number; fixed?: 'left' | 'right'; }

function useTableColumnConfig(tableKey: string, token: string, defaultColumns: ColumnConfig[]) {
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${apiUrl}/table-config/${tableKey}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (data.columns && Array.isArray(data.columns)) setColumns(data.columns);
      } catch { /* 用默认 */ }
    }
    void load();
  }, [tableKey, token]);
  const saveConfig = useCallback(async (newColumns: ColumnConfig[]) => {
    setLoading(true);
    try {
      await fetch(`${apiUrl}/table-config/${tableKey}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ columns: newColumns }) });
      setColumns(newColumns);
    } finally { setLoading(false); }
  }, [tableKey, token]);
  const resetConfig = useCallback(async () => {
    setLoading(true);
    try {
      await fetch(`${apiUrl}/table-config/${tableKey}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setColumns(defaultColumns);
    } finally { setLoading(false); }
  }, [tableKey, token, defaultColumns]);
  const visibleColumns = useCallback(() => columns.filter((col) => col.visible), [columns]);
  return { columns, setColumns, visibleColumns, configModalOpen, setConfigModalOpen, saveConfig, resetConfig, loading };
}

function ColumnConfigModal({ open, columns, loading, onCancel, onSave, onReset }: { open: boolean; columns: ColumnConfig[]; loading: boolean; onCancel: () => void; onSave: (cols: ColumnConfig[]) => void; onReset: () => void; }) {
  const [localColumns, setLocalColumns] = useState<ColumnConfig[]>(columns);
  useEffect(() => { if (open) setLocalColumns(columns); }, [open, columns]);
  const toggleColumn = (key: string) => setLocalColumns(localColumns.map((col) => col.key === key ? { ...col, visible: !col.visible } : col));
  const visibleCount = localColumns.filter((col) => col.visible).length;
  return (
    <Modal title="自定义表头" open={open} onCancel={onCancel} width={500} footer={[<Button key="reset" onClick={onReset} disabled={loading}>恢复默认</Button>, <Button key="cancel" onClick={onCancel}>取消</Button>, <Button key="save" type="primary" loading={loading} onClick={() => onSave(localColumns)} disabled={visibleCount === 0}>保存</Button>]}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Text type="secondary">已选 {visibleCount}/{localColumns.length} 列</Typography.Text>
        <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
          {localColumns.map((col) => (<div key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}><Checkbox checked={col.visible} onChange={() => toggleColumn(col.key)}>{col.title}</Checkbox>{col.fixed && <Typography.Text type="secondary" style={{ fontSize: 12 }}>[{col.fixed === 'left' ? '固定左' : '固定右'}]</Typography.Text>}</div>))}
        </div>
        {visibleCount === 0 && <Typography.Text type="danger">至少需要显示一列</Typography.Text>}
      </Space>
    </Modal>
  );
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'procurementNo', title: '订单号', visible: true },
  { key: 'customerId', title: '客户', visible: true },
  { key: 'supplierId', title: '供应商', visible: true },
  { key: 'platform', title: '平台', visible: true },
  { key: 'transactionType', title: '交易类型', visible: true },
  { key: 'businessType', title: '业务类型', visible: false },
  { key: 'baseAmount', title: '基准金额', visible: true },
  { key: 'customerRebate', title: '客户返点', visible: true },
  { key: 'supplierCost', title: '成本政策', visible: false },
  { key: 'status', title: '状态', visible: true },
  { key: 'action', title: '操作', visible: true, fixed: 'right' },
];
type Customer = { id: string; name: string };
type Supplier = { id: string; name: string; platform: string; status: string };
type Asset = { id: string; name: string; subjectId?: string; customerId?: string; platform?: string; status?: string };
type CashAccount = { id: string; name: string; currency: string; status: string };
type SupplierAccount = { id: string; accountName: string; currency: string; status: string; currentBalance: string };
type PromotionAccount = { id: string; accountName: string; unit: string; status: string; currentBalance: string };
type Order = { id: string; procurementNo: string; orderNo: string; customerId: string; supplierId: string; platform: string; transactionType?: string; businessType?: string | null; subjectId: string; accountId: string; status: string; baseAmount: string; baseCreditAmount: string | null; customerRebateType: string | null; customerRebateRate: string | null; customerCalculationMode: string | null; customerCashAmount: string | null; customerPaymentAmount: string | null; customerCreditAmount: string | null; customerRebateAmount: string | null; customerReceivable: string | null; customerPaidAmount: string | null; customerReceivableRemaining: string | null; customerPaymentStatus: string | null; customerPromotionAccountId: string | null; customerCreditedAmount: string | null; customerCreditRemaining: string | null; customerCreditStatus: string | null; supplierRebateType: string | null; supplierRebateRate: string | null; supplierCostRate: string | null; supplierCalculationMode: string | null; supplierBaseAmount: string | null; supplierCashAmount: string | null; supplierPaymentAmount: string | null; supplierCreditAmount: string | null; supplierRebateAmount: string | null; supplierPayable: string | null; supplierPaidAmount: string | null; supplierPayableRemaining: string | null; supplierPaymentStatus: string | null; operatingFeeAmount: string | null; costDifference: string | null; grossProfit: string | null; profitStatus: string | null; businessTime: string | null; remark: string | null };
type Refund = { refundId: string; refundNo: string; purchaseOrderId: string; refundAmount: string; refundReason: string; status: string; applicantId: string; approvedBy?: string | null; executedBy?: string | null; transactionNo?: string | null; createdAt: string; };

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
  return data;
}

const platforms = [{ value: 'DOUYIN', label: '抖音' }, { value: 'KUAISHOU', label: '快手' }, { value: 'XIAOHONGSHU', label: '小红书' }, { value: 'TENCENT', label: '腾讯' }];
const statusName: Record<string, string> = { DRAFT: '草稿', PENDING_CONFIRMATION: '待确认', CONFIRMED: '已确认', SETTLED: '已结算', CANCELLED: '已取消' };
const rebateTypeName: Record<string, string> = { FIXED_ADD: '固定返点', PRIVATE_DIVIDE: '私反客户政策' };
const calculationModeName: Record<string, string> = { CASH_TO_CREDIT: '人民币 → 账户币', CREDIT_TO_CASH: '账户币 → 人民币' };
const profitStatusName: Record<string, string> = { PROFIT: '盈利', BREAK_EVEN: '持平', LOSS: '亏损' };
const refundStatusName: Record<string, string> = { PENDING: '待审批', APPROVED: '已审批', REJECTED: '已驳回', REFUNDED: '已退款', CANCELLED: '已取消' };

export default function ProcurementOrderPanel({ token, customers, suppliers, onError }: { token: string; customers: Customer[]; suppliers: Supplier[]; onError: (message: string) => void }) {
  const columnConfig = useTableColumnConfig('purchase_orders', token, DEFAULT_COLUMNS);
  const [subjects, setSubjects] = useState<Asset[]>([]);
  const [accounts, setAccounts] = useState<Asset[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<'customer' | 'supplier'>('customer');
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [supplierAccounts, setSupplierAccounts] = useState<SupplierAccount[]>([]);
  const [promotionAccounts, setPromotionAccounts] = useState<PromotionAccount[]>([]);
  const [creditOrder, setCreditOrder] = useState<Order | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundRows, setRefundRows] = useState<Refund[]>([]);
  const [refundSummary, setRefundSummary] = useState<{ paidAmount: string; refundedAmount: string; refundableAmount: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [paymentForm] = Form.useForm();
  const [creditForm] = Form.useForm();
  const [refundForm] = Form.useForm();
  const [listForm] = Form.useForm();
  const [listFilters, setListFilters] = useState<Record<string, string>>({});

  async function refresh(nextFilters: Record<string, string> = listFilters) {
    setLoading(true);
    try { const params = new URLSearchParams({ page: '1', pageSize: '10' }); Object.entries(nextFilters).forEach(([key, value]) => { if (value) params.set(key, value); }); const result = await request<{ items: Order[] }>(`/purchase-orders?${params.toString()}`, token); setOrders(result.items); }
    catch (error) { onError(error instanceof Error ? error.message : '外采订单查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { Promise.all([request<Asset[]>('/ad-subjects', token), request<Asset[]>('/ad-accounts', token), request<CashAccount[]>('/accounts?status=ACTIVE', token)]).then(([subjectRows, accountRows, cashAccountRows]) => { setSubjects(subjectRows); setAccounts(accountRows); setCashAccounts(cashAccountRows.filter((item) => item.currency === 'CNY')); }).catch((error) => onError(error instanceof Error ? error.message : '基础数据查询失败')); void refresh(); }, [token]);

  const accountOptions = useMemo(() => accounts.map((item) => ({ value: item.id, label: item.name })), [accounts]);
  async function create(values: { customerId: string; supplierId: string; platform: string; transactionType?: string; businessType?: string; subjectId: string; accountId: string; cashAccountId: string; baseAmount: string; businessTime: string; inboundAccountId?: string; inboundAccountName?: string; outboundAccountId?: string; outboundAccountName?: string; clientRequestId?: string; remark?: string }) {
    try { await request('/purchase-orders', token, { method: 'POST', body: JSON.stringify({ ...values, businessTime: new Date(values.businessTime).toISOString(), baseAmount: values.baseAmount.trim() }) }); setModalOpen(false); form.resetFields(); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '外采订单创建失败'); }
  }
  async function transition(id: string, action: 'submit' | 'confirm' | 'cancel' | 'settle') {
    try { await request(`/purchase-orders/${id}/${action}`, token, { method: 'POST' }); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '订单状态更新失败'); }
  }
  async function showDetail(id: string) {
    try { const order = await request<Order>(`/purchase-orders/${id}`, token); setSelected(order); try { const refunds = await request<{ items: Refund[]; paidAmount: string; refundedAmount: string; refundableAmount: string }>(`/purchase-orders/${id}/refunds`, token); setRefundRows(refunds.items); setRefundSummary(refunds); } catch { setRefundRows([]); setRefundSummary(null); } setDetailOpen(true); }
    catch (error) { onError(error instanceof Error ? error.message : '订单详情查询失败'); }
  }

  async function openRefund(order: Order) {
    try { const summary = await request<{ items: Refund[]; paidAmount: string; refundedAmount: string; refundableAmount: string }>(`/purchase-orders/${order.id}/refunds`, token); setRefundOrder(order); setRefundRows(summary.items); setRefundSummary(summary); refundForm.resetFields(); refundForm.setFieldsValue({ refundAmount: summary.refundableAmount, idempotencyKey: crypto.randomUUID() }); setRefundOpen(true); }
    catch (error) { onError(error instanceof Error ? error.message : '退款信息查询失败'); }
  }

  async function submitRefund(values: { refundAmount: string; refundReason: string; idempotencyKey: string }) {
    if (!refundOrder) return;
    try { await request(`/purchase-orders/${refundOrder.id}/refunds`, token, { method: 'POST', body: JSON.stringify({ ...values, refundAmount: values.refundAmount.trim() }) }); setRefundOpen(false); await refresh(); await showDetail(refundOrder.id); }
    catch (error) { onError(error instanceof Error ? error.message : '退款申请失败'); }
  }

  async function processRefund(id: string, action: 'approve' | 'reject' | 'execute') {
    try { await request(`/refunds/${id}/${action}`, token, { method: 'POST' }); if (refundOrder) { const summary = await request<{ items: Refund[]; paidAmount: string; refundedAmount: string; refundableAmount: string }>(`/purchase-orders/${refundOrder.id}/refunds`, token); setRefundRows(summary.items); setRefundSummary(summary); } if (selected) await showDetail(selected.id); }
    catch (error) { onError(error instanceof Error ? error.message : '退款处理失败'); }
  }

  async function openPayment(order: Order, type: 'customer' | 'supplier') {
    setPaymentOrder(order); setPaymentType(type); paymentForm.resetFields();
    paymentForm.setFieldsValue({ occurredAt: new Date().toISOString().slice(0, 16), idempotencyKey: crypto.randomUUID(), businessNo: generatePurchaseOrderPayNo() });
    if (type === 'supplier') {
      try { setSupplierAccounts(await request<SupplierAccount[]>(`/suppliers/${order.supplierId}/accounts`, token)); }
      catch (error) { onError(error instanceof Error ? error.message : '一级代理资金账户查询失败'); return; }
    }
    setPaymentOpen(true);
  }

  async function submitPayment(values: { actualAmount: string; businessNo: string; idempotencyKey: string; occurredAt: string; supplierAccountId?: string; remark?: string }) {
    if (!paymentOrder) return;
    const path = `/purchase-orders/${paymentOrder.id}/${paymentType === 'customer' ? 'customer-payment' : 'supplier-payment'}`;
    const body = { ...values, actualAmount: values.actualAmount.trim(), occurredAt: new Date(values.occurredAt).toISOString() };
    try { await request(path, token, { method: 'POST', body: JSON.stringify(body) }); setPaymentOpen(false); await refresh(); if (detailOpen) await showDetail(paymentOrder.id); }
    catch (error) { onError(error instanceof Error ? error.message : '收付款录入失败'); }
  }

  async function openCredit(order: Order) {
    setCreditOrder(order); creditForm.resetFields();
    creditForm.setFieldsValue({ occurredAt: new Date().toISOString().slice(0, 16), idempotencyKey: crypto.randomUUID(), creditAmount: order.customerCreditRemaining || order.customerCreditAmount || '', businessNo: generatePurchaseOrderCreditNo() });
    try { setPromotionAccounts(await request<PromotionAccount[]>(`/customers/${order.customerId}/promotion-accounts`, token)); setCreditOpen(true); }
    catch (error) { onError(error instanceof Error ? error.message : '客户推广账户查询失败'); }
  }

  async function submitCredit(values: { promotionAccountId: string; creditAmount: string; businessNo: string; idempotencyKey: string; occurredAt: string; remark?: string }) {
    if (!creditOrder) return;
    try { await request(`/purchase-orders/${creditOrder.id}/customer-credit`, token, { method: 'POST', body: JSON.stringify({ ...values, creditAmount: values.creditAmount.trim(), occurredAt: new Date(values.occurredAt).toISOString() }) }); setCreditOpen(false); await refresh(); if (detailOpen) await showDetail(creditOrder.id); }
    catch (error) { onError(error instanceof Error ? error.message : '客户账户币到账失败'); }
  }

  const allColumns = [
    { key: 'procurementNo', title: '订单号', dataIndex: 'procurementNo' },
    { key: 'customerId', title: '客户', dataIndex: 'customerId', render: (value: string) => customers.find((item) => item.id === value)?.name || value },
    { key: 'supplierId', title: '供应商', dataIndex: 'supplierId', render: (value: string) => suppliers.find((item) => item.id === value)?.name || value },
    { key: 'platform', title: '平台', dataIndex: 'platform' },
    { key: 'transactionType', title: '交易类型', dataIndex: 'transactionType', render: (value: string) => value === 'TRANSFER_OUT' ? '转出' : '转入' },
    { key: 'businessType', title: '业务类型', dataIndex: 'businessType' },
    { key: 'baseAmount', title: '基准金额', dataIndex: 'baseAmount' },
    { key: 'customerRebate', title: '客户返点', render: (_: unknown, row: Order) => row.customerRebateRate ? `${rebateTypeName[row.customerRebateType || ''] || row.customerRebateType} ${row.customerRebateRate}%` : '未配置' },
    { key: 'supplierCost', title: '成本政策', render: (_: unknown, row: Order) => row.supplierCostRate ? `${rebateTypeName[row.supplierRebateType || ''] || row.supplierRebateType} ${row.supplierCostRate}%` : '未配置' },
    { key: 'status', title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{statusName[value] || value}</Tag> },
    { key: 'action', title: '操作', fixed: 'right' as const, render: (_: unknown, row: Order) => <Space wrap><Button type="link" onClick={() => void showDetail(row.id)}>详情</Button>{row.status === 'DRAFT' && <><Button type="link" onClick={() => void transition(row.id, 'submit')}>提交确认</Button><Button type="link" danger onClick={() => void transition(row.id, 'cancel')}>取消</Button></>}{row.status === 'PENDING_CONFIRMATION' && <><Button type="link" onClick={() => void transition(row.id, 'confirm')}>确认</Button><Button type="link" danger onClick={() => void transition(row.id, 'cancel')}>取消</Button></>}{(row.status === 'CONFIRMED' || row.status === 'SETTLED') && <><Button type="link" onClick={() => void openPayment(row, 'customer')}>录入客户打款</Button><Button type="link" onClick={() => void openCredit(row)}>确认账户币到账</Button><Button type="link" onClick={() => void openPayment(row, 'supplier')}>支付一级代理</Button><Button type="link" onClick={() => void openRefund(row)}>申请退款</Button></>}{row.status === 'CONFIRMED' && <Button type="link" onClick={() => void transition(row.id, 'settle')}>标记已结算</Button>}</Space> },
  ];
  const visibleKeys = new Set(columnConfig.visibleColumns().map((c) => c.key));
  const tableColumns = allColumns.filter((col) => visibleKeys.has(col.key));

  return <Card title="外采订单" extra={<Space><Button icon={<SettingOutlined />} onClick={() => columnConfig.setConfigModalOpen(true)}>自定义表头</Button><Button onClick={() => { listForm.resetFields(); setListFilters({}); void refresh({}); }}>重置</Button><Button type="primary" onClick={() => setModalOpen(true)}>新增订单</Button></Space>} loading={loading}>
    <Form form={listForm} layout="inline" onFinish={(values) => { const next = Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) => [key, String(value).trim()])); setListFilters(next); void refresh(next); }} style={{ marginBottom: 16 }}>
      <Form.Item name="procurementNo" label="订单号"><Input placeholder="订单号" allowClear /></Form.Item>
      <Form.Item name="platform" label="平台"><Select allowClear style={{ width: 120 }} options={platforms} /></Form.Item>
      <Form.Item name="transactionType" label="交易"><Select allowClear style={{ width: 100 }} options={[{ value: 'TRANSFER_IN', label: '转入' }, { value: 'TRANSFER_OUT', label: '转出' }]} /></Form.Item>
      <Form.Item name="status" label="状态"><Select allowClear style={{ width: 130 }} options={Object.entries(statusName).map(([value, label]) => ({ value, label }))} /></Form.Item>
      <Form.Item name="customerId" label="客户"><Select allowClear showSearch optionFilterProp="label" style={{ width: 160 }} options={customers.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
      <Form.Item name="supplierId" label="伙伴"><Select allowClear showSearch optionFilterProp="label" style={{ width: 160 }} options={suppliers.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
      <Form.Item name="businessType" label="业务类型"><Input placeholder="业务类型" allowClear /></Form.Item>
      <Form.Item name="customerPolicyType" label="客户政策"><Select allowClear style={{ width: 130 }} options={[{ value: 'FIXED_ADD', label: '固定返点' }, { value: 'PRIVATE_DIVIDE', label: '私反政策' }]} /></Form.Item>
      <Form.Item name="supplierPolicyType" label="伙伴政策"><Select allowClear style={{ width: 130 }} options={[{ value: 'FIXED_ADD', label: '固定返点' }, { value: 'PRIVATE_DIVIDE', label: '私反政策' }]} /></Form.Item>
      <Form.Item name="startDate" label="开始时间"><Input type="datetime-local" /></Form.Item>
      <Form.Item name="endDate" label="结束时间"><Input type="datetime-local" /></Form.Item>
      <Button htmlType="submit" type="primary">查询</Button>
    </Form>
    <Table rowKey="id" dataSource={orders} pagination={false} columns={tableColumns} />
    <Modal title="新增外采订单" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="保存草稿" cancelText="取消">
      <Form form={form} layout="vertical" onFinish={create} initialValues={{ businessTime: new Date().toISOString().slice(0, 16) }}>
        <Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}><Select showSearch options={customers.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Form.Item name="supplierId" label="供应商" rules={[{ required: true, message: '请选择供应商' }]}><Select showSearch options={suppliers.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Form.Item name="platform" label="平台" rules={[{ required: true, message: '请选择平台' }]}><Select options={platforms} /></Form.Item>
        <Form.Item name="transactionType" label="交易类型" initialValue="TRANSFER_IN" rules={[{ required: true, message: '请选择交易类型' }]}><Select options={[{ value: 'TRANSFER_IN', label: '转入' }, { value: 'TRANSFER_OUT', label: '转出' }]} /></Form.Item>
        <Form.Item name="businessType" label="业务类型"><Input maxLength={50} placeholder="例如：广告充值" /></Form.Item>
        <Form.Item name="subjectId" label="广告主体" rules={[{ required: true, message: '请选择广告主体' }]}><Select showSearch options={subjects.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Form.Item name="accountId" label="广告账户" rules={[{ required: true, message: '请选择广告账户' }]}><Select showSearch options={accountOptions} /></Form.Item>
        <Form.Item name="inboundAccountId" label="转入方账户ID"><Input maxLength={100} /></Form.Item>
        <Form.Item name="inboundAccountName" label="转入方账户名称"><Input maxLength={120} /></Form.Item>
        <Form.Item name="outboundAccountId" label="转出方账户ID"><Input maxLength={100} /></Form.Item>
        <Form.Item name="outboundAccountName" label="转出方账户名称"><Input maxLength={120} /></Form.Item>
        <Form.Item name="cashAccountId" label="公司人民币账户" rules={[{ required: true, message: '请选择公司人民币账户' }]}><Select showSearch options={cashAccounts.map((item) => ({ value: item.id, label: `${item.name}（${item.currency}）` }))} /></Form.Item>
        <Form.Item name="baseAmount" label="基准金额" rules={[{ required: true, message: '请输入基准金额' }, { pattern: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, message: '请输入最多两位小数的金额' }]}><Input placeholder="例如 10000.00" /></Form.Item>
        <Form.Item name="businessTime" label="业务时间" rules={[{ required: true, message: '请选择业务时间' }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="clientRequestId" label="业务幂等号"><Input maxLength={100} /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} showCount /></Form.Item>
      </Form>
    </Modal>
    <Modal title="外采订单详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={900}>{selected && <><Descriptions bordered column={2}><Descriptions.Item label="订单号">{selected.procurementNo}</Descriptions.Item><Descriptions.Item label="状态">{statusName[selected.status] || selected.status}</Descriptions.Item><Descriptions.Item label="账户币基准">{selected.baseCreditAmount || selected.customerCreditAmount || '-'}</Descriptions.Item><Descriptions.Item label="客户返点">{selected.customerRebateRate ? `${rebateTypeName[selected.customerRebateType || ''] || selected.customerRebateType} / ${selected.customerRebateRate}%` : '未配置'}</Descriptions.Item><Descriptions.Item label="客户计算方向">{selected.customerCalculationMode ? calculationModeName[selected.customerCalculationMode] || selected.customerCalculationMode : '-'}</Descriptions.Item><Descriptions.Item label="客户实际收入">{selected.customerCashAmount || selected.customerPaymentAmount || '-'}</Descriptions.Item><Descriptions.Item label="客户应收">{selected.customerReceivable || '-'}</Descriptions.Item><Descriptions.Item label="客户已收">{selected.customerPaidAmount || '0.00'}</Descriptions.Item><Descriptions.Item label="客户未收">{selected.customerReceivableRemaining || '-'}</Descriptions.Item><Descriptions.Item label="客户收款状态">{selected.customerPaymentStatus === 'PAID' ? '已收款' : selected.customerPaymentStatus === 'PARTIAL' ? '部分收款' : '待收款'}</Descriptions.Item><Descriptions.Item label="客户最终额度">{selected.customerCreditAmount || '-'}</Descriptions.Item><Descriptions.Item label="客户账户币已到账">{selected.customerCreditedAmount || '0.00'}</Descriptions.Item><Descriptions.Item label="客户账户币未到账">{selected.customerCreditRemaining || '-'}</Descriptions.Item><Descriptions.Item label="客户账户币状态">{selected.customerCreditStatus === 'PAID' ? '已到账' : selected.customerCreditStatus === 'PARTIAL' ? '部分到账' : '待到账'}</Descriptions.Item><Descriptions.Item label="客户返点金额">{selected.customerRebateAmount || '-'}</Descriptions.Item><Descriptions.Item label="成本点">{selected.supplierCostRate ? `${selected.supplierCostRate}%` : '未配置'}</Descriptions.Item><Descriptions.Item label="成本计算方向">{selected.supplierCalculationMode ? calculationModeName[selected.supplierCalculationMode] || selected.supplierCalculationMode : '-'}</Descriptions.Item><Descriptions.Item label="成本基准金额">{selected.supplierBaseAmount || '-'}</Descriptions.Item><Descriptions.Item label="实际供应商成本">{selected.supplierCashAmount || selected.supplierPaymentAmount || '待计算'}</Descriptions.Item><Descriptions.Item label="成本差额">{selected.costDifference || '待计算'}</Descriptions.Item><Descriptions.Item label="一级代理应付">{selected.supplierPayable || '-'}</Descriptions.Item><Descriptions.Item label="一级代理已付">{selected.supplierPaidAmount || '0.00'}</Descriptions.Item><Descriptions.Item label="一级代理未付">{selected.supplierPayableRemaining || '-'}</Descriptions.Item><Descriptions.Item label="一级代理付款状态">{selected.supplierPaymentStatus === 'PAID' ? '已付款' : selected.supplierPaymentStatus === 'PARTIAL' ? '部分付款' : '待付款'}</Descriptions.Item><Descriptions.Item label="成本优惠金额">{selected.supplierRebateAmount || '-'}</Descriptions.Item><Descriptions.Item label="运营费">{selected.operatingFeeAmount || '0.00'}</Descriptions.Item><Descriptions.Item label="真实毛利">{selected.grossProfit ? `¥${selected.grossProfit}` : '待计算'}</Descriptions.Item><Descriptions.Item label="利润状态">{selected.profitStatus ? profitStatusName[selected.profitStatus] || selected.profitStatus : '待计算'}</Descriptions.Item><Descriptions.Item label="累计已退款">{refundSummary?.refundedAmount || '0.00'}</Descriptions.Item><Descriptions.Item label="当前可退款">{refundSummary?.refundableAmount || '0.00'}</Descriptions.Item></Descriptions><Space style={{ marginTop: 16 }}><Button type="primary" onClick={() => void openPayment(selected, 'customer')}>录入客户打款</Button><Button onClick={() => void openCredit(selected)}>确认账户币到账</Button><Button onClick={() => void openPayment(selected, 'supplier')}>支付一级代理</Button><Button onClick={() => void openRefund(selected)}>申请退款</Button></Space><Alert style={{ marginTop: 16 }} type="info" message="客户人民币付款与账户币到账分开确认；退款只冲减公司人民币账户，不回滚原订单和账户币到账记录。" /><Table style={{ marginTop: 16 }} size="small" rowKey="refundId" dataSource={refundRows} pagination={false} columns={[{ title: '退款单号', dataIndex: 'refundNo' }, { title: '金额', dataIndex: 'refundAmount' }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{refundStatusName[value] || value}</Tag> }, { title: '原因', dataIndex: 'refundReason' }, { title: '操作', render: (_: unknown, row: Refund) => <Space>{row.status === 'PENDING' && <><Button type="link" onClick={() => void processRefund(row.refundId, 'approve')}>审批</Button><Button type="link" danger onClick={() => void processRefund(row.refundId, 'reject')}>驳回</Button></>}{row.status === 'APPROVED' && <Button type="link" onClick={() => void processRefund(row.refundId, 'execute')}>执行退款</Button>}</Space> }]} /></>}</Modal>
    <Modal title="申请客户退款" open={refundOpen} onCancel={() => setRefundOpen(false)} onOk={() => refundForm.submit()} okText="提交申请" cancelText="取消">
      <Form form={refundForm} layout="vertical" onFinish={submitRefund}>
        <Alert type="info" message={`客户已收 ${refundSummary?.paidAmount || '0.00'}，已退款 ${refundSummary?.refundedAmount || '0.00'}，当前可退款 ${refundSummary?.refundableAmount || '0.00'}`} />
        <Form.Item name="refundAmount" label="退款金额（CNY）" rules={[{ required: true, message: '请输入退款金额' }, { pattern: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, message: '请输入最多两位小数的金额' }]}><Input /></Form.Item>
        <Form.Item name="refundReason" label="退款原因" rules={[{ required: true, message: '请输入退款原因' }]}><Input.TextArea maxLength={255} showCount /></Form.Item>
        <Form.Item name="idempotencyKey" label="幂等键" rules={[{ required: true, message: '请输入幂等键' }]}><Input /></Form.Item>
      </Form>
    </Modal>
    <Modal title={paymentType === 'customer' ? '录入客户打款' : '支付一级代理'} open={paymentOpen} onCancel={() => setPaymentOpen(false)} onOk={() => paymentForm.submit()} okText="确认入账" cancelText="取消">
      <Form form={paymentForm} layout="vertical" onFinish={submitPayment}>
        {paymentType === 'supplier' && <Form.Item name="supplierAccountId" label="一级代理人民币账户" rules={[{ required: true, message: '请选择一级代理人民币账户' }]}><Select options={supplierAccounts.filter((item) => item.currency === 'CNY' && item.status === 'ACTIVE').map((item) => ({ value: item.id, label: `${item.accountName}（余额 ${item.currentBalance}）` }))} /></Form.Item>}
        <Form.Item name="actualAmount" label="实际金额（CNY）" rules={[{ required: true, message: '请输入实际金额' }, { pattern: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, message: '请输入最多两位小数的正数金额' }]}><Input placeholder="例如 5000.00" /></Form.Item>
        <Form.Item name="businessNo" label="业务单号" rules={[{ required: true, message: '请输入业务单号' }]}><Input disabled /></Form.Item>
        <Form.Item name="idempotencyKey" label="幂等键" rules={[{ required: true, message: '请输入幂等键' }]}><Input /></Form.Item>
        <Form.Item name="occurredAt" label={paymentType === 'customer' ? '收款时间' : '付款时间'} rules={[{ required: true, message: '请选择时间' }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} showCount /></Form.Item>
      </Form>
    </Modal>
    <Modal title="确认客户账户币到账" open={creditOpen} onCancel={() => setCreditOpen(false)} onOk={() => creditForm.submit()} okText="确认到账" cancelText="取消">
      <Form form={creditForm} layout="vertical" onFinish={submitCredit}>
        <Form.Item name="promotionAccountId" label="客户推广账户" rules={[{ required: true, message: '请选择客户推广账户' }]}><Select options={promotionAccounts.filter((item) => item.unit === 'ACCOUNT_CREDIT' && item.status === 'ACTIVE').map((item) => ({ value: item.id, label: `${item.accountName}（余额 ${item.currentBalance}）` }))} /></Form.Item>
        <Form.Item name="creditAmount" label="到账账户币金额" rules={[{ required: true, message: '请输入到账金额' }, { pattern: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, message: '请输入最多两位小数的金额' }]}><Input /></Form.Item>
        <Form.Item name="businessNo" label="业务单号" rules={[{ required: true, message: '请输入业务单号' }]}><Input disabled /></Form.Item>
        <Form.Item name="idempotencyKey" label="幂等键" rules={[{ required: true, message: '请输入幂等键' }]}><Input /></Form.Item>
        <Form.Item name="occurredAt" label="到账时间" rules={[{ required: true, message: '请选择到账时间' }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} showCount /></Form.Item>
      </Form>
    </Modal>
    <ColumnConfigModal
      open={columnConfig.configModalOpen}
      columns={columnConfig.columns}
      loading={columnConfig.loading}
      onCancel={() => columnConfig.setConfigModalOpen(false)}
      onSave={(cols) => { void columnConfig.saveConfig(cols); columnConfig.setConfigModalOpen(false); }}
      onReset={() => { void columnConfig.resetConfig(); }}
    />
  </Card>;
}
