'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../utils/api';
import { Card, Table, Button, Tag, Space, Modal, Form, Input, Select, message, Popconfirm, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, KeyOutlined, LinkOutlined, DisconnectOutlined } from '@ant-design/icons';

interface AgentUser {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  remark: string | null;
  status: string;
  createdAt: string;
  customers?: { id: string; name: string; customerCode?: string | null }[];
}

interface AgentCustomer {
  id: string;
  customerId: string;
  customer?: { name: string; customerCode: string };
}

export default function AgentPortalPanel({ token, customers, onError }: {
  token: string;
  customers: { id: string; name: string; customerCode: string }[];
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<AgentUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [current, setCurrent] = useState<AgentUser | null>(null);
  const [bound, setBound] = useState<AgentCustomer[]>([]);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [bindForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/portal/admin/agent-users?pageSize=100', token, {});
      setItems(data.items || []);
    } catch (e: any) { onError(e.message); }
    finally { setLoading(false); }
  }, [token, onError]);

  useEffect(() => { load(); }, [load]);

  async function createUser(values: any) {
    try {
      await apiRequest('/portal/admin/agent-users', token, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      message.success('代理账号已创建');
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: any) { onError(e.message); }
  }

  async function resetPassword(values: any) {
    try {
      await apiRequest(`/portal/admin/agent-users/${current!.id}/reset-password`, token, {
        method: 'POST',
        body: JSON.stringify({ password: values.password }),
      });
      message.success(`账号 ${current!.username} 密码已重置`);
      setResetOpen(false);
      resetForm.resetFields();
    } catch (e: any) { onError(e.message); }
  }

  async function openBind(record: AgentUser) {
    setCurrent(record);
    setBindOpen(true);
    bindForm.resetFields();
    setBound((record.customers || []).map((c: any) => ({ id: c.id, customerId: c.id, customer: { name: c.name, customerCode: c.customerCode } })));
  }

  async function bindCustomers(values: any) {
    try {
      await apiRequest(`/portal/admin/agent-users/${current!.id}/bind-customers`, token, {
        method: 'POST',
        body: JSON.stringify({ customerIds: values.customerIds }),
      });
      message.success('绑定成功');
      setBindOpen(false);
      load();
    } catch (e: any) { onError(e.message); }
  }

  async function unbindCustomer(customerId: string) {
    try {
      await apiRequest(`/portal/admin/agent-users/${current!.id}/unbind-customers/${customerId}`, token, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      message.success('已解绑');
      setBound((b) => b.filter((x) => x.customerId !== customerId));
      load();
    } catch (e: any) { onError(e.message); }
  }

  return (
    <Card
      title="代理账号管理（B 端登录账号）"
      extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>创建代理账号</Button></Space>}
    >
      <Table rowKey="id" size="middle" loading={loading} dataSource={items} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无代理账号' }} columns={[
        { title: '登录账号', dataIndex: 'username' },
        { title: '显示名称', dataIndex: 'displayName' },
        { title: '手机号', dataIndex: 'phone', render: (v: string) => v || '—' },
        { title: '绑定客户数', dataIndex: 'customers', render: (_: any, r: AgentUser) => r.customers?.length ?? 0 },
        { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : '停用'}</Tag> },
        { title: '创建时间', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
        {
          title: '操作', render: (_: any, r: AgentUser) => (
            <Space>
              <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openBind(r)}>绑定客户</Button>
              <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => { setCurrent(r); setResetOpen(true); resetForm.resetFields(); }}>重置密码</Button>
            </Space>
          ),
        },
      ]} />

      <Modal title="创建代理账号" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={createUser} requiredMark={false}>
          <Form.Item name="username" label="登录账号" rules={[{ required: true, message: '请输入登录账号' }]}>
            <Input placeholder="例如：agent01" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
            <Input.Password placeholder="请输入初始密码" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
            <Input placeholder="例如：一级代理张三" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input placeholder="选填" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>创建</Button>
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

      <Modal title={`绑定客户：${current?.displayName || ''}`} open={bindOpen} onCancel={() => setBindOpen(false)} footer={null} width={640}>
        {bound.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Typography.Text strong>已绑定客户</Typography.Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {bound.map((b) => (
                <Tag key={b.customerId} closable onClose={() => unbindCustomer(b.customerId)} color="blue">
                  {b.customer?.name || b.customerId}
                </Tag>
              ))}
            </div>
          </div>
        )}
        <Form form={bindForm} layout="vertical" onFinish={bindCustomers} requiredMark={false}>
          <Form.Item name="customerIds" label="选择要绑定的客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select mode="multiple" showSearch optionFilterProp="label" placeholder="可多选"
              options={customers.map((c: any) => ({ value: c.id, label: `${c.name}（${c.customerCode}）` }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>确认绑定</Button>
        </Form>
      </Modal>
    </Card>
  );
}
