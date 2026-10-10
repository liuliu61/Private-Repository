'use client';

import { useEffect, useState } from 'react';
import {
  Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber, List, message, Modal, Row,
  Select, Space, Statistic, Table, Tabs, Tag, Typography,
} from 'antd';
import {
  AccountBookOutlined, BellOutlined, CheckCircleOutlined, CloseCircleOutlined, CreditCardOutlined,
  FileDoneOutlined, LockOutlined, LogoutOutlined, ReloadOutlined, TeamOutlined, UserOutlined, WalletOutlined,
} from '@ant-design/icons';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function AgentPortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [reqStatus, setReqStatus] = useState<string>('PENDING');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [currentReq, setCurrentReq] = useState<any>(null);
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [rejectForm] = Form.useForm();

  useEffect(() => {
    const t = localStorage.getItem('bToken');
    if (t) { setToken(t); loadAll(t); }
  }, []);

  const fetchJson = async (t: string, path: string, opts?: any) => {
    const res = await fetch(`${apiUrl}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...(opts?.headers || {}) } });
    const data = await res.json();
    if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败');
    return data;
  };

  async function loadAll(t: string) {
    setLoading(true);
    try {
      const [meData, customerData, reqData, txData, invData, chData] = await Promise.all([
        fetchJson(t, '/portal/b/me'),
        fetchJson(t, '/portal/b/customers?pageSize=50'),
        fetchJson(t, '/portal/b/recharge-requests?status=PENDING&pageSize=50'),
        fetchJson(t, '/portal/b/transactions?pageSize=50'),
        fetchJson(t, '/portal/b/invoices?pageSize=50'),
        fetchJson(t, '/portal/b/channels'),
      ]);
      setMe(meData);
      setCustomers(customerData.items || []);
      setRequests(reqData.items || []);
      setTransactions(txData.items || []);
      setInvoices(invData.items || []);
      setChannels(chData || []);
    } catch (e) { message.error(e instanceof Error ? e.message : '加载失败'); }
    finally { setLoading(false); }
  }

  async function loadRequests(t: string, status: string) {
    try {
      const d = await fetchJson(t, `/portal/b/recharge-requests?status=${status}&pageSize=50`);
      setRequests(d.items || []);
    } catch (e) { message.error(e instanceof Error ? e.message : '加载失败'); }
  }

  async function openConfirm(req: any) {
    setCurrentReq(req);
    setConfirmOpen(true);
    form.resetFields();
    const isPublic = req.fundType === 'PUBLIC';
    const defCustRebate = Number(isPublic ? (req.promotionRebatePublic ?? req.promotionRebatePrivate ?? 0) : (req.promotionRebatePrivate ?? req.promotionRebatePublic ?? 0));
    const defRemit = Number(req.amount) / (1 + defCustRebate / 100);
    const ch = channels[0];
    form.setFieldsValue({
      customerRebate: defCustRebate,
      costRebate: Number(ch ? (isPublic ? ch.defaultCostRebatePublic : ch.defaultCostRebatePrivate) : 0),
      portId: ch?.id,
      paymentNature: isPublic ? 'PUBLIC' : 'PRIVATE',
      remitAmount: defRemit.toFixed(2),
    });
  }

  async function confirmRecharge(values: any) {
    if (!currentReq) return;
    setSubmitting(true);
    try {
      await fetchJson(token!, `/portal/b/recharge-requests/${currentReq.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          portId: values.portId,
          customerRebate: String(values.customerRebate || 0),
          costRebate: String(values.costRebate || 0),
          remitAmount: String(values.remitAmount),
          remark: values.remark,
        }),
      });
      message.success(`充值成功：单号 ${currentReq.requestNo}`);
      setConfirmOpen(false);
      const [meData, d] = await Promise.all([
        fetchJson(token!, '/portal/b/me'),
        fetchJson(token!, `/portal/b/recharge-requests?status=${reqStatus}&pageSize=50`),
      ]);
      setMe(meData);
      setRequests(d.items || []);
    } catch (e) { message.error(e instanceof Error ? e.message : '确认失败'); }
    finally { setSubmitting(false); }
  }

  async function rejectRecharge(values: any) {
    if (!currentReq) return;
    setSubmitting(true);
    try {
      await fetchJson(token!, `/portal/b/recharge-requests/${currentReq.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: values.reason }) });
      message.success(`已驳回：${currentReq.requestNo}`);
      setRejectOpen(false);
      rejectForm.resetFields();
      const d = await fetchJson(token!, `/portal/b/recharge-requests?status=${reqStatus}&pageSize=50`);
      setRequests(d.items || []);
    } catch (e) { message.error(e instanceof Error ? e.message : '驳回失败'); }
    finally { setSubmitting(false); }
  }

  async function openDetail(customer: any) {
    setDetailOpen(true);
    try {
      const d = await fetchJson(token!, `/portal/b/customers/${customer.id}`);
      setCustomerDetail(d);
    } catch (e) { message.error(e instanceof Error ? e.message : '加载失败'); }
  }

  function logout() { localStorage.removeItem('bToken'); window.location.href = '/b'; }

  if (!token) {
    return <AgentLogin onLogin={(t) => { setToken(t); loadAll(t); }} />;
  }

  const statusColor = (s: string) => (s === 'CONFIRMED' ? 'green' : s === 'REJECTED' ? 'red' : 'orange');
  const statusLabel = (s: string) => ({ CONFIRMED: '充值成功', REJECTED: '已驳回', PENDING: '待处理' }[s] || s);

  return (
    <main className="portal-shell">
      <style>{`${portalCss}`}</style>
      <header className="portal-header">
        <div className="portal-brand"><div className="portal-logo">代</div><div><div className="portal-title">代理商工作台</div><div className="portal-sub">AGENT PORTAL</div></div></div>
        <div className="portal-user"><BellOutlined /><span>{me?.displayName || ''}</span><Button type="text" icon={<LogoutOutlined />} onClick={logout}>退出</Button></div>
      </header>

      <div className="portal-body">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><Card className="portal-card"><Statistic title="名下客户" value={me?.customerCount || 0} suffix="家" loading={loading} /></Card></Col>
          <Col xs={24} md={8}><Card className="portal-card"><Statistic title="待处理充值申请" value={me?.pendingRechargeCount || 0} suffix="笔" loading={loading} /></Card></Col>
          <Col xs={24} md={8}><Card className="portal-card"><Statistic title="名下客户现金余额" value={customers.reduce((s: number, c: any) => s + Number(c.cashBalance), 0).toFixed(2)} prefix="¥" loading={loading} /></Card></Col>
        </Row>

        <Card className="portal-card portal-main" title="业务处理" extra={<Button icon={<ReloadOutlined />} onClick={() => loadAll(token!)}>刷新</Button>}>
          <Tabs
            defaultActiveKey="requests"
            items={[
              {
                key: 'requests', label: <span><CreditCardOutlined /> 充值申请</span>,
                children: (
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <RadioGroup value={reqStatus} onChange={(e) => { setReqStatus(e.target.value); loadRequests(token!, e.target.value); }} />
                    <Table rowKey="id" size="small" loading={loading} dataSource={requests} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无充值申请' }} columns={[
                      { title: '申请单号', dataIndex: 'requestNo' },
                      { title: '客户', dataIndex: 'customerName' },
                      { title: '提交人', dataIndex: 'submitterName' },
                      { title: '推广账户', dataIndex: 'promotionAccountName' },
                      { title: '申请金额', dataIndex: 'amount', render: (v: string) => <b>¥{v}</b> },
                      { title: '端口', dataIndex: 'portName', render: (v: string) => v || '—' },
                      { title: '备注', dataIndex: 'remark', render: (v: string) => v || '—' },
                      { title: '状态', dataIndex: 'statusLabel', render: (v: string, r: any) => <Tag color={statusColor(r.status)}>{v}</Tag> },
                      { title: '申请时间', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                      {
                        title: '操作', render: (_: any, r: any) => r.status === 'PENDING' ? (
                          <Space>
                            <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => openConfirm(r)}>确认充值成功</Button>
                            <Button danger size="small" icon={<CloseCircleOutlined />} onClick={() => { setCurrentReq(r); setRejectOpen(true); rejectForm.resetFields(); }}>驳回</Button>
                          </Space>
                        ) : (
                          <span style={{ color: '#8b8ea8', fontSize: 12 }}>{r.statusLabel}{r.confirmedAt ? ` · ${new Date(r.confirmedAt).toLocaleString('zh-CN')}` : ''}{r.rejectReason ? ` · ${r.rejectReason}` : ''}</span>
                        ),
                      },
                    ]} />
                  </Space>
                ),
              },
              {
                key: 'customers', label: <span><TeamOutlined /> 名下客户</span>,
                children: (
                  <Table rowKey="id" size="small" dataSource={customers} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无绑定客户' }} columns={[
                    { title: '客户名称', dataIndex: 'name' },
                    { title: '客户编码', dataIndex: 'customerCode' },
                    { title: '联系人', dataIndex: 'contact', render: (v: string) => v || '—' },
                    { title: '电话', dataIndex: 'phone', render: (v: string) => v || '—' },
                    { title: '钱包现金', dataIndex: 'cashBalance', render: (v: string) => <b>¥{v}</b> },
                    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : '停用'}</Tag> },
                    { title: '操作', render: (_: any, r: any) => <Button type="link" size="small" onClick={() => openDetail(r)}>查看详情</Button> },
                  ]} />
                ),
              },
              {
                key: 'funds', label: <span><WalletOutlined /> 资金流水</span>,
                children: (
                  <Table rowKey="id" size="small" dataSource={transactions} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无资金流水' }} columns={[
                    { title: '客户', dataIndex: 'customerName' },
                    { title: '钱包', dataIndex: 'walletName' },
                    { title: '类型', dataIndex: 'businessTypeLabel' },
                    { title: '变动金额', dataIndex: 'changeAmount', render: (v: string) => <b style={{ color: v.startsWith('-') ? '#ef4444' : '#22c55e' }}>{v}</b> },
                    { title: '余额', dataIndex: 'balanceAfter' },
                    { title: '业务单号', dataIndex: 'businessNo' },
                    { title: '时间', dataIndex: 'occurredAt', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
                    { title: '备注', dataIndex: 'remark' },
                  ]} />
                ),
              },
              {
                key: 'invoices', label: <span><FileDoneOutlined /> 发票</span>,
                children: (
                  <Table rowKey="id" size="small" dataSource={invoices} pagination={{ pageSize: 10 }} locale={{ emptyText: '暂无发票任务' }} columns={[
                    { title: '客户', dataIndex: 'customerName' },
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

      <Modal title={`确认充值成功：${currentReq?.requestNo || ''}`} open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} width={620}>
        {currentReq && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="客户">{currentReq.customerName}</Descriptions.Item>
              <Descriptions.Item label="推广账户">{currentReq.promotionAccountName}</Descriptions.Item>
              <Descriptions.Item label="资金类型"><Tag color={currentReq.fundType === 'PUBLIC' ? 'blue' : 'green'}>{currentReq.fundType === 'PUBLIC' ? '对公' : '对私'}</Tag></Descriptions.Item>
              <Descriptions.Item label="申请金额"><b style={{ color: '#4338ca' }}>¥{currentReq.amount}</b></Descriptions.Item>
              <Descriptions.Item label="申请时间">{new Date(currentReq.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
              {currentReq.remark ? <Descriptions.Item label="备注" span={2}>{currentReq.remark}</Descriptions.Item> : null}
            </Descriptions>
            <Form form={form} layout="vertical" onFinish={confirmRecharge} requiredMark={false}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="portId" label="端口" rules={[{ required: true, message: '请选择端口' }]}>
                    <Select placeholder="选择端口" options={channels.map((c: any) => ({ value: c.id, label: c.name }))} onChange={(v) => {
                      const ch = channels.find((c: any) => c.id === v);
                      const nature = form.getFieldValue('paymentNature');
                      if (ch) form.setFieldsValue({ costRebate: nature === 'PUBLIC' ? Number(ch.defaultCostRebatePublic) : Number(ch.defaultCostRebatePrivate) });
                    }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="paymentNature" label="款项性质" initialValue="PRIVATE">
                    <Select options={[{ value: 'PRIVATE', label: '对私' }, { value: 'PUBLIC', label: '对公' }]} onChange={(v) => {
                      const ch = channels.find((c: any) => c.id === form.getFieldValue('portId'));
                      const custReb = v === 'PUBLIC' ? Number(currentReq?.promotionRebatePublic ?? 0) : Number(currentReq?.promotionRebatePrivate ?? 0);
                      form.setFieldsValue({
                        costRebate: ch ? (v === 'PUBLIC' ? Number(ch.defaultCostRebatePublic) : Number(ch.defaultCostRebatePrivate)) : 0,
                        customerRebate: custReb,
                        remitAmount: (Math.floor((Number(currentReq?.amount ?? 0) / (1 + custReb / 100)) * 100) / 100).toFixed(2),
                      });
                    }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="customerRebate" label="客户返点(%)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} onChange={(v) => {
                      const amount = Number(currentReq.amount);
                      const remit = amount / (1 + (Number(v) || 0) / 100);
                      form.setFieldsValue({ remitAmount: remit.toFixed(2) });
                    }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="costRebate" label="成本返点(%)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="remitAmount" label="实打金额" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0.01} precision={2} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="remark" label="备注">
                <Input placeholder="选填" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>确认充值成功</Button>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal title={`驳回申请：${currentReq?.requestNo || ''}`} open={rejectOpen} onCancel={() => setRejectOpen(false)} footer={null}>
        <Form form={rejectForm} layout="vertical" onFinish={rejectRecharge} requiredMark={false}>
          <Form.Item name="reason" label="驳回原因" rules={[{ required: true, message: '请填写驳回原因' }]}>
            <Input.TextArea rows={3} placeholder="请填写驳回原因" />
          </Form.Item>
          <Button danger htmlType="submit" block loading={submitting}>确认驳回</Button>
        </Form>
      </Modal>

      <Drawer title={`客户详情：${customerDetail?.name || ''}`} open={detailOpen} onClose={() => setDetailOpen(false)} width={720}>
        {customerDetail && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="客户编码">{customerDetail.customerCode}</Descriptions.Item>
              <Descriptions.Item label="客户名称">{customerDetail.name}</Descriptions.Item>
              <Descriptions.Item label="联系人">{customerDetail.contact || '—'}</Descriptions.Item>
              <Descriptions.Item label="电话">{customerDetail.phone || '—'}</Descriptions.Item>
            </Descriptions>
            <Typography.Text strong>钱包</Typography.Text>
            <Table rowKey="id" size="small" pagination={false} dataSource={customerDetail.wallets} columns={[
              { title: '钱包名称', dataIndex: 'walletName' },
              { title: '现金余额', dataIndex: 'cashBalance', render: (v: string) => <b>¥{v}</b> },
              { title: '授信已用', dataIndex: 'creditUsed', render: (v: string) => `¥${v}` },
              { title: '垫款未还', dataIndex: 'advanceOutstanding', render: (v: string) => `¥${v}` },
            ]} />
            <Typography.Text strong>推广账户</Typography.Text>
            <Table rowKey="id" size="small" pagination={false} dataSource={customerDetail.promotionAccounts} columns={[
              { title: '账户名称', dataIndex: 'accountName' },
              { title: '端口', dataIndex: 'channelName', render: (v: string) => v || '—' },
              { title: '累计充值金额', dataIndex: 'currentBalance', render: (v: string) => <b>¥{v}</b> },
              { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : '停用'}</Tag> },
            ]} />
          </Space>
        )}
      </Drawer>
    </main>
  );
}

// ==================== B 端登录 ====================
function AgentLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [loading, setLoading] = useState(false);
  async function submit(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/portal/b/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '登录失败');
      localStorage.setItem('bToken', data.accessToken);
      onLogin(data.accessToken);
    } catch (e) { message.error(e instanceof Error ? e.message : '登录失败'); }
    finally { setLoading(false); }
  }
  return (
    <main className="portal-shell">
      <style>{`${portalCss}`}</style>
      <div className="portal-login-wrap">
        <Card className="portal-login-card" variant="borderless">
          <div className="portal-login-logo">代</div>
          <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>代理商工作台</Typography.Title>
          <p style={{ textAlign: 'center', color: '#8b8ea8', marginTop: 0 }}>名下客户 · 充值处理 · 资金结算 · 发票</p>
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

// 状态切换按钮组
function RadioGroup({ value, onChange }: { value: string; onChange: (e: any) => void }) {
  const options = [
    { key: 'PENDING', label: '待处理' },
    { key: 'CONFIRMED', label: '充值成功' },
    { key: 'REJECTED', label: '已驳回' },
    { key: '', label: '全部' },
  ];
  return (
    <Space>
      {options.map((o) => (
        <Button key={o.key || 'all'} size="small" type={value === o.key ? 'primary' : 'default'} onClick={() => onChange({ target: { value: o.key } })}>{o.label}</Button>
      ))}
    </Space>
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
