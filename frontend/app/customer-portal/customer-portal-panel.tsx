'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../utils/api';
import { Card, Table, Button, Tag, Space, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, ReloadOutlined, KeyOutlined, UserAddOutlined } from '@ant-design/icons';

interface CustomerUser {
  id: string;
  username: string;
  displayName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  customer?: { id: string; name: string; customerCode: string };
}

export default function CustomerPortalPanel({ token, customers, onError }: {
  token: string;
  customers: { id: string; name: string; customerCode: string }[];
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [current, setCurrent] = useState<CustomerUser | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/portal/admin/customer-users?pageSize=100', token, {});
      setItems(data.items || []);
    } catch (e: any) { onError(e.message); }
    finally { setLoading(false); }
  }, [token, onError]);

  useEffect(() => { load(); }, [load]);

  async function createAccount(values: any) {
    try {
      const customer = customers.find((c: any) => c.id === values.customerId);
      if (!customer) throw new Error('请选择客户');
      await apiRequest(`/portal/admin/customers/${values.customerId}/portal-account`, token, {
        method: 'POST',
        body: JSON.stringify({ username: values.username, password: values.password, displayName: values.displayName, phone: values.phone }),
      });
      message.success(`已为客户「${customer.name}」开通账号`);
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: any) { onError(e.message); }
  }

  async function resetPassword(values: any) {
    try {
      await apiRequest(`/portal/admin/customer-users/${current!.id}/reset-password`, token, {
        method: 'POST',
        body: JSON.stringify({ password: values.password }),
      });
      message.success(`账号 ${current!.username} 密码已重置`);
      setResetOpen(false);
      resetForm.resetFields();
    } catch (e: any) { onError(e.message); }
  }

  return (
    <Card
      title="客户门户账号（C 端登录账号）"
      extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<UserAddOutlined />} onClick={() => setOpen(true)}>开通客户账号</Button></Space>}
    >
      <Table rowKey="id" size="middle" loading={loading} dataSource={items} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无已开通账号' }} columns={[
        { title: '客户', dataIndex: ['customer', 'name'], render: (v: string, r: CustomerUser) => r.customer ? `${v}（${r.customer.customerCode}）` : '—' },
        { title: '登录账号', dataIndex: 'username' },
        { title: '显示名称', dataIndex: 'displayName', render: (v: string) => v || '—' },
        { title: '手机号', dataIndex: 'phone', render: (v: string) => v || '—' },
        { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : '停用'}</Tag> },
        { title: '开通时间', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
        { title: '操作', render: (_: any, r: CustomerUser) => <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => { setCurrent(r); setResetOpen(true); resetForm.resetFields(); }}>重置密码</Button> },
      ]} />

      <Modal title="开通客户账号" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={createAccount} requiredMark={false}>
          <Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select showSearch optionFilterProp="label" placeholder="请选择客户"
              options={customers.map((c: any) => ({ value: c.id, label: `${c.name}（${c.customerCode}）` }))} />
          </Form.Item>
          <Form.Item name="username" label="登录账号" rules={[{ required: true, message: '请输入登录账号' }]}>
            <Input placeholder="例如：huangjin" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
            <Input.Password placeholder="请输入初始密码" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="选填" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>开通</Button>
        </Form>
      </Modal>

      <Modal title={`重置密码：${current?.username || ''}`} open={resetOpen} onCancel={() => setResetOpen(false)} footer={null}>
        <Form form={resetForm} layout="vertical" onFinish={resetPassword} requiredMark={false}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>确认重置</Button>
        </Form>
      </Modal>
    </Card>
  );
}
