'use client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');
export default function LocaleClient({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
