'use client';
import { useState, useEffect } from 'react';
import useAutoRefresh from '../utils/useAutoRefresh';
import { apiRequest, getToken } from '../utils/api';
import { downloadExcel } from '../utils/export';
import { Upload, Button, message, Table, Modal, Select, Input, InputNumber, DatePicker, Tag, Space, Card, Typography, Popconfirm, Divider, Empty } from 'antd';
import { UploadOutlined, DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getUserInfo, getPermissionActions } from '../utils/permissions';

const statusMap: any = {
  DRAFT: { label: '草稿', color: 'default' },
  PENDING_APPROVAL: { label: '待审批', color: 'warning' },
  ACTIVE: { label: '生效中', color: 'success' },
  EXPIRING: { label: '即将到期', color: 'gold' },
  EXPIRED: { label: '已到期', color: 'default' },
  TERMINATED: { label: '已终止', color: 'error' },
};

function formatSize(bytes?: number) {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function daysUntil(expiryDate?: string) {
  if (!expiryDate) return null;
  const now = new Date();
  const exp = new Date(expiryDate);
  const diff = exp.getTime() - now.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export default function CustomerContractsPage() {
  const user = getUserInfo();
  const perm = getPermissionActions(user);
  const canDelete = perm.canDelete;
  const canApprove = perm.canApprove;
  const [contracts, setContracts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filter, setFilter] = useState({ status: '', keyword: '' });

  useEffect(() => {
    loadContracts();
    loadCustomers();
  }, []);
  useAutoRefresh(() => { loadContracts(); loadCustomers(); }, []);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      if (filter.keyword) params.set('keyword', filter.keyword);
      const res = await apiRequest(`/customer-contracts?page=1&pageSize=100&${params}`, getToken());
      setContracts(res.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCustomers = async () => {
    try {
      const res = await apiRequest('/customers?page=1&pageSize=100', getToken());
      setCustomers((Array.isArray(res) ? res : (res as any)?.items) || []);
    } catch (e) { console.error(e); }
  };

  const save = async (data: any) => {
    try {
      if (editing) {
        await apiRequest(`/customer-contracts/${editing.id}`, getToken(), { method: 'PUT', body: JSON.stringify(data) });
        message.success('保存成功');
        setShowModal(false);
        loadContracts();
      } else {
        const created = await apiRequest('/customer-contracts', getToken(), { method: 'POST', body: JSON.stringify(data) });
        message.success('合同创建成功，可继续上传附件');
        setEditing(created);
        loadContracts();
      }
    } catch (e: any) { message.error(e.message || '保存失败'); }
  };

  const submitApproval = async (id: string) => {
    if (!confirm('确定提交审批？')) return;
    try {
      await apiRequest(`/customer-contracts/${id}/submit`, getToken(), { method: 'POST' });
      message.success('已提交审批');
      loadContracts();
    } catch (e: any) { message.error(e.message || '操作失败'); }
  };

  const approve = async (id: string) => {
    try {
      await apiRequest(`/customer-contracts/${id}/approve`, getToken(), { method: 'POST', body: JSON.stringify({}) });
      message.success('审批通过');
      loadContracts();
    } catch (e: any) { message.error(e.message || '操作失败'); }
  };

  const reject = async (id: string) => {
    const reason = prompt('请输入驳回原因');
    if (!reason) return;
    try {
      await apiRequest(`/customer-contracts/${id}/reject`, getToken(), { method: 'POST', body: JSON.stringify({ reason }) });
      message.success('已驳回');
      loadContracts();
    } catch (e: any) { message.error(e.message || '操作失败'); }
  };

  const terminate = async (id: string) => {
    const reason = prompt('请输入终止原因');
    if (!reason) return;
    try {
      await apiRequest(`/customer-contracts/${id}/terminate`, getToken(), { method: 'POST', body: JSON.stringify({ reason }) });
      message.success('合同已终止');
      loadContracts();
    } catch (e: any) { message.error(e.message || '操作失败'); }
  };

  const remove = async (id: string) => {
    try {
      await apiRequest(`/customer-contracts/${id}`, getToken(), { method: 'DELETE' });
      message.success('合同已删除');
      loadContracts();
    } catch (e: any) { message.error(e.message || '删除失败'); }
  };

  const columns = [
    { title: '合同编号', dataIndex: 'contractNo', key: 'contractNo', width: 170 },
    { title: '合同名称', dataIndex: 'name', key: 'name', width: 180, render: (v: string, r: any) => <Typography.Text strong>{v}</Typography.Text> },
    { title: '客户', key: 'customer', width: 120, render: (_: any, r: any) => r.customer?.name || '-' },
    { title: '金额', key: 'amount', width: 120, render: (_: any, r: any) => <Typography.Text>¥{Number(r.amount).toLocaleString()}</Typography.Text> },
    { title: '有效期', key: 'period', width: 210, render: (_: any, r: any) => (
        <span className="text-sm" style={{ color: '#64748b' }}>
          {r.effectiveDate ? dayjs(String(r.effectiveDate)).format('YYYY年MM月DD日') : '-'} ~ {r.expiryDate ? dayjs(String(r.expiryDate)).format('YYYY年MM月DD日') : '-'}
        </span>
      ) },
    { title: '剩余天数', key: 'days', width: 110, render: (_: any, r: any) => {
        const days = daysUntil(r.expiryDate);
        if (days === null || r.status === 'EXPIRED' || r.status === 'TERMINATED') return <span style={{ color: '#94a3b8' }}>-</span>;
        const urgent = days <= 7;
        return <Tag color={urgent ? 'red' : days <= 30 ? 'orange' : 'green'}>{days > 0 ? `剩余 ${days} 天` : '已过期'}</Tag>;
      } },
    { title: '状态', key: 'status', width: 100, render: (_: any, r: any) => {
        const s = statusMap[r.status] || { label: r.status, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      } },
    { title: '操作', key: 'action', width: 220, render: (_: any, r: any) => (
        <Space size={4} wrap>
          {r.status === 'DRAFT' && (
            <>
              <Button size="small" onClick={() => { setEditing(r); setShowModal(true); }}>编辑</Button>
              <Button size="small" type="primary" ghost onClick={() => submitApproval(r.id)}>提交审批</Button>
              {canDelete && (
                <Popconfirm title="确定删除该合同？" onConfirm={() => remove(r.id)}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              )}
            </>
          )}
          {r.status === 'PENDING_APPROVAL' && (
            <>
              {canApprove && <Button size="small" type="primary" onClick={() => approve(r.id)}>通过</Button>}
              {canApprove && <Button size="small" danger onClick={() => reject(r.id)}>驳回</Button>}
            </>
          )}
          {(r.status === 'ACTIVE' || r.status === 'EXPIRING') && canApprove && (
            <Button size="small" danger onClick={() => terminate(r.id)}>终止</Button>
          )}
        </Space>
      ) },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-5">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>客户合同管理</Typography.Title>
          <Typography.Text type="secondary">维护客户合同、审批与到期跟踪</Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { loadContracts(); loadCustomers(); }}>刷新</Button>
          <Button icon={<FileExcelOutlined />} onClick={async () => { try { await downloadExcel('/customer-contracts/export', getToken(), '客户合同.xlsx'); } catch (e: any) { message.error(e.message); } }}>导出Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setShowModal(true); }}>新增合同</Button>
        </Space>
      </div>

      <Card
        className="!bg-white/70 backdrop-blur rounded-2xl"
        styles={{ body: { padding: 16 } }}
      >
        <div className="flex flex-wrap gap-3 mb-4">
          <Input.Search
            placeholder="搜索合同名称"
            allowClear
            style={{ width: 260 }}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={filter.keyword}
            onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
            onSearch={loadContracts}
          />
          <Select
            style={{ width: 140 }}
            value={filter.status}
            onChange={(v) => { setFilter({ ...filter, status: v }); setTimeout(loadContracts, 0); }}
            options={[{ value: '', label: '全部状态' }, ...Object.entries(statusMap).map(([k, v]: any) => ({ value: k, label: v.label }))]}
          />
          <Button onClick={loadContracts}>查询</Button>
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={contracts}
          columns={columns}
          pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条合同` }}
          locale={{ emptyText: <Empty description="暂无合同" /> }}
          rowClassName={(r: any) => {
            const days = daysUntil(r.expiryDate);
            const urgent = r.status === 'EXPIRING' && days !== null && days <= 7;
            return urgent ? 'ant-table-row-urgent' : '';
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        open={showModal}
        title={editing ? '编辑合同' : '新增合同'}
        footer={null}
        width={680}
        onCancel={() => setShowModal(false)}
        destroyOnClose
        styles={{ body: { paddingTop: 8 } }}
      >
        <ContractForm initial={editing} customers={customers} onSubmit={save} onClose={() => setShowModal(false)} />
      </Modal>
    </div>
  );
}

function ContractForm({ initial, customers, onSubmit, onClose }: any) {
  const [form, setForm] = useState({
    customerId: '', name: '', partyA: '', partyB: '',
    signDate: '', effectiveDate: '', expiryDate: '',
    amount: 0, remark: '', ...initial,
  });
  const [attachments, setAttachments] = useState<any[]>(initial?.attachments || []);
  const [uploading, setUploading] = useState(false);
  const contractId = initial?.id;

  useEffect(() => {
    setAttachments(initial?.attachments || []);
  }, [initial?.id]);

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('确定删除该附件？')) return;
    try {
      await apiRequest(`/customer-contracts/${contractId}/attachments/${attachmentId}`, getToken(), { method: 'DELETE' });
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      message.success('附件已删除');
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  const renderDate = (key: 'signDate' | 'effectiveDate' | 'expiryDate', label: string) => (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>{label}</label>
      <DatePicker
        style={{ width: '100%' }}
        format="YYYY年MM月DD日"
        value={form[key] ? dayjs(String(form[key]).slice(0, 10)) : null}
        onChange={(d) => setForm({ ...form, [key]: d ? d.format('YYYY-MM-DD') : '' })}
        placeholder="请选择日期"
        allowClear
      />
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>客户 *</label>
          <Select
            style={{ width: '100%' }}
            placeholder="请选择客户"
            value={form.customerId || undefined}
            onChange={(v) => setForm({ ...form, customerId: v })}
            disabled={!!initial}
            options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
            showSearch
            optionFilterProp="label"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>合同名称 *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入合同名称" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>甲方</label>
          <Input value={form.partyA || ''} onChange={(e) => setForm({ ...form, partyA: e.target.value })} placeholder="甲方" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>乙方</label>
          <Input value={form.partyB || ''} onChange={(e) => setForm({ ...form, partyB: e.target.value })} placeholder="乙方" />
        </div>
        {renderDate('signDate', '签约日期')}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>合同金额</label>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            precision={2}
            value={form.amount}
            onChange={(v) => setForm({ ...form, amount: v || 0 })}
            placeholder="合同金额"
            prefix="¥"
          />
        </div>
        {renderDate('effectiveDate', '生效日期')}
        {renderDate('expiryDate', '到期日期')}
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>备注</label>
          <Input.TextArea rows={3} value={form.remark || ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="备注说明" />
        </div>
      </div>

      {contractId ? (
        <div className="mt-5 border-t pt-4">
          <label className="block text-sm font-medium mb-2" style={{ color: '#475569' }}>合同附件</label>
          <Upload
            name="file"
            multiple
            showUploadList={false}
            customRequest={async (options: any) => {
              const { file, onSuccess, onError } = options;
              const token = getToken();
              const formData = new FormData();
              formData.append('file', file);
              setUploading(true);
              try {
                const res = await fetch(`/api/customer-contracts/${contractId}/attachments/upload`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                  body: formData,
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.message || '上传失败');
                }
                const data = await res.json();
                onSuccess(data);
                setAttachments((prev) => [...prev, data]);
                message.success('附件上传成功');
              } catch (e: any) {
                onError(e);
                message.error(e.message || '上传失败');
              } finally {
                setUploading(false);
              }
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploading}>
              上传附件（可多选）
            </Button>
          </Upload>

          {attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <DownloadOutlined className="text-gray-400" />
                    <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {att.fileName}
                    </a>
                    <span className="text-gray-400 text-xs">{formatSize(att.fileSize)}</span>
                  </div>
                  <Popconfirm title="确定删除该附件？" onConfirm={() => handleDeleteAttachment(att.id)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 border-t pt-4 text-sm" style={{ color: '#94a3b8' }}>
          保存合同后可上传附件
        </div>
      )}

      <Divider style={{ margin: '16px 0 12px' }} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" htmlType="submit">保存</Button>
      </div>
    </form>
  );
}
