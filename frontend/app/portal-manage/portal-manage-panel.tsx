'use client';

import { Card, Tabs } from 'antd';
import CustomerPortalPanel from '../customer-portal/customer-portal-panel';
import AgentPortalPanel from '../agent-portal/agent-portal-panel';

export default function PortalManagePanel({ token, customers, onError }: {
  token: string;
  customers: { id: string; name: string; customerCode: string }[];
  onError: (message: string) => void;
}) {
  return (
    <Card title="门户账号管理（统一分配 C 端客户账号与 B 端代理账号）" variant="borderless">
      <Tabs
        defaultActiveKey="c"
        items={[
          {
            key: 'c',
            label: 'C 端客户账号',
            children: <CustomerPortalPanel token={token} customers={customers} onError={onError} />,
          },
          {
            key: 'b',
            label: 'B 端代理账号',
            children: <AgentPortalPanel token={token} customers={customers} onError={onError} />,
          },
        ]}
      />
    </Card>
  );
}
