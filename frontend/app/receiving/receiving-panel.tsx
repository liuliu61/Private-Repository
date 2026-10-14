'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../utils/api';
import { MinusCircleOutlined, PlusOutlined, DownloadOutlined, SearchOutlined, ReloadOutlined, UploadOutlined, EyeOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons';
import { downloadExcel } from '../utils/export';
import { Button, Card, DatePicker, Descriptions, Form, Input, Modal, Select, Space, Table, Tag, Typography, Upload } from 'antd';
import dayjs from 'dayjs';
import type { PermissionActions } from '../utils/permissions';

type Customer = { id: string; name: string; customerCode: string };
type Account = { id: string; name: string; accountCode: string; status: string };
type ReceiveDetail = { id: string; type: 'PUBLIC' | 'PRIVATE'; amount: string };
type ReceiveRecord = { id: string; receiveNo: string; amount: string; customerId?: string; receivedAt: string; status: string; remark?: string; updatedAt: string; payerName?: string; screenshotUrl?: string; customer?: { id?: string; name: string; customerCode: string; salesPerson?: string }; bankTransaction?: { transactionNo: string; counterpartyName?: string }; account?: { id: string; name: string; accountCode: string }; creator?: { displayName: string }; confirmer?: { displayName: string }; details?: ReceiveDetail[] };

const receiveStatus: Record<string, string> = { PENDING_MATCH: '待匹配', PENDING_CONFIRMATION: '待审核', CONFIRMED: '已回款', CANCELLED: '已取消' };
const receiveStatusColor: Record<string, string> = { PENDING_MATCH: 'gold', PENDING_CONFIRMATION: 'orange', CONFIRMED: 'green', CANCELLED: 'default' };
const amountToCents = (value?: string) => {
  const [integer = '0', decimal = ''] = String(value || '').trim().replace(/^\+/, '').split('.');
  if (!/^\d+$/.test(integer) || (decimal && !/^\d{1,2}$/.test(decimal))) return null;
  return Number(integer) * 100 + Number((decimal + '00').slice(0, 2));
};
const centsToAmount = (value: number) => `${Math.trunc(value / 100)}.${Math.abs(value % 100).toString().padStart(2, '0')}`;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function ReceivingPanel({ token, customers, perm, onError }: { token: string; customers: Customer[]; perm?: PermissionActions; onError: (message: string) => void }) {
  const canConfirm = perm?.canConfirm ?? true;
  const canCreate = perm?.canCreate ?? true;
  const [receives, setReceives] = useState<ReceiveRecord[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<ReceiveRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReceiveRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [postingOpen, setPostingOpen] = useState(false);
  const [feeEditOpen, setFeeEditOpen] = useState(false);
  const [feeEditValue, setFeeEditValue] = useState("0.00");
  const [detail, setDetail] = useState<ReceiveRecord | null>(null);
  const [selectedReceive, setSelectedReceive] = useState<ReceiveRecord | null>(null);
  const [feeConfig, setFeeConfig] = useState<any>(null);
  const [screenshotView, setScreenshotView] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [receiveFilterForm] = Form.useForm();
  const [postingForm] = Form.useForm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const newShotUrl = Form.useWatch('screenshotUrl', form) as string | undefined;
  const editShotUrl = Form.useWatch('screenshotUrl', editForm) as string | undefined;
  const postingDetails = Form.useWatch('details', postingForm) as { type?: 'PUBLIC' | 'PRIVATE'; amount?: string }[] | undefined;
  const currentServiceFee = Form.useWatch("serviceFeeAmount", postingForm) as string | undefined;
  const allocatedCents = (postingDetails || []).reduce((total, item) => total + (amountToCents(item.amount) || 0), 0);
  const receiveCents = amountToCents(selectedReceive?.amount) || 0;
  const feeCents = amountToCents(currentServiceFee) || 0;
  const walletCreditCents = receiveCents - feeCents;
  const remainingCents = receiveCents - allocatedCents;

  async function refresh(receiveQuery = '') {
    setLoading(true);
    try {
      const receiveResult = await apiRequest<{ items: ReceiveRecord[] }>(`/receive-records?page=1&pageSize=100${receiveQuery ? `&${receiveQuery}` : ''}`, token);
      setReceives(receiveResult.items);
    } catch (error) { onError(error instanceof Error ? error.message : '收款数据查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [token]);

  useEffect(() => {
    apiRequest<Account[]>(`/accounts?page=1&pageSize=100`, token)
      .then((list) => setAccounts(Array.isArray(list) ? list.filter((a) => a.status === 'ACTIVE') : []))
      .catch(() => setAccounts([]));
  }, [token]);

  async function uploadScreenshot(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/receive-screenshots/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
    if (!res.ok) {
      let msg = `上传失败 (${res.status})`;
      try { const err = await res.json(); msg = err.message || err.error || msg; } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    return data.url as string;
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, setter: (url: string) => void) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { const url = await uploadScreenshot(file); setter(url); }
    catch (error) { onError(error instanceof Error ? error.message : '截图上传失败'); }
    finally { setUploading(false); }
  }

  function renderScreenshotUpload(value: string | undefined, setter: (url: string) => void, inputRef: React.RefObject<HTMLInputElement | null>) {
    return <Space direction="vertical" size={4} style={{ width: '100%' }}>
      {value && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><img src={value} alt="回款截图" style={{ maxWidth: 140, maxHeight: 90, borderRadius: 6, border: '1px solid #e5e7eb', objectFit: 'contain', cursor: 'pointer' }} onClick={() => setScreenshotView(value)} /><Button size="small" type="link" onClick={() => setter('')}>移除</Button></div>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" style={{ display: 'none' }} onChange={(e) => void handleUpload(e, setter)} />
      <Button size="small" icon={<UploadOutlined />} loading={uploading} onClick={() => inputRef.current?.click()}>{value ? '重新上传' : '上传回款截图'}</Button>
    </Space>;
  }

  async function createManual(values: { customerId: string; accountId: string; amount: string; payerName?: string; nature?: string; receivedAt?: any; remark?: string; screenshotUrl?: string }) {
    try {
      const payload = { ...values, receivedAt: values.receivedAt ? values.receivedAt.toISOString() : undefined };
      await apiRequest('/receive-records/manual', token, { method: 'POST', body: JSON.stringify(payload) });
      setReceiveOpen(false); form.resetFields(); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '回款单创建失败'); }
  }

  async function updateReceive(values: { payerName?: string; amount?: string; nature?: string; receivedAt?: any; remark?: string; screenshotUrl?: string }) {
    if (!editRow) return;
    try {
      const payload: any = {};
      if (values.payerName !== undefined) payload.payerName = values.payerName;
      if (values.amount !== undefined) payload.amount = values.amount;
      if (values.nature !== undefined) payload.nature = values.nature;
      if (values.receivedAt !== undefined) payload.receivedAt = values.receivedAt.toISOString();
      if (values.remark !== undefined) payload.remark = values.remark;
      if (values.screenshotUrl !== undefined) payload.screenshotUrl = values.screenshotUrl;
      await apiRequest(`/receive-records/${editRow.id}/update`, token, { method: 'POST', body: JSON.stringify(payload) });
      setEditOpen(false); editForm.resetFields(); setEditRow(null); await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '回款单编辑失败'); }
  }

  async function doCancel(row: ReceiveRecord) {
    try {
      await apiRequest(`/receive-records/${row.id}/cancel`, token, { method: 'POST' });
      setCancelTarget(null);
      await refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '撤回失败'); }
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

  function openEdit(row: ReceiveRecord) {
    setEditRow(row);
    editForm.setFieldsValue({
      payerName: row.payerName || row.bankTransaction?.counterpartyName || '',
      amount: row.amount,
      nature: row.details?.[0]?.type,
      receivedAt: row.receivedAt ? dayjs(row.receivedAt) : undefined,
      remark: row.remark || '',
      screenshotUrl: row.screenshotUrl || '',
    });
    setEditOpen(true);
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
        const payerText = row.payerName || row.bankTransaction?.counterpartyName || row.customer?.name || '';
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

  const editable = (row: ReceiveRecord) => row.status === 'PENDING_CONFIRMATION' || row.status === 'PENDING_MATCH';

  const detailColumns = [
    { title: <span style={{ whiteSpace: 'nowrap' }}>回款单号</span>, dataIndex: 'receiveNo', width: 150, render: (v: string) => <Typography.Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Typography.Text> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>备注</span>, dataIndex: 'remark', width: 90, render: (v?: string) => v || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>状态</span>, dataIndex: 'status', width: 90, render: (v: string) => <Tag color={receiveStatusColor[v]}>{receiveStatus[v] || v}</Tag> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>充值类型</span>, width: 90, render: () => <Tag color="blue">充值</Tag> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>打款人</span>, width: 150, ellipsis: true, render: (_: unknown, row: ReceiveRecord) => row.payerName || row.bankTransaction?.counterpartyName || row.customer?.name || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>账户类型</span>, width: 100, render: (_: unknown, row: ReceiveRecord) => row.details?.length ? row.details.map((d) => <Tag key={d.id} color={d.type === 'PUBLIC' ? 'purple' : 'cyan'}>{d.type === 'PUBLIC' ? '对公账户' : '对私账户'}</Tag>) : '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>回款金额</span>, dataIndex: 'amount', width: 110, render: (v: string) => <b>{v}</b> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>收款账户</span>, width: 150, ellipsis: true, render: (_: unknown, row: ReceiveRecord) => row.account?.name || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>更新时间</span>, dataIndex: 'updatedAt', width: 140, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    { title: <span style={{ whiteSpace: 'nowrap' }}>更新者</span>, width: 90, render: (_: unknown, row: ReceiveRecord) => row.confirmer?.displayName || row.creator?.displayName || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>销售姓名</span>, width: 110, render: (_: unknown, row: ReceiveRecord) => row.customer?.salesPerson || row.creator?.displayName || '-' },
    { title: <span style={{ whiteSpace: 'nowrap' }}>操作</span>, fixed: 'right' as const, width: 230, render: (_: unknown, row: ReceiveRecord) => <Space size={0} wrap>
      <Button type="link" size="small" onClick={() => void showReceiveDetail(row.id)}>详情</Button>
      {row.status === 'PENDING_CONFIRMATION' && canConfirm && <Button type="link" size="small" onClick={() => void openPosting(row)}>确认入账</Button>}
      {editable(row) && canCreate && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button>}
      {editable(row) && canCreate && <Button type="link" size="small" icon={<UndoOutlined />} danger onClick={() => setCancelTarget(row)}>撤回</Button>}
      {row.screenshotUrl && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setScreenshotView(row.screenshotUrl!)}>查看回款截图</Button>}
    </Space> },
  ];

  const summaryColumns = [
    { title: <span style={{ whiteSpace: 'nowrap' }}>客户姓名</span>, dataIndex: 'customerName', width: 160, ellipsis: true },
    { title: <span style={{ whiteSpace: 'nowrap' }}>群号</span>, dataIndex: 'groupNo', width: 110 },
    { title: <span style={{ whiteSpace: 'nowrap' }}>总回款金额</span>, dataIndex: 'total', width: 130, render: (v: string) => <b>{v}</b> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>已回款金额</span>, dataIndex: 'paid', width: 130, render: (v: string) => <span style={{ color: '#10b981' }}>{v}</span> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>未回款金额</span>, dataIndex: 'unpaid', width: 130, render: (v: string) => <span style={{ color: '#ef4444' }}>{v}</span> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>明细笔数</span>, dataIndex: 'count', width: 100, render: (v: number) => <Tag>{v}</Tag> },
  ];

  const natureOptions = [{ value: 'PUBLIC', label: '对公账户' }, { value: 'PRIVATE', label: '对私账户' }];
  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name}（${a.accountCode}）` }));

  return <Card title="客户打款记录" loading={loading}>
    <Form form={receiveFilterForm} layout="inline" onFinish={(values) => void filterReceive(values)} style={{ marginBottom: 16, rowGap: 12 }}>
      <Form.Item name="receiveNo"><Input placeholder="请输入回款单号" style={{ width: 200 }} /></Form.Item>
      <Form.Item name="payerName"><Input placeholder="请输入打款人" style={{ width: 180 }} /></Form.Item>
      <Form.Item name="accountId"><Select allowClear placeholder="请选择收款账户" style={{ width: 180 }} options={accountOptions} /></Form.Item>
      <Form.Item name="customerId"><Select allowClear showSearch optionFilterProp="label" placeholder="请选择客户" style={{ width: 200 }} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item>
      <Form.Item name="nature"><Select allowClear placeholder="账户分类" style={{ width: 140 }} options={natureOptions} /></Form.Item>
      <Form.Item name="status"><Select allowClear placeholder="状态" style={{ width: 140 }} options={Object.entries(receiveStatus).map(([value, label]) => ({ value, label }))} /></Form.Item>
      <Form.Item name="dateRange"><DatePicker.RangePicker style={{ width: 260 }} format="YYYY年MM月DD日" placeholder={['业务开始时间', '业务结束时间']} /></Form.Item>
      <Form.Item><Space><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>搜索</Button><Button icon={<ReloadOutlined />} onClick={() => { receiveFilterForm.resetFields(); void refresh(); }}>重置</Button></Space></Form.Item>
    </Form>
    <Space style={{ marginBottom: 16 }} wrap>
      {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => setReceiveOpen(true)}>新增</Button>}
      <Button icon={<DownloadOutlined />} onClick={async () => { try { await downloadExcel('/receive-records/export', token, '收款记录.xlsx'); } catch (e: any) { onError(e.message); } }}>导出</Button>
    </Space>
    <Table rowKey="key" dataSource={summaryRows} pagination={false} scroll={{ x: 760 }} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" dataSource={row.items} pagination={false} scroll={{ x: 1600 }} columns={detailColumns} />, rowExpandable: (row) => row.count > 0 }} columns={summaryColumns} />

    <Modal title="新增回款单" open={receiveOpen} onCancel={() => setReceiveOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消">
      <Form form={form} layout="vertical" onFinish={createManual}>
        <Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}><Select showSearch optionFilterProp="label" placeholder="请选择客户" options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item>
        <Form.Item name="payerName" label="打款人"><Input placeholder="请输入打款人（可留空）" /></Form.Item>
        <Form.Item name="accountId" label="收款账户" rules={[{ required: true, message: '请选择收款账户' }]}><Select placeholder={accountOptions.length ? '请选择收款账户' : '暂无可用收款账户'} options={accountOptions} /></Form.Item>
        <Form.Item name="amount" label="回款金额" rules={[{ required: true, message: '请输入回款金额' }]}><Input placeholder="请输入回款金额" /></Form.Item>
        <Form.Item name="nature" label="账户分类"><Select allowClear placeholder="请选择账户分类" options={natureOptions} /></Form.Item>
        <Form.Item name="receivedAt" label="回款时间"><DatePicker showTime style={{ width: '100%' }} format="YYYY年MM月DD日 HH:mm:ss" placeholder="请选择回款时间" /></Form.Item>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
        <Form.Item label="回款截图">{renderScreenshotUpload(newShotUrl, (url) => form.setFieldValue('screenshotUrl', url), fileInputRef)}</Form.Item>
      </Form>
    </Modal>

    <Modal title={editRow ? `编辑回款单：${editRow.receiveNo}` : '编辑回款单'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => editForm.submit()} okText="保存" cancelText="取消">
      <Form form={editForm} layout="vertical" onFinish={updateReceive}>
        <Form.Item name="payerName" label="打款人"><Input placeholder="请输入打款人" /></Form.Item>
        <Form.Item name="amount" label="回款金额" rules={[{ required: true, message: '请输入回款金额' }]}><Input /></Form.Item>
        <Form.Item name="nature" label="账户分类"><Select allowClear placeholder="请选择账户分类" options={natureOptions} /></Form.Item>
        <Form.Item name="receivedAt" label="回款时间"><DatePicker showTime style={{ width: '100%' }} format="YYYY年MM月DD日 HH:mm:ss" /></Form.Item>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
        <Form.Item label="回款截图">{renderScreenshotUpload(editShotUrl, (url) => editForm.setFieldValue('screenshotUrl', url), editFileInputRef)}</Form.Item>
      </Form>
    </Modal>

    <Modal title={selectedReceive ? `确认入账：${selectedReceive.receiveNo}` : '确认入账'} open={postingOpen} onCancel={() => setPostingOpen(false)} onOk={() => postingForm.submit()} okText="确认入账" cancelText="取消">
      <Form form={postingForm} layout="vertical" onFinish={confirmReceive}>
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="本次流水金额">{selectedReceive?.amount}</Descriptions.Item>
          <Descriptions.Item label="已分配金额">{centsToAmount(allocatedCents)}</Descriptions.Item>
          <Descriptions.Item label="剩余未分配金额"><Typography.Text type={remainingCents === 0 ? 'success' : 'danger'}>{centsToAmount(remainingCents)}</Typography.Text></Descriptions.Item>
        </Descriptions>
        <Typography.Paragraph style={{ marginBottom: 8 }}>服务费：¥{centsToAmount(feeCents)} <Button type="link" size="small" onClick={() => { setFeeEditValue(centsToAmount(feeCents)); setFeeEditOpen(true); }}>修改</Button> 实际入账：¥{centsToAmount(walletCreditCents)}</Typography.Paragraph>
        <Form.Item name="serviceFeeAmount" hidden><Input /></Form.Item>
        <Form.List name="details" rules={[{ validator: async (_, value) => { if (!value?.length) return Promise.reject(new Error('至少需要一条入账明细')); return Promise.resolve(); } }]}>
          {(fields, { add, remove }) => <>
            <div style={{ marginBottom: 8 }}>入账明细（对公款自动生成发票任务；对私款不生成）</div>
            {fields.map(({ key, name, ...restField }) => <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
              <Form.Item {...restField} name={[name, 'type']} rules={[{ required: true, message: '请选择入账类型' }]}><Select style={{ width: 130 }} options={[{ value: 'PUBLIC', label: 'PUBLIC（对公）' }, { value: 'PRIVATE', label: 'PRIVATE（对私）' }]} /></Form.Item>
              <Form.Item {...restField} name={[name, 'amount']} rules={[{ required: true, message: '请输入金额' }]}><Input placeholder="金额" /></Form.Item>
              {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(name)} />}
            </Space>)}
            <Button type="dashed" onClick={() => add({ type: 'PRIVATE', amount: centsToAmount(remainingCents > 0 ? remainingCents : 0) })} icon={<PlusOutlined />}>添加明细</Button>
          </>}
        </Form.List>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
      </Form>
    </Modal>

    <Modal title="收款详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null}>
      {detail && <Descriptions bordered column={1}>
        <Descriptions.Item label="收款编号">{detail.receiveNo}</Descriptions.Item>
        <Descriptions.Item label="客户">{detail.customer?.name || '待匹配'}</Descriptions.Item>
        <Descriptions.Item label="销售姓名">{detail.customer?.salesPerson || detail.creator?.displayName || '-'}</Descriptions.Item>
        <Descriptions.Item label="金额">{detail.amount}</Descriptions.Item>
        <Descriptions.Item label="入账性质">{detail.details?.map((item) => `${item.type === 'PUBLIC' ? '对公' : '对私'} ${item.amount}`).join(' / ') || '-'}</Descriptions.Item>
        <Descriptions.Item label="收款时间">{new Date(detail.receivedAt).toLocaleString('zh-CN')}</Descriptions.Item>
        <Descriptions.Item label="银行交易">{detail.bankTransaction?.transactionNo || '-'}</Descriptions.Item>
        <Descriptions.Item label="状态">{receiveStatus[detail.status] || detail.status}</Descriptions.Item>
      </Descriptions>}
    </Modal>

    <Modal title="回款截图" open={Boolean(screenshotView)} onCancel={() => setScreenshotView(null)} footer={null} width={560}>
      {screenshotView && <img src={screenshotView} alt="回款截图" style={{ width: '100%', borderRadius: 8 }} />}
    </Modal>

    <Modal title="撤回回款单" open={Boolean(cancelTarget)} onCancel={() => setCancelTarget(null)} onOk={() => cancelTarget && void doCancel(cancelTarget)} okText="撤回" cancelText="取消" okButtonProps={{ danger: true }}>
      <Typography.Text>确认撤回回款单 {cancelTarget?.receiveNo}（{cancelTarget?.amount}）？撤回后状态将变为已取消。</Typography.Text>
    </Modal>

    <Modal title="修改服务费" open={feeEditOpen} onCancel={() => setFeeEditOpen(false)} onOk={confirmFeeEdit} okText="确认" cancelText="取消" width={400}>
      <div style={{ marginBottom: 8 }}>流水金额：{selectedReceive?.amount}</div>
      <Input value={feeEditValue} onChange={(e) => setFeeEditValue(e.target.value)} placeholder="服务费金额" style={{ marginBottom: 8 }} />
      <Typography.Text type="secondary">实际入账：{centsToAmount(receiveCents - (amountToCents(feeEditValue) || 0))}</Typography.Text>
    </Modal>
  </Card>;
}
