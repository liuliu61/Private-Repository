'use client';

import { apiRequest } from '../utils/api';
import { Alert, Button, Card, Descriptions, message, Modal, Space, Switch, Table, Tabs, Tag, Typography, Input, Select, Form } from 'antd';
import { useEffect, useState } from 'react';
import { ReloadOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';

type Supplier = { id: string; name: string };
type Customer = { id: string; name: string; customerCode?: string };
type CustomerWallet = { id: string; customerId: string; customerName?: string; currency: string; currentBalance: string; status: string; walletType?: string; createdAt?: string };
type WalletTransaction = { id: string; walletId: string; amount: string; balanceAfter: string; type: string; remark?: string; createdAt: string; relatedOrderNo?: string };
type PartnerWallet = { id: string; accountName: string; currentBalance: string; unit: string; status: string; supplierName: string };



export default function SourcingPanel({ token, suppliers, customers, onError }: { token: string; suppliers: Supplier[]; customers: Customer[]; onError: (error: string) => void }) {
  const [useCustomerWallet, setUseCustomerWallet] = useState(false);
  const [wallets, setWallets] = useState<PartnerWallet[]>([]);
  const [customerWallets, setCustomerWallets] = useState<CustomerWallet[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<CustomerWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustForm] = Form.useForm();
  const [adjusting, setAdjusting] = useState(false);

  async function refresh() {
    setLoading(true);
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
      const walletList = await apiRequest<Array<CustomerWallet>>('/customer-wallets', token);
      const walletsWithName = walletList.map(w => ({ ...w, customerName: customers.find(c => c.id === w.customerId)?.name || w.customerId }));
      setCustomerWallets(walletsWithName);
    } catch (error) { onError(error instanceof Error ? error.message : '查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [token, suppliers.length, customers.length]);

  async function updateSetting(value: boolean) {
    setSaving(true);
    try { await apiRequest('/sourcing/setting', token, { method: 'POST', body: JSON.stringify({ useCustomerWallet: value }) }); setUseCustomerWallet(value); message.success('外采客户钱包配置已保存'); }
    catch (error) { onError(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  }

  async function viewDetail(wallet: CustomerWallet) {
    setSelectedWallet(wallet);
    setDetailModalOpen(true);
    try {
      const txs = await apiRequest<Array<WalletTransaction>>(`/customer-wallets/${wallet.id}/transactions`, token);
      setTransactions(txs);
    } catch (error) { onError(error instanceof Error ? error.message : '查询明细失败'); }
  }

  async function openAdjust(wallet: CustomerWallet) {
    setSelectedWallet(wallet);
    adjustForm.resetFields();
    setAdjustModalOpen(true);
  }

  async function submitAdjust() {
    if (!selectedWallet) return;
    setAdjusting(true);
    try {
      const values = await adjustForm.validateFields();
      await apiRequest(`/customer-wallets/${selectedWallet.id}/adjust`, token, { method: 'POST', body: JSON.stringify(values) });
      message.success('钱包调整成功');
      setAdjustModalOpen(false);
      void refresh();
    } catch (error) { onError(error instanceof Error ? error.message : '调整失败'); }
    finally { setAdjusting(false); }
  }

  const customerWalletColumns = [
    { title: '客户', dataIndex: 'customerName', key: 'customerName' },
    { title: '币种', dataIndex: 'currency', key: 'currency', width: 80 },
    { title: '当前余额', dataIndex: 'currentBalance', key: 'currentBalance', align: 'right' as const, render: (v: string) => <Typography.Text strong>{Number(v).toLocaleString()}</Typography.Text> },
    { title: '钱包类型', dataIndex: 'walletType', key: 'walletType', width: 100, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : v}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { title: '操作', key: 'action', width: 150, render: (_: unknown, record: CustomerWallet) => <Space><Button size="small" icon={<EyeOutlined />} onClick={() => void viewDetail(record)}>明细</Button><Button size="small" icon={<EditOutlined />} onClick={() => void openAdjust(record)}>调整</Button></Space> },
  ];

  const transactionColumns = [
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    { title: '类型', dataIndex: 'type', key: 'type', width: 100 },
    { title: '金额', dataIndex: 'amount', key: 'amount', align: 'right' as const, render: (v: string) => <Typography.Text type={Number(v) >= 0 ? 'success' : 'danger'}>{Number(v) >= 0 ? '+' : ''}{Number(v).toLocaleString()}</Typography.Text> },
    { title: '变动后余额', dataIndex: 'balanceAfter', key: 'balanceAfter', align: 'right' as const },
    { title: '关联单号', dataIndex: 'relatedOrderNo', key: 'relatedOrderNo', render: (v: string) => v || '-' },
    { title: '备注', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
  ];

  const partnerWalletColumns = [
    { title: '伙伴', dataIndex: 'supplierName', key: 'supplierName' },
    { title: '账户', dataIndex: 'accountName', key: 'accountName' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
    { title: '余额', dataIndex: 'currentBalance', key: 'currentBalance', align: 'right' as const, render: (v: string) => <Typography.Text strong>{Number(v).toLocaleString()}</Typography.Text> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v}</Tag> },
  ];

  return (
    <Card title="外采配置与钱包" extra={<Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>刷新</Button>}>
      <Tabs items={[
        {
          key: 'customer',
          label: '客户钱包',
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message={useCustomerWallet ? '外采客户钱包联动已启用' : '外采客户钱包联动未启用'}
                description="客户钱包请在客户钱包模块统一查询和调整，外采订单确认时按此开关产生账户币钱包流水。"
                type={useCustomerWallet ? 'success' : 'warning'}
                showIcon
                action={<Switch checked={useCustomerWallet} loading={saving} checkedChildren="已启用" unCheckedChildren="未启用" onChange={(value) => void updateSetting(value)} />}
              />
              <Table
                rowKey="id"
                dataSource={customerWallets}
                columns={customerWalletColumns}
                pagination={{ pageSize: 10 }}
                loading={loading}
                size="middle"
              />
            </Space>
          ),
        },
        {
          key: 'partner',
          label: '伙伴钱包',
          children: (
            <Table
              rowKey="id"
              dataSource={wallets}
              columns={partnerWalletColumns}
              pagination={{ pageSize: 10 }}
              loading={loading}
              size="middle"
            />
          ),
        },
        {
          key: 'setting',
          label: '外采设置',
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Card size="small" title="客户钱包联动">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="功能说明">启用后，外采订单确认会在同一事务中记录客户账户币钱包变化。</Descriptions.Item>
                  <Descriptions.Item label="当前状态">
                    <Switch checked={useCustomerWallet} loading={saving} checkedChildren="已启用" unCheckedChildren="未启用" onChange={(value) => void updateSetting(value)} />
                  </Descriptions.Item>
                </Descriptions>
              </Card>
              <Card size="small" title="说明">
                <Typography.Paragraph type="secondary">
                  <ul>
                    <li>客户钱包联动启用后，外采订单确认时会自动产生客户钱包流水</li>
                    <li>伙伴钱包显示各供应商的推广账户余额</li>
                    <li>钱包调整会记录操作日志，可在钱包明细中查看</li>
                    <li>如需创建新的客户钱包，请前往"客户钱包"模块</li>
                  </ul>
                </Typography.Paragraph>
              </Card>
            </Space>
          ),
        },
      ]} />

      <Modal title="钱包明细" open={detailModalOpen} onCancel={() => setDetailModalOpen(false)} footer={<Button onClick={() => setDetailModalOpen(false)}>关闭</Button>} width={900}>
        {selectedWallet && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions column={3} size="small" bordered>
              <Descriptions.Item label="客户">{selectedWallet.customerName}</Descriptions.Item>
              <Descriptions.Item label="币种">{selectedWallet.currency}</Descriptions.Item>
              <Descriptions.Item label="当前余额"><Typography.Text strong type="success">{Number(selectedWallet.currentBalance).toLocaleString()}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="状态">{selectedWallet.status === 'ACTIVE' ? '正常' : selectedWallet.status}</Descriptions.Item>
              <Descriptions.Item label="钱包类型">{selectedWallet.walletType || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{selectedWallet.createdAt ? new Date(selectedWallet.createdAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5}>交易明细</Typography.Title>
            <Table rowKey="id" dataSource={transactions} columns={transactionColumns} pagination={{ pageSize: 10 }} size="small" />
          </Space>
        )}
      </Modal>

      <Modal title="钱包调整" open={adjustModalOpen} onCancel={() => setAdjustModalOpen(false)} footer={[<Button key="cancel" onClick={() => setAdjustModalOpen(false)}>取消</Button>, <Button key="submit" type="primary" loading={adjusting} onClick={() => void submitAdjust()}>确认调整</Button>]}>
        {selectedWallet && (
          <Form form={adjustForm} layout="vertical">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="客户">{selectedWallet.customerName}</Descriptions.Item>
              <Descriptions.Item label="当前余额"><Typography.Text strong>{Number(selectedWallet.currentBalance).toLocaleString()}</Typography.Text></Descriptions.Item>
            </Descriptions>
            <Form.Item name="type" label="调整类型" rules={[{ required: true, message: '请选择调整类型' }]}>
              <Select placeholder="请选择调整类型">
                <Select.Option value="MANUAL_ADD">手工增加（蓝补）</Select.Option>
                <Select.Option value="MANUAL_DEDUCT">手工扣减（红冲）</Select.Option>
                <Select.Option value="OPENING_BALANCE">期初余额</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="amount" label="调整金额" rules={[{ required: true, message: '请输入调整金额' }]}>
              <Input type="number" placeholder="请输入金额" prefix="¥" />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} placeholder="请输入调整原因（必填用于审计）" />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Card>
  );
}
