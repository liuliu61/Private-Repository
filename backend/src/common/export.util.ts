import * as XLSX from 'xlsx';

export interface ExportColumn {
  key: string;
  label: string;
}

function getNestedValue(item: any, key: string): any {
  const parts = key.split('.');
  let cur = item;
  for (const p of parts) {
    if (cur == null) return '';
    cur = cur[p];
  }
  if (cur == null) return '';
  // Prisma Decimal / Date 等对象转字符串
  if (typeof cur === 'object') {
    if (cur instanceof Date) return cur.toISOString().slice(0, 10);
    if (typeof cur.toFixed === 'function') return cur.toString();
    return JSON.stringify(cur);
  }
  return cur;
}

/**
 * 将数据导出为 Excel Buffer
 */
export function exportToExcel(data: any[], columns: ExportColumn[], sheetName = '数据'): Buffer {
  const rows = data.map((item) => {
    const row: Record<string, any> = {};
    for (const col of columns) {
      row[col.label] = getNestedValue(item, col.key);
    }
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows, { header: columns.map((c) => c.label) });
  // 列宽自适应（粗略）
  ws['!cols'] = columns.map((c) => {
    let max = c.label.length;
    for (const row of rows) {
      const v = String(row[c.label] ?? '');
      if (v.length > max) max = v.length;
    }
    return { wch: Math.min(Math.max(max + 2, 10), 40) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 28) || '数据');
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return out as Buffer;
}
