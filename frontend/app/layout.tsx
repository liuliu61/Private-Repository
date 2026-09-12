import type { Metadata } from 'next';
import './globals.css';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';

export const metadata: Metadata = { title: '代理商财务记账与返点结算系统', description: '企业级财务管理平台' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><ConfigProvider locale={zhCN}><AntdApp>{children}</AntdApp></ConfigProvider></body></html>;
}
