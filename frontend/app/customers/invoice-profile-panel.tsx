'use client';

import { apiRequest } from '../utils/api';
import { useEffect, useState } from 'react';
import { Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';

type Customer = { id: string; name: string; customerCode: string };
type Profile = { id: string; titleName: string; taxpayerCode?: string; address?: string; phone?: string; bankName?: string; bankAccount?: string; defaultInvoiceContent?: string; enabled: boolean; isDefault: boolean };

export default function InvoiceProfilePanel({ token, customers, onError }: { token: string; customers: Customer[]; onError: (message: string) => void }) {
  const [customerId, setCustomerId] = useState<string>(); const [profiles, setProfiles] = useState<Profile[]>([]); const [loading, setLoading] = useState(false); const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Profile | null>(null); const [form] = Form.useForm();
  useEffect(() => { if (!customerId && customers[0]) setCustomerId(customers[0].id); }, [customerId, customers]);
  async function refresh(id = customerId) { if (!id) return; setLoading(true); try { setProfiles(await apiRequest<Profile[]>(`/customers/${id}/invoice-profiles`, token)); } catch (error) { onError(error instanceof Error ? error.message : '开票信息查询失败'); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, [customerId, token]);
  function create() { setEditing(null); form.resetFields(); form.setFieldsValue({ enabled: true, isDefault: profiles.length === 0 }); setOpen(true); }
  function edit(row: Profile) { setEditing(row); form.setFieldsValue(row); setOpen(true); }
  async function save(values: Record<string, unknown>) { if (!customerId) return; try { const path = editing ? `/customers/${customerId}/invoice-profiles/${editing.id}` : `/customers/${customerId}/invoice-profiles`; await apiRequest(path, token, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(values) }); setOpen(false); await refresh(); } catch (error) { onError(error instanceof Error ? error.message : '开票信息保存失败'); } }
  async function remove(row: Profile) { if (!customerId) return; try { await apiRequest(`/customers/${customerId}/invoice-profiles/${row.id}`, token, { method: 'DELETE' }); await refresh(); } catch (error) { onError(error instanceof Error ? error.message : '开票信息删除失败'); } }
  return <Card title="客户开票信息" loading={loading} extra={<Button type="primary" disabled={!customerId} onClick={create}>新增开票信息</Button>}>
    <Select value={customerId} showSearch optionFilterProp="label" placeholder="选择客户" onChange={setCustomerId} style={{ width: 320, marginBottom: 16 }} options={customers.map((item) => ({ value: item.id, label: `${item.name}（${item.customerCode}）` }))} />
    <Table rowKey="id" dataSource={profiles} pagination={false} scroll={{ x: 1100 }} columns={[{ title: '公司名称', dataIndex: 'titleName' }, { title: '纳税人识别号', dataIndex: 'taxpayerCode', render: (value: string) => value || '-' }, { title: '地址 / 电话', render: (_: unknown, row: Profile) => [row.address, row.phone].filter(Boolean).join(' / ') || '-' }, { title: '开户银行 / 账号', render: (_: unknown, row: Profile) => [row.bankName, row.bankAccount].filter(Boolean).join(' / ') || '-' }, { title: '默认', dataIndex: 'isDefault', render: (value: boolean) => value ? <Tag color="blue">默认</Tag> : '-' }, { title: '状态', dataIndex: 'enabled', render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag> }, { title: '操作', fixed: 'right', render: (_: unknown, row: Profile) => <Space><Button type="link" onClick={() => edit(row)}>修改</Button><Popconfirm title="删除后无法恢复，确认删除吗？" onConfirm={() => void remove(row)} okText="删除" cancelText="取消"><Button type="link" danger>删除</Button></Popconfirm></Space> }]} />
    <Modal title={editing ? '修改开票信息' : '新增开票信息'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消"><Form form={form} layout="vertical" onFinish={save}><Form.Item name="titleName" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}><Input /></Form.Item><Form.Item name="taxpayerCode" label="纳税人识别号"><Input /></Form.Item><Form.Item name="address" label="地址"><Input /></Form.Item><Form.Item name="phone" label="电话"><Input /></Form.Item><Form.Item name="bankName" label="开户银行"><Input /></Form.Item><Form.Item name="bankAccount" label="银行账号"><Input /></Form.Item><Form.Item name="defaultInvoiceContent" label="默认开票内容"><Input /></Form.Item><Form.Item name="isDefault" valuePropName="checked"><Checkbox>设为默认开票信息</Checkbox></Form.Item><Form.Item name="enabled" valuePropName="checked"><Checkbox>启用</Checkbox></Form.Item></Form></Modal>
  </Card>;
}
