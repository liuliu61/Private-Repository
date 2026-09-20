'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../utils/api';
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input,
  message, Descriptions, Row, Col
} from 'antd';
import { PlusOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';

interface CustomerPanelProps {
  token: string;
  onError: (error: string) => void;
}

export default function CustomerPanel({ token, onError }: CustomerPanelProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/customers?page=${page}&pageSize=${pageSize}`, token, {});
      setData(res.items || res || []);
      setTotal(res.total || (res.items ? res.total : res.length) || 0);
    } catch (e: any) { onError(e.message); } finally { setLoading(false); }
  }, [token, page, pageSize, onError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (values: any) => {
    try {
      await apiRequest('/customers', token, { method: 'POST', body: JSON.stringify(values) });
      message.success('客户创建成功');
      setCreateModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (e: any) { onError(e.message); }
  };

  const openDetail = async (record: any) => {
    try {
      const detail = await apiRequest(`/customers/${record.id}`, token, {});
      setCurrentCustomer(detail);
      setDetailModalOpen(true);
    } catch (e: any) {
      setCurrentCustomer(record);
      setDetailModalOpen(true);
    }
  };

  const columns = [
    { title: '客户编码', dataIndex: 'customerCode', key: 'customerCode', width: 150 },
    { title: '客户名称', dataIndex: 'name', key: 'name', width: 200 },
    { title: '全称', dataIndex: 'fullName', key: 'fullName', width: 200, render: (v: string) => v || '-' },
    { title: '联系人', dataIndex: 'contact', key: 'contact', width: 120, render: (v: string) => v || '-' },
    { title: '联系电话', dataIndex: 'phone', key: 'phone', width: 140, render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : '停用'}</Tag> },
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="客户管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModalOpen(true); }}>新建客户</Button>
          </Space>
        }
      >
        <Table
          rowKey="id" dataSource={data} columns={columns} loading={loading}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 个客户`,
            onChange: (p: number, ps: number) => { setPage(p); setPageSize(ps); },
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 新建客户弹窗 */}
      <Modal
        title="新建客户" open={createModalOpen} onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()} width={600} okText="创建" cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerCode" label="客户编码" rules={[{ required: true, message: '请输入客户编码' }, { max: 50, message: '最多50个字符' }]}>
                <Input placeholder="例如：CUST001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="客户名称" rules={[{ required: true, message: '请输入客户名称' }, { max: 100, message: '最多100个字符' }]}>
                <Input placeholder="例如：测试客户A" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="fullName" label="客户全称" rules={[{ max: 100, message: '最多100个字符' }]}>
            <Input placeholder="例如：XX科技有限公司（选填）" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact" label="联系人" rules={[{ max: 100, message: '最多100个字符' }]}>
                <Input placeholder="联系人姓名（选填）" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="联系电话" rules={[{ max: 50, message: '最多50个字符' }]}>
                <Input placeholder="联系电话（选填）" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注" rules={[{ max: 255, message: '最多255个字符' }]}>
            <Input.TextArea rows={2} placeholder="备注信息（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 客户详情弹窗 */}
      <Modal
        title="客户详情" open={detailModalOpen} onCancel={() => setDetailModalOpen(false)}
        footer={null} width={700}
      >
        {currentCustomer && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="客户编码">{currentCustomer.customerCode}</Descriptions.Item>
            <Descriptions.Item label="客户名称">{currentCustomer.name}</Descriptions.Item>
            <Descriptions.Item label="全称" span={2}>{currentCustomer.fullName || '-'}</Descriptions.Item>
            <Descriptions.Item label="联系人">{currentCustomer.contact || '-'}</Descriptions.Item>
            <Descriptions.Item label="联系电话">{currentCustomer.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={currentCustomer.status === 'ACTIVE' ? 'green' : 'default'}>
                {currentCustomer.status === 'ACTIVE' ? '正常' : '停用'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{currentCustomer.createdAt ? new Date(currentCustomer.createdAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>{currentCustomer.remark || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
