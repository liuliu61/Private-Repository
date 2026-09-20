'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Descriptions, Form, Input, Modal, Select, Space, Table, Tag, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

import { apiRequest } from '../utils/api';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

type Customer = { id: string; name: string; customerCode: string };
type Receive = { id: string; receiveNo: string; amount: string; invoiceEligibleAmount: string; unBillingAmount?: string; billingAmount?: string; billedAmount?: string; serviceFeeAmount?: string; status: string; customer?: Customer };
type InvoiceDetail = { id: string; amount: string; invoiceType: string; invoiceContent?: string; invoiceCode?: string; invoiceUrl?: string; imageUrl?: string; originalFileName?: string };
type Application = { id: string; invoiceNo: string; amount: string; status: string; createdBy?: string; customer?: Customer; receiveSources?: Array<{ amount: string; receiveRecord?: { receiveNo: string } }>; applicationItems?: Array<{ id?: string; amount: string; itemType?: string }>; invoiceDetails?: InvoiceDetail[]; createdAt: string; reviewedBy?: string; reviewedAt?: string; approvalRemark?: string; rejectReason?: string };

const statusName: Record<string, string> = { DRAFT: '起草', REVIEWING: '审核中', APPROVED: '审核通过', REJECTED: '审核不通过', PROCESSING: '开票中', ISSUED: '完成开票', VOIDED: '已作废' };
const invoiceTypes = ['增值税电子专用发票', '增值税电子普通发票', '增值税专用发票', '增值税普通发票', '形式发票'];

function cents(value: string): bigint { const normalized = String(value || '0').trim(); const [whole, fraction = ''] = normalized.split('.'); return BigInt(`${whole || '0'}${fraction.padEnd(2, '0').slice(0, 2)}`); }
function money(value: bigint): string { const zero = BigInt('0'); const hundred = BigInt('100'); const sign = value < zero ? '-' : ''; const absolute = value < zero ? -value : value; return `${sign}${absolute / hundred}.${(absolute % hundred).toString().padStart(2, '0')}`; }
function availableReceive(item: Receive): bigint { return cents(item.amount) - cents(item.billedAmount || '0') - cents(item.billingAmount || '0'); }
function tokenSubject(token: string): string { try { return JSON.parse(atob(token.split('.')[1])).sub || ''; } catch { return ''; } }

export default function InvoiceApplicationPanel({ token, customers, review = false, onError }: { token: string; customers: Customer[]; review?: boolean; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Application[]>([]);
  const [receives, setReceives] = useState<Receive[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Application | null>(null);
  const [uploadApplication, setUploadApplication] = useState<Application | null>(null);
  const [uploadFile, setUploadFile] = useState<any>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrRecordId, setOcrRecordId] = useState<string>();
  const [ocrMessage, setOcrMessage] = useState('');
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const [uploadForm] = Form.useForm();
  const selectedReceiveIds = Form.useWatch('receiveRecordIds', form) || [];
  const amount = Form.useWatch('amount', form) || '0';
  const autoSplit = Form.useWatch('autoSplit', form) !== false;
  const selectedReceives = useMemo(() => receives.filter((item) => selectedReceiveIds.includes(item.id)), [receives, selectedReceiveIds]);
  const currentUserId = useMemo(() => tokenSubject(token), [token]);
  const selectedAvailable = useMemo(() => selectedReceives.reduce((sum, item) => sum + availableReceive(item), BigInt('0')), [selectedReceives]);
  const selectedServiceFee = useMemo(() => selectedReceives.reduce((sum, item) => sum + cents(item.serviceFeeAmount || '0'), BigInt('0')), [selectedReceives]);
  const splitPreview = useMemo(() => { const zero = BigInt('0'); const total = cents(amount); if (!autoSplit || total <= zero) return [{ label: '自定义明细', amount: money(total) }]; const serviceFee = selectedServiceFee > total ? total : selectedServiceFee; const taxable = total - serviceFee; const technical = (taxable * BigInt('915') + BigInt('500')) / BigInt('1000'); return [{ label: '信息服务费', amount: money(serviceFee) }, { label: '技术服务费', amount: money(technical) }, { label: '广告发布费', amount: money(taxable - technical) }].filter((item) => item.amount !== '0.00'); }, [amount, autoSplit, selectedServiceFee]);

  async function refresh(values: Record<string, string | undefined> = {}) {
    setLoading(true);
    try { const params = new URLSearchParams({ page: '1', pageSize: '100' }); Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); }); const result = await apiRequest<{ items: Application[] }>(`/invoices/applications?${params.toString()}`, token); setRows(result.items); }
    catch (error) { onError(error instanceof Error ? error.message : '发票申请查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); if (!review) void apiRequest<{ items: Receive[] }>('/receive-records?page=1&pageSize=100&status=CONFIRMED', token).then((result) => { setReceives(result.items); const sourceId = new URLSearchParams(window.location.search).get('receiveRecordId'); if (sourceId && result.items.some((item) => item.id === sourceId)) form.setFieldValue('receiveRecordIds', [sourceId]); }).catch((error) => onError(error instanceof Error ? error.message : '收款来源查询失败')); }, [token, review, form]);

  async function save(values: any, submit: boolean) {
    try { const payload = { ...values, ocrRecordId, items: values.autoSplit === false ? values.items : undefined }; const result = await apiRequest<{ invoice: Application }>('/invoices/applications', token, { method: 'POST', body: JSON.stringify(payload) }); if (submit) await apiRequest(`/invoices/applications/${result.invoice.id}/submit`, token, { method: 'POST' }); setCreateOpen(false); form.resetFields(); setOcrRecordId(undefined); setOcrMessage(''); await refresh(filterForm.getFieldsValue()); }
    catch (error) { onError(error instanceof Error ? error.message : '发票申请保存失败'); }
  }

  async function recognizeInvoice(file: any) {
    if (!file) return;
    setOcrLoading(true); setOcrMessage('识别中...');
    try { const body = new FormData(); body.append('file', file); const response = await fetch(`${API_BASE}/invoices/ocr`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || 'AI识别失败，请手工填写'); const data = result.data || {}; form.setFieldsValue({ invoiceNumber: data.invoiceNo || undefined, invoiceDate: data.invoiceDate || undefined, amount: data.totalAmount || data.amountExcludingTax || undefined, invoiceType: data.invoiceType || undefined, invoiceTitle: data.buyerName || undefined, taxNumber: data.buyerTaxNo || undefined, invoiceContent: data.items?.map((item: any) => item.content || item.name).filter(Boolean).join('、') || undefined }); setOcrRecordId(result.rawResultId); setOcrMessage('AI识别完成，请核对识别结果'); }
    catch (error) { setOcrMessage('AI识别失败，请手工填写'); onError(error instanceof Error ? error.message : 'AI识别失败，请手工填写'); }
    finally { setOcrLoading(false); }
  }

  async function reviewAction(id: string, approved: boolean) {
    try { if (approved) await apiRequest(`/invoices/applications/${id}/approve`, token, { method: 'POST', body: JSON.stringify({}) }); else { const reason = window.prompt('请输入驳回原因'); if (!reason?.trim()) return; await apiRequest(`/invoices/applications/${id}/reject`, token, { method: 'POST', body: JSON.stringify({ rejectReason: reason }) }); } await refresh(filterForm.getFieldsValue()); }
    catch (error) { onError(error instanceof Error ? error.message : '发票审核操作失败'); }
  }
  async function revokeAction(id: string) { try { await apiRequest(`/invoices/applications/${id}/revoke`, token, { method: 'POST' }); await refresh(filterForm.getFieldsValue()); } catch (error) { onError(error instanceof Error ? error.message : '发票申请撤回失败'); } }
  async function showDetail(id: string) { try { setDetail(await apiRequest<Application>(`/invoices/applications/${id}`, token)); } catch (error) { onError(error instanceof Error ? error.message : '发票申请详情查询失败'); } }
  function openUpload(row: Application) { setUploadApplication(row); setUploadFile(null); uploadForm.resetFields(); uploadForm.setFieldValue('amount', '0.00'); }
  async function uploadInvoice(values: any) {
    if (!uploadApplication || !uploadFile) { onError('请选择发票文件'); return; }
    try { const body = new FormData(); body.append('file', uploadFile); body.append('invoiceType', values.invoiceType); body.append('amount', values.amount || '0.00'); if (values.invoiceCode) body.append('invoiceCode', values.invoiceCode); if (values.invoiceContent) body.append('invoiceContent', values.invoiceContent); if (values.invoiceApplicationItemId) body.append('invoiceApplicationItemId', values.invoiceApplicationItemId); const response = await fetch(`${API_BASE}/invoices/applications/${uploadApplication.id}/details/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }); const result = await response.json(); if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join('；') : result.message || '发票上传失败'); if (uploadApplication.status === 'APPROVED') await apiRequest(`/invoices/applications/${uploadApplication.id}/details/complete`, token, { method: 'POST' }); setUploadApplication(null); setUploadFile(null); uploadForm.resetFields(); await refresh(filterForm.getFieldsValue()); }
    catch (error) { onError(error instanceof Error ? error.message : '发票上传失败'); }
  }
  async function viewInvoiceFile(applicationId: string, detailId: string) { try { const response = await fetch(`${API_BASE}/invoices/applications/${applicationId}/details/${detailId}/file`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('发票文件读取失败'); const url = URL.createObjectURL(await response.blob()); window.open(url, '_blank', 'noopener,noreferrer'); } catch (error) { onError(error instanceof Error ? error.message : '发票文件读取失败'); } }

  const statusOptions = review ? ['REVIEWING', 'APPROVED', 'REJECTED', 'ISSUED'] : ['DRAFT', 'REVIEWING', 'APPROVED', 'REJECTED', 'ISSUED'];
  return <Card title={review ? '发票申请审核' : '发票申请'} loading={loading} extra={!review && <Button type="primary" onClick={() => setCreateOpen(true)}>新建申请</Button>}>
    <Form form={filterForm} layout="inline" onFinish={(values) => void refresh(values)} style={{ marginBottom: 16 }}><Form.Item name="status"><Select allowClear placeholder="状态" style={{ width: 150 }} options={statusOptions.map((value) => ({ value, label: statusName[value] }))} /></Form.Item><Form.Item name="customerId"><Select allowClear showSearch optionFilterProp="label" placeholder="客户" style={{ width: 210 }} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} /></Form.Item><Form.Item name="invoiceNo"><Input placeholder="申请编号" /></Form.Item><Button htmlType="submit" type="primary">查询</Button><Button onClick={() => { filterForm.resetFields(); void refresh(); }}>重置</Button></Form>
    <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 20 }} columns={[{ title: '申请编号', dataIndex: 'invoiceNo' }, { title: '客户', render: (_: unknown, row: Application) => row.customer?.name || '-' }, { title: '申请金额', dataIndex: 'amount' }, { title: '申请时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString('zh-CN') }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{statusName[value] || value}</Tag> }, { title: '操作', render: (_: unknown, row: Application) => <Space><Button type="link" onClick={() => void showDetail(row.id)}>详情</Button>{!review && row.status === 'REVIEWING' && row.createdBy === currentUserId && <Button type="link" onClick={() => void revokeAction(row.id)}>撤回</Button>}{row.status === 'APPROVED' && <Button type="link" onClick={() => openUpload(row)}>上传发票</Button>}{row.status === 'ISSUED' && <><Button type="link" onClick={() => openUpload(row)}>上传发票</Button><Button type="link" onClick={() => void showDetail(row.id)}>查看发票</Button></>}{review && row.status === 'REVIEWING' && <><Button type="link" onClick={() => void reviewAction(row.id, true)}>通过</Button><Button type="link" danger onClick={() => void reviewAction(row.id, false)}>驳回</Button></>}</Space> }]} />
    {!review && <Typography.Paragraph type="secondary">审核通过后通过“上传发票”弹窗确定完成开票；上传与完成开票不改变收款额度。</Typography.Paragraph>}
    <Modal title="新建发票申请" open={createOpen} onCancel={() => { setCreateOpen(false); form.resetFields(); setOcrRecordId(undefined); setOcrMessage(''); }} footer={[<Button key="cancel" onClick={() => { setCreateOpen(false); form.resetFields(); setOcrRecordId(undefined); setOcrMessage(''); }}>取消</Button>, <Button key="draft" onClick={() => form.submit()}>保存起草</Button>, <Button key="submit" type="primary" onClick={() => form.validateFields().then((values) => save(values, true))}>提交申请</Button>]}><Form form={form} layout="vertical" initialValues={{ autoSplit: true }} onFinish={(values) => void save(values, false)}><Space><Upload accept=".jpg,.jpeg,.png,.pdf" maxCount={1} showUploadList={false} beforeUpload={() => false} onChange={(info) => { const file = info.file.originFileObj; if (file) void recognizeInvoice(file); }}><Button icon={<UploadOutlined />} loading={ocrLoading}>上传发票并识别</Button></Upload>{ocrMessage && <Typography.Text type={ocrMessage.startsWith('AI识别失败') ? 'danger' : 'secondary'}>{ocrMessage}</Typography.Text>}</Space><Typography.Paragraph type="warning">AI识别结果仅供参考，请核对识别结果后再保存或提交。</Typography.Paragraph><Form.Item name="receiveRecordIds" label="收款来源" rules={[{ required: true, message: '请选择至少一笔已确认收款' }]}><Select mode="multiple" showSearch optionFilterProp="label" options={receives.map((item) => ({ value: item.id, label: `${item.receiveNo}｜可开票 ${money(availableReceive(item))} 元｜${item.customer?.name || '未关联客户'}` }))} /></Form.Item><Form.Item label="来源可开票金额"><Input value={money(selectedAvailable)} readOnly /></Form.Item><Form.Item label="可开票服务费"><Input value={money(selectedServiceFee)} readOnly /></Form.Item><Form.Item name="amount" label="本次申请开票金额" rules={[{ required: true, message: '请输入申请金额' }, { validator: async (_, value) => { if (!value) return; if (cents(value) > selectedAvailable) throw new Error('申请开票金额不能大于可开票金额'); } }]}><Input placeholder="Decimal金额，例如 50000.00" /></Form.Item><Form.Item name="invoiceNumber" label="发票号码"><Input /></Form.Item><Form.Item name="invoiceDate" label="开票日期"><Input placeholder="YYYY-MM-DD" /></Form.Item><Form.Item name="invoiceTitle" label="购买方名称"><Input /></Form.Item><Form.Item name="taxNumber" label="购买方统一社会信用代码"><Input /></Form.Item><Form.Item name="invoiceContent" label="发票内容"><Input /></Form.Item><Form.Item name="autoSplit" valuePropName="checked"><Checkbox>自动按 91.5% / 8.5% 拆分</Checkbox></Form.Item>{autoSplit ? <Descriptions size="small" bordered column={1} title="拆分预览">{splitPreview.map((item) => <Descriptions.Item key={item.label} label={item.label}>{item.amount} 元</Descriptions.Item>)}</Descriptions> : <Form.List name="items">{(fields, { add, remove }) => <>{fields.map((field) => <Space key={field.key} align="baseline"><Form.Item {...field} name={[field.name, 'itemType']}><Input placeholder="发票项目" /></Form.Item><Form.Item {...field} name={[field.name, 'amount']} rules={[{ required: true, message: '请输入明细金额' }]}><Input placeholder="金额" /></Form.Item><Button onClick={() => remove(field.name)}>删除</Button></Space>)}<Button onClick={() => add()}>添加明细</Button></>}</Form.List>}<Form.Item name="invoiceNature" label="发票性质"><Select allowClear options={[{ value: '蓝字发票', label: '蓝字发票' }]} /></Form.Item><Form.Item name="invoiceType" label="发票类型"><Input /></Form.Item><Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} /></Form.Item></Form></Modal>
    <Modal title="上传发票" open={Boolean(uploadApplication)} onCancel={() => { setUploadApplication(null); setUploadFile(null); uploadForm.resetFields(); }} onOk={() => uploadForm.submit()} okText="确定" cancelText="取消"><Form form={uploadForm} layout="vertical" onFinish={(values) => void uploadInvoice(values)}><Upload accept=".pdf,.png,.jpg,.jpeg" maxCount={1} beforeUpload={(file) => { setUploadFile(file); return false; }} onRemove={() => { setUploadFile(null); }}><Button icon={<UploadOutlined />}>选择发票文件</Button></Upload><Form.Item name="invoiceApplicationItemId" label="对应申请明细"><Select allowClear options={uploadApplication?.applicationItems?.map((item) => ({ value: item.id, label: `${item.itemType || '发票明细'}｜${item.amount} 元` }))} /></Form.Item><Form.Item name="invoiceCode" label="发票编号"><Input /></Form.Item><Form.Item name="amount" label="发票金额"><Input /></Form.Item><Form.Item name="invoiceType" label="发票类型" rules={[{ required: true, message: '请选择发票类型!' }]}><Select options={invoiceTypes.map((value) => ({ value, label: value }))} /></Form.Item><Form.Item name="invoiceContent" label="开票内容"><Input /></Form.Item><Typography.Text type="secondary">确定后审核通过申请自动变为“完成开票”；金额不一致规则当前未作额外拦截。</Typography.Text></Form></Modal>
    <Modal title="发票申请详情" open={Boolean(detail)} onCancel={() => setDetail(null)} footer={null}>{detail && <Descriptions bordered column={1}><Descriptions.Item label="申请编号">{detail.invoiceNo}</Descriptions.Item><Descriptions.Item label="客户">{detail.customer?.name || '-'}</Descriptions.Item><Descriptions.Item label="申请金额">{detail.amount} 元</Descriptions.Item><Descriptions.Item label="状态">{statusName[detail.status] || detail.status}</Descriptions.Item><Descriptions.Item label="发票明细">{detail.invoiceDetails?.length ? detail.invoiceDetails.map((item) => <div key={item.id}><span>{item.invoiceType}｜{item.amount} 元｜{item.invoiceCode || '未填写编号'}</span>{item.invoiceUrl && <Button type="link" onClick={() => void viewInvoiceFile(detail.id, item.id)}>查看发票</Button>}</div>) : '-'}</Descriptions.Item><Descriptions.Item label="审核意见">{detail.approvalRemark || detail.rejectReason || '-'}</Descriptions.Item></Descriptions>}</Modal>
  </Card>;
}
