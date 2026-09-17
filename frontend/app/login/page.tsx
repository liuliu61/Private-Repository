'use client';

import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, message } from 'antd';
import { useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  async function submit(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || '登录失败');
      localStorage.setItem('accessToken', data.accessToken); window.location.href = '/';
    } catch (error) { messageApi.error(error instanceof Error ? error.message : '登录失败，请稍后重试'); } finally { setLoading(false); }
  }
  return <main className="login-shell">{contextHolder}<Card className="login-card" variant="borderless"><div className="brand-mark">财</div><h1>代理商财务系统</h1><p className="subtitle">企业资金、返点与结算平台</p><Form layout="vertical" size="large" onFinish={submit} requiredMark={false}><Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}><Input prefix={<UserOutlined />} placeholder="请输入用户名" /></Form.Item><Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}><Input.Password prefix={<LockOutlined />} placeholder="请输入密码" /></Form.Item><Button type="primary" htmlType="submit" block loading={loading}>登录系统</Button></Form><div className="hint">初始化账号：admin / Admin@123456</div></Card></main>;
}
