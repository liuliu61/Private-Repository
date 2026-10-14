'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import {
  Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待处理', color: 'orange' },
  CONFIRMED: { label: '已确认', color: 'green' },
  REJECTED: { label: '已驳回', color: 'red' },
};

export default function PendingRechargePanel({ token, customers, onError }: {
  token: string;
  customers: { id: string; name: string; customerCode: string }[];
  onError: (error: string) => void;
}) {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [promotionOptions, setPromotionOptions] = useState<{ value: string; label: string }[]>([]);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: 'PENDING' });
      const d = await apiRequest(`/portal/admin/recharge-requests?${q}`, token);
      setData(d.items || []);
      setTotal(d.total || 0);
    } catch (e: any) { onError(e.message || '加载失败'); }
    finally { setLoading(false); }
  }, [token, page, pageSize, onError]);

  useEffect(() => { load(); }, [load]);

  // 端口与推广账户选项
  useEffect(() => {
    fetch(`/api/channels/all`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setChannels(d); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !customers?.length) return;
    const valid = customers.filter((c: any) => c.agentId);
    Promise.allSettled([
      ...valid.map((item: any) => apiRequest(`/customers/${item.id}/promotion-accounts`, token)),
      ...customers.map((item: any) => apiRequest(`/suppliers/${item.id}/promotion-accounts`, token).catch(() => null)),
    ]).then((results) => {
      const list: any[] = [];
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) {
          const rows = Array.isArray(r.value) ? r.value : (r.value.items || []);
          rows.forEach((a: any) => list.push({ value: a.id, label: `${a.accountName}（${a.customer?.name || ''}）` }));
        }
      });
      setPromotionOptions(list);
    }).catch(() => {});
  }, [token, customers]);

  const openEdit = (row: any) => {
    setEditRow(row);
    form.setFieldsValue({
      promotionAccountId: row.promotionAccountId,
      portId: row.portId || undefined,
      amount: Number(row.amount) || undefined,
      fundType: row.fundType || 'PRIVATE',
      status: row.status || 'PENDING',
      customerRebate: row.customerRebate != null ? Number(row.customerRebate) : undefined,
      costRebate: row.costRebate != null ? Number(row.costRebate) : undefined,
      remark: row.remark || undefined,
    });
    setEditOpen(true);
  };

  const handleSave = async (values: any) => {
    if (!editRow) return;
    try {
      await apiRequest(`/portal/admin/recharge-requests/${editRow.id}/update`, token, {
        method: 'POST', body: JSON.stringify(values),
      });
      message.success('充值申请已更新');
      setEditOpen(false); load();
    } catch (e: any) { onError(e.message || '保存失败'); }
  };

  const columns = [
    { title: '申请单号', dataIndex: 'requestNo', width: 200, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: '客户', dataIndex: 'customerName', width: 140, render: (v: string) => v || '—' },
    { title: '推广账户', dataIndex: 'promotionAccountName', width: 180, render: (v: string) => v || '—' },
    { title: '端口', dataIndex: 'portName', width: 120, render: (v: string | null) => v || '—' },
    { title: '金额(元)', dataIndex: 'amount', width: 120, render: (v: string) => <b>{Number(v).toFixed(2)}</b> },
    { title: '资金类型', dataIndex: 'fundType', width: 100, render: (v: string) => <Tag color={v === 'PUBLIC' ? 'blue' : 'purple'}>{v === 'PUBLIC' ? '对公' : '对私'}</Tag> },
    { title: '客户返点', dataIndex: 'customerRebate', width: 100, render: (v: string | null) => v != null ? `${v}%` : '—' },
    { title: '成本返点', dataIndex: 'costRebate', width: 100, render: (v: string | null) => v != null ? `${v}%` : '—' },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: string) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label || v}</Tag> },
    { title: '提交时间', dataIndex: 'createdAt', width: 160, render: (v: string) => v?.replace('T', ' ').slice(0, 16) },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v: string | null) => v || '—' },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right' as const,
      render: (_: any, row: any) => <Button type="link" size="small" onClick={() => openEdit(row)}>编辑</Button>,
    },
  ];

  return (
    <Card
      title={`待处理充值（共 ${total} 条）`}
      extra={<Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>}
    >
      <Table rowKey="id" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1400 }}
        pagination={{ current: page, pageSize, total, showTotal: (t: number) => `共 ${t} 条`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }} />

      <Modal title={editRow ? `编辑充值申请：${editRow.requestNo}` : '编辑充值申请'} open={editOpen}
        onCancel={() => setEditOpen(false)} onOk={() => form.submit()} width={560} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" preserve={false} onFinish={handleSave}>
          <Form.Item name="promotionAccountId" label="推广账户" rules={[{ required: true, message: '请选择推广账户' }]}>
            <Select placeholder="请选择推广账户" showSearch optionFilterProp="label" options={promotionOptions} />
          </Form.Item>
          <Form.Item name="portId" label="端口">
            <Select placeholder="请选择端口" allowClear showSearch optionFilterProp="label" options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="amount" label="金额(元)" style={{ flex: 1 }} rules={[{ required: true, message: '请输入金额' }]}>
              <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="请输入金额" />
            </Form.Item>
            <Form.Item name="fundType" label="资金类型" style={{ flex: 1 }} rules={[{ required: true, message: '请选择资金类型' }]}>
              <Select options={[{ value: 'PUBLIC', label: '对公' }, { value: 'PRIVATE', label: '对私' }]} />
            </Form.Item>
          </Space>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="customerRebate" label="客户返点(%)" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="选填" />
            </Form.Item>
            <Form.Item name="costRebate" label="成本返点(%)" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="选填" />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
