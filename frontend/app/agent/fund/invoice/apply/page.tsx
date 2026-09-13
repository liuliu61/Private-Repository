'use client';

import { useEffect, useState } from 'react';
import { App } from 'antd';
import InvoiceApplicationPanel from '../../../../invoices/invoice-application-panel';

export default function InvoiceApplicationPage() {
  const { message } = App.useApp();
  const [token, setToken] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  useEffect(() => { const value = localStorage.getItem('accessToken'); if (!value) window.location.href = '/login'; else { setToken(value); fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/customers`, { headers: { Authorization: `Bearer ${value}` } }).then((response) => response.json()).then(setCustomers).catch((error) => message.error(error.message)); } }, [message]);
  if (!token) return null;
  return <InvoiceApplicationPanel token={token} customers={customers} onError={(error) => message.error(error)} />;
}
