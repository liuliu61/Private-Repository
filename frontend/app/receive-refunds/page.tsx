'use client';
import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';

const statusMap: any = {
  PENDING_APPROVAL: { label: '待审批', color: 'orange' },
  APPROVED: { label: '已审批', color: 'blue' },
  REJECTED: { label: '已驳回', color: 'red' },
  EXECUTED: { label: '已执行', color: 'green' },
};

export default function ReceiveRefundsPage() {
  const [refunds, setRefunds] = useState<any[]>([]);
  const [receiveRecords, setReceiveRecords] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  useEffect(() => {
    loadRefunds();
    loadReceiveRecords();
    loadCustomers();
  }, []);

  const loadRefunds = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/receive-refunds?pageSize=100');
      setRefunds(res.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadReceiveRecords = async () => {
    try {
      const res = await apiRequest('/api/receive-records?pageSize=200&status=POSTED');
      setReceiveRecords(res.items || []);
    } catch (e) { console.error(e); }
  };

  const loadCustomers = async () => {
    try {
      const res = await apiRequest('/api/customers?pageSize=200');
      setCustomers(res.items || []);
    } catch (e) { console.error(e); }
  };

  const createRefund = async (data: any) => {
    try {
      await apiRequest('/api/receive-refunds', { method: 'POST', body: JSON.stringify(data) });
      setShowModal(false);
      loadRefunds();
    } catch (e: any) { alert(e.message || '创建失败'); }
  };

  const approve = async (id: string) => {
    if (!confirm('确定审批通过？')) return;
    try {
      await apiRequest(`/api/receive-refunds/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      loadRefunds();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const reject = async (id: string) => {
    const reason = prompt('请输入驳回原因');
    if (!reason) return;
    try {
      await apiRequest(`/api/receive-refunds/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      loadRefunds();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const execute = async (id: string) => {
    if (!confirm('确定执行退款？将扣减客户钱包余额。')) return;
    try {
      await apiRequest(`/api/receive-refunds/${id}/execute`, { method: 'POST' });
      loadRefunds();
    } catch (e: any) { alert(e.message || '执行失败'); }
  };

  const remove = async (id: string) => {
    if (!confirm('确定删除该退款申请？')) return;
    try {
      await apiRequest(`/api/receive-refunds/${id}`, { method: 'DELETE' });
      loadRefunds();
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">收款单退款</h1>
        <button className="bg-blue-500 text-white px-4 py-2 rounded-lg" onClick={() => { setSelectedRecord(null); setShowModal(true); }}>
          + 发起退款
        </button>
      </div>

      <div className="bg-white/60 backdrop-blur rounded-2xl p-6">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-4">退款单号</th>
              <th className="text-left py-3 px-4">客户</th>
              <th className="text-left py-3 px-4">关联收款单</th>
              <th className="text-left py-3 px-4">退款金额</th>
              <th className="text-left py-3 px-4">扣减钱包</th>
              <th className="text-left py-3 px-4">状态</th>
              <th className="text-left py-3 px-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id} className="border-b hover:bg-white/50">
                <td className="py-3 px-4 text-sm">{r.refundNo}</td>
                <td className="py-3 px-4">{r.customer?.name}</td>
                <td className="py-3 px-4 text-sm">{r.receiveRecord?.receiveNo}</td>
                <td className="py-3 px-4 text-red-500">¥{Number(r.amount).toLocaleString()}</td>
                <td className="py-3 px-4">{r.deductWallet ? '是' : '否'}</td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-1 rounded text-xs text-white bg-${statusMap[r.status]?.color || 'gray'}-500`}>
                    {statusMap[r.status]?.label || r.status}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {r.status === 'PENDING_APPROVAL' && (
                    <>
                      <button className="text-green-500 mr-2" onClick={() => approve(r.id)}>通过</button>
                      <button className="text-red-500 mr-2" onClick={() => reject(r.id)}>驳回</button>
                      <button className="text-gray-500" onClick={() => remove(r.id)}>删除</button>
                    </>
                  )}
                  {r.status === 'APPROVED' && (
                    <button className="text-blue-500" onClick={() => execute(r.id)}>执行退款</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {refunds.length === 0 && !loading && <div className="text-center py-8 text-gray-500">暂无退款申请</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">发起退款</h3>
            <RefundForm records={receiveRecords} customers={customers} onSubmit={createRefund} />
          </div>
        </div>
      )}
    </div>
  );
}

function RefundForm({ records, customers, onSubmit }: any) {
  const [form, setForm] = useState({
    receiveRecordId: '', customerId: '', amount: 0,
    feeType: 'REFUND', reason: '', deductWallet: true, remark: '',
  });
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  const handleRecordChange = (id: string) => {
    const record = records.find((r: any) => r.id === id);
    setSelectedRecord(record);
    setForm({ ...form, receiveRecordId: id, customerId: record?.customerId || '' });
  };

  const availableRefund = selectedRecord
    ? Number(selectedRecord.postedAmount || 0) - Number(selectedRecord.refundedAmount || 0)
    : 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">选择收款单 *</label>
          <select className="w-full border rounded-lg px-3 py-2" value={form.receiveRecordId} onChange={(e) => handleRecordChange(e.target.value)} required>
            <option value="">请选择收款单</option>
            {records.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.receiveNo} - {r.customer?.name} - ¥{Number(r.amount).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        {selectedRecord && (
          <div className="bg-blue-50 p-3 rounded-lg text-sm">
            <div>已入账金额：¥{Number(selectedRecord.postedAmount || 0).toLocaleString()}</div>
            <div>已退款金额：¥{Number(selectedRecord.refundedAmount || 0).toLocaleString()}</div>
            <div className="text-blue-600 font-medium">可退款金额：¥{availableRefund.toLocaleString()}</div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">退款金额 *</label>
          <input type="number" className="w-full border rounded-lg px-3 py-2" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required max={availableRefund} />
          {form.amount > availableRefund && <p className="text-red-500 text-sm mt-1">退款金额不能超过可退款金额</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">费用类型</label>
          <select className="w-full border rounded-lg px-3 py-2" value={form.feeType} onChange={(e) => setForm({ ...form, feeType: e.target.value })}>
            <option value="REFUND">退款</option>
            <option value="OTHER">其他</option>
          </select>
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.deductWallet} onChange={(e) => setForm({ ...form, deductWallet: e.target.checked })} />
            <span className="text-sm">扣减客户钱包余额（如已通过红冲蓝补扣过可不勾选）</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">退款原因</label>
          <textarea className="w-full border rounded-lg px-3 py-2" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => window.location.reload()}>取消</button>
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-lg" disabled={form.amount > availableRefund}>提交审批</button>
      </div>
    </form>
  );
}
