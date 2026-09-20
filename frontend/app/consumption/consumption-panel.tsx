'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';


type Customer = { id: string; name: string; customerCode: string };
type ConsumptionRecord = {
  id: string; recordNo: string; customerId: string; customer?: { name: string; customerCode: string };
  consumptionDate: string; creditAmount: string; cashAmount: string; rebateAmount: string;
  serviceCost: string; profitAmount: string; remark?: string; createdAt: string;
};
type Overview = {
  totalCredit: string; totalCash: string; totalRebate: string; totalServiceCost: string;
  totalProfit: string; recordCount: number;
  topCustomers: Array<{ customerId: string; customerName: string; creditAmount: string; profit: string }>;
  dailyTrend: Array<{ date: string; creditAmount: string; profit: string }>;
};

function formatMoney(value: string | number) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ConsumptionPanel({ token, customers: propCustomers, onError }: { token: string; customers: Customer[]; onError: (message: string) => void }) {
  const [records, setRecords] = useState<ConsumptionRecord[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(propCustomers);
  const [filterCustomer, setFilterCustomer] = useState<string>();
  const [filterDate, setFilterDate] = useState<[string, string] | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await apiRequest<{ items: Customer[] } | Customer[]>('/customers?page=1&pageSize=100', token);
        const list = Array.isArray(res) ? res : (res.items || []);
        setLocalCustomers(list);
      } catch { /* 忽略 */ }
    }
    void loadCustomers();
  }, [token]);

  const customers = localCustomers.length > 0 ? localCustomers : propCustomers;

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      if (filterCustomer) params.set('customerId', filterCustomer);
      if (filterDate?.[0]) params.set('startDate', filterDate[0]);
      if (filterDate?.[1]) params.set('endDate', filterDate[1]);
      const [listData, ov] = await Promise.all([
        apiRequest<{ items: ConsumptionRecord[] }>(`/consumption/records?${params.toString()}`, token),
        apiRequest<Overview>('/consumption/overview', token),
      ]);
      setRecords(listData.items);
      setOverview(ov);
    } catch (error) { onError(error instanceof Error ? error.message : '消耗分析查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [token, filterCustomer, filterDate]);

  async function handleCreate(values: Record<string, unknown>) {
    try {
      await apiRequest('/consumption/records', token, { method: 'POST', body: JSON.stringify(values) });
      message.success('消耗记录创建成功');
      setModalOpen(false); form.resetFields();
      await refresh();
    } catch (error) { message.error(error instanceof Error ? error.message : '创建失败'); }
  }

  async function handleDelete(id: string) {
    Modal.confirm({
      title: '删除消耗记录',
      content: '确定要删除该消耗记录吗？此操作不可撤销。',
      onOk: async () => {
        try {
          await apiRequest(`/consumption/records/${id}`, token, { method: 'DELETE' });
          message.success('已删除');
          await refresh();
        } catch (error) { message.error(error instanceof Error ? error.message : '删除失败'); }
      },
    });
  }

  const profitRate = useMemo(() => {
    if (!overview || parseFloat(overview.totalCredit) === 0) return '0.00';
    return ((parseFloat(overview.totalProfit) / parseFloat(overview.totalCredit)) * 100).toFixed(2);
  }, [overview]);

  return (
    <Card title="消耗分析 / 经分" extra={<Button type="primary" onClick={() => setModalOpen(true)}>录入消耗</Button>} loading={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space wrap>
          <Select style={{ width: 240 }} placeholder="按客户筛选" value={filterCustomer} onChange={setFilterCustomer} allowClear options={customers.map((c) => ({ value: c.id, label: `${c.name}（${c.customerCode}）` }))} />
          <DatePicker.RangePicker onChange={(_, dateStrings) => setFilterDate(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} />
        </Space>

        {overview && (
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={8} lg={4}><Card><Statistic title="总消耗(币)" value={formatMoney(overview.totalCredit)} /></Card></Col>
            <Col xs={12} sm={8} lg={4}><Card><Statistic title="总现金消耗" value={formatMoney(overview.totalCash)} prefix="¥" /></Card></Col>
            <Col xs={12} sm={8} lg={4}><Card><Statistic title="总返点" value={formatMoney(overview.totalRebate)} /></Card></Col>
            <Col xs={12} sm={8} lg={4}><Card><Statistic title="总服务成本" value={formatMoney(overview.totalServiceCost)} prefix="¥" /></Card></Col>
            <Col xs={12} sm={8} lg={4}><Card><Statistic title="总毛利" value={formatMoney(overview.totalProfit)} prefix="¥" valueStyle={{ color: parseFloat(overview.totalProfit) >= 0 ? '#3f8600' : '#cf1322' }} /></Card></Col>
            <Col xs={12} sm={8} lg={4}><Card><Statistic title="毛利率" value={profitRate} suffix="%" /></Card></Col>
          </Row>
        )}

        {overview?.topCustomers && overview.topCustomers.length > 0 && (
          <Card size="small" title="客户消耗TOP10">
            <Table rowKey="customerId" dataSource={overview.topCustomers} pagination={false} size="small" columns={[
              { title: '排名', key: 'rank', render: (_: unknown, __: unknown, index: number) => index + 1, width: 60 },
              { title: '客户', dataIndex: 'customerName' },
              { title: '消耗(币)', dataIndex: 'creditAmount', render: (v: string) => formatMoney(v) },
              { title: '毛利', dataIndex: 'profit', render: (v: string) => <span style={{ color: parseFloat(v) >= 0 ? '#3f8600' : '#cf1322' }}>¥{formatMoney(v)}</span> },
            ]} />
          </Card>
        )}

        <Card size="small" title="消耗明细">
          <Table rowKey="id" dataSource={records} pagination={{ pageSize: 20 }} size="small" columns={[
            { title: '记录编号', dataIndex: 'recordNo', width: 160 },
            { title: '客户', dataIndex: ['customer', 'name'], width: 150 },
            { title: '消耗日期', dataIndex: 'consumptionDate', render: (v: string) => new Date(v).toLocaleDateString('zh-CN'), width: 110 },
            { title: '消耗(币)', dataIndex: 'creditAmount', render: (v: string) => formatMoney(v), width: 120 },
            { title: '现金消耗', dataIndex: 'cashAmount', render: (v: string) => `¥${formatMoney(v)}`, width: 120 },
            { title: '返点', dataIndex: 'rebateAmount', render: (v: string) => formatMoney(v), width: 100 },
            { title: '服务成本', dataIndex: 'serviceCost', render: (v: string) => `¥${formatMoney(v)}`, width: 110 },
            { title: '毛利', dataIndex: 'profitAmount', render: (v: string) => <span style={{ color: parseFloat(v) >= 0 ? '#3f8600' : '#cf1322' }}>¥{formatMoney(v)}</span>, width: 110 },
            { title: '操作', key: 'action', width: 80, render: (_: unknown, row: ConsumptionRecord) => <Button type="link" size="small" danger onClick={() => void handleDelete(row.id)}>删除</Button> },
          ]} />
        </Card>
      </Space>

      <Modal title="录入消耗记录" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="保存" cancelText="取消" width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select placeholder="请选择客户" options={customers.map((c) => ({ value: c.id, label: `${c.name}（${c.customerCode}）` }))} />
          </Form.Item>
          <Form.Item name="consumptionDate" label="消耗日期" rules={[{ required: true, message: '请选择消耗日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="creditAmount" label="消耗(币)" rules={[{ required: true, message: '请输入消耗币数' }]}><InputNumber style={{ width: '100%' }} min={0} placeholder="账户币消耗" /></Form.Item></Col>
            <Col span={12}><Form.Item name="cashAmount" label="现金消耗(元)"><InputNumber style={{ width: '100%' }} min={0} placeholder="对应现金金额" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="rebateAmount" label="返点金额"><InputNumber style={{ width: '100%' }} min={0} placeholder="返点" /></Form.Item></Col>
            <Col span={12}><Form.Item name="serviceCost" label="服务成本(元)"><InputNumber style={{ width: '100%' }} min={0} placeholder="服务成本" /></Form.Item></Col>
          </Row>
          <Form.Item name="grossProfit" label="毛利(元，留空自动计算=现金-服务成本)"><InputNumber style={{ width: '100%' }} placeholder="留空自动计算" /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea maxLength={500} showCount /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
