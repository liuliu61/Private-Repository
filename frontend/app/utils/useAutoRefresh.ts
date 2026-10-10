'use client';
import { useEffect, useRef } from 'react';

/** 通用自动刷新 Hook：定时静默调用 fn，不阻断用户操作。
 * deps 变化时重启定时器；默认 30 秒一次。 */
export default function useAutoRefresh(fn: () => void, deps: unknown[] = [], interval = 30000) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const timer = setInterval(() => {
      try { fnRef.current(); } catch { /* 轮询错误静默忽略 */ }
    }, interval);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, ...deps]);
}
