'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';

type Customer = { id: string; name: string; customerCode: string };
type ServiceFeeConfig = {
  id: string;
  customerId: string;
  rate: string;
  defaultAmount: string;
  needInvoice: boolean;
  status: string;
  remark: string | null;
  customer?: { id: string; name: string; customerCode: string };
};

export default function ServiceFeeConfigPanel({ token, customers, onError }: { token: string; customers: Customer[]; onError: (msg: string) => void }) {
  const [items, setItems] = useState<ServiceFeeConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceFeeConfig | null>(null);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: ServiceFeeConfig[] }>('/service-fee-configs', token);
      setItems(res.items || []);
    } catch (e) {
      onError(e instanceof Error ? e.message : '服务费配置查询失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ rate: 0, defaultAmount: 0, needInvoice: true, status: 'ACTIVE' });
    setModalOpen(true);
  }

  function openEdit(row: ServiceFeeConfig) {
    setEditing(row);
    form.setFieldsValue({
      customerId: row.customerId,
      rate: parseFloat(row.rate),
      defaultAmount: parseFloat(row.defaultAmount),
      needInvoice: row.needInvoice,
      status: row.status,
      remark: row.remark || '',
    });
    setModalOpen(true);
  }

  async function handleSubmit(values: { customerId: string; rate: number; defaultAmount: number; needInvoice: boolean; status: string; remark?: string }) {
    try {
      await apiRequest('/service-fee-configs', token, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      message.success(editing ? '配置已更新' : '配置已添加');
      setModalOpen(false);
      form.resetFields();
      void load();
    } catch (e) {
      onError(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function handleDelete(row: ServiceFeeConfig) {
    try {
      await apiRequest(`/service-fee-configs/${row.id}`, token, { method: 'DELETE' });
      message.success('已删除');
      void load();
    } catch (e) {
      onError(e instanceof Error ? e.message : '删除失败');
    }
  }

  const columns = [
    { title: '客户名称', dataIndex: ['customer', 'name'], render: (v: string, row: ServiceFeeConfig) => v || customers.find((c) => c.id === row.customerId)?.name || '-' },
    { title: '客户编码', dataIndex: ['customer', 'customerCode'], render: (v: string) => v || '-' },
    { title: '服务费比例(%)', dataIndex: 'rate', render: (v: string) => <Typography.Text strong>{v}%</Typography.Text> },
    { title: '默认金额', dataIndex: 'defaultAmount', render: (v: string) => `¥${v}` },
    {
      title: '是否需开票(对公)',
      dataIndex: 'needInvoice',
      render: (v: boolean) => v ? <Tag color="blue">需开票</Tag> : <Tag color="default">不需要</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '启用' : '停用'}</Tag>,
    },
    { title: '备注', dataIndex: 'remark', render: (v: string) => v || '-', ellipsis: true },
    {
      title: '操作',
      render: (_: any, row: ServiceFeeConfig) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(row)}>编辑</Button>
          <Popconfirm title="确认删除该配置？" onConfirm={() => handleDelete(row)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="服务费配置"
      extra={<Button type="primary" onClick={openCreate}>新增配置</Button>}
    >
      <Table rowKey="id" loading={loading} dataSource={items} columns={columns} pagination={{ pageSize: 20 }} />

      <Modal
        title={editing ? '编辑服务费配置' : '新增服务费配置'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="请选择客户"
              disabled={!!editing}
              options={customers.map((c) => ({ value: c.id, label: `${c.name}（${c.customerCode}）` }))}
            />
          </Form.Item>
          <Form.Item name="rate" label="服务费比例(%)" rules={[{ required: true, message: '请输入比例' }]}>
            <InputNumber min={0} max={100} step={0.1} precision={2} style={{ width: '100%' }} placeholder="如 2.5 表示 2.5%" />
          </Form.Item>
          <Form.Item name="defaultAmount" label="默认金额(元)">
            <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="默认服务费金额" />
          </Form.Item>
          <Form.Item name="needInvoice" label="对公需开票" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="ACTIVE">
            <Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
