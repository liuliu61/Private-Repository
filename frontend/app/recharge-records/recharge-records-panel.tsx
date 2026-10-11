"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Select, Space, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { apiRequest } from "../utils/api";

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待处理", color: "orange" },
  CONFIRMED: { label: "已确认", color: "green" },
  REJECTED: { label: "已驳回", color: "red" },
};

export default function RechargeRecordsPanel({ token, customers, onError }: {
  token: string;
  customers: { id: string; name: string; customerCode: string }[];
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [status, setStatus] = useState<string | undefined>();
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) q.set("status", status);
      if (customerId) q.set("customerId", customerId);
      const d = await apiRequest(`/portal/admin/recharge-requests?${q}`, token);
      setData(d.items || []);
      setTotal(d.total || 0);
    } catch (e) {
      onError(e instanceof Error ? e.message : "充值记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, status, customerId, onError]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { title: "申请单号", dataIndex: "requestNo", render: (v: string) => <Typography.Text copyable={{ text: v }} style={{ fontSize: 12 }}>{v}</Typography.Text> },
    { title: "客户", dataIndex: "customerName" },
    { title: "推广账户", dataIndex: "promotionAccountName" },
    { title: "到账金额(元)", dataIndex: "amount", render: (v: string) => <b>{Number(v).toFixed(2)}</b> },
    { title: "资金类型", dataIndex: "fundType", render: (v: string) => (v === "PUBLIC" ? <Tag color="blue">对公</Tag> : <Tag color="purple">对私</Tag>) },
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
      extra={
        <Space>
          <Select
            allowClear placeholder="按客户筛选" style={{ width: 180 }} value={customerId}
            onChange={(v) => { setCustomerId(v); setPage(1); }}
            options={(customers || []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            allowClear placeholder="按状态筛选" style={{ width: 140 }} value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
        </Space>
      }
    >
      <Table
        rowKey="id" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1300 }}
        pagination={{ current: page, pageSize, total, showTotal: (t: number) => `共 ${t} 条`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
      />
    </Card>
  );
}
