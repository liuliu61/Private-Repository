'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Button, Card, Descriptions, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';

type Customer = { id: string; name: string; customerCode: string };
type Policy = { id: string; name: string; customerId: string | null; status: string; remark: string | null; versions?: { id: string; version: number; rebateType: string; rate: string; calculationMode: string | null; effectiveFrom: string; status: string }[] };
type ChangeRequest = {
  id: string;
  policyId: string;
  customerId: string;
  changeData: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  applicantId: string;
  approverId: string | null;
  approvedAt: string | null;
  rejectReason: string | null;
  remark: string | null;
  createdAt: string;
  customer?: { id: string; name: string };
  policy?: { id: string; name: string };
};

const statusMap: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待审批', color: 'orange' },
  APPROVED: { label: '已通过', color: 'green' },
  REJECTED: { label: '已驳回', color: 'red' },
};

const fieldLabels: Record<string, string> = {
  name: '政策名称',
  status: '状态',
  remark: '备注',
  adSubjectId: '广告主体ID',
  adAccountId: '广告账户ID',
  rate: '返点比例(%)',
  rebateType: '返点类型',
  calculationMode: '计算模式',
};

function parseChangeData(changeData: string): Record<string, any> {
  try { return JSON.parse(changeData); } catch { return {}; }
}

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return '-';
  if (key === 'status') return value === 'ACTIVE' ? '启用' : value === 'DISABLED' ? '停用' : String(value);
  return String(value);
}

export default function PolicyChangePanel({ token, customers, onError }: { token: string; customers: Customer[]; onError: (msg: string) => void }) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [current, setCurrent] = useState<ChangeRequest | null>(null);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [createForm] = Form.useForm();
  const [approveForm] = Form.useForm();
  const [rejectForm] = Form.useForm();

  const selectedCustomerId = Form.useWatch('customerId', createForm);
  const selectedPolicyId = Form.useWatch('policyId', createForm);

  async function load(p = page, tab = activeTab) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (tab !== 'ALL') params.set('status', tab);
      const res = await apiRequest<{ items: ChangeRequest[]; total: number }>(`/policy-change-requests?${params.toString()}`, token);
      setItems(res.items);
      setTotal(res.total);
      setPage(p);
    } catch (e) {
      onError(e instanceof Error ? e.message : '政策变更申请查询失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(1); }, [token, activeTab]);

  // 加载客户的政策列表
  useEffect(() => {
    if (!selectedCustomerId) { setPolicies([]); return; }
    setPoliciesLoading(true);
    apiRequest<{ items: Policy[] } | Policy[]>(`/customers/${selectedCustomerId}/rebate-policies?page=1&pageSize=100`, token)
      .then((res) => {
        const list = Array.isArray(res) ? res : (res.items || []);
        setPolicies(list.filter((p: any) => p.status === 'ACTIVE'));
      })
      .catch(() => setPolicies([]))
      .finally(() => setPoliciesLoading(false));
  }, [selectedCustomerId, token]);

  // 选中政策后，回填当前值到表单
  useEffect(() => {
    if (!selectedPolicyId || !policies.length) return;
    const policy = policies.find((p) => p.id === selectedPolicyId);
    if (policy) {
      createForm.setFieldsValue({
        name: policy.name,
        status: policy.status,
        remark: policy.remark || '',
      });
    }
  }, [selectedPolicyId, policies, createForm]);

  async function handleCreate(values: { customerId: string; policyId: string; name: string; status: string; remark?: string }) {
    try {
      const changeData = JSON.stringify({
        name: values.name,
        status: values.status,
        remark: values.remark || '',
      });
      await apiRequest('/policy-change-requests', token, {
        method: 'POST',
        body: JSON.stringify({ policyId: values.policyId, customerId: values.customerId, changeData, remark: values.remark || '' }),
      });
      message.success('申请已提交');
      setCreateOpen(false);
      createForm.resetFields();
      void load(1);
    } catch (e) {
      onError(e instanceof Error ? e.message : '创建申请失败');
    }
  }

  async function handleApprove(values: { remark?: string }) {
    if (!current) return;
    try {
      await apiRequest(`/policy-change-requests/${current.id}/approve`, token, {
        method: 'POST',
        body: JSON.stringify({ remark: values.remark || '' }),
      });
      message.success('已审批通过，政策已更新');
      setApproveOpen(false);
      approveForm.resetFields();
      void load(1);
    } catch (e) {
      onError(e instanceof Error ? e.message : '审批失败');
    }
  }

  async function handleReject(values: { reason: string }) {
    if (!current) return;
    try {
      await apiRequest(`/policy-change-requests/${current.id}/reject`, token, {
        method: 'POST',
        body: JSON.stringify({ reason: values.reason }),
      });
      message.success('已驳回');
      setRejectOpen(false);
      rejectForm.resetFields();
      void load(1);
    } catch (e) {
      onError(e instanceof Error ? e.message : '驳回失败');
    }
  }

  async function handleDelete(row: ChangeRequest) {
    try {
      await apiRequest(`/policy-change-requests/${row.id}`, token, { method: 'DELETE' });
      message.success('已删除');
      void load(1);
    } catch (e) {
      onError(e instanceof Error ? e.message : '删除失败');
    }
  }

  async function showDetail(row: ChangeRequest) {
    try {
      const detail = await apiRequest<ChangeRequest>(`/policy-change-requests/${row.id}`, token);
      setCurrent(detail);
      setDetailOpen(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : '详情查询失败');
    }
  }

  const changeData = current ? parseChangeData(current.changeData) : {};

  const columns = [
    { title: '客户', dataIndex: ['customer', 'name'], render: (v: string) => v || '-' },
    { title: '政策名称', dataIndex: ['policy', 'name'], render: (v: string) => v || '-' },
    {
      title: '变更内容摘要',
      dataIndex: 'changeData',
      render: (v: string) => {
        const data = parseChangeData(v);
        const keys = Object.keys(data).filter((k) => data[k] !== '' && data[k] !== null && data[k] !== undefined);
        if (!keys.length) return '-';
        return keys.slice(0, 3).map((k) => (
          <Tag key={k} style={{ marginBottom: 2 }}>{fieldLabels[k] || k}: {formatValue(k, data[k])}</Tag>
        ));
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string) => {
        const s = statusMap[v] || { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    { title: '申请时间', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    {
      title: '操作',
      render: (_: any, row: ChangeRequest) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => showDetail(row)}>详情</Button>
          {row.status === 'PENDING' && (
            <>
              <Button type="link" size="small" style={{ color: '#52c41a' }} onClick={() => { setCurrent(row); setApproveOpen(true); }}>通过</Button>
              <Button type="link" size="small" danger onClick={() => { setCurrent(row); setRejectOpen(true); }}>驳回</Button>
            </>
          )}
          {row.status !== 'APPROVED' && <Button type="link" size="small" danger onClick={() => handleDelete(row)}>删除</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="政策变更审批"
      extra={<Button type="primary" onClick={() => setCreateOpen(true)}>新建申请</Button>}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => { setActiveTab(k); setPage(1); }}
        items={[
          { key: 'ALL', label: '全部' },
          { key: 'PENDING', label: '待审批' },
          { key: 'APPROVED', label: '已通过' },
          { key: 'REJECTED', label: '已驳回' },
        ]}
        style={{ marginBottom: 16 }}
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={columns}
        pagination={{ current: page, pageSize: 20, total, onChange: (p) => load(p) }}
      />

      {/* 新建申请弹窗 */}
      <Modal
        title="新建政策变更申请"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        okText="提交申请"
        cancelText="取消"
        width={600}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="customerId" label="选择客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="请选择客户"
              options={customers.map((c) => ({ value: c.id, label: `${c.name}（${c.customerCode}）` }))}
            />
          </Form.Item>
          <Form.Item name="policyId" label="选择返点政策" rules={[{ required: true, message: '请选择政策' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={selectedCustomerId ? '请选择政策' : '请先选择客户'}
              loading={policiesLoading}
              disabled={!selectedCustomerId}
              options={policies.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          {selectedPolicyId && (
            <>
              <Form.Item name="name" label="政策名称" rules={[{ required: true, message: '请输入政策名称' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="status" label="状态" initialValue="ACTIVE">
                <Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} />
              </Form.Item>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="变更详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={600}
      >
        {current && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="客户">{current.customer?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="政策名称">{current.policy?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMap[current.status]?.color}>{statusMap[current.status]?.label || current.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="变更内容">
              {Object.entries(changeData).map(([k, v]) => (
                <div key={k} style={{ marginBottom: 4 }}>
                  <Typography.Text type="secondary">{fieldLabels[k] || k}：</Typography.Text>
                  <Typography.Text strong>{formatValue(k, v)}</Typography.Text>
                </div>
              ))}
            </Descriptions.Item>
            {current.rejectReason && (
              <Descriptions.Item label="驳回原因">
                <Typography.Text type="danger">{current.rejectReason}</Typography.Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="申请时间">{new Date(current.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
            {current.approvedAt && (
              <Descriptions.Item label="审批时间">{new Date(current.approvedAt).toLocaleString('zh-CN')}</Descriptions.Item>
            )}
            {current.remark && <Descriptions.Item label="备注">{current.remark}</Descriptions.Item>}
          </Descriptions>
        )}
      </Modal>

      {/* 审批通过弹窗 */}
      <Modal
        title="审批通过"
        open={approveOpen}
        onCancel={() => { setApproveOpen(false); approveForm.resetFields(); }}
        onOk={() => approveForm.submit()}
        okText="确认通过"
        cancelText="取消"
      >
        <Typography.Paragraph>审批通过后，系统将自动更新该政策。确认通过吗？</Typography.Paragraph>
        <Form form={approveForm} layout="vertical" onFinish={handleApprove}>
          <Form.Item name="remark" label="审批备注（可选）">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 驳回弹窗 */}
      <Modal
        title="驳回申请"
        open={rejectOpen}
        onCancel={() => { setRejectOpen(false); rejectForm.resetFields(); }}
        onOk={() => rejectForm.submit()}
        okText="确认驳回"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Form form={rejectForm} layout="vertical" onFinish={handleReject}>
          <Form.Item name="reason" label="驳回原因" rules={[{ required: true, message: '请填写驳回原因' }]}>
            <Input.TextArea rows={3} placeholder="请输入驳回原因" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
