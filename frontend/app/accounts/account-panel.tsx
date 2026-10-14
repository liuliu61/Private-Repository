'use client';

import { useState, useEffect, useCallback } from 'react';
import useAutoRefresh from '../utils/useAutoRefresh';
import { apiRequest } from '../utils/api';
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input, Select, message, Popconfirm,
} from 'antd';
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { exportCsv } from '../utils/export';

interface AccountRow {
  id: string; name: string; accountCode: string; accountType: string;
  accountCategory?: string | null; bankCardNo?: string | null; status: string; currentBalance: string;
  openingBalance: string; createdAt: string;
}

const accountTypeLabel: Record<string, string> = {
  CASH: '现金', BANK: '银行卡', ALIPAY: '支付宝', WECHAT: '微信', OTHER: '其他',
};

export default function AccountPanel({ token, onError }: {
  token: string; onError: (error: string) => void;
}) {
  const [data, setData] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>();
  const [nameFilter, setNameFilter] = useState<string>();
  const [form] = Form.useForm();
  const [, setPageForce] = useState(0);
  const filtered = data.filter((r) => {
    if (nameFilter && !r.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (categoryFilter && (r.accountCategory || 'PRIVATE') !== categoryFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiRequest<AccountRow[]>('/accounts', token);
      setData(Array.isArray(rows) ? rows : []);
    } catch (e: any) { onError(e.message || '加载失败'); }
    finally { setLoading(false); }
  }, [token, onError]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ accountType: 'BANK', accountCategory: 'PRIVATE', status: 'ACTIVE', openingBalance: '0' });
    setModalOpen(true);
  };

  const openEdit = (record: AccountRow) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      accountCode: record.accountCode,
      accountType: record.accountType,
      accountCategory: record.accountCategory || 'PRIVATE',
      bankCardNo: record.bankCardNo || undefined,
      status: record.status,
      openingBalance: record.openingBalance,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editing) {
        await apiRequest(`/accounts/${editing.id}/update`, token, {
          method: 'POST', body: JSON.stringify({
            name: values.name,
            accountCategory: values.accountCategory,
            bankCardNo: values.bankCardNo,
            status: values.status,
          }),
        });
        message.success('收款账户已更新');
      } else {
        await apiRequest('/accounts', token, {
          method: 'POST', body: JSON.stringify(values),
        });
        message.success('收款账户已新增');
      }
      setModalOpen(false); form.resetFields(); fetchData();
    } catch (e: any) { onError(e.message || '保存失败'); }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await apiRequest(`/accounts/${id}/delete`, token, { method: 'POST' });
      if (res?.deleted) message.success(`已删除收款账户 ${name}`);
      else message.warning(res?.reason || '该账户存在历史关联记录，已转为注销状态');
      fetchData();
    } catch (e: any) { onError(e.message || '删除失败'); }
  };

  const statusMeta: Record<string, { color: string; label: string }> = {
    ACTIVE: { color: 'green', label: '启用' },
    DISABLED: { color: 'orange', label: '封停' },
    CANCELLED: { color: 'default', label: '注销' },
  };

  const columns = [
    { title: '账户名称', dataIndex: 'name', width: 220, render: (v: string, r: AccountRow) => <Space><span>{v}</span><Tag color={r.accountCategory === 'PUBLIC' ? 'blue' : 'purple'}>{r.accountCategory === 'PUBLIC' ? '对公' : '对私'}</Tag></Space> },
    { title: '银行卡账号', dataIndex: 'bankCardNo', width: 200, render: (v: string | null) => v ? <span style={{ fontFamily: 'monospace' }}>{v}</span> : '-' },
    { title: '账户编码', dataIndex: 'accountCode', width: 160, render: (v: string) => v || '-' },
    { title: '账户类型', dataIndex: 'accountType', width: 120, render: (v: string) => accountTypeLabel[v] || v },
    { title: '期初余额', dataIndex: 'openingBalance', width: 130, render: (v: string) => <b>¥{v}</b> },
    { title: '当前余额', dataIndex: 'currentBalance', width: 130, render: (v: string) => <b style={{ color: '#1677ff' }}>¥{v}</b> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => { const m = statusMeta[v as keyof typeof statusMeta]; return <Tag color={m?.color || 'default'}>{m?.label || v}</Tag>; } },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    {
      title: '操作', key: 'action', width: 150, fixed: 'right' as const,
      render: (_: any, record: AccountRow) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title={`确定删除/注销「${record.name}」？`} description="有历史关联记录时将自动转为注销" onConfirm={() => handleDelete(record.id, record.name)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="收款账户"
      extra={
        <Space wrap>
          <Input allowClear placeholder="账户名称" style={{ width: 180 }} value={nameFilter} onChange={(e) => setNameFilter(e.target.value || undefined)} onPressEnter={() => { setPageForce((v) => v + 1); }} />
          <Select placeholder="对公/对私" style={{ width: 130 }} allowClear value={categoryFilter} onChange={setCategoryFilter}
            options={[{ value: 'PUBLIC', label: '对公' }, { value: 'PRIVATE', label: '对私' }]} />
          <Select placeholder="状态" style={{ width: 120 }} allowClear value={statusFilter} onChange={setStatusFilter}
            options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '封停' }, { value: 'CANCELLED', label: '注销' }]} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button icon={<DownloadOutlined />} onClick={() => exportCsv(`收款账户_${new Date().toISOString().slice(0, 10)}`, [
            { key: 'name', title: '账户名称' },
            { key: 'accountCode', title: '账户编码' },
            { key: 'bankCardNo', title: '银行卡账号' },
            { key: 'accountTypeLabel', title: '账户类型' },
            { key: 'accountCategoryLabel', title: '账户分类' },
            { key: 'openingBalance', title: '期初余额' },
            { key: 'currentBalance', title: '当前余额' },
            { key: 'statusLabel', title: '状态' },
            { key: 'createdAt', title: '创建时间' },
          ], filtered.map((r) => ({ ...r, accountTypeLabel: accountTypeLabel[r.accountType] || r.accountType, accountCategoryLabel: r.accountCategory === 'PUBLIC' ? '对公' : '对私', statusLabel: statusMeta[r.status as keyof typeof statusMeta]?.label || r.status })))}>导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增收款账户</Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        dataSource={filtered}
        columns={columns} loading={loading} scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
      />

      <Modal title={editing ? `编辑收款账户 - ${editing.name}` : '新增收款账户'} open={modalOpen}
        onOk={() => form.submit()} onCancel={() => setModalOpen(false)} width={520} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" preserve={false} onFinish={handleSubmit}>
          <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}>
            <Input placeholder="例如：寰宇(中信银行)(银行卡)" />
          </Form.Item>
          {!editing && (
            <Form.Item name="accountCode" label="账户编码" rules={[{ required: true, message: '请输入账户编码' }]}>
              <Input placeholder="例如：HY-BANK-001" />
            </Form.Item>
          )}
          <Form.Item name="bankCardNo" label="银行卡账号" tooltip="银行卡/对公账户填写银行卡号，其他账户类型可留空">
            <Input maxLength={64} placeholder="例如：6222 0202 1234 5678" />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="accountType" label="账户类型" style={{ flex: 1 }} rules={[{ required: true, message: '请选择账户类型' }]}>
              <Select options={Object.entries(accountTypeLabel).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="accountCategory" label="账户分类" style={{ flex: 1 }} rules={[{ required: true, message: '请选择对公或对私' }]}>
              <Select options={[{ value: 'PUBLIC', label: '对公账户' }, { value: 'PRIVATE', label: '对私账户' }]} />
            </Form.Item>
          </Space>
          {!editing && (
            <Form.Item name="openingBalance" label="期初余额" rules={[{ required: true, message: '请输入期初余额' }]}>
              <Input type="number" min="0" step="0.01" placeholder="0.00" />
            </Form.Item>
          )}
          {editing && (
            <Form.Item name="status" label="账户状态">
              <Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '封停' }, { value: 'CANCELLED', label: '注销' }]} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
