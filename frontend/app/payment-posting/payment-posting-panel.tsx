'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input, InputNumber,
  Select, DatePicker, message, Popconfirm, Descriptions, Row, Col, Divider, List, Typography
} from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { paymentPostingApi, PAYMENT_STATUS_MAP, OA_STATUS_MAP, EXPENSE_TYPE_MAP } from './api';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

interface PaymentPostingPanelProps {
  token: string;
  customers: any[];
  accounts: any[];
  receiveRecords: any[];
  onError: (error: string) => void;
}

export default function PaymentPostingPanel({ token, customers, accounts, receiveRecords, onError }: PaymentPostingPanelProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<any>(null);
  const [form] = Form.useForm();
  const [detailForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize, ...filters };
      const res = await paymentPostingApi.list(params, token);
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, filters, onError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (values: any) => {
    try {
      const details = values.details?.map((d: any) => ({
        expenseType: d.expenseType || 'AD_RECHARGE',
        applyAmount: d.applyAmount,
        serviceFeeAmount: d.serviceFeeAmount || 0,
        remark: d.remark,
      })) || [];
      await paymentPostingApi.create({
        customerId: values.customerId,
        details,
        paymentRecordIds: values.paymentRecordIds || [],
        payerAccountId: values.payerAccountId,
        payeeAccountId: values.payeeAccountId,
        paymentMethod: values.paymentMethod,
        remark: values.remark,
      }, token);
      message.success('创建成功');
      setCreateModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const handleAction = async (action: string, id: string, extra?: any) => {
    try {
      let result;
      switch (action) {
        case 'submit': result = await paymentPostingApi.submit(id, token); message.success('提交成功'); break;
        case 'approve': result = await paymentPostingApi.approve(id, extra || {}, token); message.success('审核通过'); break;
        case 'reject': result = await paymentPostingApi.reject(id, extra || {}, token); message.success('已驳回'); break;
        case 'revoke': result = await paymentPostingApi.revoke(id, token); message.success('已撤销'); break;
        case 'pay': result = await paymentPostingApi.pay(id, extra || {}, token); message.success('付款成功'); break;
        case 'complete': result = await paymentPostingApi.complete(id, extra || {}, token); message.success('已完成'); break;
        case 'retryOa': result = await paymentPostingApi.retryOa(id, token); message.success('OA重试成功'); break;
      }
      if (currentRecord?.id === id) {
        const detail = await paymentPostingApi.getById(id, token);
        setCurrentRecord(detail);
      }
      fetchData();
    } catch (e: any) {
      onError(e.message);
    }
  };

  const openDetail = async (record: any) => {
    try {
      const detail = await paymentPostingApi.getById(record.id, token);
      setCurrentRecord(detail);
      setDetailModalOpen(true);
    } catch (e: any) {
      onError(e.message);
    }
  };

  const statusInfo = (status: string) => PAYMENT_STATUS_MAP[status] || { label: status, color: 'default' };
  const oaStatusInfo = (status: string) => OA_STATUS_MAP[status] || { label: status, color: 'default' };

  const columns = [
    { title: '申请单号', dataIndex: 'applyNo', key: 'applyNo', width: 160 },
    { title: '客户', dataIndex: ['customer', 'name'], key: 'customer', width: 120 },
    { title: '申请金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: (v: string) => <b>¥{v}</b> },
    { title: '服务费', dataIndex: 'serviceFeeAmount', key: 'serviceFeeAmount', width: 100, render: (v: string) => `¥${v}` },
    { title: '实付金额', dataIndex: 'actualPayAmount', key: 'actualPayAmount', width: 100, render: (v: string) => v ? `¥${v}` : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <Tag color={statusInfo(s).color}>{statusInfo(s).label}</Tag> },
    { title: 'OA状态', dataIndex: 'oaStatus', key: 'oaStatus', width: 100, render: (s: string) => s ? <Tag color={oaStatusInfo(s).color}>{oaStatusInfo(s).label}</Tag> : '-' },
    { title: 'OA流程号', dataIndex: 'oaFlowNo', key: 'oaFlowNo', width: 140, render: (v: string) => v || '-' },
    { title: '创建人', dataIndex: ['creator', 'displayName'], key: 'creator', width: 100 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    {
      title: '操作', key: 'action', width: 180, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
          {record.status === 'DRAFT' && (
            <Button type="link" size="small" onClick={() => handleAction('submit', record.id)}>提交</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="充值付款（补款申请）"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModalOpen(true); }}>新建补款</Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="状态" allowClear style={{ width: 140 }}
            onChange={(v) => setFilters((f: any) => ({ ...f, status: v }))}
            options={Object.entries(PAYMENT_STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Select
            placeholder="客户" allowClear showSearch style={{ width: 180 }}
            optionFilterProp="label"
            onChange={(v) => setFilters((f: any) => ({ ...f, customerId: v }))}
            options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
          />
          <Input
            placeholder="申请单号" allowClear style={{ width: 160 }}
            onPressEnter={(e: any) => setFilters((f: any) => ({ ...f, applyNo: e.target.value }))}
          />
        </Space>

        <Table
          rowKey="id" dataSource={data} columns={columns} loading={loading}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (p: number, ps: number) => { setPage(p); setPageSize(ps); },
          }}
          scroll={{ x: 1500 }}
        />
      </Card>

      {/* 新建补款弹窗 */}
      <Modal
        title="新建补款申请" open={createModalOpen} onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()} width={800} okText="创建" cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerId" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
                <Select placeholder="请选择客户" showSearch optionFilterProp="label"
                  options={customers.map((c: any) => ({ value: c.id, label: c.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="paymentMethod" label="付款方式">
                <Select placeholder="请选择" allowClear options={[
                  { value: 'BANK_TRANSFER', label: '银行转账' },
                  { value: 'ALIPAY', label: '支付宝' },
                  { value: 'WECHAT', label: '微信' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="payerAccountId" label="付款账户">
                <Select placeholder="请选择付款账户" showSearch optionFilterProp="label"
                  options={accounts.map((a: any) => ({ value: a.id, label: `${a.name} (¥${a.currentBalance})` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="payeeAccountId" label="收款账户">
                <Select placeholder="请选择收款账户" showSearch optionFilterProp="label"
                  options={accounts.map((a: any) => ({ value: a.id, label: a.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="paymentRecordIds" label="关联收款记录" rules={[{ required: true, message: '请选择收款记录' }]}>
            <Select mode="multiple" placeholder="选择要补款的收款记录" showSearch optionFilterProp="label"
              options={receiveRecords.map((r: any) => ({ value: r.id, label: `${r.receiveNo} - ¥${r.amount} (已入账¥${r.postedAmount})` }))} />
          </Form.Item>
          <Divider orientation="left">补款明细</Divider>
          <Form.List name="details">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={8} style={{ marginBottom: 8 }} align="top">
                    <Col span={5}>
                      <Form.Item {...restField} name={[name, 'expenseType']} initialValue="AD_RECHARGE">
                        <Select options={Object.entries(EXPENSE_TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item {...restField} name={[name, 'applyAmount']} rules={[{ required: true, message: '必填' }]}>
                        <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="申请金额" />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item {...restField} name={[name, 'serviceFeeAmount']} initialValue={0}>
                        <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="服务费" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item {...restField} name={[name, 'remark']}>
                        <Input placeholder="备注" />
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      <Button danger onClick={() => remove(name)}>删除</Button>
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>添加明细</Button>
              </>
            )}
          </Form.List>
          <Form.Item name="remark" label="备注" style={{ marginTop: 16 }}>
            <TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title={`补款申请详情 - ${currentRecord?.applyNo || ''}`}
        open={detailModalOpen} onCancel={() => setDetailModalOpen(false)}
        footer={null} width={900}
      >
        {currentRecord && (
          <div>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="申请单号">{currentRecord.applyNo}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusInfo(currentRecord.status).color}>{statusInfo(currentRecord.status).label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="客户">{currentRecord.customer?.name}</Descriptions.Item>
              <Descriptions.Item label="申请类型">{currentRecord.applyType}</Descriptions.Item>
              <Descriptions.Item label="申请金额"><b>¥{currentRecord.totalAmount}</b></Descriptions.Item>
              <Descriptions.Item label="服务费">¥{currentRecord.serviceFeeAmount}</Descriptions.Item>
              <Descriptions.Item label="已付金额">¥{currentRecord.paidAmount || '0'}</Descriptions.Item>
              <Descriptions.Item label="实付金额">¥{currentRecord.actualPayAmount || '0'}</Descriptions.Item>
              <Descriptions.Item label="OA状态">
                {currentRecord.oaStatus ? <Tag color={oaStatusInfo(currentRecord.oaStatus).color}>{oaStatusInfo(currentRecord.oaStatus).label}</Tag> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="OA流程号">{currentRecord.oaFlowNo || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建人">{currentRecord.creator?.displayName}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{new Date(currentRecord.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
              {currentRecord.submittedAt && <Descriptions.Item label="提交时间">{new Date(currentRecord.submittedAt).toLocaleString('zh-CN')}</Descriptions.Item>}
              {currentRecord.approvedAt && <Descriptions.Item label="审核时间">{new Date(currentRecord.approvedAt).toLocaleString('zh-CN')}</Descriptions.Item>}
              {currentRecord.paidAt && <Descriptions.Item label="付款时间">{new Date(currentRecord.paidAt).toLocaleString('zh-CN')}</Descriptions.Item>}
              {currentRecord.completedAt && <Descriptions.Item label="完成时间">{new Date(currentRecord.completedAt).toLocaleString('zh-CN')}</Descriptions.Item>}
              {currentRecord.rejectReason && <Descriptions.Item label="驳回原因" span={2}>{currentRecord.rejectReason}</Descriptions.Item>}
              {currentRecord.remark && <Descriptions.Item label="备注" span={2}>{currentRecord.remark}</Descriptions.Item>}
            </Descriptions>

            <Divider orientation="left">补款明细</Divider>
            <Table rowKey="id" dataSource={currentRecord.details || []} pagination={false} size="small"
              columns={[
                { title: '费用类型', dataIndex: 'expenseType', render: (v: string) => EXPENSE_TYPE_MAP[v] || v },
                { title: '申请金额', dataIndex: 'applyAmount', render: (v: string) => `¥${v}` },
                { title: '服务费', dataIndex: 'serviceFeeAmount', render: (v: string) => `¥${v}` },
                { title: '备注', dataIndex: 'remark' },
              ]} />

            <Divider orientation="left">关联收款记录</Divider>
            <Table rowKey="id" dataSource={currentRecord.receiveRecords || []} pagination={false} size="small"
              columns={[
                { title: '收款单号', dataIndex: ['receiveRecord', 'receiveNo'] },
                { title: '收款金额', dataIndex: ['receiveRecord', 'amount'], render: (v: string) => `¥${v}` },
                { title: '关联金额', dataIndex: 'amount', render: (v: string) => `¥${v}` },
              ]} />

            <Divider orientation="left">操作</Divider>
            <Space wrap>
              {currentRecord.status === 'DRAFT' && (
                <>
                  <Button type="primary" onClick={() => handleAction('submit', currentRecord.id)}>提交审核</Button>
                  <Button onClick={() => handleAction('revoke', currentRecord.id)}>撤销</Button>
                </>
              )}
              {currentRecord.status === 'REVIEWING' && (
                <>
                  <Button type="primary" onClick={() => {
                    Modal.confirm({
                      title: '审核通过', content: '确认审核通过该补款申请？',
                      onOk: () => handleAction('approve', currentRecord.id),
                    });
                  }}>审核通过</Button>
                  <Button danger onClick={() => {
                    Modal.confirm({
                      title: '审核驳回',
                      content: <Input.TextArea rows={3} placeholder="请输入驳回原因" onChange={(e) => detailForm.setFieldValue('rejectReason', e.target.value)} />,
                      onOk: () => handleAction('reject', currentRecord.id, detailForm.getFieldsValue()),
                    });
                  }}>审核驳回</Button>
                  <Button onClick={() => handleAction('retryOa', currentRecord.id)}>重试OA</Button>
                  <Button onClick={() => handleAction('revoke', currentRecord.id)}>撤销</Button>
                </>
              )}
              {currentRecord.status === 'REJECTED' && (
                <Button onClick={() => handleAction('revoke', currentRecord.id)}>撤销（可重新编辑）</Button>
              )}
              {currentRecord.status === 'APPROVED' && (
                <Button type="primary" onClick={() => {
                  Modal.confirm({
                    title: '确认付款',
                    content: `确认支付 ¥${currentRecord.actualPayAmount || currentRecord.totalAmount}？付款后将从付款账户扣款。`,
                    onOk: () => handleAction('pay', currentRecord.id, { payerAccountId: currentRecord.payerAccountId }),
                  });
                }}>确认付款</Button>
              )}
              {currentRecord.status === 'PAID' && (
                <Button type="primary" onClick={() => handleAction('complete', currentRecord.id)}>确认完成</Button>
              )}
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
}
