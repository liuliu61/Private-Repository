'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message, Popconfirm } from 'antd';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Channel {
  id: string;
  name: string;
  code?: string | null;
  platform?: string | null;
  defaultCostRebatePublic: string;
  defaultCostRebatePrivate: string;
  status: string;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
}

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
  return data;
}

const platformOptions = [
  { value: 'DOUYIN', label: '抖音/巨量引擎' },
  { value: 'KUAISHOU', label: '快手' },
  { value: 'XIAOHONGSHU', label: '小红书' },
  { value: 'BAIDU', label: '百度' },
  { value: 'TENCENT', label: '腾讯' },
  { value: 'WECHAT', label: '微信' },
  { value: 'BILIBILI', label: 'B站' },
  { value: 'OTHER', label: '其他' },
];

export default function ChannelPanel({ token, onError }: { token: string; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Channel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [form] = Form.useForm();

  async function refresh() {
    setLoading(true);
    try {
      const result = await request<{ items: Channel[]; total: number }>('/channels?page=1&pageSize=100', token);
      setRows(result.items);
      setTotal(result.total);
    } catch (error) {
      onError(error instanceof Error ? error.message : '端口列表查询失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [token]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ defaultCostRebatePublic: 0, defaultCostRebatePrivate: 0, status: 'ACTIVE' });
    setModalOpen(true);
  };

  const openEdit = (record: Channel) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      platform: record.platform,
      defaultCostRebatePublic: parseFloat(record.defaultCostRebatePublic),
      defaultCostRebatePrivate: parseFloat(record.defaultCostRebatePrivate),
      status: record.status,
      remark: record.remark,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editing) {
        await request(`/channels/${editing.id}`, token, { method: 'PUT', body: JSON.stringify(values) });
        message.success('端口更新成功');
      } else {
        await request('/channels', token, { method: 'POST', body: JSON.stringify(values) });
        message.success('端口创建成功');
      }
      setModalOpen(false);
      form.resetFields();
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : '端口保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await request(`/channels/${id}`, token, { method: 'DELETE' });
      message.success('端口删除成功');
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : '端口删除失败');
    }
  };

  return (
    <Card
      title="端口管理"
      extra={<Button type="primary" onClick={openCreate}>新增端口</Button>}
      loading={loading}
    >
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={{ current: 1, pageSize: 20, total, showSizeChanger: false }}
        columns={[
          { title: '端口名称', dataIndex: 'name', width: 180 },
          { title: '端口编码', dataIndex: 'code', width: 120, render: (v: string) => v || '-' },
          { title: '所属平台', dataIndex: 'platform', width: 130, render: (v: string) => v ? <Tag color="blue">{platformOptions.find(p => p.value === v)?.label || v}</Tag> : '-' },
          { title: '对公成本返点(%)', dataIndex: 'defaultCostRebatePublic', width: 140, render: (v: string) => <b style={{ color: '#1677ff' }}>{v}%</b> },
          { title: '对私成本返点(%)', dataIndex: 'defaultCostRebatePrivate', width: 140, render: (v: string) => <b style={{ color: '#fa8c16' }}>{v}%</b> },
          { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '启用' : '停用'}</Tag> },
          { title: '备注', dataIndex: 'remark', render: (v: string) => v || '-' },
          { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
          {
            title: '操作', key: 'action', width: 130, fixed: 'right' as const,
            render: (_: unknown, record: Channel) => (
              <Space>
                <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
                <Popconfirm title="确定删除该端口吗？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑端口' : '新增端口'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        width={650}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="端口名称" rules={[{ required: true, message: '请输入端口名称' }, { max: 100, message: '最多100个字符' }]}>
            <Input placeholder="例如：全网对公、星途、智星" />
          </Form.Item>
          <Form.Item name="code" label="端口编码">
            <Input placeholder="可选，例如：GW-GONG" maxLength={50} />
          </Form.Item>
          <Form.Item name="platform" label="所属平台">
            <Select placeholder="请选择平台" allowClear options={platformOptions} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="defaultCostRebatePublic" label="对公成本返点(%)" rules={[{ required: true, message: '请输入对公成本返点' }]} style={{ flex: 1 }}>
              <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} placeholder="例如：18" />
            </Form.Item>
            <Form.Item name="defaultCostRebatePrivate" label="对私成本返点(%)" rules={[{ required: true, message: '请输入对私成本返点' }]} style={{ flex: 1 }}>
              <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} placeholder="例如：15" />
            </Form.Item>
          </div>
          <Form.Item name="status" label="状态" initialValue="ACTIVE">
            <Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '停用' }]} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea maxLength={255} rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
