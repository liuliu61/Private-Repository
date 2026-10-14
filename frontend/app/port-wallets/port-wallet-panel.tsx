"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert, App, Button, Card, Col, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tabs, Tag,
} from "antd";
import { BankOutlined, DownloadOutlined, PayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { apiRequest } from "../utils/api";
import { exportCsv } from "../utils/export";

type PortAccount = { promotionAccountId: string; accountName: string; platform: string; platformAccountId: string; channelName: string; customerName: string; currentBalance: string; totalCharge: string; totalRefund: string; label?: string };
type PortChannel = { channelId?: string | null; channelName: string; isPinned?: boolean; totalCharge: string; totalRefund: string; currentBalance: string; accounts: PortAccount[] };
type RechargeRow = { id: string; requestNo: string; customerName: string; promotionAccountName: string; portName: string | null; amount: string; fundType: string; status: string; createdAt: string; };
type AgentWallet = { agentUserId: string; username: string; displayName: string; balance: string; updatedAt: string };

export default function PortWalletPanel({ token, onError }: { token: string; onError?: (e: Error) => void }) {
  const { message } = App.useApp();
  const [channels, setChannels] = useState<PortChannel[]>([]);
  const [agentWallets, setAgentWallets] = useState<AgentWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutForm] = Form.useForm();
  const [portKeyword, setPortKeyword] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailChannel, setDetailChannel] = useState<PortChannel | null>(null);
  const [detailAccounts, setDetailAccounts] = useState<PortAccount[]>([]);
  const [detailRecharges, setDetailRecharges] = useState<RechargeRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pinning, setPinning] = useState(false);

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

  const openDetail = async (c: PortChannel) => {
    setDetailChannel(c);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailAccounts(c.accounts || []);
    try {
      const rows = await apiRequest<{ items: RechargeRow[] }>(`/portal/admin/recharge-requests?page=1&pageSize=50&portId=${c.channelId || ''}`, token);
      setDetailRecharges(rows.items || []);
    } catch { setDetailRecharges([]); }
    setDetailLoading(false);
  };

  const togglePin = async (c: PortChannel) => {
    if (!c.channelId) { message.warning("该端口暂无可用的端口ID，请先在端口管理创建端口"); return; }
    setPinning(true);
    try {
      await apiRequest(`/channels/${c.channelId}/pin`, token, { method: "POST", body: JSON.stringify({ pinned: !c.isPinned }) });
      message.success(c.isPinned ? "已取消置顶" : "已置顶");
      load(true);
    } catch (e) { message.error((e as Error).message); }
    finally { setPinning(false); }
  };

  const filtered = channels.filter((c) => {
    if (pinnedOnly && !c.isPinned) return false;
    if (portKeyword && !c.channelName.includes(portKeyword)) return false;
    return true;
  });

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

      <Card
        title="端口钱包"
        extra={
          <Space>
            <Input.Search placeholder="搜索端口名称" allowClear style={{ width: 200 }} onSearch={(v) => setPortKeyword(v)} onChange={(e) => { if (!e.target.value) setPortKeyword(""); }} />
            <Select placeholder="筛选" style={{ width: 130 }} allowClear value={pinnedOnly ? "PINNED" : undefined} onChange={(v) => setPinnedOnly(v === "PINNED")}
              options={[{ value: "PINNED", label: "仅看置顶" }]} />
            <Button icon={<ReloadOutlined />} onClick={() => load(true)}>刷新</Button>
            <Button icon={<DownloadOutlined />} onClick={() => exportCsv(`端口钱包_${new Date().toISOString().slice(0, 10)}`, [
              { key: 'channelName', title: '端口名称' },
              { key: 'walletBalance', title: '钱包余额(账户币)' },
              { key: 'totalRecharge', title: '累计充值' },
              { key: 'totalRefund', title: '累计退款' },
              { key: 'pinnedLabel', title: '置顶' },
            ], filtered.map((c: any) => ({ ...c, walletBalance: c.balance ?? c.walletBalance ?? '0.00', pinnedLabel: c.isPinned ? '已置顶' : '未置顶' })))}>导出</Button>
          </Space>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "#999" }}>暂无端口数据</div>}
          {filtered.map((c: PortChannel) => (
            <div key={c.channelName} style={{
              display: "flex", alignItems: "center", gap: 24, padding: "16px 20px",
              borderRadius: 12, border: c.isPinned ? "1.5px solid #1677ff" : "1px solid #e5e7eb",
              background: c.isPinned ? "rgba(22, 119, 255, 0.04)" : "#fff",
            }}>
              <div style={{ width: 160, flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 6 }}>
                  <BankOutlined /> {c.channelName}
                  {c.isPinned && <Tag color="blue">置顶</Tag>}
                </div>
              </div>
              <div style={{ flex: 1, display: "flex", gap: 40 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>钱包余额（账户币）</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#1677ff" }}>¥{c.currentBalance}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>累计充值</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#10b981" }}>¥{c.totalCharge}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>累计退款</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: Number(c.totalRefund) > 0 ? "#ef4444" : "#94a3b8" }}>{Number(c.totalRefund) > 0 ? `¥${c.totalRefund}` : "—"}</div>
                </div>
              </div>
              <Space>
                <Button size="small" type={c.isPinned ? "default" : "primary"} ghost={!c.isPinned} loading={pinning} onClick={() => togglePin(c)}>
                  {c.isPinned ? "取消置顶" : "置顶"}
                </Button>
                <Button size="small" type="link" onClick={() => openDetail(c)}>详情</Button>
              </Space>
            </div>
          ))}
        </div>
      </Card>

      <Modal title={detailChannel ? `端口详情 - ${detailChannel.channelName}` : "端口详情"} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={1000}>
        {detailChannel && (
          <Tabs items={[
            {
              key: "info", label: "端口信息",
              children: (
                <div>
                  <Descriptions size="small" bordered column={4}>
                    <Descriptions.Item label="端口名称">{detailChannel.channelName}</Descriptions.Item>
                    <Descriptions.Item label="钱包余额(账户币)"><b style={{ color: "#1677ff" }}>¥{detailChannel.currentBalance}</b></Descriptions.Item>
                    <Descriptions.Item label="累计充值(账户币)"><b style={{ color: "#10b981" }}>¥{detailChannel.totalCharge}</b></Descriptions.Item>
                    <Descriptions.Item label="累计退款(账户币)">{Number(detailChannel.totalRefund) > 0 ? <b style={{ color: "#ef4444" }}>¥{detailChannel.totalRefund}</b> : "—"}</Descriptions.Item>
                    <Descriptions.Item label="置顶状态">{detailChannel.isPinned ? <Tag color="blue">已置顶</Tag> : "未置顶"}</Descriptions.Item>
                    <Descriptions.Item label="绑定推广账户数">{detailAccounts.length} 个</Descriptions.Item>
                    <Descriptions.Item label="打款记录（当前页显示）" span={2}>{detailRecharges.length} 笔</Descriptions.Item>
                  </Descriptions>
                  <div style={{ marginTop: 16, fontWeight: 600, marginBottom: 8 }}>绑定推广账户</div>
                  <Table rowKey="promotionAccountId" size="small" dataSource={detailAccounts} pagination={false} locale={{ emptyText: "暂无推广账户" }} columns={accountColumns} />
                </div>
              ),
            },
            {
              key: "recharges", label: `打款记录（${detailRecharges.length}）`,
              children: detailLoading ? <div style={{ textAlign: "center", padding: 40, color: "#999" }}>加载中...</div> : detailRecharges.length > 0 ? (
                <Table rowKey="id" size="small" dataSource={detailRecharges} pagination={false} locale={{ emptyText: "暂无记录" }} columns={[
                  { title: "充值单号", dataIndex: "requestNo" },
                  { title: "客户", dataIndex: "customerName", render: (v: string) => v || "—" },
                  { title: "推广账户", dataIndex: "promotionAccountName", render: (v: string) => v || "—" },
                  { title: "金额", dataIndex: "amount", render: (v: string) => <b>¥{v}</b> },
                  { title: "类型", dataIndex: "fundType", render: (v: string) => <Tag color={v === "PUBLIC" ? "blue" : "orange"}>{v === "PUBLIC" ? "对公" : "对私"}</Tag> },
                  { title: "状态", dataIndex: "status", render: (v: string) => { const m: Record<string, any> = { PENDING: { c: "orange", l: "待处理" }, CONFIRMED: { c: "green", l: "已确认" }, REJECTED: { c: "red", l: "已驳回" } }; return <Tag color={m[v]?.c || "default"}>{m[v]?.l || v}</Tag>; } },
                  { title: "创建时间", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString("zh-CN") },
                ]} />
              ) : <div style={{ textAlign: "center", padding: 40, color: "#999" }}>暂无打款记录</div>,
            },
          ]} />
        )}
      </Modal>

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
