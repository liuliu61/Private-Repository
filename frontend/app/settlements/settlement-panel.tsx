'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { Button, Card, Descriptions, Form, Input, Modal, Space, Table, Tag } from 'antd';

type Settlement = { id: string; settlementNo: string; settlementType: string; customerId?: string | null; supplierId?: string | null; periodStart: string; periodEnd: string; orderCount: number; customerCashAmount: string; customerPaidAmount: string; customerRefundAmount: string; netCustomerCashAmount: string; customerCreditAmount: string; supplierCashAmount: string; supplierPaidAmount: string; supplierCreditAmount: string; supplierPayable: string; grossProfit: string | null; realizedProfit: string | null; status: string };
type SettlementItem = { id: string; orderId: string; orderNo: string; businessTime: string; cashAmount: string; creditAmount: string; refundAmount: string; grossProfit: string | null };

const statusName: Record<string, string> = { DRAFT: '草稿', GENERATED: '已生成', CONFIRMED: '已确认', SETTLED: '已结算', CANCELLED: '已取消' };

export default function SettlementPanel({ token, mode, customers, suppliers, onError }: { token: string; mode: 'customer' | 'supplier'; customers: Array<{ id: string; name: string }>; suppliers: Array<{ id: string; name: string }>; onError: (message: string) => void }) {
  const isCustomer = mode === 'customer';
  const basePath = isCustomer ? '/customer-settlements' : '/supplier-settlements';
  const [rows, setRows] = useState<Settlement[]>([]);
  const [selected, setSelected] = useState<(Settlement & { items?: SettlementItem[] }) | null>(null);
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  async function refresh() {
    setLoading(true);
    try { const result = await apiRequest<{ items: Settlement[] }>(`${basePath}?page=1&pageSize=100`, token); setRows(result.items); }
    catch (error) { onError(error instanceof Error ? error.message : '结算单查询失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [token, basePath]);

  async function generate(values: { entityId: string; periodStart: string; periodEnd: string }) {
    const body = { [isCustomer ? 'customerId' : 'supplierId']: values.entityId, periodStart: new Date(values.periodStart).toISOString(), periodEnd: new Date(values.periodEnd).toISOString() };
    try { await apiRequest(`${basePath}/generate`, token, { method: 'POST', body: JSON.stringify(body) }); setOpen(false); form.resetFields(); await refresh(); }
    catch (error) { onError(error instanceof Error ? error.message : '结算单生成失败'); }
  }
  async function detail(id: string) { try { setSelected(await apiRequest<Settlement & { items: SettlementItem[] }>(`${basePath}/${id}`, token)); setDetailOpen(true); } catch (error) { onError(error instanceof Error ? error.message : '结算单详情查询失败'); } }
  async function action(id: string, actionName: 'confirm' | 'cancel') { try { await apiRequest(`${basePath}/${id}/${actionName}`, token, { method: 'POST' }); await refresh(); if (detailOpen) await detail(id); } catch (error) { onError(error instanceof Error ? error.message : '结算单操作失败'); } }

  const entityOptions = isCustomer ? customers : suppliers;
  return <Card title={isCustomer ? '客户结算' : '一级代理结算'} extra={<Button type="primary" onClick={() => setOpen(true)}>生成结算单</Button>} loading={loading}>
    <Table rowKey="id" dataSource={rows} pagination={false} columns={[
      { title: '结算单号', dataIndex: 'settlementNo' },
      { title: '结算周期', render: (_: unknown, row: Settlement) => `${new Date(row.periodStart).toLocaleDateString('zh-CN')} ~ ${new Date(row.periodEnd).toLocaleDateString('zh-CN')}` },
      { title: '订单数', dataIndex: 'orderCount' },
      { title: isCustomer ? '净收款' : '应付金额', render: (_: unknown, row: Settlement) => isCustomer ? row.netCustomerCashAmount : row.supplierPayable },
      { title: isCustomer ? '已收款' : '已付款', render: (_: unknown, row: Settlement) => isCustomer ? row.customerPaidAmount : row.supplierPaidAmount },
      { title: isCustomer ? '退款' : '账户币', render: (_: unknown, row: Settlement) => isCustomer ? row.customerRefundAmount : row.supplierCreditAmount },
      { title: '状态', dataIndex: 'status', render: (value: string) => <Tag>{statusName[value] || value}</Tag> },
      { title: '操作', render: (_: unknown, row: Settlement) => <Space><Button type="link" onClick={() => void detail(row.id)}>详情</Button>{row.status === 'GENERATED' && <Button type="link" onClick={() => void action(row.id, 'confirm')}>确认</Button>}{(row.status === 'DRAFT' || row.status === 'GENERATED') && <Button type="link" danger onClick={() => void action(row.id, 'cancel')}>取消</Button>}</Space> },
    ]} />
    <Modal title={isCustomer ? '生成客户结算单' : '生成一级代理结算单'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="生成" cancelText="取消">
      <Form form={form} layout="vertical" onFinish={generate}>
        <Form.Item name="entityId" label={isCustomer ? '客户' : '一级代理'} rules={[{ required: true, message: `请选择${isCustomer ? '客户' : '一级代理'}` }]}><select className="ant-input" defaultValue=""><option value="">请选择</option>{entityOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Form.Item>
        <Form.Item name="periodStart" label="周期开始" rules={[{ required: true, message: '请选择周期开始时间' }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="periodEnd" label="周期结束（不含）" rules={[{ required: true, message: '请选择周期结束时间' }]}><Input type="datetime-local" /></Form.Item>
      </Form>
    </Modal>
    <Modal title="结算单详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={900}>{selected && <><Descriptions bordered column={2}><Descriptions.Item label="结算单号">{selected.settlementNo}</Descriptions.Item><Descriptions.Item label="状态">{statusName[selected.status] || selected.status}</Descriptions.Item><Descriptions.Item label="周期">{new Date(selected.periodStart).toLocaleString('zh-CN')} 至 {new Date(selected.periodEnd).toLocaleString('zh-CN')}</Descriptions.Item><Descriptions.Item label="订单数">{selected.orderCount}</Descriptions.Item>{isCustomer ? <><Descriptions.Item label="客户应收">{selected.customerCashAmount}</Descriptions.Item><Descriptions.Item label="客户已收">{selected.customerPaidAmount}</Descriptions.Item><Descriptions.Item label="退款">{selected.customerRefundAmount}</Descriptions.Item><Descriptions.Item label="净收款">{selected.netCustomerCashAmount}</Descriptions.Item><Descriptions.Item label="账户币已到账">{selected.customerCreditAmount}</Descriptions.Item></> : <><Descriptions.Item label="供应商应付">{selected.supplierPayable}</Descriptions.Item><Descriptions.Item label="供应商已付">{selected.supplierPaidAmount}</Descriptions.Item><Descriptions.Item label="账户币">{selected.supplierCreditAmount}</Descriptions.Item></>}<Descriptions.Item label="历史毛利">{selected.grossProfit ?? '待计算'}</Descriptions.Item><Descriptions.Item label="退款后实现利润">{selected.realizedProfit ?? '待计算'}</Descriptions.Item></Descriptions><Table style={{ marginTop: 16 }} rowKey="id" pagination={false} dataSource={selected.items || []} columns={[{ title: '订单号', dataIndex: 'orderNo' }, { title: '业务时间', dataIndex: 'businessTime', render: (value: string) => new Date(value).toLocaleString('zh-CN') }, { title: '现金金额', dataIndex: 'cashAmount' }, { title: '账户币金额', dataIndex: 'creditAmount' }, { title: '退款', dataIndex: 'refundAmount' }, { title: '毛利快照', dataIndex: 'grossProfit', render: (value: string | null) => value ?? '待计算' }]} /></>}</Modal>
  </Card>;
}
