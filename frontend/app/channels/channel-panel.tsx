'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message, Popconfirm } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { exportCsv } from '../utils/export';


interface Channel {
  id: string;
  name: string;
  code?: string | null;
  platform?: string | null;
  defaultCostRebatePublic: string;
  defaultCostRebatePrivate: string;
  status: string;
  remark?: string | null;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}
interface ChannelDetail {
  channel: Channel;
  promotionAccounts: Array<{ id: string; accountName: string; platform: string | null; platformAccountId: string | null; label: string | null; status: string; ownerName: string | null; currentBalance: string; customerRebatePublic: string | null; customerRebatePrivate: string | null; }>;
  recharge: { totalCount: number; totalAmount: string; confirmedCount: number; confirmedAmount: string; };
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ChannelDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form] = Form.useForm();

  async function refresh() {
    setLoading(true);
    try {
      const result = await apiRequest<{ items: Channel[]; total: number }>('/channels?page=1&pageSize=100', token);
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
        await apiRequest(`/channels/${editing.id}`, token, { method: 'PUT', body: JSON.stringify(values) });
        message.success('端口更新成功');
      } else {
        await apiRequest('/channels', token, { method: 'POST', body: JSON.stringify(values) });
        message.success('端口创建成功');
      }
      setModalOpen(false);
      form.resetFields();
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : '端口保存失败');
    }
  };

  const openDetail = async (record: Channel) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await apiRequest<ChannelDetail>(`/channels/${record.id}/detail`, token);
      setDetail(d);
    } catch (error) { onError(error instanceof Error ? error.message : '端口详情查询失败'); }
    setDetailLoading(false);
  };

  const exportAccounts = () => {
    if (!detail) return;
    const head = ['账户名称', '客户/供应商', '平台', '平台账号ID', '标签', '状态', '当前余额', '客户返点(对公%)', '客户返点(对私%)'];
    const rows = detail.promotionAccounts.map((a) => [
      a.accountName, a.ownerName || '', a.platform || '', a.platformAccountId || '',
      a.label === 'LEADS' ? '线索' : '团购', a.status === 'ACTIVE' ? '启用' : a.status === 'DISABLED' ? '封停' : '注销',
      a.currentBalance, a.customerRebatePublic ?? '', a.customerRebatePrivate ?? '',
    ]);
    const csv = '\ufeff' + [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `端口_${detail.channel.name}_绑定账户.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/channels/${id}`, token, { method: 'DELETE' });
      message.success('端口删除成功');
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : '端口删除失败');
    }
  };

  return (
    <Card
      title="端口管理"
      extra={<Space><Button icon={<DownloadOutlined />} onClick={() => exportCsv(`端口管理_${new Date().toISOString().slice(0, 10)}`, [
        { key: 'name', title: '端口名称' },
        { key: 'code', title: '端口编码' },
        { key: 'platform', title: '所属平台' },
        { key: 'defaultCostRebatePublic', title: '对公成本返点(%)' },
        { key: 'defaultCostRebatePrivate', title: '对私成本返点(%)' },
        { key: 'pinnedLabel', title: '置顶' },
        { key: 'statusLabel', title: '状态' },
        { key: 'remark', title: '备注' },
        { key: 'createdAt', title: '创建时间' },
      ], rows.map((r) => ({ ...r, pinnedLabel: r.isPinned ? '已置顶' : '—', statusLabel: r.status === 'ACTIVE' ? '启用' : '停用' })))}>导出</Button><Button type="primary" onClick={openCreate}>新增端口</Button></Space>}
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
          { title: '置顶', dataIndex: 'isPinned', width: 80, render: (v: boolean) => v ? <Tag color="blue">已置顶</Tag> : <span style={{ color: '#cbd5e1' }}>—</span> },
          { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '启用' : '停用'}</Tag> },
          { title: '备注', dataIndex: 'remark', render: (v: string) => v || '-' },
          { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
          {
            title: '操作', key: 'action', width: 130, fixed: 'right' as const,
            render: (_: unknown, record: Channel) => (
              <Space>
                <Button type="link" size="small" onClick={() => openDetail(record)}>详情</Button>
                <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
                <Popconfirm title="确定删除该端口吗？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal title={detail ? `端口详情 - ${detail.channel.name}` : '端口详情'} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={900}>
        {detailLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div> : detail && (
          <div>
            <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
              <div><div style={{ fontSize: 12, color: '#64748b' }}>总充值单数</div><div style={{ fontSize: 20, fontWeight: 700 }}>{detail.recharge.totalCount} 笔</div></div>
              <div><div style={{ fontSize: 12, color: '#64748b' }}>累计充值金额</div><div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>¥{detail.recharge.totalAmount}</div></div>
              <div><div style={{ fontSize: 12, color: '#64748b' }}>已确认单数</div><div style={{ fontSize: 20, fontWeight: 700 }}>{detail.recharge.confirmedCount} 笔</div></div>
              <div><div style={{ fontSize: 12, color: '#64748b' }}>已确认金额</div><div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>¥{detail.recharge.confirmedAmount}</div></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b>绑定推广账户（{detail.promotionAccounts.length}）</b>
              <Button size="small" type="primary" onClick={exportAccounts} disabled={detail.promotionAccounts.length === 0}>导出绑定账户</Button>
            </div>
            <Table rowKey="id" size="small" dataSource={detail.promotionAccounts} pagination={false} locale={{ emptyText: '暂无绑定推广账户' }} columns={[
              { title: '账户名称', dataIndex: 'accountName' },
              { title: '客户/供应商', dataIndex: 'ownerName', render: (v: string) => v || '-' },
              { title: '平台', dataIndex: 'platform', render: (v: string) => v || '-' },
              { title: '平台账号ID', dataIndex: 'platformAccountId', render: (v: string) => v || '-' },
              { title: '标签', dataIndex: 'label', width: 80, render: (v: string) => <Tag color={v === 'LEADS' ? 'purple' : 'blue'}>{v === 'LEADS' ? '线索' : '团购'}</Tag> },
              { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => { const m: Record<string, any> = { ACTIVE: { c: 'green', l: '启用' }, DISABLED: { c: 'orange', l: '封停' }, CANCELLED: { c: 'default', l: '注销' } }; return <Tag color={m[v]?.c || 'default'}>{m[v]?.l || v}</Tag>; } },
              { title: '当前余额', dataIndex: 'currentBalance', render: (v: string) => <b>¥{v}</b> },
              { title: '客户返点(对公%)', dataIndex: 'customerRebatePublic', render: (v: string) => v != null ? `${v}%` : '-' },
              { title: '客户返点(对私%)', dataIndex: 'customerRebatePrivate', render: (v: string) => v != null ? `${v}%` : '-' },
            ]} />
          </div>
        )}
      </Modal>

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
