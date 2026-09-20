'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';

type Supplier = { id: string; name: string; platform: string; status: string };
type Asset = { id: string; name: string; subjectId?: string; subjectCode?: string; platform?: string };
type Policy = { id: string; policyId: string; supplierId: string; version: number; platform: string | null; subjectId: string | null; accountId: string | null; rebateType: 'FIXED_ADD' | 'PRIVATE_DIVIDE'; calculationMode: 'CASH_TO_CREDIT' | 'CREDIT_TO_CASH'; rate: string; effectiveFrom: string; effectiveTo: string | null; status: string; policyStatus: string; createdBy: string | null };

const platforms = [{ value: 'DOUYIN', label: '抖音' }, { value: 'KUAISHOU', label: '快手' }, { value: 'XIAOHONGSHU', label: '小红书' }, { value: 'TENCENT', label: '腾讯' }, { value: 'OTHER', label: '其他' }];
const platformName = (value: string | null) => platforms.find((item) => item.value === value)?.label || '供应商默认';
const rebateTypeName = (value: Policy['rebateType']) => value === 'FIXED_ADD' ? '固定返点' : '私反客户政策';
const calculationModeName = (value: Policy['calculationMode']) => value === 'CASH_TO_CREDIT' ? '人民币 → 账户币' : '账户币 → 人民币';
const timeName = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '长期有效';

export default function SupplierRebatePolicyPanel({ token, suppliers, onError }: { token: string; suppliers: Supplier[]; onError: (message: string) => void }) {
  const [supplierId, setSupplierId] = useState<string>();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [current, setCurrent] = useState<Policy | null>(null);
  const [subjects, setSubjects] = useState<Asset[]>([]);
  const [accounts, setAccounts] = useState<Asset[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const supplier = useMemo(() => suppliers.find((item) => item.id === supplierId), [suppliers, supplierId]);

  useEffect(() => { if (!supplierId && suppliers[0]) setSupplierId(suppliers[0].id); }, [supplierId, suppliers]);
  useEffect(() => { if (!token) return; Promise.all([apiRequest<Asset[]>('/ad-subjects', token), apiRequest<Asset[]>('/ad-accounts', token)]).then(([subjectRows, accountRows]) => { setSubjects(subjectRows); setAccounts(accountRows); }).catch((error) => onError(error instanceof Error ? error.message : '广告资源查询失败')); }, [token]);

  async function refresh(id = supplierId) {
    if (!id) return;
    setLoading(true);
    try {
      const result = await apiRequest<{ items: Policy[] }>(`/suppliers/${id}/rebate-policies?page=1&pageSize=100`, token);
      setPolicies(result.items);
      try { setCurrent(await apiRequest<Policy>(`/suppliers/${id}/rebate-policy`, token)); } catch { setCurrent(null); }
    } catch (error) { onError(error instanceof Error ? error.message : '成本返点政策查询失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [supplierId]);

  async function createPolicy(values: { platform?: string; subjectId?: string; accountId?: string; rebateType: Policy['rebateType']; calculationMode: Policy['calculationMode']; rate: string; effectiveFrom: string; effectiveTo?: string; remark?: string }) {
    if (!supplierId) return;
    try { await apiRequest(`/suppliers/${supplierId}/rebate-policies`, token, { method: 'POST', body: JSON.stringify({ ...values, rate: values.rate.trim(), effectiveFrom: new Date(values.effectiveFrom).toISOString(), effectiveTo: values.effectiveTo ? new Date(values.effectiveTo).toISOString() : undefined }) }); setModalOpen(false); form.resetFields(); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '成本返点政策保存失败'); }
  }
  async function disablePolicy(policyId: string) {
    if (!supplierId) return;
    try { await apiRequest(`/suppliers/${supplierId}/rebate-policies/${policyId}/disable`, token, { method: 'POST' }); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '成本返点政策停用失败'); }
  }

  return <Card title="供应商成本返点政策" extra={<Button type="primary" disabled={!supplierId || supplier?.status !== 'ACTIVE'} onClick={() => setModalOpen(true)}>新增政策版本</Button>} loading={loading}>
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Select style={{ width: 320 }} placeholder="请选择供应商" value={supplierId} onChange={setSupplierId} options={suppliers.map((item) => ({ value: item.id, label: item.name }))} />
      {supplier?.status !== 'ACTIVE' && <Alert type="warning" message="供应商已停用，不能新增成本返点政策" />}
      {supplier && <Card size="small" title={`当前政策：${supplier.name}`}>
        {current ? <Space direction="vertical"><Typography.Text>平台：{platformName(current.platform)}</Typography.Text><Typography.Text>返点类型：{rebateTypeName(current.rebateType)}</Typography.Text><Typography.Text>计算方向：{calculationModeName(current.calculationMode)}</Typography.Text><Typography.Text>返点比例：{current.rate}%</Typography.Text><Typography.Text>有效期：{timeName(current.effectiveFrom)} 至 {timeName(current.effectiveTo)}</Typography.Text></Space> : <Alert type="warning" message="当前业务范围没有有效成本返点政策" />}
      </Card>}
      <Table rowKey="id" dataSource={policies} pagination={false} columns={[{ title: '版本', dataIndex: 'version' }, { title: '平台', dataIndex: 'platform', render: platformName }, { title: '主体', dataIndex: 'subjectId', render: (value: string | null) => value || '供应商级' }, { title: '账户', dataIndex: 'accountId', render: (value: string | null) => value || '未指定' }, { title: '返点类型', dataIndex: 'rebateType', render: rebateTypeName }, { title: '计算方向', dataIndex: 'calculationMode', render: calculationModeName }, { title: '返点比例', dataIndex: 'rate', render: (value: string) => `${value}%` }, { title: '生效时间', dataIndex: 'effectiveFrom', render: timeName }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value === 'ACTIVE' ? '有效' : '已停用'}</Tag> }, { title: '操作人', dataIndex: 'createdBy', render: (value: string | null) => value || '历史数据' }, { title: '操作', key: 'action', render: (_: unknown, row: Policy) => row.policyStatus === 'ACTIVE' ? <Button type="link" danger onClick={() => void disablePolicy(row.policyId)}>停用</Button> : null }]} />
    </Space>
    <Modal title="新增供应商成本返点政策版本" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消">
      <Form form={form} layout="vertical" onFinish={createPolicy} initialValues={{ calculationMode: 'CASH_TO_CREDIT' }}>
        <Form.Item name="platform" label="平台"><Select allowClear options={platforms} /></Form.Item>
        <Form.Item name="subjectId" label="广告主体"><Select allowClear showSearch options={subjects.map((item) => ({ value: item.id, label: item.name || item.subjectCode || item.id }))} /></Form.Item>
        <Form.Item name="accountId" label="广告账户"><Select allowClear showSearch options={accounts.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Form.Item name="rebateType" label="返点类型" rules={[{ required: true, message: '请选择返点类型' }]}><Select options={[{ value: 'FIXED_ADD', label: '固定返点' }, { value: 'PRIVATE_DIVIDE', label: '私反客户政策' }]} /></Form.Item>
        <Form.Item name="calculationMode" label="计算方向" rules={[{ required: true, message: '请选择计算方向' }]}><Select options={[{ value: 'CASH_TO_CREDIT', label: '人民币 → 账户币' }, { value: 'CREDIT_TO_CASH', label: '账户币 → 人民币' }]} /></Form.Item>
        <Form.Item name="rate" label="返点比例（%）" rules={[{ required: true, message: '请输入返点比例' }, { pattern: /^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, message: '请输入大于 -100 且小于 100 的比例' }]}><Input placeholder="例如 8、7.5 或 -5" /></Form.Item>
        <Form.Item name="effectiveFrom" label="生效时间" rules={[{ required: true, message: '请选择生效时间' }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="effectiveTo" label="失效时间"><Input type="datetime-local" /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={255} showCount /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}
