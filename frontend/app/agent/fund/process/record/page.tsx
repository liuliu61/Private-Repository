'use client';

import { useEffect, useState } from 'react';
import { App, Card } from 'antd';
import RechargePaymentPanel from '../../../../recharge-payment/recharge-payment-panel';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
type Customer = { id: string; name: string; customerCode: string };

export default function RechargePaymentRecordPage() {
  const { message } = App.useApp();
  const [token, setToken] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [initialReceiveId, setInitialReceiveId] = useState<string | undefined>();
  useEffect(() => {
    setInitialReceiveId(new URLSearchParams(window.location.search).get('receiveRecordId') || undefined);
    const value = localStorage.getItem('accessToken');
    if (!value) window.location.href = '/login';
    else {
      setToken(value);
      fetch(apiUrl + '/customers', { headers: { Authorization: 'Bearer ' + value } })
        .then((response) => response.json())
        .then(setCustomers)
        .catch(() => message.error('客户查询失败'));
    }
  }, [message]);
  if (!token) return <Card loading />;
  return <RechargePaymentPanel token={token} customers={customers} onError={(error) => message.error(error)} initialReceiveId={initialReceiveId} />;
}
