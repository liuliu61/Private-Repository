"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert, App, Button, Card, Col, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tabs, Tag,
} from "antd";
import { BankOutlined, PayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { apiRequest } from "../utils/api";

type PortAccount = { promotionAccountId: string; accountName: string; platform: string; platformAccountId: string; channelName: string; customerName: string; currentBalance: string; totalCharge: string; totalRefund: string };
type PortChannel = { channelName: string; totalCharge: string; totalRefund: string; currentBalance: string; accounts: PortAccount[] };
type AgentWallet = { agentUserId: string; username: string; displayName: string; balance: string; updatedAt: string };

export default function PortWalletPanel({ token, onError }: { token: string; onError?: (e: Error) => void }) {
  const { message } = App.useApp();
  const [channels, setChannels] = useState<PortChannel[]>([]);
  const [agentWallets, setAgentWallets] = useState<AgentWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutForm] = Form.useForm();

  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const [pw, aw] = await Promise.all([
        apiRequest<{ channels: PortChannel[] }>("/portal/admin/port-wallet-stats", token),
        apiRequest<AgentWallet[]>("/portal/admin/agent-wallets", token),
      ]);
      setChannels(pw.channels || []);
      setAgentWallets(aw || []);
    } catch (e) { if (onError) onError(e as Error); else message.error((e as Error).message); }
    finally { setLoading(false); }
  }, [token, message, onError]);

  useEffect(() => { load(); }, [load]);

  async function submitPayout(values: any) {
    setPayoutSubmitting(true);
    try {
      await apiRequest("/portal/admin/agent-payout", token, { method: "POST", body: JSON.stringify(values) });
      message.success("打款录入成功，代理商钱包已加回");
      setPayoutOpen(false);
      payoutForm.resetFields();
      load(true);
    } catch (e) { message.error((e as Error).message); }
    finally { setPayoutSubmitting(false); }
  }

  const accountColumns = [
    { title: "推广账户", dataIndex: "accountName" },
    { title: "客户", dataIndex: "customerName" },
    { title: "平台", dataIndex: "platform" },
    { title: "平台账号ID", dataIndex: "platformAccountId" },
    { title: "累计充值(账户币)", dataIndex: "totalCharge", render: (v: string) => <b style={{ color: "#10b981" }}>¥{v}</b> },
    { title: "累计退款(账户币)", dataIndex: "totalRefund", render: (v: string) => Number(v) > 0 ? <b style={{ color: "#ef4444" }}>¥{v}</b> : "—" },
    { title: "当前余额(账户币)", dataIndex: "currentBalance", render: (v: string) => <b>¥{v}</b> },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title="代理商钱包"
        extra={
          <Space>
            <Button type="primary" icon={<PayCircleOutlined />} onClick={() => { payoutForm.resetFields(); setPayoutOpen(true); }}>打款录入</Button>
            <Button icon={<ReloadOutlined />} onClick={() => load(true)}>刷新</Button>
          </Space>
        }
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="每笔充值确认后，代理商钱包会扣减对应现金（负数表示欠代理商未打款）；录入打款后加回。" />
        <Table rowKey="agentUserId" size="small" loading={loading} dataSource={agentWallets} pagination={false} locale={{ emptyText: "暂无代理商钱包记录" }} columns={[
          { title: "代理商", dataIndex: "displayName", render: (v: string, r: any) => <span>{v}<Tag style={{ marginLeft: 8 }}>{r.username}</Tag></span> },
          { title: "钱包余额", dataIndex: "balance", render: (v: string) => {
            const n = Number(v);
            return n < 0
              ? <Tag color="red">欠款 ¥{Math.abs(n).toFixed(2)}</Tag>
              : <b style={{ color: "#10b981" }}>¥{n.toFixed(2)}</b>;
          } },
          { title: "更新时间", dataIndex: "updatedAt", render: (v: string) => v ? new Date(v).toLocaleString("zh-CN") : "—" },
        ]} />
      </Card>

      <Card title="端口钱包" extra={<Button icon={<ReloadOutlined />} onClick={() => load(true)}>刷新</Button>}>
        <Tabs
          items={channels.length > 0 ? channels.map((c: PortChannel, idx: number) => ({
            key: String(idx),
            label: <span><BankOutlined /> {c.channelName}</span>,
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Descriptions size="small" bordered column={3}>
                  <Descriptions.Item label="端口">{c.channelName}</Descriptions.Item>
                  <Descriptions.Item label="累计充值(账户币)"><b style={{ color: "#10b981" }}>¥{c.totalCharge}</b></Descriptions.Item>
                  <Descriptions.Item label="累计退款(账户币)">{Number(c.totalRefund) > 0 ? <b style={{ color: "#ef4444" }}>¥{c.totalRefund}</b> : "—"}</Descriptions.Item>
                  <Descriptions.Item label="端口钱包余额(账户币)" span={3}><b>¥{c.currentBalance}</b></Descriptions.Item>
                </Descriptions>
                <Table rowKey="promotionAccountId" size="small" dataSource={c.accounts} pagination={false} locale={{ emptyText: "暂无推广账户" }} columns={accountColumns} />
              </Space>
            ),
          })) : []}
        />
      </Card>

      <Modal title="代理商打款录入" open={payoutOpen} onCancel={() => setPayoutOpen(false)} footer={null} destroyOnClose width={520}>
        <Form form={payoutForm} layout="vertical" onFinish={submitPayout}>
          <Form.Item name="agentUserId" label="代理商" rules={[{ required: true, message: "请选择代理商" }]}>
            <Select placeholder="请选择代理商" options={agentWallets.map((w: AgentWallet) => ({ value: w.agentUserId, label: `${w.displayName}（${w.username}）` }))} />
          </Form.Item>
          <Form.Item name="amount" label="打款金额(元)" rules={[{ required: true, message: "请输入打款金额" }]}>
            <InputNumber style={{ width: "100%" }} min={0.01} precision={2} prefix="¥" placeholder="请输入打款金额" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
          <Space style={{ width: "100%", justifyContent: "flex-end" }}>
            <Button onClick={() => setPayoutOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={payoutSubmitting}>确认录入</Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
