"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, DatePicker, Input, Select, Space, Table, Tabs, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { apiRequest } from "../utils/api";
import type { Dayjs } from "dayjs";

const { RangePicker } = DatePicker;

const opTypeOptions = [
  { value: "", label: "全部类型" },
  { value: "LOGIN", label: "登录" },
  { value: "LOGOUT", label: "退出" },
  { value: "CONFIRM_RECHARGE", label: "确认充值" },
  { value: "REJECT_RECHARGE", label: "驳回充值" },
  { value: "APPROVE_REFUND", label: "通过退款" },
  { value: "REJECT_REFUND", label: "驳回退款" },
  { value: "AGENT_PAYOUT", label: "代理商打款" },
  { value: "OTHER", label: "其他" },
];

export default function OperationLogPanel({ token, onError }: { token: string; onError?: (e: Error) => void }) {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState("ops");
  const [opLogs, setOpLogs] = useState<any[]>([]);
  const [opTotal, setOpTotal] = useState(0);
  const [opPage, setOpPage] = useState(1);
  const [opType, setOpType] = useState("");
  const [opRange, setOpRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [opKeyword, setOpKeyword] = useState("");
  const [recharges, setRecharges] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [agentTx, setAgentTx] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadOps = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params: any = { page: opPage, pageSize: 20 };
      if (opType) params.type = opType;
      if (opKeyword) params.keyword = opKeyword;
      if (opRange && opRange[0] && opRange[1]) {
        params.from = opRange[0].startOf("day").format("YYYY-MM-DD HH:mm:ss");
        params.to = opRange[1].endOf("day").format("YYYY-MM-DD HH:mm:ss");
      }
      const qs = new URLSearchParams(params).toString();
      const d = await apiRequest<{ total: number; items: any[] }>(`/portal/admin/operation-logs?${qs}`, token);
      setOpLogs(d.items || []);
      setOpTotal(d.total || 0);
    } catch (e) { message.error((e as Error).message); }
    finally { setLoading(false); }
  }, [token, opPage, opType, opKeyword, opRange, message]);

  const loadTab = useCallback(async (tab: string) => {
    if (!token) return;
    setLoading(true);
    try {
      if (tab === "recharges") {
        const d = await apiRequest<{ total: number; items: any[] }>("/portal/admin/recharge-requests?page=1&pageSize=50", token);
        setRecharges(d.items || []);
      } else if (tab === "refunds") {
        const d = await apiRequest<{ total: number; items: any[] }>("/portal/admin/refund-requests?page=1&pageSize=50", token);
        setRefunds(d.items || []);
      } else if (tab === "wallets") {
        const d = await apiRequest<{ items: any[] }>("/transactions/all?source=CUSTOMER_WALLET&page=1&pageSize=50", token);
        setTxs(d.items || []);
      } else if (tab === "accounts") {
        const d = await apiRequest<{ items: any[] }>("/transactions/all?source=PROMOTION_ACCOUNT&page=1&pageSize=50", token);
        setTxs(d.items || []);
      } else if (tab === "agent") {
        const d = await apiRequest<{ items: any[] }>("/portal/admin/agent-wallet-transactions?page=1&pageSize=50", token);
        setAgentTx(d.items || []);
      }
    } catch (e) { message.error((e as Error).message); }
    finally { setLoading(false); }
  }, [token, message]);

  useEffect(() => { loadOps(); }, [loadOps]);
  useEffect(() => { if (activeTab !== "ops") loadTab(activeTab); }, [activeTab, loadTab]);

  const opColumns = [
    { title: "操作人", dataIndex: "operatorName", render: (v: string) => v || "系统" },
    { title: "动作", dataIndex: "actionLabel", render: (v: string, r: any) => <Tag color={r.actionType === "LOGIN" ? "blue" : r.actionType === "AGENT_PAYOUT" ? "purple" : r.actionType.includes("REJECT") ? "red" : "green"}>{v}</Tag> },
    { title: "对象", dataIndex: "targetType", render: (v: string) => v || "—" },
    { title: "单号", dataIndex: "targetNo", render: (v: string) => v || "—" },
    { title: "详情", dataIndex: "detail", render: (v: string) => v || "—" },
    { title: "时间", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString("zh-CN") },
  ];
  const rechargeColumns = [
    { title: "申请单号", dataIndex: "requestNo" },
    { title: "客户", dataIndex: "customerName" },
    { title: "推广账户", dataIndex: "promotionAccountName", render: (v: string, r: any) => <span>{v}{r.platformAccountId ? `（${r.platformAccountId}）` : ""}</span> },
    { title: "申请金额", dataIndex: "amount", render: (v: string) => <b style={{ color: "#10b981" }}>¥{v}</b> },
    { title: "资金类型", dataIndex: "fundType", render: (v: string) => <Tag color={v === "PUBLIC" ? "blue" : "green"}>{v === "PUBLIC" ? "对公" : "对私"}</Tag> },
    { title: "状态", dataIndex: "statusLabel", render: (v: string, r: any) => <Tag color={r.status === "PENDING" ? "orange" : r.status === "CONFIRMED" ? "green" : "red"}>{v}</Tag> },
    { title: "处理人", dataIndex: "agentName", render: (v: string) => v || "—" },
    { title: "申请时间", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString("zh-CN") },
  ];
  const refundColumns = [
    { title: "退款单号", dataIndex: "requestNo" },
    { title: "客户", dataIndex: "customerName" },
    { title: "推广账户", dataIndex: "promotionAccountName", render: (v: string, r: any) => <span>{v}{r.platformAccountId ? `（${r.platformAccountId}）` : ""}</span> },
    { title: "退款金额(账户币)", dataIndex: "amount", render: (v: string) => <b style={{ color: "#ef4444" }}>¥{v}</b> },
    { title: "退回现金", dataIndex: "cashAmount", render: (v: string) => v ? `¥${v}` : "—" },
    { title: "资金类型", dataIndex: "fundType", render: (v: string) => <Tag color={v === "PUBLIC" ? "blue" : "green"}>{v === "PUBLIC" ? "对公" : "对私"}</Tag> },
    { title: "状态", dataIndex: "statusLabel", render: (v: string, r: any) => <Tag color={r.status === "PENDING" ? "orange" : r.status === "CONFIRMED" ? "green" : "red"}>{v}</Tag> },
    { title: "处理人", dataIndex: "agentName", render: (v: string) => v || "—" },
    { title: "申请时间", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString("zh-CN") },
  ];
  const txColumns = [
    { title: "来源名称", dataIndex: "sourceName", render: (v: string) => v || "—" },
    { title: "流水号", dataIndex: "transactionNo" },
    { title: "业务类型", dataIndex: "businessType", render: (v: string) => (v === "CUSTOMER_CREDIT" ? "账户充值" : v === "PROMOTION_ACCOUNT_CREDIT" ? "推广账户充值" : v === "PROMOTION_ACCOUNT_REFUND" ? "推广账户退款" : v === "WALLET_OPEN" ? "钱包开户" : v) || v },
    { title: "业务单号", dataIndex: "businessNo", render: (v: string) => v || "—" },
    { title: "变动金额", dataIndex: "changeAmount", render: (v: string) => <b style={{ color: v.startsWith("-") ? "#ef4444" : "#10b981" }}>{v}</b> },
    { title: "变动后余额", dataIndex: "balanceAfter" },
    { title: "发生时间", dataIndex: "occurredAt", render: (v: string) => new Date(v).toLocaleString("zh-CN") },
  ];
  const agentTxColumns = [
    { title: "代理商", dataIndex: "agentName" },
    { title: "流水号", dataIndex: "transactionNo" },
    { title: "业务类型", dataIndex: "businessTypeLabel", render: (v: string, r: any) => <Tag color={r.businessType === "AGENT_PAYOUT" ? "purple" : r.businessType === "REFUND_BACK" ? "blue" : "orange"}>{v}</Tag> },
    { title: "业务单号", dataIndex: "businessNo", render: (v: string) => v || "—" },
    { title: "变动金额", dataIndex: "changeAmount", render: (v: string) => <b style={{ color: v.startsWith("-") ? "#ef4444" : "#10b981" }}>{v}</b> },
    { title: "变动前余额", dataIndex: "balanceBefore" },
    { title: "变动后余额", dataIndex: "balanceAfter" },
    { title: "备注", dataIndex: "remark", render: (v: string) => v || "—" },
    { title: "时间", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString("zh-CN") },
  ];

  return (
    <Card
      title="日志管理"
      extra={<Space><Button icon={<ReloadOutlined />} onClick={() => { if (activeTab === "ops") loadOps(); else loadTab(activeTab); }}>刷新</Button></Space>}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: "ops", label: "操作日志",
          children: (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Space wrap>
                <Select style={{ width: 140 }} value={opType} onChange={setOpType} options={opTypeOptions} />
                <Input.Search style={{ width: 240 }} placeholder="搜索单号/详情关键词" allowClear onSearch={(v) => { setOpPage(1); setOpKeyword(v); }} />
                <RangePicker value={opRange} onChange={(v) => { setOpPage(1); setOpRange(v as any); }} />
              </Space>
              <Table rowKey="id" size="small" loading={loading} dataSource={opLogs} columns={opColumns} pagination={{ current: opPage, pageSize: 20, total: opTotal, showTotal: (t: number) => `共 ${t} 条日志`, onChange: setOpPage }} />
            </Space>
          ),
        },
        { key: "recharges", label: "充值记录", children: <Table rowKey="id" size="small" loading={loading} dataSource={recharges} columns={rechargeColumns} pagination={{ pageSize: 20 }} /> },
        { key: "refunds", label: "退款记录", children: <Table rowKey="id" size="small" loading={loading} dataSource={refunds} columns={refundColumns} pagination={{ pageSize: 20 }} /> },
        { key: "wallets", label: "客户钱包流水", children: <Table rowKey="id" size="small" loading={loading} dataSource={txs} columns={txColumns} pagination={{ pageSize: 20 }} /> },
        { key: "accounts", label: "推广账户流水", children: <Table rowKey="id" size="small" loading={loading} dataSource={txs} columns={txColumns} pagination={{ pageSize: 20 }} /> },
        { key: "agent", label: "代理商钱包流水", children: <Table rowKey="id" size="small" loading={loading} dataSource={agentTx} columns={agentTxColumns} pagination={{ pageSize: 20 }} /> },
      ]} />
    </Card>
  );
}
