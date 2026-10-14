'use client';

import { apiRequest } from './api';

/**
 * 导出 Excel 文件下载（后端 xlsx）
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

/**
 * 前端 CSV 导出：按列导出当前列表数据（通用，任何页面可用）
 * @param filename 文件名（不含扩展名）
 * @param headers 列头数组
 * @param rows 数据行数组（每行为对象，key 对应 headers 的 key）
 */
export function exportCsv(filename: string, headers: { key: string; title: string }[], rows: any[]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/\n/g, ' ').replace(/\r/g, '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(headers.map((h) => esc(h.title)).join(','));
  rows.forEach((row) => {
    lines.push(headers.map((h) => esc(row[h.key])).join(','));
  });
  // \uFEFF BOM 让 Excel 正确识别 UTF-8
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
