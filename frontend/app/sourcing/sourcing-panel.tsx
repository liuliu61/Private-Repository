'use client';

import { Card, message, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

type Supplier = { id: string; name: string };
type PartnerWallet = { id: string; accountName: string; currentBalance: string; unit: string; status: string; supplierName: string };
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function apiRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || '外采配置请求失败');
  return body as T;
}

export default function SourcingPanel({ token, suppliers, onError }: { token: string; suppliers: Supplier[]; onError: (error: string) => void }) {
  const [useCustomerWallet, setUseCustomerWallet] = useState(false);
  const [wallets, setWallets] = useState<PartnerWallet[]>([]);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const setting = await apiRequest<{ useCustomerWallet: boolean }>('/sourcing/setting', token);
      setUseCustomerWallet(setting.useCustomerWallet);
      const groups = await Promise.all(suppliers.map(async (supplier) => {
        try {
          const rows = await apiRequest<Array<{ id: string; accountName: string; currentBalance: string; unit: string; status: string }>>(`/suppliers/${supplier.id}/promotion-accounts`, token);
          return rows.map((row) => ({ ...row, supplierName: supplier.name }));
        } catch { return [] as Array<PartnerWallet>; }
      }));
      setWallets(groups.flat());
    } catch (error) { onError(error instanceof Error ? error.message : '外采钱包查询失败'); }
  }

  useEffect(() => { void refresh(); }, [token, suppliers.length]);

  async function updateSetting(value: boolean) {
    setSaving(true);
    try { await apiRequest('/sourcing/setting', token, { method: 'POST', body: JSON.stringify({ useCustomerWallet: value }) }); setUseCustomerWallet(value); message.success('外采客户钱包配置已保存'); }
    catch (error) { onError(error instanceof Error ? error.message : '外采配置保存失败'); }
    finally { setSaving(false); }
  }

  return <Card title="外采配置与钱包"><Tabs items={[
    { key: 'customer', label: '客户钱包', children: <Space direction="vertical"><Typography.Text>客户钱包请在“客户钱包”模块统一查询和调整，外采订单确认时按此开关产生账户币钱包流水。</Typography.Text><Tag color={useCustomerWallet ? 'green' : 'default'}>{useCustomerWallet ? '当前已启用外采客户钱包联动' : '当前未启用外采客户钱包联动'}</Tag></Space> },
    { key: 'partner', label: '伙伴钱包', children: <Table rowKey="id" dataSource={wallets} pagination={{ pageSize: 10 }} columns={[{ title: '伙伴', dataIndex: 'supplierName' }, { title: '账户', dataIndex: 'accountName' }, { title: '单位', dataIndex: 'unit' }, { title: '余额', dataIndex: 'currentBalance' }, { title: '状态', dataIndex: 'status' }]} /> },
    { key: 'setting', label: '外采设置', children: <Space direction="vertical"><Typography.Text>启用后，外采订单确认会在同一事务中记录客户账户币钱包变化。</Typography.Text><Switch checked={useCustomerWallet} loading={saving} checkedChildren="已启用" unCheckedChildren="未启用" onChange={(value) => void updateSetting(value)} /></Space> },
  ]} /></Card>;
}
