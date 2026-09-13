'use client';

import { useEffect, useState } from 'react';
import { App } from 'antd';
import PublicInvoiceTaskPanel from '../../../../invoices/public-invoice-task-panel';

export default function InvoiceCompletePage() {
  const { message } = App.useApp();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { const value = localStorage.getItem('accessToken'); if (!value) window.location.href = '/login'; else setToken(value); }, []);
  if (!token) return null;
  return <PublicInvoiceTaskPanel token={token} mode="complete" onError={(error) => message.error(error)} />;
}
