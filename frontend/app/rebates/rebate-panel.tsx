'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input, InputNumber,
  Select, DatePicker, message, Descriptions, Row, Col, Divider, Statistic
} from 'antd';
import { PlusOutlined, ReloadOutlined, CalculatorOutlined, CheckOutlined } from '@ant-design/icons';


import { apiRequest } from '../utils/api';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';


interface RebatePanelProps {
  token: string;
  customers: any[];
  suppliers: any[];
  onError: (error: string) => void;
}

export default function RebatePanel({ token, customers, suppliers, onError }: RebatePanelProps) {
  const [rules, setRules] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'rules' | 'records'>('rules');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [calcForm] = Form.useForm();

  const fetchRules = useCallback(async () => {
    try {
      const data = await apiRequest('/rebate-rules', token, {});
      setRules(Array.isArray(data) ? data : data.items || []);
    } catch (e: any) { onError(e.message); }
  }, [token, onError]);

  const fetchRecords = useCallback(async () => {
    try {
      const data = await apiRequest('/rebates?page=1&pageSize=50', token, {});
      setRecords(Array.isArray(data) ? data : data.items || []);
    } catch (e: any) { onError(e.message); }
  }, [token, onError]);

  useEffect(() => { fetchRules(); fetchRecords(); }, [fetchRules, fetchRecords]);

  const handleCreateRule = async (values: any) => {
    try {
      await apiRequest('/rebate-rules', token, { method: 'POST', body: JSON.stringify(values) });
      message.success('创建成功');
      setCreateModalOpen(false);
      form.resetFields();
      fetchRules();
    } catch (e: any) { onError(e.message); }
  };

  const handleCalculate = async (values: any) => {
    setLoading(true);
    try {
      const result = await apiRequest('/rebates/calculate', token, { method: 'POST', body: JSON.stringify(values) });
      message.success('计算成功');
      setCalcModalOpen(false);
      calcForm.resetFields();
      fetchRecords();
    } catch (e: any) { onError(e.message); } finally { setLoading(false); }
  };

  const handleConfirm = async (id: string) => {
    try {
      await apiRequest(`/rebates/${id}/confirm`, token, { method: 'POST' });
      message.success('确认成功');
      fetchRecords();
    } catch (e: any) { onError(e.message); }
  };

  const pendingCount = records.filter((r: any) => r.status === 'PENDING' || r.status === 'CALCULATED').length;
  const confirmedCount = records.filter((r: any) => r.status === 'CONFIRMED').length;
  const totalAmount = records.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

  const ruleColumns = [
    { title: '规则名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '类型', dataIndex: 'ruleType', key: 'ruleType', width: 100, render: (v: string) => <Tag color={v === 'CUSTOMER' ? 'blue' : 'green'}>{v === 'CUSTOMER' ? '客户返点' : '供应商返点'}</Tag> },
    { title: '返点比例', dataIndex: 'rate', key: 'rate', width: 100, render: (v: number) => `${(v * 100).toFixed(2)}%` },
    { title: '最低金额', dataIndex: 'minAmount', key: 'minAmount', width: 120, render: (v: string) => v ? `¥${v}` : '-' },
    { title: '最高金额', dataIndex: 'maxAmount', key: 'maxAmount', width: 120, render: (v: string) => v ? `¥${v}` : '无上限' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '启用' : '停用'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
  ];

  const recordColumns = [
    { title: '返点单号', dataIndex: 'rebateNo', key: 'rebateNo', width: 160 },
    { title: '客户', dataIndex: ['customer', 'name'], key: 'customer', width: 120, render: (v: any) => v?.name || '-' },
    { title: '供应商', dataIndex: ['supplier', 'name'], key: 'supplier', width: 120, render: (v: any) => v?.name || '-' },
    { title: '返点金额', dataIndex: 'amount', key: 'amount', width: 120, render: (v: string) => <b>¥{v}</b> },
    { title: '计算基数', dataIndex: 'baseAmount', key: 'baseAmount', width: 120, render: (v: string) => v ? `¥${v}` : '-' },
    { title: '返点比例', dataIndex: 'rate', key: 'rate', width: 100, render: (v: number) => v ? `${(v * 100).toFixed(2)}%` : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => {
      const map: Record<string, { label: string; color: string }> = {
        PENDING: { label: '待计算', color: 'default' },
        CALCULATED: { label: '已计算', color: 'processing' },
        CONFIRMED: { label: '已确认', color: 'success' },
        REJECTED: { label: '已驳回', color: 'error' },
      };
      const info = map[v] || { label: v, color: 'default' };
      return <Tag color={info.color}>{info.label}</Tag>;
    }},
    { title: '计算时间', dataIndex: 'calculatedAt', key: 'calculatedAt', render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { title: '确认时间', dataIndex: 'confirmedAt', key: 'confirmedAt', render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, record: any) => (
        <Space>
          {(record.status === 'CALCULATED' || record.status === 'PENDING') && (
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleConfirm(record.id)}>确认</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="返点管理"
        tabList={[
          { key: 'rules', tab: '返点规则' },
          { key: 'records', tab: '返点记录' },
        ]}
        activeTabKey={activeTab}
        onTabChange={(key) => setActiveTab(key as 'rules' | 'records')}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchRules(); fetchRecords(); }}>刷新</Button>
            {activeTab === 'rules' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModalOpen(true); }}>新建规则</Button>
            )}
            {activeTab === 'records' && (
              <Button type="primary" icon={<CalculatorOutlined />} onClick={() => { calcForm.resetFields(); setCalcModalOpen(true); }}>计算返点</Button>
            )}
          </Space>
        }
      >
        {activeTab === 'rules' ? (
          <Table rowKey="id" dataSource={rules} columns={ruleColumns} loading={loading}
            pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条` }} scroll={{ x: 1000 }} />
        ) : (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}><Card><Statistic title="待确认" value={pendingCount} suffix="笔" valueStyle={{ color: '#faad14' }} /></Card></Col>
              <Col span={6}><Card><Statistic title="已确认" value={confirmedCount} suffix="笔" valueStyle={{ color: '#52c41a' }} /></Card></Col>
              <Col span={6}><Card><Statistic title="返点总额" value={totalAmount.toFixed(2)} prefix="¥" /></Card></Col>
              <Col span={6}><Card><Statistic title="规则总数" value={rules.length} suffix="条" /></Card></Col>
            </Row>
            <Table rowKey="id" dataSource={records} columns={recordColumns} loading={loading}
              pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条` }} scroll={{ x: 1400 }} />
          </div>
        )}
      </Card>

      {/* 新建规则弹窗 */}
      <Modal title="新建返点规则" open={createModalOpen} onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()} width={600} okText="创建" cancelText="取消">
        <Form form={form} layout="vertical" onFinish={handleCreateRule}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="例如：常规客户返点规则" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="ruleType" label="返点类型" rules={[{ required: true }]} initialValue="CUSTOMER">
                <Select options={[
                  { value: 'CUSTOMER', label: '客户返点' },
                  { value: 'SUPPLIER', label: '供应商返点' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rate" label="返点比例(%)" rules={[{ required: true, message: '请输入比例' }]}>
                <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} placeholder="例如：5" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="minAmount" label="最低金额(元)">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="不填则无限制" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maxAmount" label="最高金额(元)">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="不填则无上限" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="status" label="状态" initialValue="ACTIVE">
            <Select options={[
              { value: 'ACTIVE', label: '启用' },
              { value: 'INACTIVE', label: '停用' },
            ]} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 计算返点弹窗 */}
      <Modal title="计算返点" open={calcModalOpen} onCancel={() => setCalcModalOpen(false)}
        onOk={() => calcForm.submit()} confirmLoading={loading} width={600} okText="计算" cancelText="取消">
        <Form form={calcForm} layout="vertical" onFinish={handleCalculate}>
          <Form.Item name="customerId" label="客户">
            <Select placeholder="选择客户（不选则计算全部）" allowClear showSearch optionFilterProp="label"
              options={customers.map((c: any) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="supplierId" label="供应商">
            <Select placeholder="选择供应商（不选则计算全部）" allowClear showSearch optionFilterProp="label"
              options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="startDate" label="开始日期">
                <DatePicker style={{ width: '100%' }} placeholder="选择开始日期" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="结束日期">
                <DatePicker style={{ width: '100%' }} placeholder="选择结束日期" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
