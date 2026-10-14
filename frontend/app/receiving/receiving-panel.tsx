'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../utils/api';
import { MinusCircleOutlined, PlusOutlined, DownloadOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { downloadExcel } from '../utils/export';
import { Button, Card, DatePicker, Descriptions, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { PermissionActions } from '../utils/permissions';

type Customer = { id: string; name: string; customerCode: string };
type BankTransaction = { id: string; transactionNo: string; account?: { id?: string; name: string; accountCode: string }; occurredAt: string; direction: string; amount: string; counterpartyName?: string; status: string; matchedCustomer?: { name: string }; receiveRecord?: { id: string; receiveNo: string; status: string } };
type ReceiveDetail = { id: string; type: 'PUBLIC' | 'PRIVATE'; amount: string };
type ReceiveRecord = { id: string; receiveNo: string; amount: string; customerId?: string; receivedAt: string; status: string; remark?: string; updatedAt: string; customer?: { id?: string; name: string; customerCode: string }; bankTransaction?: { transactionNo: string; counterpartyName?: string }; account?: { id: string; name: string; accountCode: string }; creator?: { displayName: string }; confirmer?: { displayName: string }; details?: ReceiveDetail[] };

const bankStatus: Record<string, string> = { UNPROCESSED: '未处理', CONFIRMING: '确认中', CONFIRMED: '已到账', MATCHED: '已匹配', RECEIPT_CREATED: '已生成收款', RECEIPT_CONFIRMED: '已确认到账', IGNORED: '已忽略' };
const receiveStatus: Record<string, string> = { PENDING_MATCH: '待匹配', PENDING_CONFIRMATION: '待审核', CONFIRMED: '已回款', CANCELLED: '已取消' };
const receiveStatusColor: Record<string, string> = { PENDING_MATCH: 'gold', PENDING_CONFIRMATION: 'orange', CONFIRMED: 'green', CANCELLED: 'default' };
const directionName: Record<string, string> = { INCOME: '收入', EXPENSE: '支出' };
const amountToCents = (value?: string) => {
  const [integer = '0', decimal = ''] = String(value || '').trim().replace(/^\+/, '').split('.');
  if (!/^\d+$/.test(integer) || (decimal && !/^\d{1,2}$/.test(decimal))) return null;
  return Number(integer) * 100 + Number((decimal + '00').slice(0, 2));
};
const centsToAmount = (value: number) => `${Math.trunc(value / 100)}.${Math.abs(value % 100).toString().padStart(2, '0')}`;

export default function ReceivingPanel({ token, customers, perm, onError }: { token: string; customers: Customer[]; perm?: PermissionActions; onError: (message: string) => void }) {
  const canConfirm = perm?.canConfirm ?? true;
  const [tab, setTab] = useState('receive');
  const [banks, setBanks] = useState<BankTransaction[]>([]);
  const [receives, setReceives] = useState<ReceiveRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [postingOpen, setPostingOpen] = useState(false);
  const [feeEditOpen, setFeeEditOpen] = useState(false);
  const [feeEditValue, setFeeEditValue] = useState("0.00");
  const [detail, setDetail] = useState<ReceiveRecord | null>(null);
  const [selectedReceive, setSelectedReceive] = useState<ReceiveRecord | null>(null);
  const [feeConfig, setFeeConfig] = useState<any>(null);
  const [form] = Form.useForm();
  const [bankFilterForm] = Form.useForm();
  const [receiveFilterForm] = Form.useForm();
  const [postingForm] = Form.useForm();
  const postingDetails = Form.useWatch('details', postingForm) as { type?: 'PUBLIC' | 'PRIVATE'; amount?: string }[] | undefined;
  const currentServiceFee = Form.useWatch("serviceFeeAmount", postingForm) as string | undefined;
  const allocatedCents = (postingDetails || []).reduce((total, item) => total + (amountToCents(item.amount) || 0), 0);
  const receiveCents = amountToCents(selectedReceive?.amount) || 0;
  const feeCents = amountToCents(currentServiceFee) || 0;
  const walletCreditCents = receiveCents - feeCents;
  const remainingCents = receiveCents - allocatedCents;

  async function refresh(receiveQuery = '', bankQuery = '') {
    setLoading(true);
    try {
      const [receiveResult, bankResult] = await Promise.all([
        apiRequest<{ items: ReceiveRecord[] }>(`/receive-records?page=1&pageSize=100${receiveQuery ? `&${receiveQuery}` : ''}`, token),
        apiRequest<{ items: BankTransaction[] }>(`/bank-transactions?page=1&pageSize=100${bankQuery ? `&${bankQuery}` : ''}`, token),
      ]);
      setReceives(receiveResult.items);
      setBanks(bankResult.items);
    } catch (error) { onError(error instanceof Error ? error.message : '收款数据查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [token]);

  async function importBank(values: { accountId: string; occurredAt: any; direction: string; amount: string; source: string; externalTransactionId: string; counterpartyName?: string; summary?: string }) {
    try {
      const payload = { ...values, occurredAt: values.occurredAt ? values.occurredAt.toISOString() : undefined };
      await apiRequest('/bank-transactions/import', token, { method: 'POST', body: JSON.stringify({ items: [payload] }) });
      setImportOpen(false); form.resetFields(); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '银行交易导入失败'); }
  }

  async function createReceive(values: { bankTransactionId: string; remark?: string }) {
    try { await apiRequest('/receive-records', token, { method: 'POST', body: JSON.stringify(values) }); setReceiveOpen(false); form.resetFields(); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '回款单创建失败'); }
  }

  async function confirmReceive(values: { serviceFeeAmount?: string; remark?: string; details: { type: 'PUBLIC' | 'PRIVATE'; amount: string }[] }) {
    if (!selectedReceive) return;
    if (remainingCents !== 0) { onError('入账明细金额合计必须等于本次流水金额'); return; }
    try {
      await apiRequest(`/receive-records/${selectedReceive.id}/confirm`, token, { method: 'POST', body: JSON.stringify(values) });
      setPostingOpen(false); postingForm.resetFields(); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '确认收款失败'); }
  }

  async function openPosting(row: ReceiveRecord) {
    setSelectedReceive(row);
    setFeeConfig(null);
    let feeAmount = '0.00';
    const cid = row.customerId || (row.customer && row.customer.id);
    if (cid) {
      try {
        const config = await apiRequest(`/service-fee-configs/customer/${cid}`, token);
        if (config && parseFloat(config.rate) > 0) {
          feeAmount = (parseFloat(row.amount) * parseFloat(config.rate) / 100).toFixed(2);
        }
        if (config) setFeeConfig(config);
      } catch (e) {}
    }
    postingForm.setFieldsValue({ serviceFeeAmount: feeAmount, details: [{ type: 'PUBLIC', amount: row.amount }] });
    setFeeEditValue(feeAmount);
    setPostingOpen(true);
  }

  function confirmFeeEdit() {
    postingForm.setFieldsValue({ serviceFeeAmount: feeEditValue });
    setFeeEditOpen(false);
  }

  async function showReceiveDetail(id: string) {
    try { setDetail(await apiRequest<ReceiveRecord>(`/receive-records/${id}`, token)); setDetailOpen(true); }
    catch (error) { onError(error instanceof Error ? error.message : '收款详情查询失败'); }
  }

  async function filterReceive(values: Record<string, any>) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== 'all') { if (k === 'dateRange' && Array.isArray(v) && v[0] && v[1]) { params.set('startDate', v[0].toISOString()); params.set('endDate', v[1].toISOString()); } else if (k !== 'dateRange') { params.set(k, String(v)); } } });
    await refresh(params.toString());
  }

  const filteredReceives = useMemo(() => {
    const fv = receiveFilterForm.getFieldsValue();
    const payer = (fv.payerName || '').toString().trim();
    const nature = fv.nature;
    return receives.filter((row) => {
      if (payer) {
        const payerText = row.bankTransaction?.counterpartyName || row.customer?.name || '';
        if (!payerText.includes(payer)) return false;
      }
      if (nature && nature !== 'all') {
        const hasNature = row.details?.some((d) => d.type === nature);
        if (!hasNature) return false;
      }
      return true;
    });
  }, [receives, receiveFilterForm]);

  const summaryRows = useMemo(() => {
    const map = new Map<string, { key: string; customerId: string; customerName: string; groupNo: string; total: number; paid: number; unpaid: number; count: number; items: ReceiveRecord[] }>();
    for (const row of filteredReceives) {
      const cid = row.customerId || row.customer?.id || 'unmatched';
      const cname = row.customer?.name || '待匹配';
      const ccode = row.customer?.customerCode || '-';
      if (!map.has(cid)) map.set(cid, { key: cid, customerId: cid, customerName: cname, groupNo: ccode, total: 0, paid: 0, unpaid: 0, count: 0, items: [] });
      const g = map.get(cid)!;
      g.total += amountToCents(row.amount) || 0;
      if (row.status === 'CONFIRMED') g.paid += amountToCents(row.amount) || 0;
      else g.unpaid += amountToCents(row.amount) || 0;
      g.count += 1;
      g.items.push(row);
    }
    return Array.from(map.values()).map((g) => ({ ...g, total: centsToAmount(g.total), paid: centsToAmount(g.paid), unpaid: centsToAmount(g.unpaid) }));
  }, [filteredReceives]);

  const availableBanks = banks.filter((b) => b.status === 'RECEIPT_CONFIRMED' && (!b.receiveRecord || b.receiveRecord.status === 'CANCELLED'));

  const detailColumns = [
    { title: <span style={{ whiteSpace: 'nowrap' }}>回款单号</span>, dataIndex: 'receiveNo', width: 150, render: (v: string) => <Typography.Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Typography.Text> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>备注</span>, dataIndex: 'remark', width: 90, render: (v?: string) => v || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>状态</span>, dataIndex: 'status', width: 90, render: (v: string) => <Tag color={receiveStatusColor[v]}>{receiveStatus[v] || v}</Tag> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>充值类型</span>, width: 90, render: () => <Tag color="blue">充值</Tag> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>打款人</span>, width: 150, ellipsis: true, render: (_: unknown, row: ReceiveRecord) => row.bankTransaction?.counterpartyName || row.customer?.name || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>账户类型</span>, width: 100, render: (_: unknown, row: ReceiveRecord) => row.details?.length ? row.details.map((d) => <Tag key={d.id} color={d.type === 'PUBLIC' ? 'purple' : 'cyan'}>{d.type === 'PUBLIC' ? '对公账户' : '对私账户'}</Tag>) : '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>回款金额</span>, dataIndex: 'amount', width: 110, render: (v: string) => <b>{v}</b> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>收款账户</span>, width: 150, ellipsis: true, render: (_: unknown, row: ReceiveRecord) => row.account?.name || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>更新时间</span>, dataIndex: 'updatedAt', width: 140, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    { title: <span style={{ whiteSpace: 'nowrap' }}>更新者</span>, width: 90, render: (_: unknown, row: ReceiveRecord) => row.confirmer?.displayName || row.creator?.displayName || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>销售姓名</span>, width: 110, render: (_: unknown, row: ReceiveRecord) => row.creator?.displayName || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>操作</span>, fixed: 'right' as const, width: 160, render: (_: unknown, row: ReceiveRecord) => <Space size={0}><Button type="link" size="small" onClick={() => void showReceiveDetail(row.id)}>详情</Button>{row.status === 'PENDING_CONFIRMATION' && canConfirm && <Button type="link" size="small" onClick={() => void openPosting(row)}>确认入账</Button>}</Space> },
  ];

  const summaryColumns = [
    { title: <span style={{ whiteSpace: 'nowrap' }}>客户姓名</span>, dataIndex: 'customerName', width: 160, ellipsis: true },
    { title: <span style={{ whiteSpace: 'nowrap' }}>群号</span>, dataIndex: 'groupNo', width: 110 },
    { title: <span style={{ whiteSpace: 'nowrap' }}>总回款金额</span>, dataIndex: 'total', width: 130, render: (v: string) => <b>{v}</b> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>已回款金额</span>, dataIndex: 'paid', width: 130, render: (v: string) => <span style={{ color: '#10b981' }}>{v}</span> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>未回款金额</span>, dataIndex: 'unpaid', width: 130, render: (v: string) => <span style={{ color: '#ef4444' }}>{v}</span> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>明细笔数</span>, dataIndex: 'count', width: 100, render: (v: number) => <Tag>{v}</Tag> },
  ];

  return <Card title="收款管理" loading={loading}>
    <Form form={receiveFilterForm} layout="inline" onFinish={(values) => void filterReceive(values)} style={{ marginBottom: 16, rowGap: 12 }}>
      <Form.Item name="receiveNo"><Input placeholder="请输入回款单号" style={{ width: 200 }} /></Form.Item>
      <Form.Item name="payerName"><Input placeholder="请输入打款人" style={{ width: 180 }} /></Form.Item>
      <Form.Item name="accountId"><Select allowClear placeholder="请选择收款账户" style={{ width: 180 }} options={Array.from(new Map(banks.filter((b) => b.account).map((b) => [b.account!.id || b.account!.accountCode, b.account!])).values()).map((a) => ({ value: a.id || a.accountCode, label: a.name }))} /></Form.Item>
      <Form.Item name="customerId"><Select allowClear showSearch optionFilterProp="label" placeholder="请选择客户" style={{ width: 200 }} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item>
      <Form.Item name="nature"><Select allowClear placeholder="账户分类" style={{ width: 140 }} options={[{ value: 'PUBLIC', label: '对公账户' }, { value: 'PRIVATE', label: '对私账户' }]} /></Form.Item>
      <Form.Item name="status"><Select allowClear placeholder="状态" style={{ width: 140 }} options={Object.entries(receiveStatus).map(([value, label]) => ({ value, label }))} /></Form.Item>
      <Form.Item name="dateRange"><DatePicker.RangePicker style={{ width: 260 }} format="YYYY年MM月DD日" placeholder={['业务开始时间', '业务结束时间']} /></Form.Item>
      <Form.Item><Space><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>搜索</Button><Button icon={<ReloadOutlined />} onClick={() => { receiveFilterForm.resetFields(); void refresh(); }}>重置</Button></Space></Form.Item>
    </Form>
    <Space style={{ marginBottom: 16 }} wrap>
      <Button type="primary" onClick={() => setReceiveOpen(true)}>新增</Button>
      <Button onClick={() => setImportOpen(true)}>导入银行交易</Button>
      <Button icon={<DownloadOutlined />} onClick={async () => { try { await downloadExcel('/receive-records/export', token, '收款记录.xlsx'); } catch (e: any) { onError(e.message); } }}>导出</Button>
    </Space>
    <Tabs activeKey={tab} onChange={setTab} items={[{ key: 'receive', label: '回款记录' }, { key: 'bank', label: '银行交易' }]} />
    {tab === 'receive' && <>
      <Table rowKey="key" dataSource={summaryRows} pagination={false} scroll={{ x: 760 }} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" dataSource={row.items} pagination={false} scroll={{ x: 1500 }} columns={detailColumns} />, rowExpandable: (row) => row.count > 0 }} columns={summaryColumns} />
    </>}
    {tab === 'bank' && <>
      <Form form={bankFilterForm} layout="inline" onFinish={async (values) => { const params = new URLSearchParams(Object.entries(values).filter(([, v]) => Boolean(v)) as [string, string][]); await refresh('', params.toString()); }} style={{ marginBottom: 16, rowGap: 12 }}><Form.Item name="accountId"><Input placeholder="银行账户ID" /></Form.Item><Form.Item name="direction"><Select allowClear placeholder="交易方向" style={{ width: 120 }} options={[{ value: 'INCOME', label: '收入' }, { value: 'EXPENSE', label: '支出' }]} /></Form.Item><Form.Item name="status"><Select allowClear placeholder="交易状态" style={{ width: 150 }} options={Object.entries(bankStatus).map(([value, label]) => ({ value, label }))} /></Form.Item><Form.Item name="counterpartyName"><Input placeholder="对方名称" /></Form.Item><Form.Item name="keyword"><Input placeholder="交易编号/摘要" /></Form.Item><Form.Item><Space><Button htmlType="submit" type="primary">查询</Button><Button onClick={() => { bankFilterForm.resetFields(); void refresh(); }}>重置</Button></Space></Form.Item></Form>
      <Table rowKey="id" dataSource={banks} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }} scroll={{ x: 1200 }} columns={[
        { title: <span style={{ whiteSpace: 'nowrap' }}>交易编号</span>, dataIndex: 'transactionNo', width: 150, render: (v: string) => <Typography.Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Typography.Text> },
        { title: <span style={{ whiteSpace: 'nowrap' }}>交易时间</span>, dataIndex: 'occurredAt', width: 160, render: (value: string) => new Date(value).toLocaleString('zh-CN') },
        { title: <span style={{ whiteSpace: 'nowrap' }}>方向</span>, dataIndex: 'direction', width: 80, render: (value: string) => directionName[value] || value },
        { title: <span style={{ whiteSpace: 'nowrap' }}>金额</span>, dataIndex: 'amount', width: 110 },
        { title: <span style={{ whiteSpace: 'nowrap' }}>对方名称</span>, dataIndex: 'counterpartyName', width: 160, ellipsis: true, render: (v?: string) => v || '-' },
        { title: <span style={{ whiteSpace: 'nowrap' }}>客户</span>, width: 140, render: (_: unknown, row: BankTransaction) => row.matchedCustomer?.name || '待匹配' },
        { title: <span style={{ whiteSpace: 'nowrap' }}>状态</span>, dataIndex: 'status', width: 110, render: (value: string) => <Tag>{bankStatus[value] || value}</Tag> },
        { title: <span style={{ whiteSpace: 'nowrap' }}>收款账户</span>, width: 150, ellipsis: true, render: (_: unknown, row: BankTransaction) => row.account?.name || '-' },
      ]} />
    </>}
    <Modal title="新增回款单" open={receiveOpen} onCancel={() => setReceiveOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消"><Form form={form} layout="vertical" onFinish={createReceive}><Form.Item name="bankTransactionId" label="银行交易（已确认到账）" rules={[{ required: true, message: '请选择银行交易' }]}><Select placeholder={availableBanks.length ? '请选择银行交易' : '暂无已确认到账的银行交易，请先导入并确认到账'} options={availableBanks.map((b) => ({ value: b.id, label: `${b.transactionNo}  ${b.amount}  ${b.counterpartyName || ''}  ${b.account?.name || ''}` }))} showSearch optionFilterProp="label" /></Form.Item><Form.Item name="remark" label="备注"><Input /></Form.Item></Form></Modal>
    <Modal title="导入银行交易" open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => form.submit()} okText="导入" cancelText="取消"><Form form={form} layout="vertical" onFinish={importBank}><Form.Item name="accountId" label="银行账户ID" rules={[{ required: true, message: '请输入银行账户ID' }]}><Input placeholder="请输入账户ID" /></Form.Item><Form.Item name="occurredAt" label="交易时间" rules={[{ required: true, message: '请选择交易时间' }]}><DatePicker showTime style={{ width: '100%' }} format="YYYY年MM月DD日 HH:mm:ss" placeholder="请选择交易时间" /></Form.Item><Form.Item name="direction" label="交易方向" initialValue="INCOME"><Select options={[{ value: 'INCOME', label: '收入' }, { value: 'EXPENSE', label: '支出' }]} /></Form.Item><Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}><Input /></Form.Item><Form.Item name="source" label="来源" initialValue="MANUAL" rules={[{ required: true, message: '请选择来源' }]}><Select options={[{ value: 'MANUAL', label: '手工录入' }, { value: 'IMPORT', label: '文件导入' }, { value: 'API', label: '接口同步' }, { value: 'BANK_API', label: '银行直连' }]} /></Form.Item><Form.Item name="externalTransactionId" label="原始交易编号" rules={[{ required: true, message: '请输入原始交易编号' }]}><Input /></Form.Item><Form.Item name="counterpartyName" label="对方名称"><Input /></Form.Item><Form.Item name="summary" label="摘要"><Input /></Form.Item></Form></Modal>
    <Modal title={selectedReceive ? `确认入账：${selectedReceive.receiveNo}` : '确认入账'} open={postingOpen} onCancel={() => setPostingOpen(false)} onOk={() => postingForm.submit()} okText="确认入账" cancelText="取消"><Form form={postingForm} layout="vertical" onFinish={confirmReceive}><Descriptions size="small" bordered column={1}><Descriptions.Item label="本次流水金额">{selectedReceive?.amount}</Descriptions.Item><Descriptions.Item label="已分配金额">{centsToAmount(allocatedCents)}</Descriptions.Item><Descriptions.Item label="剩余未分配金额"><Typography.Text type={remainingCents === 0 ? 'success' : 'danger'}>{centsToAmount(remainingCents)}</Typography.Text></Descriptions.Item></Descriptions><Typography.Paragraph style={{marginBottom:8}}>服务费：¥{centsToAmount(feeCents)} <Button type="link" size="small" onClick={() => { setFeeEditValue(centsToAmount(feeCents)); setFeeEditOpen(true); }}>修改</Button> 实际入账：¥{centsToAmount(walletCreditCents)}</Typography.Paragraph><Form.Item name="serviceFeeAmount" hidden><Input /></Form.Item><Form.List name="details" rules={[{ validator: async (_, value) => { if (!value?.length) return Promise.reject(new Error('至少需要一条入账明细')); return Promise.resolve(); } }]}>{(fields, { add, remove }) => <><div style={{ marginBottom: 8 }}>入账明细（对公款自动生成发票任务；对私款不生成）</div>{fields.map(({ key, name, ...restField }) => <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}><Form.Item {...restField} name={[name, 'type']} rules={[{ required: true, message: '请选择入账类型' }]}><Select style={{ width: 130 }} options={[{ value: 'PUBLIC', label: 'PUBLIC（对公）' }, { value: 'PRIVATE', label: 'PRIVATE（对私）' }]} /></Form.Item><Form.Item {...restField} name={[name, 'amount']} rules={[{ required: true, message: '请输入金额' }]}><Input placeholder="金额" /></Form.Item>{fields.length > 1 && <MinusCircleOutlined onClick={() => remove(name)} />}</Space>)}<Button type="dashed" onClick={() => add({ type: 'PRIVATE', amount: centsToAmount(remainingCents > 0 ? remainingCents : 0) })} icon={<PlusOutlined />}>添加明细</Button></>}</Form.List><Form.Item name="remark" label="备注"><Input /></Form.Item></Form></Modal>
    <Modal title="收款详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null}>{detail && <Descriptions bordered column={1}><Descriptions.Item label="收款编号">{detail.receiveNo}</Descriptions.Item><Descriptions.Item label="客户">{detail.customer?.name || '待匹配'}</Descriptions.Item><Descriptions.Item label="金额">{detail.amount}</Descriptions.Item><Descriptions.Item label="入账性质">{detail.details?.map((item) => `${item.type === 'PUBLIC' ? '对公' : '对私'} ${item.amount}`).join(' / ') || '-'}</Descriptions.Item><Descriptions.Item label="收款时间">{new Date(detail.receivedAt).toLocaleString('zh-CN')}</Descriptions.Item><Descriptions.Item label="银行交易">{detail.bankTransaction?.transactionNo || '-'}</Descriptions.Item><Descriptions.Item label="状态">{receiveStatus[detail.status] || detail.status}</Descriptions.Item></Descriptions>}</Modal>
    <Modal title="修改服务费" open={feeEditOpen} onCancel={() => setFeeEditOpen(false)} onOk={confirmFeeEdit} okText="确认" cancelText="取消" width={400}><div style={{marginBottom:8}}>流水金额：{selectedReceive?.amount}</div><Input value={feeEditValue} onChange={(e) => setFeeEditValue(e.target.value)} placeholder="服务费金额" style={{marginBottom:8}} /><Typography.Text type="secondary">实际入账：{centsToAmount(receiveCents - (amountToCents(feeEditValue) || 0))}</Typography.Text></Modal>
  </Card>;
}
