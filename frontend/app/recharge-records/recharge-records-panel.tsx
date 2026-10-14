"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, DatePicker, Input, Select, Space, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { apiRequest } from "../utils/api";
import { exportCsv } from "../utils/export";

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待处理", color: "orange" },
  CONFIRMED: { label: "已确认", color: "green" },
  REJECTED: { label: "已驳回", color: "red" },
};

const FUND_TYPE_LABEL: Record<string, string> = { PUBLIC: "对公", PRIVATE: "对私" };

export default function RechargeRecordsPanel({ token, customers, onError }: {
  token: string;
  customers: { id: string; name: string; customerCode: string }[];
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [loading, setLoading] = useState(false);
  // 筛选字段（参考统一筛选模板：充值单号/账户名称/客户姓名/账户分类/端口/状态/业务日期）
  const [requestNo, setRequestNo] = useState<string | undefined>();
  const [accountName, setAccountName] = useState<string | undefined>();
  const [customerName, setCustomerName] = useState<string | undefined>();
  const [fundType, setFundType] = useState<string | undefined>();
  const [portId, setPortId] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [searchVersion, setSearchVersion] = useState(0);

  const buildQuery = useCallback((p: number, ps: number) => {
    const q = new URLSearchParams({ page: String(p), pageSize: String(ps) });
    if (requestNo) q.set("requestNo", requestNo);
    if (accountName) q.set("accountName", accountName);
    if (customerName) q.set("customerName", customerName);
    if (fundType) q.set("fundType", fundType);
    if (portId) q.set("portId", portId);
    if (status) q.set("status", status);
    if (dateRange?.[0]) q.set("startDate", dateRange[0]);
    if (dateRange?.[1]) q.set("endDate", dateRange[1]);
    return q;
  }, [requestNo, accountName, customerName, fundType, portId, status, dateRange]);

  const load = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const d = await apiRequest(`/portal/admin/recharge-requests?${buildQuery(p, ps)}`, token);
      setData(d.items || []);
      setTotal(d.total || 0);
      setPage(d.page || p);
    } catch (e) {
      onError(e instanceof Error ? e.message : "充值记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, token, page, pageSize, onError]);

  useEffect(() => { load(1, pageSize); /* eslint-disable-next-line */ }, [searchVersion]);
  useEffect(() => {
    fetch(`/api/channels/all`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setChannels(d); })
      .catch(() => {});
  }, [token]);

  const resetFilters = () => {
    setRequestNo(undefined);
    setAccountName(undefined);
    setCustomerName(undefined);
    setFundType(undefined);
    setPortId(undefined);
    setStatus(undefined);
    setDateRange(undefined);
  };

  const handleExport = () => {
    exportCsv(`充值记录_${new Date().toISOString().slice(0, 10)}`, [
      { key: "requestNo", title: "充值单号" },
      { key: "customerName", title: "客户姓名" },
      { key: "promotionAccountName", title: "推广账户" },
      { key: "amount", title: "充值金额" },
      { key: "fundTypeLabel", title: "账户分类" },
      { key: "statusLabel", title: "状态" },
      { key: "createdAt", title: "提交时间" },
      { key: "agentName", title: "处理人" },
      { key: "confirmedAt", title: "确认时间" },
      { key: "remark", title: "备注" },
    ], data.map((r) => ({ ...r, fundTypeLabel: FUND_TYPE_LABEL[r.fundType] || r.fundType, statusLabel: STATUS_META[r.status]?.label || r.status })));
  };

  const columns = [
    { title: "充值单号", dataIndex: "requestNo", render: (v: string) => <Typography.Text copyable={{ text: v }} style={{ fontSize: 12 }}>{v}</Typography.Text> },
    { title: "客户", dataIndex: "customerName" },
    { title: "推广账户", dataIndex: "promotionAccountName" },
    { title: "到账金额(元)", dataIndex: "amount", render: (v: string) => <b>{Number(v).toFixed(2)}</b> },
    { title: "账户分类", dataIndex: "fundType", render: (v: string) => (v === "PUBLIC" ? <Tag color="blue">对公</Tag> : <Tag color="purple">对私</Tag>) },
    { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label || v}</Tag> },
    { title: "提交时间", dataIndex: "createdAt", render: (v: string) => v?.replace("T", " ").slice(0, 16) },
    { title: "处理人", dataIndex: "agentName", render: (v: string | null) => v || "—" },
    { title: "确认时间", dataIndex: "confirmedAt", render: (v: string | null) => (v ? v.replace("T", " ").slice(0, 16) : "—") },
    { title: "备注", dataIndex: "remark", render: (v: string | null) => v || "—" },
  ];

  return (
    <Card
      title={`充值记录（共 ${total} 条）`}
      variant="borderless"
      extra={<Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>}
    >
      {/* 统一筛选模板：两行条件 + 搜索/重置 */}
      <Space wrap style={{ marginBottom: 12 }} size={8}>
        <Input allowClear placeholder="充值单号" style={{ width: 200 }} value={requestNo}
          onChange={(e) => setRequestNo(e.target.value || undefined)} onPressEnter={() => { setSearchVersion((v) => v + 1); }} />
        <Input allowClear placeholder="账户名称" style={{ width: 170 }} value={accountName}
          onChange={(e) => setAccountName(e.target.value || undefined)} onPressEnter={() => { setSearchVersion((v) => v + 1); }} />
        <Input allowClear placeholder="客户姓名" style={{ width: 160 }} value={customerName}
          onChange={(e) => setCustomerName(e.target.value || undefined)} onPressEnter={() => { setSearchVersion((v) => v + 1); }} />
        <Select allowClear placeholder="账户分类" style={{ width: 130 }} value={fundType}
          onChange={(v) => setFundType(v)}
          options={[{ value: "PUBLIC", label: "对公" }, { value: "PRIVATE", label: "对私" }]} />
        <Select allowClear placeholder="端口" style={{ width: 150 }} value={portId}
          onChange={(v) => setPortId(v)}
          options={channels.map((c) => ({ value: c.id, label: c.name }))} />
      </Space>
      <Space wrap style={{ marginBottom: 16 }} size={8}>
        <Select allowClear placeholder="状态" style={{ width: 130 }} value={status}
          onChange={(v) => setStatus(v)}
          options={Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label }))} />
        <DatePicker.RangePicker
          style={{ width: 260 }}
          value={dateRange ? (dateRange.map((d) => (d ? dayjs(d) : null)) as any) : undefined}
          onChange={(_, ds) => setDateRange(ds && ds[0] && ds[1] ? [ds[0], ds[1]] : undefined)}
          placeholder={["开始时间", "结束时间"]}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => { setSearchVersion((v) => v + 1); }}>搜索</Button>
        <Button onClick={() => { resetFilters(); setSearchVersion((v) => v + 1); }}>重置</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
      </Space>
      <Table
        rowKey="id" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1300 }}
        pagination={{ current: page, pageSize, total, showTotal: (t: number) => `共 ${t} 条`, onChange: (p, ps) => load(p, ps) }}
      />
    </Card>
  );
}
