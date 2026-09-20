'use client';

import { apiRequest } from '../utils/api';
import { Button, Card, DatePicker, Descriptions, Form, Input, Modal, Space, Statistic, Table, Tabs, Tag } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

type ServiceFeeRow = { id: string; transactionNo: string; paymentAccount: { id: string; name: string; accountCode: string } | null; receivingAccount: unknown; transactionTime: string | null; amount: string; serviceFee: string; customer: { id: string; name: string } | null; business: string | null; remark: string | null };

export default function ServiceFeePanel({ token, onError }: { token: string; onError: (error: string) => void }) {
  const [form] = Form.useForm();
  const [rows, setRows] = useState<ServiceFeeRow[]>([]);
  const [tab, setTab] = useState<'ALL' | 'NON_ZERO'>('ALL');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState('0.00');
  const [totalServiceFee, setTotalServiceFee] = useState('0.00');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ServiceFeeRow | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  async function load(nextPage = page, nextFilters = filters, nextTab = tab) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: '10', tab: nextTab });
      Object.entries(nextFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const result = await apiRequest<{ items: ServiceFeeRow[]; totalCount: number; totalAmount: string; totalServiceFee: string }>(`/service-fee-reconciliation?${params.toString()}`, token);
      setRows(result.items); setTotalCount(result.totalCount); setTotalAmount(result.totalAmount); setTotalServiceFee(result.totalServiceFee); setPage(nextPage);
    } catch (error) { onError(error instanceof Error ? error.message : '服务费对账查询失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(1, {}, 'ALL'); }, [token]);

  function submit(values: { transactionNo?: string; paymentAccountKeyword?: string; dates?: [Dayjs, Dayjs] }) {
    const next: Record<string, string> = { transactionNo: values.transactionNo?.trim() || '', paymentAccountKeyword: values.paymentAccountKeyword?.trim() || '' };
    if (values.dates?.[0]) next.dateFrom = values.dates[0].startOf('day').toISOString();
    if (values.dates?.[1]) next.dateTo = values.dates[1].add(1, 'day').startOf('day').toISOString();
    setFilters(next); void load(1, next, tab);
  }

  async function exportRows() {
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100', tab }); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const response = await fetch(`${API_BASE}/service-fee-reconciliation/export?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('服务费对账导出失败');
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = '服务费对账.xls'; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { onError(error instanceof Error ? error.message : '服务费对账导出失败'); }
  }

  return <Card title="服务费对账" extra={<Button onClick={() => void exportRows()}>导出 Excel</Button>}>
    <Form form={form} layout="inline" onFinish={submit} style={{ marginBottom: 16 }}>
      <Form.Item name="transactionNo" label="流水号"><Input allowClear placeholder="订单/流水号" /></Form.Item>
      <Form.Item name="dates" label="日期"><DatePicker.RangePicker allowEmpty={[true, true]} /></Form.Item>
      <Form.Item name="paymentAccountKeyword" label="付款账户"><Input allowClear placeholder="名称或账户编码" /></Form.Item>
      <Button type="primary" htmlType="submit">查询</Button><Button onClick={() => { form.resetFields(); setFilters({}); void load(1, {}, tab); }}>重置</Button>
    </Form>
    <Space size="large" style={{ marginBottom: 16 }}><Statistic title="总笔数" value={totalCount} suffix="笔" /><Statistic title="金额总计" value={totalAmount} suffix="元" /><Statistic title="服务费总额" value={totalServiceFee} suffix="元" /></Space>
    <Tabs activeKey={tab} onChange={(key) => { const next = key as 'ALL' | 'NON_ZERO'; setTab(next); void load(1, filters, next); }} items={[{ key: 'ALL', label: '全部' }, { key: 'NON_ZERO', label: '服务费 ≠ 0' }]} />
    <Table rowKey="id" loading={loading} dataSource={rows} pagination={{ current: page, pageSize: 10, total: totalCount, showSizeChanger: false, showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 总共 ${total} 条`, onChange: (nextPage) => void load(nextPage) }} columns={[{ title: '流水号', dataIndex: 'transactionNo' }, { title: '付款账户', render: (_: unknown, row: ServiceFeeRow) => row.paymentAccount?.name || '-' }, { title: '收款账户', render: () => '-' }, { title: '交易时间', dataIndex: 'transactionTime', render: (value: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-' }, { title: '金额(元)', dataIndex: 'amount' }, { title: '服务费(元)', dataIndex: 'serviceFee', render: (value: string) => <Tag color={value === '0.00' ? 'default' : 'blue'}>{value}</Tag> }, { title: '归属客户', render: (_: unknown, row: ServiceFeeRow) => row.customer?.name || '-' }, { title: '商务', dataIndex: 'business', render: (value: string | null) => value || '-' }, { title: '备注', dataIndex: 'remark', render: (value: string | null) => value || '-' }, { title: '操作', render: (_: unknown, row: ServiceFeeRow) => <Button type="link" onClick={() => { void apiRequest<ServiceFeeRow>(`/service-fee-reconciliation/${row.id}`, token).then(setDetail).catch((error) => onError(error instanceof Error ? error.message : '详情查询失败')); }}>查看详情</Button> }]} />
    <Modal title="服务费对账详情" open={!!detail} footer={null} onCancel={() => setDetail(null)}><Descriptions bordered column={1}>{detail && <><Descriptions.Item label="流水号">{detail.transactionNo}</Descriptions.Item><Descriptions.Item label="付款账户">{detail.paymentAccount?.name || '-'}</Descriptions.Item><Descriptions.Item label="收款账户">-</Descriptions.Item><Descriptions.Item label="客户">{detail.customer?.name || '-'}</Descriptions.Item><Descriptions.Item label="交易时间">{detail.transactionTime ? new Date(detail.transactionTime).toLocaleString('zh-CN') : '-'}</Descriptions.Item><Descriptions.Item label="金额">{detail.amount}</Descriptions.Item><Descriptions.Item label="服务费">{detail.serviceFee}</Descriptions.Item><Descriptions.Item label="备注">{detail.remark || '-'}</Descriptions.Item></>}</Descriptions></Modal>
  </Card>;
}
