'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { exportCsv } from '../utils/export';

type Account = { id: string; name: string; accountCode: string; currency: string; currentBalance: string };
type PromotionAccount = { id: string; accountName: string; unit: string; currentBalance: string };
type Adjustment = { id: string; adjustmentNo: string; accountType: string; type: string; amount: string; reason: string; status: string; account?: Account; promotionAccount?: PromotionAccount; createdAt: string };

const statusName: Record<string, string> = { DRAFT: '草稿', APPROVED: '已审核', REJECTED: '已拒绝', EXECUTED: '已执行' };
const typeName: Record<string, string> = { INCOME: '收入调整', EXPENSE: '支出调整' };

export default function FinancialAdjustmentPanel({ token, accounts, promotionAccounts, onError }: { token: string; accounts: Account[]; promotionAccounts: PromotionAccount[]; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Adjustment[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>();
  const [form] = Form.useForm();
  const accountType = Form.useWatch('accountType', form) || 'CNY';

  async function refresh() {
    setLoading(true);
    try { const result = await apiRequest<{ items: Adjustment[] }>('/financial-adjustments?page=1&pageSize=100', token); setRows(result.items); }
    catch (error) { onError(error instanceof Error ? error.message : '调整单查询失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [token]);
  async function create(values: { accountType: string; targetId: string; type: string; amount: string; reason: string }) {
    const body = { accountType: values.accountType, type: values.type, amount: values.amount, reason: values.reason, ...(values.accountType === 'CNY' ? { accountId: values.targetId } : { promotionAccountId: values.targetId }) };
    try { await apiRequest('/financial-adjustments', token, { method: 'POST', body: JSON.stringify(body) }); setOpen(false); form.resetFields(); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '调整单创建失败'); }
  }
  async function action(id: string, actionName: 'approve' | 'reject' | 'execute') {
    try { await apiRequest(`/financial-adjustments/${id}/${actionName}`, token, { method: 'POST' }); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '调整单操作失败'); }
  }
  const targetOptions = accountType === 'CNY' ? accounts.map((item) => ({ value: item.id, label: `${item.name}（${item.currency}）` })) : promotionAccounts.map((item) => ({ value: item.id, label: `${item.accountName}（${item.unit}）` }));
  const filteredRows = rows.filter((r) => !statusFilter || r.status === statusFilter);
  return <Card title="财务调整" extra={<Space><Select allowClear placeholder="状态" style={{ width: 130 }} value={statusFilter} onChange={setStatusFilter} options={Object.entries(statusName).map(([value, label]) => ({ value, label }))} /><Button icon={<DownloadOutlined />} onClick={() => exportCsv(`财务调整_${new Date().toISOString().slice(0, 10)}`, [
    { key: 'adjustmentNo', title: '调整编号' },
    { key: 'accountType', title: '账户类型' },
    { key: 'targetName', title: '目标账户' },
    { key: 'typeLabel', title: '调整类型' },
    { key: 'amount', title: '调整金额' },
    { key: 'statusLabel', title: '状态' },
    { key: 'reason', title: '原因' },
    { key: 'createdAt', title: '创建时间' },
  ], filteredRows.map((r) => ({ ...r, targetName: r.accountType === 'CNY' ? r.account?.name || '-' : r.promotionAccount?.accountName || '-', typeLabel: typeName[r.type] || r.type, statusLabel: statusName[r.status] || r.status })))}>导出</Button><Button type="primary" onClick={() => setOpen(true)}>创建调整单</Button></Space>} loading={loading}>
    <Table rowKey="id" dataSource={filteredRows} pagination={false} columns={[
      { title: '调整编号', dataIndex: 'adjustmentNo' },
      { title: '账户', render: (_: unknown, row: Adjustment) => row.account?.name || row.promotionAccount?.accountName || '-' },
      { title: '账户单位', dataIndex: 'accountType' },
      { title: '类型', render: (value: string) => typeName[value] || value, dataIndex: 'type' },
      { title: '金额', dataIndex: 'amount' },
      { title: '原因', dataIndex: 'reason' },
      { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{statusName[value] || value}</Tag> },
      { title: '操作', render: (_: unknown, row: Adjustment) => <Space>{row.status === 'DRAFT' && <><Button type="link" onClick={() => void action(row.id, 'approve')}>审核</Button><Button type="link" danger onClick={() => void action(row.id, 'reject')}>拒绝</Button></>}{row.status === 'APPROVED' && <Button type="link" onClick={() => void action(row.id, 'execute')}>执行</Button>}</Space> },
    ]} />
    <Modal title="创建财务调整单" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消">
      <Form form={form} layout="vertical" onFinish={create} initialValues={{ accountType: 'CNY', type: 'INCOME' }}>
        <Form.Item name="accountType" label="账户单位" rules={[{ required: true, message: '请选择账户单位' }]}><Select options={[{ value: 'CNY', label: 'CNY人民币' }, { value: 'ACCOUNT_CREDIT', label: 'ACCOUNT_CREDIT账户币' }]} /></Form.Item>
        <Form.Item name="targetId" label={accountType === 'CNY' ? '资金账户' : '推广账户'} rules={[{ required: true, message: '请选择目标账户' }]}><Select options={targetOptions} placeholder="请选择账户" /></Form.Item>
        <Form.Item name="type" label="调整类型" rules={[{ required: true, message: '请选择调整类型' }]}><Select options={[{ value: 'INCOME', label: '收入调整' }, { value: 'EXPENSE', label: '支出调整' }]} /></Form.Item>
        <Form.Item name="amount" label="调整金额" rules={[{ required: true, message: '请输入调整金额' }]}><Input placeholder="例如 100.00" /></Form.Item>
        <Form.Item name="reason" label="调整原因" rules={[{ required: true, message: '请输入调整原因' }]}><Input.TextArea maxLength={255} showCount /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}
