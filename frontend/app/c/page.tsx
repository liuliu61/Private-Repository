'use client';

import { useEffect, useState } from 'react';
import useAutoRefresh from '../utils/useAutoRefresh';
import {
  Alert, Button, Card, Col, Descriptions, Form, Input, InputNumber, List, message, Modal, Row, Select,
  Radio, Space, Statistic, Table, Tabs, Tag, Typography,
} from 'antd';
import {
  AccountBookOutlined, BellOutlined, CreditCardOutlined,
  FileDoneOutlined, LockOutlined, LogoutOutlined, PayCircleOutlined, PlusOutlined, ReloadOutlined, RollbackOutlined, UserOutlined, WalletOutlined,
} from '@ant-design/icons';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function CustomerPortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeWallet, setActiveWallet] = useState<string>('');
  const [accountTx, setAccountTx] = useState<any[]>([]);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAccounts, setRechargeAccounts] = useState<any>({ public: null, private: null });
  const [accountTxAccount, setAccountTxAccount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calcCash, setCalcCash] = useState<number | null>(null);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundForm] = Form.useForm();
  const refundAccountId = Form.useWatch('promotionAccountId', refundForm);
  const refundAccount = accounts.find((a: any) => a.id === refundAccountId);
  const refundFund = Form.useWatch('fundType', refundForm) || 'PRIVATE';
  const [form] = Form.useForm();
  const watchAccount = Form.useWatch('promotionAccountId', form);
  const watchFund = Form.useWatch('fundType', form);
  const selectedAccount = accounts.find((a: any) => a.id === watchAccount);
  const rebateRate = watchFund ? (parseFloat(watchFund === 'PUBLIC' ? (selectedAccount?.customerRebatePublic ?? '0') : (selectedAccount?.customerRebatePrivate ?? '0')) || 0) : null;
  const calcArrived = rebateRate != null && calcCash != null && calcCash > 0 ? calcCash * (1 + rebateRate / 100) : 0;

  useEffect(() => {
    const t = localStorage.getItem('cToken');
    if (t) { setToken(t); loadAll(t); }
  }, []);
  useAutoRefresh(() => { if (token) loadAll(token, true); }, [token]);

  const fetchJson = async (t: string, path: string, opts?: any) => {
    const res = await fetch(`${apiUrl}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...(opts?.headers || {}) } });
    const data = await res.json();
    if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
    return data;
  };

  async function loadAll(t: string, silent?: boolean) {
    if (!silent) setLoading(true);
    try {
      const [meData, walletData, accountData, requestData, invoiceData, refundData] = await Promise.all([
        fetchJson(t, '/portal/c/me'),
        fetchJson(t, '/portal/c/wallets'),
        fetchJson(t, '/portal/c/promotion-accounts'),
        fetchJson(t, '/portal/c/recharge-requests?pageSize=50'),
        fetchJson(t, '/portal/c/invoices?pageSize=50'),
        fetchJson(t, '/portal/c/refund-requests?pageSize=50'),
      ]);
      setMe(meData);
      setWallets(walletData);
      setAccounts(accountData);
      setRequests(requestData.items || []);
      setInvoices(invoiceData.items || []);
      setRefunds(refundData.items || []);
      if (walletData.length > 0 && !activeWallet) {
        setActiveWallet(walletData[0].id);
        loadWalletTx(t, walletData[0].id);
      }
    } catch (e) { message.error(e instanceof Error ? e.message : '加载失败'); }
    finally { setLoading(false); }
  }

  
async function submitRefund(values: any) {
    const account = accounts.find((a: any) => a.id === values.promotionAccountId);
    setRefundSubmitting(true);
    try {
      await fetchJson(token!, '/portal/c/refund-requests', { method: 'POST', body: JSON.stringify(values) });
      message.success('退款申请已提交，等待代理商处理');
      setRefundOpen(false);
      refundForm.resetFields();
      const d = await fetchJson(token!, '/portal/c/refund-requests?pageSize=50');
      setRefunds(d.items || []);
    } catch (e) { message.error(e instanceof Error ? e.message : '提交失败'); }
    finally { setRefundSubmitting(false); }
  }

  async function loadRechargeAccounts() {
  try {
    const d = await fetchJson(token!, '/portal/c/recharge-accounts');
    setRechargeAccounts(d || { public: null, private: null });
  } catch { /* ignore */ }
}

async function loadWalletTx(t: string, walletId: string) {
    try { const d = await fetchJson(t, `/portal/c/wallets/${walletId}/transactions?pageSize=50`); setTransactions(d.items || []); }
    catch (e) { message.error(e instanceof Error ? e.message : '流水加载失败'); }
  }

  async function loadAccountTx(t: string, accountId: string) {
    try { const d = await fetchJson(t, `/portal/c/promotion-accounts/${accountId}/transactions?pageSize=50`); setAccountTx(d.items || []); setAccountTxAccount(accountId); setTxModalOpen(true); }
    catch (e) { message.error(e instanceof Error ? e.message : '流水加载失败'); }
  }

  async function submitRequest(values: any) {
    // 提交前预检钱包余额：预计扣款 = 到账金额 ÷ (1 + 客户返点%)
    const account = accounts.find((a: any) => a.id === values.promotionAccountId);
    const amt = Number(values.amount || 0);
    if (account && amt > 0) {
      const fund = values.fundType || 'PRIVATE';
      const rate = Number(fund === 'PUBLIC' ? (account.customerRebatePublic || 0) : (account.customerRebatePrivate || 0)) || 0;
      const deduction = amt / (1 + rate / 100);
      const balance = fund === 'PUBLIC' ? totalPublic : totalPrivate;
      if (balance < deduction) {
        const tip = `钱包${fund === 'PUBLIC' ? '对公' : '对私'}余额不足（预计扣款 ¥${deduction.toFixed(2)}，当前余额 ¥${balance.toFixed(2)}），请联系销售充值钱包后再提交充值单`;
        message.error(tip);
        form.setFields([{ name: 'amount', errors: [tip] }]);
        return;
      }
    }
    setSubmitting(true);
    try {
      await fetchJson(token!, '/portal/c/recharge-requests', { method: 'POST', body: JSON.stringify(values) });
      message.success('充值申请已提交，等待代理商确认');
      setModalOpen(false);
      form.resetFields();
      await loadAll(token!);
      const d = await fetchJson(token!, '/portal/c/recharge-requests?pageSize=50');
      setRequests(d.items || []);
    } catch (e) { message.error(e instanceof Error ? e.message : '提交失败'); }
    finally { setSubmitting(false); }
  }

  function logout() { localStorage.removeItem('cToken'); window.location.href = '/c'; }

  // ==================== 登录视图 ====================
  if (!token) {
    return <CustomerLogin onLogin={(t) => { setToken(t); loadAll(t); }} />;
  }

  const statusColor = (s: string) => (s === 'CONFIRMED' ? 'green' : s === 'REJECTED' ? 'red' : 'orange');
  const txStatusLabel = (s: string) => ({ CONFIRMED: '充值成功', REJECTED: '已驳回', PENDING: '待处理' }[s] || s);

  const totalCash = wallets.reduce((s: number, w: any) => s + Number(w.cashBalance), 0);
  const totalPublic = wallets.reduce((s: number, w: any) => s + Number(w.cashBalancePublic || 0), 0);
  const totalPrivate = wallets.reduce((s: number, w: any) => s + Number(w.cashBalancePrivate || 0), 0);

  return (
    <main className="portal-shell">
      <style>{`${portalCss}`}</style>
      <header className="portal-header">
        <div className="portal-brand"><div className="portal-logo">财</div><div><div className="portal-title">客户中心</div><div className="portal-sub">CUSTOMER PORTAL</div></div></div>
        <div className="portal-user"><BellOutlined /><span>{me?.customerName || ''}</span><Button type="text" icon={<LogoutOutlined />} onClick={logout}>退出</Button></div>
      </header>

      <div className="portal-body">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><Card className="portal-card"><Statistic title="对公资金" value={totalPublic.toFixed(2)} prefix="¥" loading={loading} /><Statistic title="对私资金" value={totalPrivate.toFixed(2)} prefix="¥" loading={loading} style={{ marginTop: 8 }} /></Card></Col>
          <Col xs={24} md={8}><Card className="portal-card"><Statistic title="推广账户" value={accounts.length} suffix="个" loading={loading} /></Card></Col>
          <Col xs={24} md={8}><Card className="portal-card"><Statistic title="待处理充值申请" value={requests.filter((r: any) => r.status === 'PENDING').length} suffix="笔" loading={loading} /></Card></Col>
        </Row>

        <Card className="portal-card portal-main" title="我的服务" extra={<Button icon={<ReloadOutlined />} onClick={() => loadAll(token!)}>刷新</Button>}>
          <Tabs
            items={[
              {
                key: 'wallets', label: <span><WalletOutlined /> 钱包与流水</span>,
                children: (
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Space wrap>
                      <Select style={{ width: 280 }} placeholder="选择钱包" value={activeWallet} onChange={(v) => { setActiveWallet(v); loadWalletTx(token!, v); }} options={wallets.map((w: any) => ({ value: w.id, label: `${w.walletName}（对公 ¥${w.cashBalancePublic ?? 0} / 对私 ¥${w.cashBalancePrivate ?? 0}）` }))} />
                      <Button type="primary" icon={<PayCircleOutlined />} onClick={() => { loadRechargeAccounts(); setRechargeOpen(true); }}>钱包充值</Button>
                    </Space>
                    <Space wrap size="small">
                      <Tag color="blue">对公资金 ¥{wallets.find((w: any) => w.id === activeWallet)?.cashBalancePublic ?? '0.00'}</Tag>
                      <Tag color="green">对私资金 ¥{wallets.find((w: any) => w.id === activeWallet)?.cashBalancePrivate ?? '0.00'}</Tag>
                    </Space>
                    <Table rowKey="id" size="small" loading={loading} pagination={false} dataSource={transactions} locale={{ emptyText: '暂无流水' }} columns={[
                      { title: '类型', dataIndex: 'businessTypeLabel' },
                      { title: '资金类型', dataIndex: 'fundTypeLabel', render: (v: string) => <Tag color={v === '对公' ? 'blue' : 'green'}>{v}</Tag> },
                      { title: '变动金额', dataIndex: 'changeAmount', render: (v: string) => <b style={{ color: v.startsWith('-') ? '#ef4444' : '#22c55e' }}>{v}</b> },
                      { title: '余额', dataIndex: 'balanceAfter' },
                      { title: '业务单号', dataIndex: 'businessNo' },
                      { title: '时间', dataIndex: 'occurredAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                      { title: '备注', dataIndex: 'remark' },
                    ]} />
                  </Space>
                ),
              },
              {
                key: 'accounts', label: <span><AccountBookOutlined /> 推广账户</span>,
                children: (
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Space>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>提交充值申请</Button>
                      <Button icon={<RollbackOutlined />} onClick={() => { refundForm.resetFields(); setRefundOpen(true); }}>退款申请</Button>
                    </Space>
                    <Table rowKey="id" size="small" dataSource={accounts} pagination={false} locale={{ emptyText: '暂无推广账户' }} columns={[
                      { title: '账户名称', dataIndex: 'accountName' },
                      { title: '平台账号ID', dataIndex: 'platformAccountId' },
                      { title: '平台', dataIndex: 'platform' },
                      { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : '停用'}</Tag> },
                      { title: '操作', render: (_: any, r: any) => <Button type="link" size="small" onClick={() => loadAccountTx(token!, r.id)}>账户流水</Button> },
                    ]} />
                  </Space>
                ),
              },
              {
                key: 'refunds', label: <span><RollbackOutlined /> 退款申请</span>,
                children: (
                  <Table rowKey="id" size="small" dataSource={refunds} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无退款申请' }} columns={[
                    { title: '退款单号', dataIndex: 'requestNo' },
                    { title: '推广账户', dataIndex: 'promotionAccountName' },
                    { title: '退款金额(账户币)', dataIndex: 'amount', render: (v: string) => <b>¥{v}</b> },
                    { title: '资金类型', dataIndex: 'fundType', render: (v: string) => <Tag color={v === 'PUBLIC' ? 'blue' : 'green'}>{v === 'PUBLIC' ? '对公' : '对私'}</Tag> },
                    { title: '退回现金', dataIndex: 'cashAmount', render: (v: string) => v ? `¥${v}` : '—' },
                    { title: '状态', dataIndex: 'statusLabel', render: (v: string, r: any) => <Tag color={r.status === 'PENDING' ? 'orange' : r.status === 'CONFIRMED' ? 'green' : 'red'}>{v}</Tag> },
                    { title: '处理人', dataIndex: 'agentName', render: (v: string) => v || '—' },
                    { title: '驳回原因', dataIndex: 'rejectReason', render: (v: string) => v || '—' },
                    { title: '申请时间', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                  ]} />
                ),
              },
              {
                key: 'requests', label: <span><CreditCardOutlined /> 我的充值申请</span>,
                children: (
                  <Table rowKey="id" size="small" dataSource={requests} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无充值申请' }} columns={[
                    { title: '申请单号', dataIndex: 'requestNo' },
                    { title: '推广账户', dataIndex: 'promotionAccountName' },
                    { title: '申请金额', dataIndex: 'amount', render: (v: string) => <b>¥{v}</b> },
                    { title: '状态', dataIndex: 'statusLabel', render: (v: string, r: any) => <Tag color={statusColor(r.status)}>{v}</Tag> },
                    { title: '端口', dataIndex: 'portName', render: (v: string) => v || '—' },
                    { title: '处理人', dataIndex: 'agentName', render: (v: string) => v || '—' },
                    { title: '驳回原因', dataIndex: 'rejectReason', render: (v: string) => v || '—' },
                    { title: '申请时间', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                  ]} />
                ),
              },
              {
                key: 'invoices', label: <span><FileDoneOutlined /> 发票</span>,
                children: (
                  <Table rowKey="id" size="small" dataSource={invoices} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无发票任务' }} columns={[
                    { title: '任务单号', dataIndex: 'taskNo' },
                    { title: '发票抬头', dataIndex: 'titleName', render: (v: string) => v || '—' },
                    { title: '开票金额', dataIndex: 'invoiceAmount', render: (v: string) => `¥${v}` },
                    { title: '状态', dataIndex: 'statusLabel', render: (v: string, r: any) => <Tag color={r.status === 'COMPLETED' ? 'green' : r.status === 'REJECTED' ? 'red' : r.status === 'APPROVED' ? 'blue' : 'orange'}>{v}</Tag> },
                    { title: '提交时间', dataIndex: 'submittedAt', render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '—' },
                  ]} />
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Modal title="钱包充值" open={rechargeOpen} onCancel={() => setRechargeOpen(false)} footer={null} destroyOnClose>
        <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>钱包充值请联系销售</Typography.Title>
          <Typography.Text type="secondary">如需充值，请联系您的销售顾问获取帮助</Typography.Text>
        </div>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card title="对公账户" size="small" extra={<Tag color="blue">对公</Tag>}>
              {rechargeAccounts?.public ? (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <div>户名：{rechargeAccounts.public.accountName || '—'}</div>
                  <div>开户行：{rechargeAccounts.public.bankName || '—'}</div>
                  <div>账号：{rechargeAccounts.public.accountNo || '—'}</div>
                  {rechargeAccounts.public.remark && <div style={{ color: '#94a3b8', fontSize: 12 }}>{rechargeAccounts.public.remark}</div>}
                </Space>
              ) : <Typography.Text type="secondary">暂未配置</Typography.Text>}
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="对私账户" size="small" extra={<Tag color="green">对私</Tag>}>
              {rechargeAccounts?.private ? (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <div>户名：{rechargeAccounts.private.accountName || '—'}</div>
                  <div>开户行：{rechargeAccounts.private.bankName || '—'}</div>
                  <div>账号：{rechargeAccounts.private.accountNo || '—'}</div>
                  {rechargeAccounts.private.remark && <div style={{ color: '#94a3b8', fontSize: 12 }}>{rechargeAccounts.private.remark}</div>}
                </Space>
              ) : <Typography.Text type="secondary">暂未配置</Typography.Text>}
            </Card>
          </Col>
        </Row>
      </Modal>

      <Modal title="提交充值申请" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} destroyOnClose width={760}>
        <Row gutter={16}>
          <Col span={13}>
            <Form form={form} layout="vertical" onFinish={submitRequest} requiredMark={false}>
              <Form.Item name="promotionAccountId" label="推广账户" rules={[{ required: true, message: '请选择推广账户' }]}>
                <Select placeholder="请选择推广账户" options={accounts.map((a: any) => ({ value: a.id, label: `${a.accountName}（${a.platformAccountId || '无ID'}）` }))} />
              </Form.Item>
              {watchAccount && <div style={{ marginBottom: 8 }}>已选账户：{selectedAccount?.accountName}（{selectedAccount?.platformAccountId || '无ID'}）</div>}
              <Form.Item name="amount" label="到账金额" rules={[{ required: true, message: '请输入到账金额' }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="请输入到账金额" prefix="¥" />
              </Form.Item>
              <Form.Item name="fundType" label="资金类型" rules={[{ required: true, message: '请选择资金类型' }]}>
                <Radio.Group>
                  <Radio value="PUBLIC">对公</Radio>
                  <Radio value="PRIVATE">对私</Radio>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="选填" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>提交申请</Button>
            </Form>
          </Col>
          <Col span={11}>
            <Card title="现金换算到账币" size="small" style={{ background: '#fafafa', height: '100%' }}>
              <div style={{ marginBottom: 8 }}>当前返点比例：{watchFund ? <Tag color="blue">{rebateRate}%</Tag> : <Tag>请先选择资金类型</Tag>}</div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ marginBottom: 4 }}>客户打款现金(元)</div>
                <InputNumber style={{ width: '100%' }} value={calcCash} onChange={setCalcCash} disabled={!watchFund} min={0} precision={2} placeholder={watchFund ? '输入现金金额' : '请先选择资金类型'} prefix="¥" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 4 }}>到账广告币(元)</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#1677ff' }}>{watchFund ? `¥${calcArrived.toFixed(2)}` : '—'}</div>
                <div style={{ fontSize: 12, color: '#999' }}>到账 = 现金 × (1 + 返点%)</div>
              </div>
              <Button size="small" type="primary" disabled={!watchFund || calcArrived <= 0} onClick={() => form.setFieldValue('amount', Math.round(calcArrived * 100) / 100)}>填入到账金额</Button>
            </Card>
          </Col>
        </Row>
      </Modal>

      <Modal title="提交退款申请" open={refundOpen} onCancel={() => setRefundOpen(false)} footer={null} destroyOnClose width={640}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="退款金额为账户币（到账币）。退款成功后，将按客户返点比例换算成现金退回您的钱包，并同步扣减推广账户余额。" />
        <Form form={refundForm} layout="vertical" onFinish={submitRefund} requiredMark={false} initialValues={{ fundType: 'PRIVATE' }}>
          <Form.Item name="promotionAccountId" label="推广账户" rules={[{ required: true, message: '请选择推广账户' }]}>
            <Select placeholder="请选择推广账户" options={accounts.filter((a: any) => a.status === 'ACTIVE').map((a: any) => ({ value: a.id, label: `${a.accountName}（${a.platformAccountId || '无ID'}）` }))} />
          </Form.Item>
          {refundAccountId && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 8, fontSize: 13 }}>
              已选账户：{refundAccount?.accountName}（{refundAccount?.platformAccountId || '无ID'}）　当前余额：<b>¥{refundAccount?.currentBalance ?? '0.00'}</b>（账户币）
            </div>
          )}
          <Form.Item name="amount" label="退款金额（账户币）" rules={[{ required: true, message: '请输入退款金额' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="默认退全部余额，可自定义" prefix="¥" />
          </Form.Item>
          <Form.Item label={<span style={{ color: '#8b8ea8' }}>快捷操作</span>}>
            <Button size="small" type="dashed" onClick={() => refundForm.setFieldValue('amount', Number(refundAccount?.currentBalance || 0))}>退全部余额（¥{refundAccount?.currentBalance ?? '0.00'}）</Button>
          </Form.Item>
          <Form.Item name="fundType" label="退回资金类型" rules={[{ required: true, message: '请选择资金类型' }]}>
            <Radio.Group>
              <Radio value="PUBLIC">对公</Radio>
              <Radio value="PRIVATE">对私</Radio>
            </Radio.Group>
          </Form.Item>
          {refundFund && refundAccount && (
            <div style={{ marginBottom: 12, fontSize: 13, color: '#555' }}>
              预计退回现金：<b style={{ color: '#1677ff' }}>¥{((Number(refundForm.getFieldValue('amount') || 0) / (1 + (Number(refundFund === 'PUBLIC' ? (refundAccount.customerRebatePublic || 0) : (refundAccount.customerRebatePrivate || 0)) || 0) / 100))).toFixed(2)}</b>（按{refundFund === 'PUBLIC' ? '对公' : '对私'}返点 {Number(refundFund === 'PUBLIC' ? (refundAccount.customerRebatePublic || 0) : (refundAccount.customerRebatePrivate || 0)) || 0}% 换算）
            </div>
          )}
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={refundSubmitting}>提交退款申请</Button>
        </Form>
      </Modal>

      <Modal title={`账户流水：${accounts.find((a: any) => a.id === accountTxAccount)?.accountName || ''}`} open={txModalOpen} onCancel={() => setTxModalOpen(false)} footer={null} width={760}>
        <Table rowKey="id" size="small" pagination={false} dataSource={accountTx} locale={{ emptyText: '暂无流水' }} columns={[
          { title: '交易单号', dataIndex: 'transactionNo' },
          { title: '变动金额', dataIndex: 'changeAmount', render: (v: string) => <b style={{ color: v.startsWith('-') ? '#ef4444' : '#22c55e' }}>{v}</b> },
          { title: '客户返点', dataIndex: 'customerRebate', render: (v: string) => v ? `${v}%` : '—' },
          { title: '实打金额', dataIndex: 'remitAmount', render: (v: string) => v || '—' },
          { title: '时间', dataIndex: 'occurredAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
        ]} />
      </Modal>
    </main>
  );
}

// ==================== C 端登录 ====================
function CustomerLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [loading, setLoading] = useState(false);
  async function submit(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/portal/c/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '登录失败');
      localStorage.setItem('cToken', data.accessToken);
      onLogin(data.accessToken);
    } catch (e) { message.error(e instanceof Error ? e.message : '登录失败'); }
    finally { setLoading(false); }
  }
  return (
    <main className="portal-shell">
      <style>{`${portalCss}`}</style>
      <div className="portal-login-wrap">
        <Card className="portal-login-card" variant="borderless">
          <div className="portal-login-logo">财</div>
          <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>客户自助中心</Typography.Title>
          <p style={{ textAlign: 'center', color: '#8b8ea8', marginTop: 0 }}>钱包 · 推广账户 · 充值申请 · 发票</p>
          <Form layout="vertical" size="large" onFinish={submit} requiredMark={false}>
            <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}><Input prefix={<UserOutlined />} placeholder="请输入账号" /></Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}><Input.Password prefix={<LockOutlined />} placeholder="请输入密码" /></Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
          </Form>
        </Card>
      </div>
    </main>
  );
}

const portalCss = `
.portal-shell { min-height: 100vh; background: linear-gradient(135deg, #e0e7ff 0%, #f0f4ff 25%, #fdf2f8 50%, #ecfeff 75%, #f0fdf4 100%); }
.portal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; background: rgba(255,255,255,0.72); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.8); box-shadow: 0 8px 32px rgba(31,38,135,0.08); position: sticky; top: 0; z-index: 10; }
.portal-brand { display: flex; align-items: center; gap: 12px; }
.portal-logo, .portal-login-logo { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(102,126,234,0.4); }
.portal-title { font-size: 18px; font-weight: 700; color: #4338ca; }
.portal-sub { font-size: 11px; letter-spacing: 2px; color: #a5a8c0; }
.portal-user { display: flex; align-items: center; gap: 14px; color: #4b4e6d; }
.portal-body { padding: 20px 24px; max-width: 1280px; margin: 0 auto; }
.portal-card { border: 1px solid rgba(255,255,255,0.8) !important; background: rgba(255,255,255,0.68) !important; backdrop-filter: blur(20px) !important; box-shadow: 0 8px 32px rgba(31,38,135,0.08) !important; border-radius: 16px !important; }
.portal-main { margin-top: 16px; }
.portal-login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.portal-login-card { width: 380px; max-width: 100%; border-radius: 20px !important; background: rgba(255,255,255,0.72) !important; backdrop-filter: blur(24px) !important; border: 1px solid rgba(255,255,255,0.85) !important; box-shadow: 0 16px 48px rgba(31,38,135,0.14) !important; padding: 8px 12px; }
.portal-login-logo { width: 56px; height: 56px; font-size: 26px; margin: 8px auto 12px; }
`;
