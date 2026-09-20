'use client';

import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Layout, Menu, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { BankOutlined, DashboardOutlined, FileDoneOutlined, FileTextOutlined, LogoutOutlined, ReloadOutlined, SettingOutlined, ShopOutlined, TeamOutlined, TransactionOutlined, WalletOutlined, AppstoreOutlined, FileSearchOutlined, ShoppingOutlined } from '@ant-design/icons';
import RebatePolicyPanel from './customers/rebate-policy-panel';
import CustomerPanel from './customers/customer-panel';
import SupplierRebatePolicyPanel from './suppliers/rebate-policy-panel';
import ProcurementOrderPanel from './purchase-orders/order-panel';
import SettlementPanel from './settlements/settlement-panel';
import FinancialAdjustmentPanel from './financial-adjustments/adjustment-panel';
import CustomerWalletPanel from './customer-wallets/wallet-panel';
import ReceivingPanel from './receiving/receiving-panel';
import PublicInvoiceTaskPanel from './invoices/public-invoice-task-panel';
import InvoiceProfilePanel from './customers/invoice-profile-panel';
import SourcingPanel from './sourcing/sourcing-panel';
import ServiceFeePanel from './service-fee-reconciliation/service-fee-panel';
import PaymentPostingPanel from './payment-posting/payment-posting-panel';
import RebatePanel from './rebates/rebate-panel';
import SettingsPanel from './settings/settings-panel';
import ServiceOrderPanel from './service-orders/service-order-panel';
import ConsumptionPanel from './consumption/consumption-panel';
import PromotionAccountPanel from './promotion-accounts/promotion-account-panel';
import ChannelPanel from './channels/channel-panel';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const { Header, Sider, Content } = Layout;
type Dashboard = { accountBalance: string; accountCount: number; pendingRebates: number; pendingOrders: number; pendingSettlements: number };
type Account = { id: string; name: string; accountCode: string; accountType: string; currency: string; currentBalance: string; status: string };
type Transaction = { id: string; transactionNo: string; source: string; sourceName: string; businessType: string; businessNo: string; changeAmount: string; balanceBefore: string; balanceAfter: string; occurredAt: string };

const businessTypeMap: Record<string, string> = {
  RECEIPT: '收款', CUSTOMER_PAYMENT: '客户付款', RECHARGE: '充值',
  DEDUCTION: '扣款', SUPPLIER_PAYMENT: '供应商付款', REBATE: '返点',
  REFUND: '退款', CUSTOMER_REFUND: '客户退款', ADJUSTMENT: '调整',
  OTHER: '其他', OPENING_BALANCE: '期初余额', MANUAL_ADJUSTMENT: '手工调整',
  ADJUSTMENT_RED: '红冲调整', ADJUSTMENT_BLUE: '蓝补调整',
  CUSTOMER_CREDIT: '账户充值', PROMOTION_ACCOUNT_CREDIT: '推广账户充值',
  PROMOTION_ACCOUNT_REFUND: '推广账户退款', FINANCIAL_ADJUST: '财务调整',
  WALLET_OPEN: '钱包开户',
};

const sourceMap: Record<string, { label: string; color: string }> = {
  ACCOUNT: { label: '资金账户', color: 'blue' },
  CUSTOMER_WALLET: { label: '客户钱包', color: 'green' },
  PROMOTION_ACCOUNT: { label: '推广账户', color: 'purple' },
};

const dashboardTxColumns = [
  { title: '来源', dataIndex: 'source', width: 90, render: (v: string) => { const s = sourceMap[v] || { label: v, color: 'default' }; return <Tag color={s.color}>{s.label}</Tag>; } },
  { title: '账户名', dataIndex: 'sourceName', width: 180, ellipsis: true },
  { title: '业务类型', dataIndex: 'businessType', width: 110, render: (v: string) => businessTypeMap[v] || v },
  { title: '变动金额', dataIndex: 'changeAmount', width: 110, render: (value: string) => <span style={{ color: value.startsWith('-') ? '#ef4444' : '#10b981', fontWeight: 600 }}>{value.startsWith('-') ? value : `+${value}`}</span> },
  { title: '发生时间', dataIndex: 'occurredAt', width: 160, render: (value: string) => new Date(value).toLocaleString('zh-CN') },
];

const txColumns = [
  { title: '来源', dataIndex: 'source', width: 100, render: (v: string) => { const s = sourceMap[v] || { label: v, color: 'default' }; return <Tag color={s.color}>{s.label}</Tag>; } },
  { title: '来源名称', dataIndex: 'sourceName', width: 160, ellipsis: true },
  { title: '流水号', dataIndex: 'transactionNo', width: 200 },
  { title: '业务类型', dataIndex: 'businessType', width: 120, render: (v: string) => businessTypeMap[v] || v },
  { title: '业务单号', dataIndex: 'businessNo', width: 160, render: (v: string) => v || '-' },
  { title: '变动金额', dataIndex: 'changeAmount', width: 120, render: (v: string) => <span style={{ color: v.startsWith('-') ? '#ef4444' : '#10b981', fontWeight: 600 }}>{v.startsWith('-') ? v : `+${v}`}</span> },
  { title: '变动前余额', dataIndex: 'balanceBefore', width: 120 },
  { title: '变动后余额', dataIndex: 'balanceAfter', width: 120 },
  { title: '发生时间', dataIndex: 'occurredAt', width: 170, render: (value: string) => new Date(value).toLocaleString('zh-CN') },
];

type Customer = { id: string; name: string; customerCode: string };
type Supplier = { id: string; name: string; platform: string; status: string };
type PromotionAccount = { id: string; accountName: string; unit: string; currentBalance: string };
type ReceiveRecord = { id: string; receiveNo: string; amount: string; postedAmount: string; status: string };

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
  return data;
}

export default function HomePage() {
  const { message } = App.useApp();
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [promotionAccounts, setPromotionAccounts] = useState<PromotionAccount[]>([]);
  const [receiveRecords, setReceiveRecords] = useState<ReceiveRecord[]>([]);
  const [selected, setSelected] = useState('dashboard');
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { const value = localStorage.getItem('accessToken'); if (!value) window.location.href = '/login'; else setToken(value); }, []);
  useEffect(() => { if (!token) return; Promise.all([request<Dashboard>('/dashboard', token), request<Account[]>('/accounts', token), request<{ items: Transaction[] }>('/transactions/all?page=1&pageSize=20', token), request<Customer[]>('/customers', token), request<Supplier[]>('/suppliers', token), request<{ items: ReceiveRecord[] }>('/receive-records?page=1&pageSize=50', token)]).then(([d, a, t, c, s, r]) => { setDashboard(d); setAccounts(a); setTransactions(t.items); setCustomers(c); setSuppliers(s); setReceiveRecords(r.items || []); }).catch((error) => message.error(error.message)).finally(() => setLoading(false)); }, [token, message]);
  // 每次切换菜单时刷新客户和供应商列表，确保新建客户后其他页面能看到
  useEffect(() => { if (!token || !selected) return; Promise.all([request<Customer[]>('/customers', token), request<Supplier[]>('/suppliers', token)]).then(([c, s]) => { setCustomers(c); setSuppliers(s); }).catch(() => {}); }, [token, selected]);
  useEffect(() => { if (!token || (!customers.length && !suppliers.length)) return; Promise.all([...customers.map((item) => request<PromotionAccount[]>(`/customers/${item.id}/promotion-accounts`, token)), ...suppliers.map((item) => request<PromotionAccount[]>(`/suppliers/${item.id}/promotion-accounts`, token))]).then((groups) => setPromotionAccounts(groups.flat())).catch((error) => message.error(error.message)); }, [token, customers, suppliers, message]);
  const menuItems = useMemo(() => [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: 'group-fund', icon: <WalletOutlined />, label: '资金管理', children: [
      { key: 'accounts', icon: <BankOutlined />, label: '账户管理' },
      { key: 'transactions', icon: <TransactionOutlined />, label: '资金流水' },
      { key: 'receiving', icon: <BankOutlined />, label: '收款管理' },
      { key: 'payment-posting', icon: <TransactionOutlined />, label: '充值付款' },
      { key: 'financial-adjustments', icon: <BankOutlined />, label: '财务调整' },
    ]},
    { key: 'group-business', icon: <AppstoreOutlined />, label: '业务运营', children: [
      { key: 'service-orders', icon: <FileTextOutlined />, label: '服务订单' },
      { key: 'consumption', icon: <FileTextOutlined />, label: '消耗分析' },
      { key: 'service-fee', icon: <FileDoneOutlined />, label: '服务费对账' },
      { key: 'customer-settlements', icon: <FileDoneOutlined />, label: '客户结算' },
      { key: 'supplier-settlements', icon: <FileDoneOutlined />, label: '一级代理结算' },
    ]},
    { key: 'group-invoice', icon: <FileSearchOutlined />, label: '发票管理', children: [
      { key: 'invoice-tasks', icon: <FileTextOutlined />, label: '发票任务管理' },
      { key: 'invoice-review', icon: <FileDoneOutlined />, label: '发票审核' },
      { key: 'invoice-complete', icon: <FileDoneOutlined />, label: '完成开票' },
      { key: 'invoice-profiles', icon: <TeamOutlined />, label: '客户开票信息' },
    ]},
    { key: 'group-customer', icon: <TeamOutlined />, label: '客户中心', children: [
      { key: 'customers', icon: <TeamOutlined />, label: '客户管理' },
      { key: 'customer-wallets', icon: <BankOutlined />, label: '客户钱包' },
      { key: 'promotion-accounts', icon: <TeamOutlined />, label: '推广账户' },
      { key: 'channels', icon: <TransactionOutlined />, label: '端口管理' },
      { key: 'rebates', icon: <FileDoneOutlined />, label: '返点管理' },
    ]},
    { key: 'group-sourcing', icon: <ShoppingOutlined />, label: '外采管理', children: [
      { key: 'purchase-orders', icon: <FileTextOutlined />, label: '外采订单' },
      { key: 'sourcing', icon: <BankOutlined />, label: '外采钱包与配置' },
      { key: 'suppliers', icon: <ShopOutlined />, label: '供应商成本政策' },
    ]},
    { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
  ], []);
  function logout() { localStorage.removeItem('accessToken'); window.location.href = '/'; }
  const refreshTransactions = () => { if (!token) return; request<{ items: Transaction[] }>('/transactions/all?page=1&pageSize=20', token).then(t => setTransactions(t.items)).catch(e => message.error(e.message)); };
  if (!token) return null;
  return <Layout className="admin-shell"><Sider theme="light" width={228}><div className="system-brand"><div className="brand-mark small">财</div><span>代理商财务系统</span></div><Menu mode="inline" selectedKeys={[selected]} openKeys={openKeys} onOpenChange={setOpenKeys} items={menuItems} onClick={({ key }) => setSelected(key)} /></Sider><Layout><Header className="admin-header"><Typography.Title level={4}>企业资金管理平台</Typography.Title><Space><span>欢迎回来，管理员</span><Button type="text" icon={<LogoutOutlined />} onClick={logout}>退出登录</Button></Space></Header><Content className="admin-content">{selected === 'dashboard' && <><div className="page-heading"><div><Typography.Title level={2}>工作台</Typography.Title><Typography.Paragraph type="secondary">实时掌握账户、返点和结算状态</Typography.Paragraph></div><Tag color="green">系统运行正常</Tag></div><Row gutter={[16, 16]}><Col xs={24} sm={12} lg={6}><Card><Statistic title="账户总余额" value={dashboard?.accountBalance || '0.00'} suffix="元" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="资金账户" value={dashboard?.accountCount || 0} suffix="个" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="待确认返点" value={dashboard?.pendingRebates || 0} suffix="笔" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="待处理采购单" value={dashboard?.pendingOrders || 0} suffix="笔" loading={loading} /></Card></Col></Row><Row gutter={[16, 16]} className="dashboard-grid"><Col xs={24} lg={14}><Card title="最近资金流水" extra={<Button type="link" onClick={() => setSelected('transactions')}>查看全部</Button>}><Table rowKey="id" pagination={false} dataSource={transactions.slice(0, 8)} columns={dashboardTxColumns} /></Card></Col><Col xs={24} lg={10}><Card title="账户余额概览"><Table rowKey="id" pagination={false} dataSource={accounts.slice(0, 6)} columns={[{ title: '账户', dataIndex: 'name' }, { title: '当前余额', dataIndex: 'currentBalance', render: (value: string) => <b>{value}</b> }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value === 'ACTIVE' ? '正常' : '停用'}</Tag> }]} /></Card></Col></Row></>}{selected === 'accounts' && <Card title="账户管理"><Table rowKey="id" dataSource={accounts} columns={[{ title: '账户名称', dataIndex: 'name' }, { title: '账户编码', dataIndex: 'accountCode' }, { title: '账户类型', dataIndex: 'accountType' }, { title: '当前余额', dataIndex: 'currentBalance' }, { title: '状态', dataIndex: 'status' }]} /></Card>}{selected === 'transactions' && <Card title="资金流水（整合资金账户/客户钱包/推广账户）" extra={<Button icon={<ReloadOutlined />} onClick={refreshTransactions}>刷新</Button>}><Table rowKey="id" dataSource={transactions} scroll={{ x: 1200 }} pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条流水` }} columns={txColumns} /></Card>}{selected === 'receiving' && <ReceivingPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'payment-posting' && <PaymentPostingPanel token={token} customers={customers} accounts={accounts} receiveRecords={receiveRecords} onError={(error) => message.error(error)} />}{selected === 'service-orders' && <ServiceOrderPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'consumption' && <ConsumptionPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'service-fee' && <ServiceFeePanel token={token} onError={(error) => message.error(error)} />}{selected === 'invoice-tasks' && <PublicInvoiceTaskPanel token={token} onError={(error) => message.error(error)} />}{selected === 'invoice-review' && <PublicInvoiceTaskPanel token={token} mode="review" onError={(error) => message.error(error)} />}{selected === 'invoice-complete' && <PublicInvoiceTaskPanel token={token} mode="complete" onError={(error) => message.error(error)} />}{selected === 'invoice-profiles' && <InvoiceProfilePanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'customer-wallets' && <CustomerWalletPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'sourcing' && <SourcingPanel token={token} suppliers={suppliers} customers={customers} onError={(error) => message.error(error)} />}{selected === 'customers' && <CustomerPanel token={token} onError={(error) => message.error(error)} />}{selected === 'promotion-accounts' && <PromotionAccountPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'channels' && <ChannelPanel token={token} onError={(error) => message.error(error)} />}{selected === 'suppliers' && <SupplierRebatePolicyPanel token={token} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'purchase-orders' && <ProcurementOrderPanel token={token} customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'customer-settlements' && <SettlementPanel token={token} mode="customer" customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'supplier-settlements' && <SettlementPanel token={token} mode="supplier" customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'financial-adjustments' && <FinancialAdjustmentPanel token={token} accounts={accounts} promotionAccounts={promotionAccounts} onError={(error) => message.error(error)} />}{selected === 'rebates' && <RebatePolicyPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'settings' && <SettingsPanel token={token} onError={(error) => message.error(error)} />}</Content></Layout></Layout>;
}
