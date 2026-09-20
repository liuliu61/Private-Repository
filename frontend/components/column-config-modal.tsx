'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, Modal, Space, Typography } from 'antd';
import type { ColumnConfig } from './use-table-column-config';

interface ColumnConfigModalProps {
  open: boolean;
  columns: ColumnConfig[];
  loading: boolean;
  onCancel: () => void;
  onSave: (columns: ColumnConfig[]) => void;
  onReset: () => void;
}

export default function ColumnConfigModal({ open, columns, loading, onCancel, onSave, onReset }: ColumnConfigModalProps) {
  const [localColumns, setLocalColumns] = useState<ColumnConfig[]>(columns);

  useEffect(() => {
    if (open) setLocalColumns(columns);
  }, [open, columns]);

  const toggleColumn = (key: string) => {
    setLocalColumns(localColumns.map((col) => col.key === key ? { ...col, visible: !col.visible } : col));
  };

  const selectAll = () => {
    setLocalColumns(localColumns.map((col) => ({ ...col, visible: true })));
  };

  const clearAll = () => {
    setLocalColumns(localColumns.map((col) => ({ ...col, visible: false })));
  };

  const visibleCount = localColumns.filter((col) => col.visible).length;

  return (
    <Modal
      title="自定义表头"
      open={open}
      onCancel={onCancel}
      width={500}
      footer={[
        <Button key="reset" onClick={onReset} disabled={loading}>恢复默认</Button>,
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="save" type="primary" loading={loading} onClick={() => onSave(localColumns)} disabled={visibleCount === 0}>保存</Button>,
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space>
          <Typography.Text type="secondary">已选 {visibleCount}/{localColumns.length} 列</Typography.Text>
          <Button type="link" size="small" onClick={selectAll}>全选</Button>
          <Button type="link" size="small" onClick={clearAll}>清空</Button>
        </Space>
        <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {localColumns.map((col) => (
              <div key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                <Checkbox checked={col.visible} onChange={() => toggleColumn(col.key)}>{col.title}</Checkbox>
                {col.fixed && <Typography.Text type="secondary" style={{ fontSize: 12 }}>[{col.fixed === 'left' ? '固定左' : '固定右'}]</Typography.Text>}
              </div>
            ))}
          </Space>
        </div>
        {visibleCount === 0 && <Typography.Text type="danger">至少需要显示一列</Typography.Text>}
      </Space>
    </Modal>
  );
}
