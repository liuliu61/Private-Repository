'use client';

import { useCallback, useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ColumnConfig {
  key: string;
  title: string;
  visible: boolean;
  width?: number;
  fixed?: 'left' | 'right';
}

export function useTableColumnConfig(tableKey: string, token: string, defaultColumns: ColumnConfig[]) {
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${apiUrl}/table-config/${tableKey}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.columns && Array.isArray(data.columns)) {
          setColumns(data.columns);
        }
      } catch { /* 加载失败用默认 */ }
    }
    void load();
  }, [tableKey, token]);

  const saveConfig = useCallback(async (newColumns: ColumnConfig[]) => {
    setLoading(true);
    try {
      await fetch(`${apiUrl}/table-config/${tableKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ columns: newColumns }),
      });
      setColumns(newColumns);
    } finally {
      setLoading(false);
    }
  }, [tableKey, token]);

  const resetConfig = useCallback(async () => {
    setLoading(true);
    try {
      await fetch(`${apiUrl}/table-config/${tableKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setColumns(defaultColumns);
    } finally {
      setLoading(false);
    }
  }, [tableKey, token, defaultColumns]);

  const visibleColumns = useCallback(() => {
    return columns.filter((col) => col.visible);
  }, [columns]);

  return {
    columns,
    setColumns,
    visibleColumns,
    configModalOpen,
    setConfigModalOpen,
    saveConfig,
    resetConfig,
    loading,
  };
}
