'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input, Select,
  message, Descriptions, Row, Col, Divider, Avatar, Typography
} from 'antd';
import { ReloadOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function request(path: string, options: RequestInit = {}, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `请求失败 ${res.status}`);
  }
  return res.json();
}

interface SettingsPanelProps {
  token: string;
  onError: (error: string) => void;
}

export default function SettingsPanel({ token, onError }: SettingsPanelProps) {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'org' | 'users' | 'about'>('org');

  const fetchOrganizations = useCallback(async () => {
    try {
      const data = await request('/organizations?page=1&pageSize=50', {}, token);
      setOrganizations(Array.isArray(data) ? data : data.items || []);
    } catch (e: any) { onError(e.message); }
  }, [token, onError]);

  useEffect(() => { fetchOrganizations(); }, [fetchOrganizations]);

  const orgColumns = [
    { title: '组织名称', dataIndex: 'name', key: 'name', width: 200 },
    { title: '组织编码', dataIndex: 'orgCode', key: 'orgCode', width: 150 },
    { title: '组织类型', dataIndex: 'orgType', key: 'orgType', width: 150, render: (v: string) => {
      const map: Record<string, string> = { PLATFORM: '平台', AGENT: '一级代理', SECONDARY_AGENT: '二级代理', CUSTOMER: '客户' };
      return <Tag color="blue">{map[v] || v}</Tag>;
    }},
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '正常' : '停用'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
  ];

  return (
    <div>
      <Card
        title="系统设置"
        tabList={[
          { key: 'org', tab: '组织管理' },
          { key: 'about', tab: '关于系统' },
        ]}
        activeTabKey={activeTab}
        onTabChange={(key) => setActiveTab(key as 'org' | 'users' | 'about')}
        extra={<Button icon={<ReloadOutlined />} onClick={fetchOrganizations}>刷新</Button>}
      >
        {activeTab === 'org' && (
          <div>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              管理系统中的组织（代理商）信息。当前系统采用组织级数据隔离，每个组织的数据相互独立。
            </Typography.Paragraph>
            <Table rowKey="id" dataSource={organizations} columns={orgColumns} loading={loading}
              pagination={{ pageSize: 10, showTotal: (t: number) => `共 ${t} 个组织` }} scroll={{ x: 800 }} />
          </div>
        )}

        {activeTab === 'about' && (
          <div>
            <Row gutter={[24, 24]}>
              <Col span={12}>
                <Card title="系统信息">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="系统名称">代理商财务记账与返点结算系统</Descriptions.Item>
                    <Descriptions.Item label="系统版本">v1.0.0</Descriptions.Item>
                    <Descriptions.Item label="技术栈">NestJS 11 + Prisma 6 + PostgreSQL + Next.js 15 + Ant Design 5</Descriptions.Item>
                    <Descriptions.Item label="部署环境">宝塔 Linux + PM2 + Nginx</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col span={12}>
                <Card title="功能模块">
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <div><Tag color="green">已完成</Tag> 工作台 / 账户管理 / 资金流水</div>
                    <div><Tag color="green">已完成</Tag> 收款管理（银行流水/收款记录/对公对私入账）</div>
                    <div><Tag color="green">已完成</Tag> 充值付款（补款申请/OA审批/付款/完成）</div>
                    <div><Tag color="green">已完成</Tag> 发票管理（任务/审核/完成开票/客户开票信息）</div>
                    <div><Tag color="green">已完成</Tag> 客户钱包（授信/垫款/调整/期初余额）</div>
                    <div><Tag color="green">已完成</Tag> 外采管理（订单/钱包配置/供应商政策）</div>
                    <div><Tag color="green">已完成</Tag> 结算管理（客户结算/一级代理结算）</div>
                    <div><Tag color="green">已完成</Tag> 财务调整 / 服务费对账 / 返点管理</div>
                    <div><Tag color="blue">进行中</Tag> 系统设置 / 权限管理 / Excel导入导出</div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Card>
    </div>
  );
}
