'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../utils/api';
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input, Select,
  Switch, message, Popconfirm,
} from 'antd';
import { PlusOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { downloadExcel } from '../utils/export';
import type { PermissionActions } from '../utils/permissions';

interface Customer { id: string; name: string; customerCode: string; }

interface PaymentAccount {
  id: string;
  customerId: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  autoPost: boolean;
  status: string;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: Customer;
}

export default function PaymentAccountPanel({ token, customers, perm, onError }: {
  token: string;
  customers: Customer[];
  perm?: PermissionActions;
  onError: (error: string) => void;
}) {
  const canDelete = perm?.canDelete ?? true;
  const [data, setData] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterCustomerId ? `?customerId=${filterCustomerId}` : '';
      const res = await apiRequest(`/customer-payment-accounts${params}`, token);
      setData(res.items || []);
    } catch (e: any) {
      onError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token, filterCustomerId, onError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleOpenModal = (record?: PaymentAccount) => {
    setEditing(record || null);
    form.setFieldsValue(
      record
        ? {
            customerId: record.customerId,
            accountName: record.accountName,
            accountNumber: record.accountNumber,
            bankName: record.bankName,
            autoPost: record.autoPost,
            remark: record.remark || '',
          }
        : {
            customerId: filterCustomerId || undefined,
            accountName: '',
            accountNumber: '',
            bankName: '',
            autoPost: false,
            remark: '',
          }
    );
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await apiRequest(`/customer-payment-accounts/${editing.id}`, token, {
          method: 'PUT',
          body: JSON.stringify(values),
        });
        message.success('更新成功');
      } else {
        await apiRequest('/customer-payment-accounts', token, {
          method: 'POST',
          body: JSON.stringify(values),
        });
        message.success('新增成功');
      }
      setModalOpen(false);
      fetchData();
    } catch (e: any) {
      if (e?.errorFields) return; // 表单校验错误，不提示
      onError(e.message || '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/customer-payment-accounts/${id}`, token, { method: 'DELETE' });
      message.success('删除成功');
      fetchData();
    } catch (e: any) {
      onError(e.message || '删除失败');
    }
  };

  const columns = [
    {
      title: '客户名称',
      dataIndex: ['customer', 'name'],
      width: 180,
      render: (_: string, record: PaymentAccount) => record.customer?.name || '-',
    },
    { title: '户名', dataIndex: 'accountName', width: 150 },
    { title: '账号', dataIndex: 'accountNumber', width: 180 },
    { title: '开户行', dataIndex: 'bankName', width: 160 },
    {
      title: '自动入账',
      dataIndex: 'autoPost',
      width: 100,
      render: (v: boolean) =>
        v ? <Tag color="green">开启</Tag> : <Tag color="default">关闭</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) =>
        v === 'ACTIVE' ? <Tag color="green">正常</Tag> : <Tag color="red">停用</Tag>,
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true, width: 150 },
    {
      title: '操作',
      width: 140,
      render: (_: any, record: PaymentAccount) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleOpenModal(record)}>
            编辑
          </Button>
          {canDelete && (
            <Popconfirm
              title="确定删除该打款账户？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="客户打款账户"
      extra={
        <Space>
          <Select
            placeholder="按客户筛选"
            allowClear
            style={{ width: 200 }}
            value={filterCustomerId || undefined}
            onChange={(v) => setFilterCustomerId(v || '')}
            showSearch
            optionFilterProp="children"
          >
            {customers.map((c) => (
              <Select.Option key={c.id} value={c.id}>
                {c.name}
              </Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
          <Button icon={<DownloadOutlined />} onClick={async () => { try { await downloadExcel('/customer-payment-accounts/export', token, '打款账户.xlsx'); } catch (e: any) { onError(e.message); } }}>
            导出Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            新增打款账户
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        dataSource={data}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal
        title={editing ? '编辑打款账户' : '新增打款账户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="customerId"
            label="客户"
            rules={[{ required: true, message: '请选择客户' }]}
          >
            <Select
              placeholder="请选择客户"
              showSearch
              optionFilterProp="children"
              disabled={!!editing}
            >
              {customers.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="accountName"
            label="户名"
            rules={[{ required: true, message: '请输入户名' }]}
          >
            <Input placeholder="请输入开户户名" />
          </Form.Item>
          <Form.Item
            name="accountNumber"
            label="账号"
            rules={[{ required: true, message: '请输入银行账号' }]}
          >
            <Input placeholder="请输入银行账号" />
          </Form.Item>
          <Form.Item
            name="bankName"
            label="开户行"
            rules={[{ required: true, message: '请输入开户行' }]}
          >
            <Input placeholder="请输入开户行名称" />
          </Form.Item>
          <Form.Item name="autoPost" label="自动入账" valuePropName="checked">
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
