'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Alert, Button, Card, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';


type Customer = { id: string; name: string; customerCode: string };
type ReceiveRecord = { id: string; receiveNo: string; amount: number; receivedAt: string; customerName?: string };
type ServiceOrder = {
  id: string; orderNo: string; customerId: string; customer?: { name: string; customerCode: string };
  contractSubject?: string; transferCategory: string; deliveryType: string; businessType?: string;
  totalReceivableAmount: string; actualReceivedAmount: string; serviceCostAmount: string;
  creditAmount: string; serviceFeeAmount: string; status: string;
  confirmedAt?: string; createdBy?: string; createdAt: string; remark?: string;
  receiveRecords?: Array<{ id: string; receiveRecordId: string; amount: string; serviceFee: string; receiveRecord?: ReceiveRecord }>;
  purchaseRecords?: Array<{ id: string; purchaseOrderId?: string; adAccountId?: string; transferAmount: string; receivableAmount: string; remark?: string }>;
};

const statusMap: Record<string, { text: string; color: string }> = {
  DRAFT: { text: '草稿', color: 'default' },
  PENDING_CONFIRM: { text: '待客户确认', color: 'warning' },
  CONFIRMED: { text: '已确认', color: 'success' },
  CANCELLED: { text: '已取消', color: 'error' },
};

function formatMoney(value: string | number) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

export default function ServiceOrderPanel({ token, customers: propCustomers, onError }: { token: string; customers: Customer[]; onError: (message: string) => void }) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState<ServiceOrder | null>(null);
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(propCustomers);
  const [receiveRecords, setReceiveRecords] = useState<ReceiveRecord[]>([]);
  const [form] = Form.useForm();
  const [receiveItems, setReceiveItems] = useState<Array<{ receiveRecordId: string; amount: number; serviceFee?: number }>>([]);
  const [purchaseItems, setPurchaseItems] = useState<Array<{ adAccountId?: string; transferAmount: number; receivableAmount?: number; remark?: string }>>([]);

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

  useEffect(() => {
    async function loadReceives() {
      try {
        const res = await apiRequest<{ items: ReceiveRecord[] } | ReceiveRecord[]>('/receive-records?page=1&pageSize=100', token);
        const list = Array.isArray(res) ? res : (res.items || []);
        setReceiveRecords(list);
      } catch { setReceiveRecords([]); }
    }
    void loadReceives();
  }, [token]);

  const customers = localCustomers.length > 0 ? localCustomers : propCustomers;

  async function refresh() {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: ServiceOrder[] }>('/service-orders?page=1&pageSize=100', token);
      setOrders(res.items);
    } catch (error) { onError(error instanceof Error ? error.message : '服务订单查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [token]);

  async function handleCreate(values: Record<string, unknown>) {
    try {
      const body: Record<string, unknown> = {
        ...values,
        receiveItems,
        purchaseItems,
        totalReceivableAmount: receiveItems.reduce((sum, item) => sum + item.amount, 0),
        creditAmount: purchaseItems.reduce((sum, item) => sum + item.transferAmount, 0),
      };
      await apiRequest('/service-orders', token, { method: 'POST', body: JSON.stringify(body) });
      message.success('服务订单创建成功');
      setModalOpen(false); form.resetFields(); setReceiveItems([]); setPurchaseItems([]);
      await refresh();
    } catch (error) { message.error(error instanceof Error ? error.message : '创建失败'); }
  }

  async function handleSubmit(id: string) {
    try {
      await apiRequest(`/service-orders/${id}/submit`, token, { method: 'POST' });
      message.success('已提交，待客户确认');
      await refresh();
    } catch (error) { message.error(error instanceof Error ? error.message : '提交失败'); }
  }

  async function handleConfirm(id: string) {
    Modal.confirm({
      title: '确认服务订单',
      content: '确认后该服务订单将成为合规有效凭证，确认操作不可撤销。',
      onOk: async () => {
        try {
          await apiRequest(`/service-orders/${id}/confirm`, token, { method: 'POST', body: JSON.stringify({}) });
          message.success('服务订单已确认');
          await refresh();
        } catch (error) { message.error(error instanceof Error ? error.message : '确认失败'); }
      },
    });
  }

  async function handleCancel(id: string) {
    Modal.confirm({
      title: '取消服务订单',
      content: '确定要取消该服务订单吗？',
      onOk: async () => {
        try {
          await apiRequest(`/service-orders/${id}/cancel`, token, { method: 'POST' });
          message.success('已取消');
          await refresh();
        } catch (error) { message.error(error instanceof Error ? error.message : '取消失败'); }
      },
    });
  }

  async function viewDetail(id: string) {
    try {
      const order = await apiRequest<ServiceOrder>(`/service-orders/${id}`, token);
      setCurrent(order);
      setDetailOpen(true);
    } catch (error) { message.error(error instanceof Error ? error.message : '查询详情失败'); }
  }

  const totalReceivable = useMemo(() => receiveItems.reduce((sum, item) => sum + item.amount, 0), [receiveItems]);
  const totalCredit = useMemo(() => purchaseItems.reduce((sum, item) => sum + item.transferAmount, 0), [purchaseItems]);

  return (
    <Card title="服务订单管理" extra={<Button type="primary" onClick={() => { form.resetFields(); setReceiveItems([]); setPurchaseItems([]); setModalOpen(true); }}>新建服务订单</Button>} loading={loading}>
      <Table rowKey="id" dataSource={orders} pagination={{ pageSize: 20 }} columns={[
        { title: '订单编号', dataIndex: 'orderNo', width: 160 },
        { title: '客户', dataIndex: ['customer', 'name'], width: 150 },
        { title: '充值总应收', dataIndex: 'totalReceivableAmount', render: (v: string) => `¥${formatMoney(v)}`, width: 130 },
        { title: '代理商实收', dataIndex: 'actualReceivedAmount', render: (v: string) => `¥${formatMoney(v)}`, width: 130 },
        { title: '服务成本', dataIndex: 'serviceCostAmount', render: (v: string) => `¥${formatMoney(v)}`, width: 110 },
        { title: '充值币', dataIndex: 'creditAmount', render: (v: string) => formatMoney(v), width: 120 },
        { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag>, width: 110 },
        { title: '创建时间', dataIndex: 'createdAt', render: formatTime, width: 170 },
        { title: '操作', key: 'action', fixed: 'right', width: 200, render: (_: unknown, row: ServiceOrder) => (
          <Space size="small">
            <Button type="link" size="small" onClick={() => void viewDetail(row.id)}>详情</Button>
            {row.status === 'DRAFT' && <Button type="link" size="small" onClick={() => void handleSubmit(row.id)}>提交</Button>}
            {row.status === 'PENDING_CONFIRM' && <Button type="link" size="small" onClick={() => void handleConfirm(row.id)}>确认</Button>}
            {(row.status === 'DRAFT' || row.status === 'PENDING_CONFIRM') && <Button type="link" size="small" danger onClick={() => void handleCancel(row.id)}>取消</Button>}
          </Space>
        ) },
      ]} />

      <Modal title="新建服务订单" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="保存草稿" cancelText="取消" width={800}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="收款合计">¥{formatMoney(totalReceivable)}</Descriptions.Item>
            <Descriptions.Item label="充值币合计">{formatMoney(totalCredit)}</Descriptions.Item>
          </Descriptions>

          <Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select placeholder="请选择客户" options={customers.map((c) => ({ value: c.id, label: `${c.name}（${c.customerCode}）` }))} />
          </Form.Item>

          <Form.Item name="contractSubject" label="合同主体">
            <Input placeholder="请输入合同主体名称" />
          </Form.Item>

          <Card size="small" title="收款单信息（关联收款记录）" style={{ marginBottom: 16 }} extra={<Button size="small" onClick={() => setReceiveItems([...receiveItems, { receiveRecordId: '', amount: 0 }])}>添加</Button>}>
            {receiveItems.length === 0 && <Alert type="info" message="暂无收款记录，点击添加" showIcon />}
            {receiveItems.map((item, idx) => (
              <Space key={idx} style={{ display: 'flex', marginBottom: 8 }} align="center">
                <Select style={{ width: 280 }} placeholder="选择收款记录" value={item.receiveRecordId || undefined} onChange={(v) => { const next = [...receiveItems]; next[idx].receiveRecordId = v; const rec = receiveRecords.find((r) => r.id === v); if (rec) next[idx].amount = rec.amount; setReceiveItems(next); }} options={receiveRecords.map((r) => ({ value: r.id, label: `${r.receiveNo} - ¥${formatMoney(r.amount)}` }))} />
                <InputNumber style={{ width: 140 }} placeholder="金额" value={item.amount} min={0} onChange={(v) => { const next = [...receiveItems]; next[idx].amount = v || 0; setReceiveItems(next); }} />
                <InputNumber style={{ width: 120 }} placeholder="服务费" value={item.serviceFee} min={0} onChange={(v) => { const next = [...receiveItems]; next[idx].serviceFee = v || 0; setReceiveItems(next); }} />
                <Button danger type="link" onClick={() => setReceiveItems(receiveItems.filter((_, i) => i !== idx))}>删除</Button>
              </Space>
            ))}
          </Card>

          <Card size="small" title="方舟转账明细（关联充值记录）" style={{ marginBottom: 16 }} extra={<Button size="small" onClick={() => setPurchaseItems([...purchaseItems, { transferAmount: 0 }])}>添加</Button>}>
            {purchaseItems.length === 0 && <Alert type="info" message="暂无转账明细，点击添加" showIcon />}
            {purchaseItems.map((item, idx) => (
              <Space key={idx} style={{ display: 'flex', marginBottom: 8 }} align="center">
                <Input style={{ width: 200 }} placeholder="广告账户ID" value={item.adAccountId} onChange={(e) => { const next = [...purchaseItems]; next[idx].adAccountId = e.target.value; setPurchaseItems(next); }} />
                <InputNumber style={{ width: 140 }} placeholder="转账金额(币)" value={item.transferAmount} min={0} onChange={(v) => { const next = [...purchaseItems]; next[idx].transferAmount = v || 0; setPurchaseItems(next); }} />
                <InputNumber style={{ width: 140 }} placeholder="应收金额" value={item.receivableAmount} min={0} onChange={(v) => { const next = [...purchaseItems]; next[idx].receivableAmount = v || 0; setPurchaseItems(next); }} />
                <Button danger type="link" onClick={() => setPurchaseItems(purchaseItems.filter((_, i) => i !== idx))}>删除</Button>
              </Space>
            ))}
          </Card>

          <Form.Item name="serviceCostAmount" label="服务成本（后返金额）">
            <InputNumber style={{ width: '100%' }} min={0} placeholder="系统可根据政策自动计算" />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="服务订单详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={700}>
        {current && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions title="基础信息" bordered column={2} size="small">
              <Descriptions.Item label="订单编号">{current.orderNo}</Descriptions.Item>
              <Descriptions.Item label="客户">{current.customer?.name}</Descriptions.Item>
              <Descriptions.Item label="合同主体">{current.contractSubject || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={statusMap[current.status]?.color}>{statusMap[current.status]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatTime(current.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="确认时间">{formatTime(current.confirmedAt)}</Descriptions.Item>
            </Descriptions>

            <Descriptions title="费用项" bordered column={2} size="small">
              <Descriptions.Item label="充值总应收">¥{formatMoney(current.totalReceivableAmount)}</Descriptions.Item>
              <Descriptions.Item label="代理商实收">¥{formatMoney(current.actualReceivedAmount)}</Descriptions.Item>
              <Descriptions.Item label="服务成本">¥{formatMoney(current.serviceCostAmount)}</Descriptions.Item>
              <Descriptions.Item label="充值币">{formatMoney(current.creditAmount)}</Descriptions.Item>
              <Descriptions.Item label="服务费">¥{formatMoney(current.serviceFeeAmount)}</Descriptions.Item>
              <Descriptions.Item label="服务利润">¥{formatMoney(parseFloat(current.actualReceivedAmount) - parseFloat(current.serviceCostAmount))}</Descriptions.Item>
            </Descriptions>

            {current.receiveRecords && current.receiveRecords.length > 0 && (
              <Card size="small" title="收款单使用明细">
                <Table rowKey="id" dataSource={current.receiveRecords} pagination={false} size="small" columns={[
                  { title: '收款单号', dataIndex: ['receiveRecord', 'receiveNo'] },
                  { title: '金额', dataIndex: 'amount', render: (v: string) => `¥${formatMoney(v)}` },
                  { title: '服务费', dataIndex: 'serviceFee', render: (v: string) => `¥${formatMoney(v)}` },
                ]} />
              </Card>
            )}

            {current.purchaseRecords && current.purchaseRecords.length > 0 && (
              <Card size="small" title="方舟转账记录">
                <Table rowKey="id" dataSource={current.purchaseRecords} pagination={false} size="small" columns={[
                  { title: '广告账户', dataIndex: 'adAccountId', render: (v?: string) => v || '-' },
                  { title: '转账金额', dataIndex: 'transferAmount', render: (v: string) => formatMoney(v) },
                  { title: '应收金额', dataIndex: 'receivableAmount', render: (v: string) => `¥${formatMoney(v)}` },
                ]} />
              </Card>
            )}

            {current.remark && <Alert type="info" message={`备注：${current.remark}`} />}
          </Space>
        )}
      </Drawer>
    </Card>
  );
}
