'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input, Select,
  message, Descriptions, Tabs, Statistic, Row, Col
} from 'antd';
import { PlusOutlined, ReloadOutlined, EyeOutlined, WalletOutlined } from '@ant-design/icons';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function request(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `请求失败 ${res.status}`);
  return data;
}

interface Customer { id: string; name: string; customerCode: string; }
interface PromotionAccount {
  id: string; accountName: string; platform?: string; platformAccountId?: string;
  accountCategory?: string; channelName?: string; unit: string; currentBalance: string;
  status: string; customerId: string; createdAt: string; customer?: Customer;
}
interface PromotionTransaction {
  id: string; transactionNo: string; businessType: string; businessNo: string;
  changeAmount: string; balanceBefore: string; balanceAfter: string;
  occurredAt: string; remark: string | null;
}

export default function PromotionAccountPanel({ token, customers, onError }: {
  token: string; customers: Customer[]; onError: (error: string) => void;
}) {
  const [data, setData] = useState<PromotionAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<PromotionAccount | null>(null);
  const [transactions, setTransactions] = useState<PromotionTransaction[]>([]);
  const [rechargeModalOpen, setRechargeModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [wallets, setWallets] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [rechargeForm] = Form.useForm();
  const [refundForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    if (!selectedCustomer) { setData([]); return; }
    setLoading(true);
    try {
      const rows = await request(`/customers/${selectedCustomer}/promotion-accounts`, token) as PromotionAccount[] | { items: PromotionAccount[] };
      setData(Array.isArray(rows) ? rows : (rows.items || []));
    } catch (e: any) { onError(e.message); } finally { setLoading(false); }
  }, [token, selectedCustomer, onError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (values: any) => {
    if (!selectedCustomer) return;
    try {
      await request(`/customers/${selectedCustomer}/promotion-accounts`, token, {
        method: 'POST', body: JSON.stringify(values),
      });
      message.success('推广账户创建成功');
      setCreateModalOpen(false); form.resetFields(); fetchData();
    } catch (e: any) { onError(e.message); }
  };

  const openDetail = async (record: PromotionAccount) => {
    setCurrentAccount(record);
    setDetailModalOpen(true);
    // 尝试加载交易记录（如果有API）
    try {
      const txs = await request(`/promotion-accounts/${record.id}/transactions?page=1&pageSize=50`, token);
      setTransactions(Array.isArray(txs) ? txs : (txs.items || []));
    } catch { setTransactions([]); }
  };

  const openRecharge = async (record: PromotionAccount) => {
    setCurrentAccount(record);
    setRechargeModalOpen(true);
    rechargeForm.resetFields();
    // 加载客户钱包并默认选中第一个
    try {
      const ws = await request(`/customer-wallets?customerId=${record.customerId}`, token);
      const walletList = Array.isArray(ws) ? ws : (ws.items || []);
      setWallets(walletList);
      if (walletList.length > 0) {
        rechargeForm.setFieldsValue({ customerWalletId: walletList[0].id });
      }
    } catch (e: any) { onError(e.message); }
  };

  const handleRecharge = async (values: any) => {
    if (!currentAccount) return;
    try {
      const amount = Number(values.creditAmount) || 0;
      const customerRebate = Number(values.customerRebate) || 0;
      const costRebate = Number(values.costRebate) || 0;
      const additionalFee = Number(values.additionalFee) || 0;
      const operateFee = Number(values.operateFee) || 0;
      const remitAmount = amount / (1 + customerRebate / 100);
      const profit = remitAmount - amount / (1 + costRebate / 100) - additionalFee - operateFee;
      await request(`/promotion-accounts/${currentAccount.id}/credit`, token, {
        method: 'POST',
        body: JSON.stringify({
          amount: String(amount),
          customerRebate: String(customerRebate),
          costRebate: String(costRebate),
          remitAmount: remitAmount.toFixed(2),
          additionalFee: String(additionalFee),
          operateFee: String(operateFee),
          profit: profit.toFixed(2),
          accountCategory: values.accountCategory,
          channelName: values.channelName,
          paymentNature: values.paymentNature,
          customerWalletId: values.customerWalletId,
          remark: values.remark || '手动充值',
        }),
      });
      message.success('充值成功');
      setRechargeModalOpen(false); rechargeForm.resetFields(); fetchData();
    } catch (e: any) { onError(e.message); }
  };

  const openRefund = async (record: PromotionAccount) => {
    setCurrentAccount(record);
    setRefundModalOpen(true);
    refundForm.resetFields();
    // 加载客户钱包并默认选中第一个
    try {
      const ws = await request(`/customer-wallets?customerId=${record.customerId}`, token);
      const walletList = Array.isArray(ws) ? ws : (ws.items || []);
      setWallets(walletList);
      if (walletList.length > 0) {
        refundForm.setFieldsValue({ customerWalletId: walletList[0].id });
      }
    } catch (e: any) { onError(e.message); }
  };

  const handleRefund = async (values: any) => {
    if (!currentAccount) return;
    try {
      await request(`/promotion-accounts/${currentAccount.id}/refund`, token, {
        method: 'POST',
        body: JSON.stringify({
          amount: String(values.refundAmount),
          customerWalletId: values.customerWalletId,
          remark: values.remark || '账户退款',
        }),
      });
      message.success('退款成功');
      setRefundModalOpen(false); refundForm.resetFields(); fetchData();
    } catch (e: any) { onError(e.message); }
  };

  const columns = [
    { title: '账户名称', dataIndex: 'accountName', key: 'accountName', width: 180 },
    { title: '所属客户', dataIndex: ['customer', 'name'], key: 'customerName', width: 150, render: (v: string, r: PromotionAccount) => customers.find(c => c.id === r.customerId)?.name || '-' },
    { title: '推广平台', dataIndex: 'platform', key: 'platform', width: 120, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: '平台账号ID', dataIndex: 'platformAccountId', key: 'platformAccountId', width: 140, render: (v: string) => v || '-' },
    { title: '币种/单位', dataIndex: 'unit', key: 'unit', width: 100, render: (v: string) => v === 'ACCOUNT_CREDIT' ? '账户币' : v },
    { title: '当前余额', dataIndex: 'currentBalance', key: 'currentBalance', width: 130, render: (v: string) => <b style={{ color: '#1677ff' }}>{v}</b> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : '停用'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right' as const,
      render: (_: any, record: PromotionAccount) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
          <Button type="link" size="small" icon={<WalletOutlined />} onClick={() => openRecharge(record)}>充值</Button>
          <Button type="link" size="small" danger onClick={() => openRefund(record)}>退款</Button>
        </Space>
      ),
    },
  ];

  const txColumns = [
    { title: '流水号', dataIndex: 'transactionNo', key: 'transactionNo', width: 200 },
    { title: '业务类型', dataIndex: 'businessType', key: 'businessType', width: 140, render: (v: string) => {
      const map: Record<string, string> = { CUSTOMER_CREDIT: '账户充值', MANUAL_ADJUST: '手工调整', WALLET_OPEN: '期初余额', FINANCIAL_ADJUST: '财务调整' };
      return map[v] || v;
    }},
    { title: '变动金额(元)', dataIndex: 'changeAmount', key: 'changeAmount', width: 140, render: (v: string) => <span style={{ color: v.startsWith('-') ? '#ef4444' : '#10b981', fontWeight: 600, fontSize: 15 }}>{v.startsWith('-') ? v : `+${v}`}</span> },
    { title: '完成时间', dataIndex: 'occurredAt', key: 'occurredAt', width: 180, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
  ];

  return (
    <div>
      <Card
        title="推广账户管理"
        extra={
          <Space>
            <Select
              placeholder="选择客户" style={{ width: 240 }} allowClear
              value={selectedCustomer} onChange={(v) => setSelectedCustomer(v)}
              options={customers.map(c => ({ value: c.id, label: `${c.name} (${c.customerCode})` }))}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={!selectedCustomer} onClick={() => { form.resetFields(); setCreateModalOpen(true); }}>新增推广账户</Button>
          </Space>
        }
      >
        {!selectedCustomer ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>请先选择客户查看推广账户</div>
        ) : (
          <Table rowKey="id" dataSource={data} columns={columns} loading={loading} scroll={{ x: 1200 }} pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 个推广账户` }} />
        )}
      </Card>

      {/* 新增推广账户弹窗 */}
      <Modal title="新增推广账户" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={() => form.submit()} width={500} okText="创建" cancelText="取消">
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="accountName" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }, { max: 100, message: '最多100个字符' }]}>
            <Input placeholder="例如：巨量引擎-测试账户" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="platform" label="推广平台">
                <Select placeholder="请选择推广平台" allowClear>
                  <Select.Option value="DOUYIN">抖音/巨量引擎</Select.Option>
                  <Select.Option value="KUAISHOU">快手</Select.Option>
                  <Select.Option value="XIAOHONGSHU">小红书</Select.Option>
                  <Select.Option value="BAIDU">百度</Select.Option>
                  <Select.Option value="TENCENT">腾讯</Select.Option>
                  <Select.Option value="WECHAT">微信</Select.Option>
                  <Select.Option value="BILIBILI">B站</Select.Option>
                  <Select.Option value="OTHER">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="platformAccountId" label="平台账号ID">
                <Input placeholder="请输入平台账号ID" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="accountCategory" label="账户分类">
                <Select placeholder="请选择账户分类" allowClear>
                  <Select.Option value="AD_RECHARGE">广告充值</Select.Option>
                  <Select.Option value="LOCAL_PROMOTION">本地推</Select.Option>
                  <Select.Option value="XIAOHONGSHU">小红书</Select.Option>
                  <Select.Option value="OTHER">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="channelName" label="端口">
                <Select placeholder="请选择端口" allowClear showSearch>
                  <Select.Option value="全网对公">全网对公</Select.Option>
                  <Select.Option value="全网对私">全网对私</Select.Option>
                  <Select.Option value="星途">星途</Select.Option>
                  <Select.Option value="智星">智星</Select.Option>
                  <Select.Option value="至真">至真</Select.Option>
                  <Select.Option value="其他">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="unit" label="账户单位" initialValue="ACCOUNT_CREDIT">
            <Select options={[{ value: 'ACCOUNT_CREDIT', label: '账户币' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 推广账户详情弹窗 */}
      <Modal title="推广账户详情" open={detailModalOpen} onCancel={() => setDetailModalOpen(false)} footer={null} width={900}>
        {currentAccount && (
          <Tabs items={[
            {
              key: 'info', label: '基本信息',
              children: (
                <Descriptions bordered column={2} size="small">
                  <Descriptions.Item label="账户名称">{currentAccount.accountName}</Descriptions.Item>
                  <Descriptions.Item label="所属客户">{customers.find(c => c.id === currentAccount.customerId)?.name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="推广平台">{currentAccount.platform || '-'}</Descriptions.Item>
                  <Descriptions.Item label="平台账号ID">{currentAccount.platformAccountId || '-'}</Descriptions.Item>
                  <Descriptions.Item label="账户分类">{currentAccount.accountCategory || '-'}</Descriptions.Item>
                  <Descriptions.Item label="端口">{currentAccount.channelName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="单位">{currentAccount.unit === 'ACCOUNT_CREDIT' ? '账户币' : currentAccount.unit}</Descriptions.Item>
                  <Descriptions.Item label="当前余额"><b style={{ color: '#1677ff', fontSize: 16 }}>{currentAccount.currentBalance}</b></Descriptions.Item>
                  <Descriptions.Item label="状态"><Tag color={currentAccount.status === 'ACTIVE' ? 'green' : 'default'}>{currentAccount.status === 'ACTIVE' ? '正常' : '停用'}</Tag></Descriptions.Item>
                  <Descriptions.Item label="创建时间">{new Date(currentAccount.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'transactions', label: '交易记录',
              children: transactions.length > 0 ? (
                <Table rowKey="id" dataSource={transactions} columns={txColumns} size="small" scroll={{ x: 1000 }} pagination={{ pageSize: 10 }} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>暂无交易记录</div>
              ),
            },
          ]} />
        )}
      </Modal>

      {/* 充值弹窗 */}
      <Modal title="推广账户充值" open={rechargeModalOpen} onCancel={() => setRechargeModalOpen(false)} onOk={() => rechargeForm.submit()} width={700} okText="确认充值" cancelText="取消">
        {currentAccount && <RechargeFormContent form={rechargeForm} account={currentAccount} token={token} wallets={wallets} onFinish={handleRecharge} />}
      </Modal>

      {/* 退款弹窗 */}
      <Modal title="推广账户退款" open={refundModalOpen} onCancel={() => setRefundModalOpen(false)} onOk={() => refundForm.submit()} width={520} okText="确认退款" cancelText="取消" okButtonProps={{ danger: true }}>
        {currentAccount && (
          <div>
            <div style={{ background: 'rgba(99, 102, 241, 0.08)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>推广账户</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>{currentAccount.accountName}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>当前余额(账户币)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>{currentAccount.currentBalance}</div>
                </div>
              </div>
            </div>
            <Form form={refundForm} layout="vertical" onFinish={handleRefund}>
              <Form.Item name="refundAmount" label="退款金额" rules={[{ required: true, message: '请输入退款金额' }]}>
                <Input type="number" placeholder="请输入退款金额" min="0.01" step="0.01" style={{ fontSize: 16 }} />
              </Form.Item>
              <Form.Item name="customerWalletId" label="退款到客户钱包" rules={[{ required: true, message: '请选择客户钱包' }]}>
                <Select placeholder="选择客户钱包接收退款" showSearch optionFilterProp="label"
                  options={wallets.map((w: any) => ({ value: w.id, label: `${w.walletName} (余额: ${w.cashBalance})` }))}
                />
              </Form.Item>
              <Form.Item name="remark" label="备注">
                <Input.TextArea placeholder="请输入备注（可选）" rows={2} />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RechargeFormContent({ form, account, token, wallets, onFinish }: { form: any; account: PromotionAccount; token: string; wallets: any[]; onFinish: (values: any) => void }) {
  const [channels, setChannels] = useState<any[]>([]);
  const creditAmount = Form.useWatch('creditAmount', form);
  const customerRebate = Form.useWatch('customerRebate', form);
  const costRebate = Form.useWatch('costRebate', form);
  const additionalFee = Form.useWatch('additionalFee', form);
  const operateFee = Form.useWatch('operateFee', form);
  const channelName = Form.useWatch('channelName', form);
  const paymentNature = Form.useWatch('paymentNature', form);

  // 加载端口列表
  useEffect(() => {
    async function loadChannels() {
      try {
        const response = await fetch(`${API_BASE}/channels/all`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (Array.isArray(data)) setChannels(data);
      } catch { /* 用默认端口 */ }
    }
    void loadChannels();
  }, [token]);

  // 根据端口和款项类型自动设置成本返点
  useEffect(() => {
    if (channelName && paymentNature) {
      const channel = channels.find(c => c.name === channelName);
      if (channel) {
        const rebate = paymentNature === 'PUBLIC' ? channel.defaultCostRebatePublic : channel.defaultCostRebatePrivate;
        if (rebate !== undefined) {
          form.setFieldsValue({ costRebate: parseFloat(rebate) });
        }
      }
    }
  }, [channelName, paymentNature, channels, form]);

  const amount = Number(creditAmount) || 0;
  const cRebate = Number(customerRebate) || 0;
  const costR = Number(costRebate) || 0;
  const addFee = Number(additionalFee) || 0;
  const opFee = Number(operateFee) || 0;
  const remitAmount = amount / (1 + cRebate / 100);
  const profit = remitAmount - amount / (1 + costR / 100) - addFee - opFee;

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}><Statistic title="推广账户" value={account.accountName} /></Col>
        <Col span={12}><Statistic title="当前余额(账户币)" value={account.currentBalance} /></Col>
      </Row>
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ customerRebate: 10, costRebate: 10, paymentNature: 'PUBLIC' }}>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="customerWalletId" label="扣款客户钱包（可选，不选则不扣钱包）">
              <Select placeholder="选择客户钱包进行扣款" allowClear showSearch optionFilterProp="label"
                options={wallets.map((w: any) => ({ value: w.id, label: `${w.walletName} (余额: ${w.cashBalance})` }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="accountCategory" label="账户分类">
              <Select placeholder="请选择账户分类" allowClear>
                <Select.Option value="AD_RECHARGE">广告充值</Select.Option>
                <Select.Option value="LOCAL_PROMOTION">本地推</Select.Option>
                <Select.Option value="XIAOHONGSHU">小红书</Select.Option>
                <Select.Option value="OTHER">其他</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="paymentNature" label="款项类型" rules={[{ required: true, message: '请选择款项类型' }]}>
              <Select placeholder="请选择款项类型">
                <Select.Option value="PUBLIC">对公</Select.Option>
                <Select.Option value="PRIVATE">对私</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="channelName" label="端口">
              <Select placeholder="请选择端口" allowClear showSearch optionFilterProp="label"
                options={channels.length > 0
                  ? channels.map(c => ({ value: c.name, label: `${c.name} (对公${c.defaultCostRebatePublic}%/对私${c.defaultCostRebatePrivate}%)` }))
                  : [{ value: '全网对公', label: '全网对公' }, { value: '全网对私', label: '全网对私' }, { value: '星途', label: '星途' }, { value: '智星', label: '智星' }, { value: '至真', label: '至真' }, { value: '其他', label: '其他' }]}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="creditAmount" label="充值金额" rules={[{ required: true, message: '请输入充值金额' }]}>
              <Input type="number" min="0.01" step="0.01" placeholder="请输入充值金额" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="customerRebate" label="客户返点(%)" rules={[{ required: true, message: '请输入客户返点' }]}>
              <Input type="number" step="0.01" placeholder="10" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="打款金额">
              <Input value={remitAmount.toFixed(2)} disabled />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="costRebate" label="成本返点(%)" rules={[{ required: true, message: '请输入成本返点' }]}>
              <Input type="number" step="0.01" placeholder="选择端口后自动带入" addonAfter={channelName && paymentNature ? <span style={{ color: paymentNature === 'PUBLIC' ? '#1677ff' : '#fa8c16', fontSize: 12 }}>{paymentNature === 'PUBLIC' ? '对公政策' : '对私政策'}</span> : undefined} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="additionalFee" label="额外费用">
              <Input type="number" step="0.01" placeholder="请输入额外费用" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="operateFee" label="运营费用">
              <Input type="number" step="0.01" placeholder="请输入运营费用" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="利润">
              <Input value={profit.toFixed(2)} disabled style={{ color: profit >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }} />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={1} placeholder="选填，例如：客户打款充值" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </div>
  );
}
