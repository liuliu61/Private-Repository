'use client';
import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';

const statusMap: any = {
  DRAFT: { label: '草稿', color: 'gray' },
  PENDING_APPROVAL: { label: '待审批', color: 'orange' },
  ACTIVE: { label: '生效中', color: 'green' },
  EXPIRING: { label: '即将到期', color: 'yellow' },
  EXPIRED: { label: '已到期', color: 'gray' },
  TERMINATED: { label: '已终止', color: 'red' },
};

export default function CustomerContractsPage() {
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
      const res = await apiRequest(`/api/customer-contracts?pageSize=100&${params}`);
      setContracts(res.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCustomers = async () => {
    try {
      const res = await apiRequest('/api/customers?pageSize=200');
      setCustomers(res.items || []);
    } catch (e) { console.error(e); }
  };

  const save = async (data: any) => {
    try {
      if (editing) {
        await apiRequest(`/api/customer-contracts/${editing.id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await apiRequest('/api/customer-contracts', { method: 'POST', body: JSON.stringify(data) });
      }
      setShowModal(false);
      loadContracts();
    } catch (e: any) { alert(e.message || '保存失败'); }
  };

  const submitApproval = async (id: string) => {
    if (!confirm('确定提交审批？')) return;
    try {
      await apiRequest(`/api/customer-contracts/${id}/submit`, { method: 'POST' });
      loadContracts();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const approve = async (id: string) => {
    if (!confirm('确定审批通过？')) return;
    try {
      await apiRequest(`/api/customer-contracts/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      loadContracts();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const reject = async (id: string) => {
    const reason = prompt('请输入驳回原因');
    if (!reason) return;
    try {
      await apiRequest(`/api/customer-contracts/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      loadContracts();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const terminate = async (id: string) => {
    const reason = prompt('请输入终止原因');
    if (!reason) return;
    try {
      await apiRequest(`/api/customer-contracts/${id}/terminate`, { method: 'POST', body: JSON.stringify({ reason }) });
      loadContracts();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const remove = async (id: string) => {
    if (!confirm('确定删除该合同？')) return;
    try {
      await apiRequest(`/api/customer-contracts/${id}`, { method: 'DELETE' });
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
              <th className="text-left py-3 px-4">状态</th>
              <th className="text-left py-3 px-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-b hover:bg-white/50">
                <td className="py-3 px-4 text-sm">{c.contractNo}</td>
                <td className="py-3 px-4">{c.name}</td>
                <td className="py-3 px-4">{c.customer?.name}</td>
                <td className="py-3 px-4">¥{Number(c.amount).toLocaleString()}</td>
                <td className="py-3 px-4 text-sm">{c.effectiveDate?.slice(0, 10)} ~ {c.expiryDate?.slice(0, 10)}</td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-1 rounded text-xs text-white bg-${statusMap[c.status]?.color || 'gray'}-500`}>
                    {statusMap[c.status]?.label || c.status}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {c.status === 'DRAFT' && (
                    <>
                      <button className="text-blue-500 mr-2" onClick={() => { setEditing(c); setShowModal(true); }}>编辑</button>
                      <button className="text-green-500 mr-2" onClick={() => submitApproval(c.id)}>提交审批</button>
                      <button className="text-red-500" onClick={() => remove(c.id)}>删除</button>
                    </>
                  )}
                  {c.status === 'PENDING_APPROVAL' && (
                    <>
                      <button className="text-green-500 mr-2" onClick={() => approve(c.id)}>通过</button>
                      <button className="text-red-500" onClick={() => reject(c.id)}>驳回</button>
                    </>
                  )}
                  {(c.status === 'ACTIVE' || c.status === 'EXPIRING') && (
                    <button className="text-red-500" onClick={() => terminate(c.id)}>终止</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contracts.length === 0 && !loading && <div className="text-center py-8 text-gray-500">暂无合同</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editing ? '编辑合同' : '新增合同'}</h3>
            <ContractForm initial={editing} customers={customers} onSubmit={save} />
          </div>
        </div>
      )}
    </div>
  );
}

function ContractForm({ initial, customers, onSubmit }: any) {
  const [form, setForm] = useState({
    customerId: '', name: '', partyA: '', partyB: '',
    signDate: '', effectiveDate: '', expiryDate: '',
    amount: 0, remark: '', ...initial,
  });

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
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => window.location.reload()}>取消</button>
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-lg">保存</button>
      </div>
    </form>
  );
}
