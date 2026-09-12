'use client';

import { useEffect, useState } from 'react';
import { App, Card } from 'antd';
import RechargePaymentPanel from '../../../../recharge-payment/recharge-payment-panel';

export default function RechargePaymentRecordPage() {
  const { message } = App.useApp();
  const [token, setToken] = useState<string | null>(null);
  const [initialReceiveId, setInitialReceiveId] = useState<string | undefined>();
  useEffect(() => {
    setInitialReceiveId(new URLSearchParams(window.location.search).get('receiveRecordId') || undefined);
    const value = localStorage.getItem('accessToken');
    if (!value) window.location.href = '/login';
    else setToken(value);
  }, [message]);
  if (!token) return <Card loading />;
  return <RechargePaymentPanel token={token} onError={(error) => message.error(error)} initialReceiveId={initialReceiveId} />;
}
