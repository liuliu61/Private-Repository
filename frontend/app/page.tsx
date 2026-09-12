'use client';

import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Layout, Menu, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { BankOutlined, DashboardOutlined, FileDoneOutlined, FileTextOutlined, LogoutOutlined, SettingOutlined, ShopOutlined, TeamOutlined, TransactionOutlined } from '@ant-design/icons';
import RebatePolicyPanel from './customers/rebate-policy-panel';
import SupplierRebatePolicyPanel from './suppliers/rebate-policy-panel';
import ProcurementOrderPanel from './purchase-orders/order-panel';
import SettlementPanel from './settlements/settlement-panel';
import FinancialAdjustmentPanel from './financial-adjustments/adjustment-panel';
import CustomerWalletPanel from './customer-wallets/wallet-panel';
import ReceivingPanel from './receiving/receiving-panel';
import InvoicePanel from './invoices/invoice-panel';
import SourcingPanel from './sourcing/sourcing-panel';
import ServiceFeePanel from './service-fee-reconciliation/service-fee-panel';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const { Header, Sider, Content } = Layout;
type Dashboard = { accountBalance: string; accountCount: number; pendingRebates: number; pendingOrders: number; pendingSettlements: number };
type Account = { id: string; name: string; accountCode: string; accountType: string; currentBalance: string; status: string };
type Transaction = { id: string; transactionNo: string; businessType: string; businessNo: string; changeAmount: string; balanceAfter: string; occurredAt: string };
type Customer = { id: string; name: string; customerCode: string };
type Supplier = { id: string; name: string; platform: string; status: string };
type PromotionAccount = { id: string; accountName: string; unit: string; currentBalance: string };

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
  const [selected, setSelected] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (selected === 'recharge-payments') window.location.href = '/agent/fund/process/record'; }, [selected]);

  useEffect(() => { const value = localStorage.getItem('accessToken'); if (!value) window.location.href = '/login'; else setToken(value); }, []);
  useEffect(() => { if (!token) return; Promise.all([request<Dashboard>('/dashboard', token), request<Account[]>('/accounts', token), request<{ items: Transaction[] }>('/transactions?page=1&pageSize=10', token), request<Customer[]>('/customers', token), request<Supplier[]>('/suppliers', token)]).then(([d, a, t, c, s]) => { setDashboard(d); setAccounts(a); setTransactions(t.items); setCustomers(c); setSuppliers(s); }).catch((error) => message.error(error.message)).finally(() => setLoading(false)); }, [token, message]);
  useEffect(() => { if (!token || (!customers.length && !suppliers.length)) return; Promise.all([...customers.map((item) => request<PromotionAccount[]>(`/customers/${item.id}/promotion-accounts`, token)), ...suppliers.map((item) => request<PromotionAccount[]>(`/suppliers/${item.id}/promotion-accounts`, token))]).then((groups) => setPromotionAccounts(groups.flat())).catch((error) => message.error(error.message)); }, [token, customers, suppliers, message]);
  const menuItems = useMemo(() => [{ key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' }, { key: 'accounts', icon: <BankOutlined />, label: '账户管理' }, { key: 'transactions', icon: <TransactionOutlined />, label: '资金流水' }, { key: 'receiving', icon: <BankOutlined />, label: '收款管理' }, { key: 'recharge-payments', icon: <FileDoneOutlined />, label: '充值付款流程' }, { key: 'service-fee', icon: <FileDoneOutlined />, label: '服务费对账' }, { key: 'invoices', icon: <FileTextOutlined />, label: '发票管理' }, { key: 'customer-wallets', icon: <BankOutlined />, label: '客户钱包' }, { key: 'rebates', icon: <FileDoneOutlined />, label: '返点管理' }, { key: 'customers', icon: <TeamOutlined />, label: '客户管理' }, { key: 'suppliers', icon: <ShopOutlined />, label: '供应商成本政策' }, { key: 'purchase-orders', icon: <FileTextOutlined />, label: '外采订单' }, { key: 'sourcing', icon: <BankOutlined />, label: '外采钱包与配置' }, { key: 'customer-settlements', icon: <FileDoneOutlined />, label: '客户结算' }, { key: 'supplier-settlements', icon: <FileDoneOutlined />, label: '一级代理结算' }, { key: 'financial-adjustments', icon: <BankOutlined />, label: '财务调整' }, { key: 'settings', icon: <SettingOutlined />, label: '系统设置' }], []);
  function logout() { localStorage.removeItem('accessToken'); window.location.href = '/'; }
  if (!token) return null;
  return <Layout className="admin-shell"><Sider theme="light" width={228}><div className="system-brand"><div className="brand-mark small">财</div><span>代理商财务系统</span></div><Menu mode="inline" selectedKeys={[selected]} items={menuItems} onClick={({ key }) => setSelected(key)} /></Sider><Layout><Header className="admin-header"><Typography.Title level={4}>企业资金管理平台</Typography.Title><Space><span>欢迎回来，管理员</span><Button type="text" icon={<LogoutOutlined />} onClick={logout}>退出登录</Button></Space></Header><Content className="admin-content">{selected === 'dashboard' && <><div className="page-heading"><div><Typography.Title level={2}>工作台</Typography.Title><Typography.Paragraph type="secondary">实时掌握账户、返点和结算状态</Typography.Paragraph></div><Tag color="green">系统运行正常</Tag></div><Row gutter={[16, 16]}><Col xs={24} sm={12} lg={6}><Card><Statistic title="账户总余额" value={dashboard?.accountBalance || '0.00'} suffix="元" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="资金账户" value={dashboard?.accountCount || 0} suffix="个" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="待确认返点" value={dashboard?.pendingRebates || 0} suffix="笔" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="待处理采购单" value={dashboard?.pendingOrders || 0} suffix="笔" loading={loading} /></Card></Col></Row><Row gutter={[16, 16]} className="dashboard-grid"><Col xs={24} lg={14}><Card title="最近资金流水" extra={<Button type="link" onClick={() => setSelected('transactions')}>查看全部</Button>}><Table rowKey="id" pagination={false} dataSource={transactions} columns={[{ title: '流水号', dataIndex: 'transactionNo' }, { title: '业务类型', dataIndex: 'businessType' }, { title: '变动金额', dataIndex: 'changeAmount', render: (value: string) => <span className={value.startsWith('-') ? 'money-negative' : 'money-positive'}>{value}</span> }, { title: '发生时间', dataIndex: 'occurredAt', render: (value: string) => new Date(value).toLocaleString('zh-CN') }]} /></Card></Col><Col xs={24} lg={10}><Card title="账户余额概览"><Table rowKey="id" pagination={false} dataSource={accounts.slice(0, 6)} columns={[{ title: '账户', dataIndex: 'name' }, { title: '当前余额', dataIndex: 'currentBalance', render: (value: string) => <b>{value}</b> }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value === 'ACTIVE' ? '正常' : '停用'}</Tag> }]} /></Card></Col></Row></>}{selected === 'accounts' && <Card title="账户管理"><Table rowKey="id" dataSource={accounts} columns={[{ title: '账户名称', dataIndex: 'name' }, { title: '账户编码', dataIndex: 'accountCode' }, { title: '账户类型', dataIndex: 'accountType' }, { title: '当前余额', dataIndex: 'currentBalance' }, { title: '状态', dataIndex: 'status' }]} /></Card>}{selected === 'transactions' && <Card title="资金流水"><Table rowKey="id" dataSource={transactions} columns={[{ title: '流水号', dataIndex: 'transactionNo' }, { title: '业务类型', dataIndex: 'businessType' }, { title: '业务单号', dataIndex: 'businessNo' }, { title: '变动金额', dataIndex: 'changeAmount' }, { title: '变动后余额', dataIndex: 'balanceAfter' }, { title: '发生时间', dataIndex: 'occurredAt', render: (value: string) => new Date(value).toLocaleString('zh-CN') }]} /></Card>}{selected === 'receiving' && <ReceivingPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'service-fee' && <ServiceFeePanel token={token} onError={(error) => message.error(error)} />}{selected === 'invoices' && <InvoicePanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'customer-wallets' && <CustomerWalletPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'sourcing' && <SourcingPanel token={token} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'customers' && <RebatePolicyPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'suppliers' && <SupplierRebatePolicyPanel token={token} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'purchase-orders' && <ProcurementOrderPanel token={token} customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'customer-settlements' && <SettlementPanel token={token} mode="customer" customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'supplier-settlements' && <SettlementPanel token={token} mode="supplier" customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'financial-adjustments' && <FinancialAdjustmentPanel token={token} accounts={accounts} promotionAccounts={promotionAccounts} onError={(error) => message.error(error)} />}{['rebates', 'settings'].includes(selected) && <Card title={menuItems.find((item) => item.key === selected)?.label}><Typography.Paragraph type="secondary">该模块接口已就绪，页面功能将在后续迭代中逐步开放。</Typography.Paragraph></Card>}</Content></Layout></Layout>;
}
