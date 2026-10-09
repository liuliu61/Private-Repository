'use client';
import { useState, useEffect } from 'react';
import { apiRequest, getToken } from '../utils/api';
import { downloadExcel } from '../utils/export';
import { Upload, Button, message } from 'antd';
import { UploadOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { getUserInfo, getPermissionActions } from '../utils/permissions';

const statusMap: any = {
  DRAFT: { label: '草稿', color: 'gray' },
  PENDING_APPROVAL: { label: '待审批', color: 'orange' },
  ACTIVE: { label: '生效中', color: 'green' },
  EXPIRING: { label: '即将到期', color: 'yellow' },
  EXPIRED: { label: '已到期', color: 'gray' },
  TERMINATED: { label: '已终止', color: 'red' },
};

const statusColorMap: any = {
  gray: '#6b7280',
  orange: '#f97316',
  green: '#10b981',
  yellow: '#eab308',
  red: '#ef4444',
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

  const loadContracts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      if (filter.keyword) params.set('keyword', filter.keyword);
      const res = await apiRequest(`customer-contracts?page=1&pageSize=100&${params}`, getToken());
      setContracts(res.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCustomers = async () => {
    try {
      const res = await apiRequest('customers?page=1&pageSize=100', getToken());
      setCustomers(res.items || []);
    } catch (e) { console.error(e); }
  };

  const save = async (data: any) => {
    try {
      if (editing) {
        await apiRequest(`customer-contracts/${editing.id}`, getToken(), { method: 'PUT', body: JSON.stringify(data) });
        message.success('保存成功');
        setShowModal(false);
        loadContracts();
      } else {
        const created = await apiRequest('customer-contracts', getToken(), { method: 'POST', body: JSON.stringify(data) });
        message.success('合同创建成功，可继续上传附件');
        // 切换到编辑模式，保留弹窗以便上传附件
        setEditing(created);
        loadContracts();
      }
    } catch (e: any) { alert(e.message || '保存失败'); }
  };

  const submitApproval = async (id: string) => {
    if (!confirm('确定提交审批？')) return;
    try {
      await apiRequest(`customer-contracts/${id}/submit`, getToken(), { method: 'POST' });
      loadContracts();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const approve = async (id: string) => {
    if (!confirm('确定审批通过？')) return;
    try {
      await apiRequest(`customer-contracts/${id}/approve`, getToken(), { method: 'POST', body: JSON.stringify({}) });
      loadContracts();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const reject = async (id: string) => {
    const reason = prompt('请输入驳回原因');
    if (!reason) return;
    try {
      await apiRequest(`customer-contracts/${id}/reject`, getToken(), { method: 'POST', body: JSON.stringify({ reason }) });
      loadContracts();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const terminate = async (id: string) => {
    const reason = prompt('请输入终止原因');
    if (!reason) return;
    try {
      await apiRequest(`customer-contracts/${id}/terminate`, getToken(), { method: 'POST', body: JSON.stringify({ reason }) });
      loadContracts();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const remove = async (id: string) => {
    if (!confirm('确定删除该合同？')) return;
    try {
      await apiRequest(`customer-contracts/${id}`, getToken(), { method: 'DELETE' });
      loadContracts();
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">客户合同管理</h1>
        <button className="bg-blue-500 text-white px-4 py-2 rounded-lg" onClick={() => { setEditing(null); setShowModal(true); }}>
          + 新增合同
        </button>
        <button className="bg-green-500 text-white px-4 py-2 rounded-lg" onClick={async () => { try { await downloadExcel('/customer-contracts/export', getToken(), '客户合同.xlsx'); } catch (e: any) { message.error(e.message); } }}>
          导出Excel
        </button>
      </div>

      <div className="bg-white/60 backdrop-blur rounded-2xl p-6">
        <div className="flex gap-4 mb-4">
          <input className="border rounded-lg px-3 py-2" placeholder="搜索合同名称" value={filter.keyword} onChange={(e) => setFilter({ ...filter, keyword: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && loadContracts()} />
          <select className="border rounded-lg px-3 py-2" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">全部状态</option>
            {Object.entries(statusMap).map(([k, v]: any) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="bg-gray-500 text-white px-4 py-2 rounded-lg" onClick={loadContracts}>搜索</button>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-4">合同编号</th>
              <th className="text-left py-3 px-4">合同名称</th>
              <th className="text-left py-3 px-4">客户</th>
              <th className="text-left py-3 px-4">金额</th>
              <th className="text-left py-3 px-4">有效期</th>
              <th className="text-left py-3 px-4">剩余天数</th>
              <th className="text-left py-3 px-4">状态</th>
              <th className="text-left py-3 px-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => {
              const days = daysUntil(c.expiryDate);
              const urgent = (c.status === 'EXPIRING' && days !== null && days <= 7);
              return (
                <tr key={c.id} className={`border-b hover:bg-white/50 ${urgent ? 'bg-red-50' : ''}`}>
                  <td className="py-3 px-4 text-sm">{c.contractNo}</td>
                  <td className="py-3 px-4">{c.name}</td>
                  <td className="py-3 px-4">{c.customer?.name}</td>
                  <td className="py-3 px-4">¥{Number(c.amount).toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm">{c.effectiveDate?.slice(0, 10)} ~ {c.expiryDate?.slice(0, 10)}</td>
                  <td className="py-3 px-4 text-sm">
                    {days !== null && c.status !== 'EXPIRED' && c.status !== 'TERMINATED' ? (
                      <span style={{ color: urgent ? '#ef4444' : '#374151', fontWeight: urgent ? 600 : 400 }}>
                        {days > 0 ? `剩余 ${days} 天` : '已过期'}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className="px-2 py-1 rounded text-xs text-white"
                      style={{ backgroundColor: statusColorMap[statusMap[c.status]?.color] || '#6b7280' }}
                    >
                      {statusMap[c.status]?.label || c.status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {c.status === 'DRAFT' && (
                      <>
                        <button className="text-blue-500 mr-2" onClick={() => { setEditing(c); setShowModal(true); }}>编辑</button>
                        <button className="text-green-500 mr-2" onClick={() => submitApproval(c.id)}>提交审批</button>
                        {canDelete && <button className="text-red-500" onClick={() => remove(c.id)}>删除</button>}
                      </>
                    )}
                    {c.status === 'PENDING_APPROVAL' && (
                      <>
                        {canApprove && <button className="text-green-500 mr-2" onClick={() => approve(c.id)}>通过</button>}
                        {canApprove && <button className="text-red-500" onClick={() => reject(c.id)}>驳回</button>}
                      </>
                    )}
                    {(c.status === 'ACTIVE' || c.status === 'EXPIRING') && canApprove && (
                      <button className="text-red-500" onClick={() => terminate(c.id)}>终止</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {contracts.length === 0 && !loading && <div className="text-center py-8 text-gray-500">暂无合同</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editing ? '编辑合同' : '新增合同'}</h3>
            <ContractForm initial={editing} customers={customers} onSubmit={save} onClose={() => setShowModal(false)} />
          </div>
        </div>
      )}
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

  // 当切换编辑对象时重置附件列表
  useEffect(() => {
    setAttachments(initial?.attachments || []);
  }, [initial?.id]);

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('确定删除该附件？')) return;
    try {
      await apiRequest(`customer-contracts/${contractId}/attachments/${attachmentId}`, getToken(), { method: 'DELETE' });
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      message.success('附件已删除');
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">客户 *</label>
          <select className="w-full border rounded-lg px-3 py-2" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required disabled={!!initial}>
            <option value="">请选择客户</option>
            {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">合同名称 *</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">甲方</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.partyA || ''} onChange={(e) => setForm({ ...form, partyA: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">乙方</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.partyB || ''} onChange={(e) => setForm({ ...form, partyB: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">签约日期</label>
          <input type="date" className="w-full border rounded-lg px-3 py-2" value={form.signDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, signDate: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">合同金额</label>
          <input type="number" className="w-full border rounded-lg px-3 py-2" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">生效日期</label>
          <input type="date" className="w-full border rounded-lg px-3 py-2" value={form.effectiveDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">到期日期</label>
          <input type="date" className="w-full border rounded-lg px-3 py-2" value={form.expiryDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">备注</label>
          <textarea className="w-full border rounded-lg px-3 py-2" rows={3} value={form.remark || ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </div>
      </div>

      {/* 附件上传区域 —— 仅编辑已有合同时显示 */}
      {contractId ? (
        <div className="mt-6 border-t pt-4">
          <label className="block text-sm font-medium mb-2">合同附件</label>
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
                  <button
                    type="button"
                    className="text-red-500 text-sm flex items-center gap-1"
                    onClick={() => handleDeleteAttachment(att.id)}
                  >
                    <DeleteOutlined /> 删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 border-t pt-4 text-sm text-gray-400">
          保存合同后可上传附件
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="px-4 py-2 border rounded-lg" onClick={onClose}>关闭</button>
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-lg">保存</button>
      </div>
    </form>
  );
}
