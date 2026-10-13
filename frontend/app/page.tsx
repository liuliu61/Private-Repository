'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import useAutoRefresh from './utils/useAutoRefresh';
import { apiRequest } from './utils/api';
import { getUserInfo, getPermissionActions, type UserInfo, type PermissionActions } from './utils/permissions';
import { App, Badge, Button, Card, Col, Layout, List, Menu, Popover, Radio, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { BankOutlined, BellOutlined, DashboardOutlined, FileDoneOutlined, FileTextOutlined, LogoutOutlined, ReloadOutlined, SettingOutlined, ShopOutlined, TeamOutlined, TransactionOutlined, WalletOutlined, AppstoreOutlined, FileSearchOutlined, ShoppingOutlined, UserAddOutlined, IdcardOutlined } from '@ant-design/icons';
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
import SystemPage from './system/page';
import CustomerContractsPage from './customer-contracts/page';
import ReceiveRefundsPage from './receive-refunds/page';
import PaymentAccountPanel from './customer-payment-accounts/payment-account-panel';
import PortalManagePanel from './portal-manage/portal-manage-panel';
import RechargeRecordsPanel from './recharge-records/recharge-records-panel';
import PortWalletPanel from './port-wallets/port-wallet-panel';
import OperationLogPanel from './operation-logs/operation-log-panel';
import PolicyChangePanel from './policy-changes/policy-change-panel';
import ServiceFeeConfigPanel from './service-fee-configs/service-fee-config-panel';

const { Header, Sider, Content } = Layout;
type Dashboard = { accountBalance: string; accountCount: string; pendingRebates: string; pendingOrders: number; pendingSettlements: number; rechargeOverview: RechargeOverview[] };
type RechargeOverview = { id: string; transactionNo: string; accountName: string; customerName: string; amount: string; remitAmount: string; customerRebate: string; costRebate: string; profit: string; occurredAt: string };
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

const rechargeColumns = [
  { title: '推广账户', dataIndex: 'accountName', width: 150, ellipsis: true },
  { title: '客户', dataIndex: 'customerName', width: 100 },
  { title: '充值金额', dataIndex: 'amount', width: 110, render: (v: string) => <b style={{ color: '#10b981' }}>{v}</b> },
  { title: '实打金额', dataIndex: 'remitAmount', width: 110 },
  { title: '客户返点', dataIndex: 'customerRebate', width: 90, render: (v: string) => `${v}%` },
  { title: '成本返点', dataIndex: 'costRebate', width: 90, render: (v: string) => `${v}%` },
  { title: '利润', dataIndex: 'profit', width: 110, render: (v: string) => <span style={{ color: '#ef4444', fontWeight: 600 }}>{v}</span> },
  { title: '时间', dataIndex: 'occurredAt', width: 150, render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
];

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

export default function HomePage() {
  const { message } = App.useApp();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [promotionAccounts, setPromotionAccounts] = useState<PromotionAccount[]>([]);
  const [receiveRecords, setReceiveRecords] = useState<ReceiveRecord[]>([]);
  const [expiringContracts, setExpiringContracts] = useState<any[]>([]);
  const [expiringDays, setExpiringDays] = useState<number>(30);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [selected, setSelected] = useState('dashboard');
  const [rechargeRange, setRechargeRange] = useState<'day' | '3d' | '7d' | '30d'>('7d');
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    const value = localStorage.getItem('accessToken');
    if (!value) { window.location.href = '/login'; return; }
    setToken(value);
    const cached = getUserInfo();
    if (cached) { setUser(cached); return; }
    // 旧登录态兜底：无 userInfo 时按 token 拉取用户信息（含角色权限），刷新即可恢复按钮级权限
    apiRequest<{ user: UserInfo }>('/auth/me', value).then((d) => {
      if (d?.user) { localStorage.setItem('userInfo', JSON.stringify(d.user)); setUser(d.user); }
    }).catch(() => { window.location.href = '/login'; });
  }, []);
  const refreshMain = useCallback(async (silent = false) => {
    if (!token) return;
    try {
      // 第一步：先渲染核心卡片与流水
      const [d, t] = await Promise.all([apiRequest<Dashboard>('/dashboard', token), apiRequest<{ items: Transaction[] }>('/transactions/all?page=1&pageSize=20', token)]);
      setDashboard(d); setTransactions(t.items);
      // 第二步：其余列表数据（不阻塞首屏）
      const [a, c, s, r] = await Promise.all([apiRequest<Account[]>('/accounts', token), apiRequest<Customer[]>('/customers', token), apiRequest<Supplier[]>('/suppliers', token), apiRequest<{ items: ReceiveRecord[] }>('/receive-records?page=1&pageSize=50', token)]);
      setAccounts(a); setCustomers(c); setSuppliers(s); setReceiveRecords(r.items || []);
    } catch (error) { if (!silent) message.error((error as Error).message); }
  }, [token, message]);
  useEffect(() => { if (!token) return; refreshMain().finally(() => setLoading(false)); }, [refreshMain]);
  useAutoRefresh(() => { refreshMain(true); }, [token]);
  // 合同到期提醒：立即加载 + 随轮询刷新（切换 15/30 天时立即生效）
  useEffect(() => { if (!token) return; apiRequest<any[]>(`/customer-contracts/expiring?days=${expiringDays}`, token).then((data) => setExpiringContracts(data || [])).catch(() => {}); }, [token, expiringDays]);
  useAutoRefresh(() => { if (!token) return; apiRequest<any[]>(`/customer-contracts/expiring?days=${expiringDays}`, token).then((data) => setExpiringContracts(data || [])).catch(() => {}); }, [token, expiringDays]);
  // 待开票提醒：随轮询刷新
  useEffect(() => { if (!token) return; apiRequest<{ items: any[] }>('/invoice-tasks?status=PENDING&page=1&pageSize=5', token).then((data) => setPendingInvoices(data?.items || [])).catch(() => {}); }, [token]);
  useAutoRefresh(() => { if (!token) return; apiRequest<{ items: any[] }>('/invoice-tasks?status=PENDING&page=1&pageSize=5', token).then((data) => setPendingInvoices(data?.items || [])).catch(() => {}); }, [token]);
  // 每次切换菜单时刷新客户和供应商列表，确保新建客户后其他页面能看到
  useEffect(() => { if (!token || !selected) return; Promise.all([apiRequest<Customer[]>('/customers', token), apiRequest<Supplier[]>('/suppliers', token)]).then(([c, s]) => { setCustomers(c); setSuppliers(s); }).catch(() => {}); }, [token, selected]);
  useEffect(() => { if (!token || (!customers.length && !suppliers.length)) return; const validCustomers = customers.filter((c: any) => c.agentId); Promise.allSettled([...validCustomers.map((item) => apiRequest<PromotionAccount[]>(`/customers/${item.id}/promotion-accounts`, token)), ...suppliers.map((item) => apiRequest<PromotionAccount[]>(`/suppliers/${item.id}/promotion-accounts`, token))]).then((results) => { const accounts = results.filter((r) => r.status === 'fulfilled').flatMap((r: any) => r.value || []); setPromotionAccounts(accounts); }); }, [token, customers, suppliers]);


  useEffect(() => { if (!token) return; const fetchUnread = () => { apiRequest<{ count: number }>('/notifications/unread-count', token).then((d) => setUnreadCount(d.count || 0)).catch(() => {}); }; fetchUnread(); const timer = setInterval(fetchUnread, 30000); return () => clearInterval(timer); }, [token]);
  useEffect(() => { if (!token || !notifOpen) return; apiRequest<{ items: any[] }>('/notifications?page=1&pageSize=20', token).then((d) => setNotifications(d.items || [])).catch(() => {}); }, [token, notifOpen]);
  const menuItems = useMemo(() => [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: 'group-fund', icon: <WalletOutlined />, label: '资金管理', children: [
      { key: 'accounts', icon: <BankOutlined />, label: '账户管理' },
      { key: 'transactions', icon: <TransactionOutlined />, label: '资金流水' },
      { key: 'receiving', icon: <BankOutlined />, label: '收款管理' },
      { key: 'receive-refunds', icon: <TransactionOutlined />, label: '收款单退款' },
      { key: 'payment-posting', icon: <TransactionOutlined />, label: '充值付款' },
      { key: 'financial-adjustments', icon: <BankOutlined />, label: '财务调整' },
      { key: 'port-wallets', icon: <WalletOutlined />, label: '端口钱包' },
    ]},
    { key: 'group-business', icon: <AppstoreOutlined />, label: '业务运营', children: [
      { key: 'service-orders', icon: <FileTextOutlined />, label: '服务订单' },
      { key: 'consumption', icon: <FileTextOutlined />, label: '消耗分析' },
      { key: 'service-fee', icon: <FileDoneOutlined />, label: '服务费对账' },
      { key: 'policy-changes', icon: <FileDoneOutlined />, label: '政策变更审批' },
      { key: 'service-fee-configs', icon: <FileDoneOutlined />, label: '服务费配置' },
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
      { key: 'customer-contracts', icon: <FileTextOutlined />, label: '客户合同' },
      { key: 'customer-wallets', icon: <BankOutlined />, label: '客户钱包' },
      { key: 'customer-payment-accounts', icon: <BankOutlined />, label: '客户打款账户' },
      { key: 'promotion-accounts', icon: <TeamOutlined />, label: '推广账户' },
      { key: 'channels', icon: <TransactionOutlined />, label: '端口管理' },
      { key: 'rebates', icon: <FileDoneOutlined />, label: '返点管理' },
      { key: 'recharge-records', icon: <TransactionOutlined />, label: '充值记录' },
    ]},
    { key: 'group-sourcing', icon: <ShoppingOutlined />, label: '外采管理', children: [
      { key: 'purchase-orders', icon: <FileTextOutlined />, label: '外采订单' },
      { key: 'sourcing', icon: <BankOutlined />, label: '外采钱包与配置' },
      { key: 'suppliers', icon: <ShopOutlined />, label: '供应商成本政策' },
    ]},
    { key: 'group-system', icon: <SettingOutlined />, label: '系统管理', children: [
      { key: 'system', icon: <TeamOutlined />, label: '部门/角色/用户' },
      { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
      { key: 'operation-logs', icon: <FileSearchOutlined />, label: '日志管理' },
    ]},
    { key: 'group-portal', icon: <IdcardOutlined />, label: '门户管理', children: [
      { key: 'portal-manage', icon: <TeamOutlined />, label: '门户账号管理' },
    ]},
  ], []);
  function logout() { localStorage.removeItem("accessToken"); localStorage.removeItem("userInfo"); window.location.href = "/"; }
  const refreshNotifications = () => { if (!token) return; apiRequest<{ items: any[] }>('/notifications?page=1&pageSize=20', token).then((d) => setNotifications(d.items || [])).catch(() => {}); };
  const markAllRead = () => { if (!token) return; apiRequest('/notifications/read-all', token, { method: 'POST' }).then(() => { setUnreadCount(0); setNotifications((prev) => prev.map((n) => ({ ...n, status: 'READ' }))); }).catch((e) => message.error(e.message)); };
  const handleNotifClick = (n: any) => { if (n.status === 'UNREAD' && token) { apiRequest(`/notifications/${n.id}/read`, token, { method: 'POST' }).then(() => { setUnreadCount((c) => Math.max(0, c - 1)); setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'READ' } : x))); }).catch(() => {}); } if (n.link) setSelected(n.link); setNotifOpen(false); };
  const refreshTransactions = () => { if (!token) return; apiRequest<{ items: Transaction[] }>('/transactions/all?page=1&pageSize=20', token).then(t => setTransactions(t.items)).catch(e => message.error(e.message)); };
  const perm = getPermissionActions(user);
  if (!token) return null;
  return <Layout className="admin-shell"><Sider theme="light" width={228}><div className="system-brand"><div className="brand-mark small">财</div><div className="brand-text"><span>代理商财务系统</span><span className="brand-sub">AGENT FINANCE</span></div></div><Menu mode="inline" selectedKeys={[selected]} openKeys={openKeys} onOpenChange={setOpenKeys} items={menuItems} onClick={({ key }) => {
  window.scrollTo({ top: 0, behavior: 'smooth' }); if (key === 'system') { setSelected('system'); return; }
  if (key === 'customer-contracts') { setSelected('customer-contracts'); return; }
  if (key === 'receive-refunds') { setSelected('receive-refunds'); return; }
  setSelected(key);
}} /></Sider><Layout><Header className="admin-header"><Typography.Title level={4}>企业资金管理平台</Typography.Title><Space><Popover open={notifOpen} onOpenChange={setNotifOpen} placement="bottomRight" trigger="click" content={<div style={{ width: 360 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><Typography.Text strong>通知中心</Typography.Text><Button type="link" size="small" onClick={markAllRead}>全部已读</Button></div><List size="small" style={{ maxHeight: 400, overflow: 'auto' }} dataSource={notifications} locale={{ emptyText: '暂无通知' }} renderItem={(n: any) => <List.Item style={{ cursor: 'pointer', background: n.status === 'UNREAD' ? '#f0f7ff' : undefined }} onClick={() => handleNotifClick(n)}><List.Item.Meta title={<span>{n.title}{n.status === 'UNREAD' ? ' ' : ''}{n.status === 'UNREAD' && <Badge status="error" />}</span>} description={<div><div style={{ fontSize: 12 }}>{n.content}</div><div style={{ color: '#999', fontSize: 12 }}>{new Date(n.createdAt).toLocaleString('zh-CN')}</div></div>} /></List.Item>} /></div>}><Badge count={unreadCount} size="small"><Button type="text" icon={<BellOutlined />} /></Badge></Popover><span>欢迎回来，{user?.displayName || '管理员'}</span><Button type="text" icon={<LogoutOutlined />} onClick={logout}>退出登录</Button></Space></Header><Content className="admin-content">{selected === 'dashboard' && <><div className="page-heading"><div><Typography.Title level={2}>工作台</Typography.Title><Typography.Paragraph type="secondary">实时掌握账户、返点和结算状态</Typography.Paragraph></div><Tag color="green">系统运行正常</Tag></div><Row gutter={[16, 16]}><Col xs={24} sm={12} lg={6}><Card><Statistic title="今日累计充值金额" value={dashboard?.accountBalance || '0.00'} suffix="元" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="客户钱包总余额" value={dashboard?.accountCount || '0.00'} suffix="元" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="今日利润" value={dashboard?.pendingRebates || '0.00'} suffix="元" loading={loading} /></Card></Col><Col xs={24} sm={12} lg={6}><Card><Statistic title="待处理充值数" value={dashboard?.pendingOrders || 0} suffix="笔" loading={loading} /></Card></Col></Row><Row gutter={[16, 16]}><Col xs={24} lg={12}><Card title="合同到期提醒" extra={<Space><Radio.Group size="small" value={expiringDays} onChange={(e) => setExpiringDays(e.target.value)}><Radio.Button value={15}>15天</Radio.Button><Radio.Button value={30}>30天</Radio.Button></Radio.Group><Button type="link" onClick={() => setSelected('customer-contracts')}>查看全部合同</Button></Space>}>{expiringContracts.length === 0 ? <div className="text-gray-400 text-center py-4">暂无即将到期的合同</div> : <Table rowKey="id" pagination={false} dataSource={expiringContracts.slice(0, 5)} columns={[{ title: '合同名称', dataIndex: 'name', render: (v: string) => <a onClick={() => setSelected('customer-contracts')}>{v}</a> }, { title: '客户', dataIndex: ['customer', 'name'] }, { title: '到期日期', dataIndex: 'expiryDate', render: (v: string) => v?.slice(0, 10) }, { title: '剩余天数', dataIndex: 'expiryDate', render: (v: string) => { const days = Math.ceil((new Date(v).getTime() - Date.now()) / 86400000); return <Tag color={days <= 7 ? 'red' : 'orange'}>{days} 天</Tag>; } }]} />}</Card></Col><Col xs={24} lg={12}><Card title="待开票提醒" extra={<Space><Tag color="orange">待开票 {pendingInvoices.length} 笔</Tag><Button type="link" onClick={() => setSelected('invoice-tasks')}>查看全部</Button></Space>}>{pendingInvoices.length === 0 ? <div className="text-gray-400 text-center py-4">暂无待开票任务</div> : <Table rowKey="id" pagination={false} dataSource={pendingInvoices} columns={[{ title: '任务编号', dataIndex: 'taskNo', render: (v: string) => <a onClick={() => setSelected('invoice-tasks')}>{v}</a> }, { title: '客户', render: (_: unknown, row: any) => row.customer?.name || '-' }, { title: '开票金额', dataIndex: 'invoiceAmount' }, { title: '创建时间', dataIndex: 'createdAt', render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN').slice(0, 16) : '-') }]} />}</Card></Col></Row><Row gutter={[16, 16]} className="dashboard-grid"><Col xs={24} lg={14}><Card title="最近资金流水" extra={<Button type="link" onClick={() => setSelected('transactions')}>查看全部</Button>}><Table rowKey="id" pagination={false} dataSource={transactions.slice(0, 8)} columns={dashboardTxColumns} /></Card></Col><Col xs={24} lg={10}><Card title="充值数据" extra={<Radio.Group size="small" value={rechargeRange} onChange={(e) => setRechargeRange(e.target.value)}><Radio.Button value="day">当日</Radio.Button><Radio.Button value="3d">近3天</Radio.Button><Radio.Button value="7d">近7天</Radio.Button><Radio.Button value="30d">近30天</Radio.Button></Radio.Group>}><Table rowKey="id" pagination={false} dataSource={(dashboard?.rechargeOverview || []).filter((r) => { const t = new Date(r.occurredAt).getTime(); const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); const dayMs = 86400000; const from = rechargeRange === 'day' ? dayStart.getTime() : dayStart.getTime() - (rechargeRange === '3d' ? 2 : rechargeRange === '7d' ? 6 : 29) * dayMs; return t >= from; }).slice(0, 8)} columns={rechargeColumns} summary={(data) => data.length > 0 ? <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={2}><b>合计</b></Table.Summary.Cell><Table.Summary.Cell index={2}><b style={{ color: '#10b981' }}>{data.reduce((sum: number, r) => sum + Number(r.amount), 0).toFixed(2)}</b></Table.Summary.Cell><Table.Summary.Cell index={3} colSpan={3}></Table.Summary.Cell><Table.Summary.Cell index={6}><b style={{ color: '#ef4444' }}>{data.reduce((sum: number, r) => sum + Number(r.profit), 0).toFixed(2)}</b></Table.Summary.Cell><Table.Summary.Cell index={7}></Table.Summary.Cell></Table.Summary.Row> : null} /></Card></Col></Row></>}{selected === 'accounts' && <Card title="账户管理"><Table rowKey="id" dataSource={accounts} columns={[{ title: '账户名称', dataIndex: 'name' }, { title: '账户编码', dataIndex: 'accountCode' }, { title: '账户类型', dataIndex: 'accountType' }, { title: '当前余额', dataIndex: 'currentBalance' }, { title: '状态', dataIndex: 'status' }]} /></Card>}{selected === 'transactions' && <Card title="资金流水（整合资金账户/客户钱包/推广账户）" extra={<Button icon={<ReloadOutlined />} onClick={refreshTransactions}>刷新</Button>}><Table rowKey="id" dataSource={transactions} scroll={{ x: 1200 }} pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条流水` }} columns={txColumns} /></Card>}{selected === 'receiving' && <ReceivingPanel token={token} customers={customers} perm={perm} onError={(error) => message.error(error)} />}{selected === 'payment-posting' && <PaymentPostingPanel token={token} customers={customers} accounts={accounts} receiveRecords={receiveRecords} onError={(error) => message.error(error)} />}{selected === 'service-orders' && <ServiceOrderPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'consumption' && <ConsumptionPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'service-fee' && <ServiceFeePanel token={token} onError={(error) => message.error(error)} />}{selected === 'policy-changes' && <PolicyChangePanel token={token} customers={customers} perm={perm} onError={(error) => message.error(error)} />}{selected === 'service-fee-configs' && <ServiceFeeConfigPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'invoice-tasks' && <PublicInvoiceTaskPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'invoice-review' && <PublicInvoiceTaskPanel token={token} mode="review" customers={customers} onError={(error) => message.error(error)} />}{selected === 'invoice-complete' && <PublicInvoiceTaskPanel token={token} mode="complete" customers={customers} onError={(error) => message.error(error)} />}{selected === 'invoice-profiles' && <InvoiceProfilePanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'customer-wallets' && <CustomerWalletPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'customer-payment-accounts' && <PaymentAccountPanel token={token} customers={customers} perm={perm} onError={(error) => message.error(error)} />}{selected === 'sourcing' && <SourcingPanel token={token} suppliers={suppliers} customers={customers} onError={(error) => message.error(error)} />}{selected === 'customers' && <CustomerPanel token={token} perm={perm} onError={(error) => message.error(error)} />}{selected === 'promotion-accounts' && <PromotionAccountPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'channels' && <ChannelPanel token={token} onError={(error) => message.error(error)} />}{selected === 'suppliers' && <SupplierRebatePolicyPanel token={token} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'purchase-orders' && <ProcurementOrderPanel token={token} customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'customer-settlements' && <SettlementPanel token={token} mode="customer" customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'supplier-settlements' && <SettlementPanel token={token} mode="supplier" customers={customers} suppliers={suppliers} onError={(error) => message.error(error)} />}{selected === 'financial-adjustments' && <FinancialAdjustmentPanel token={token} accounts={accounts} promotionAccounts={promotionAccounts} onError={(error) => message.error(error)} />}{selected === 'rebates' && <RebatePolicyPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'system' && <SystemPage />}{selected === 'customer-contracts' && <CustomerContractsPage />}{selected === 'receive-refunds' && <ReceiveRefundsPage />}{selected === 'settings' && <SettingsPanel token={token} onError={(error) => message.error(error)} />}{selected === 'recharge-records' && <RechargeRecordsPanel token={token} customers={customers} onError={(error) => message.error(error)} />}{selected === 'port-wallets' && <PortWalletPanel token={token} onError={(error) => message.error((error as Error).message)} />}{selected === 'operation-logs' && <OperationLogPanel token={token} onError={(error) => message.error((error as Error).message)} />}{selected === 'portal-manage' && <PortalManagePanel token={token} customers={customers} onError={(error) => message.error(error)} />}</Content></Layout></Layout>;
}
