'use client';

import { apiRequest } from './api';

/**
 * 导出 Excel 文件下载
 * @param path 接口路径（不含 /api 前缀）
 * @param token JWT token
 * @param filename 下载文件名
 */
export async function downloadExcel(path: string, token: string, filename: string) {
  const res = await apiRequest<Response>(path, token, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
