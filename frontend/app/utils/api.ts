'use client';

/**
 * 统一 API 请求工具
 * 消除各页面重复的 request 函数
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface ApiRequestOptions extends RequestInit {
  /** 是否跳过自动 JSON 解析（用于下载等场景） */
  raw?: boolean;
}

/**
 * 统一 API 请求
 * @param path 接口路径（不含 /api 前缀）
 * @param token JWT token
 * @param options fetch 选项
 */
export async function apiRequest<T = any>(
  path: string,
  token: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { raw, ...fetchOptions } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers || {}),
    },
  });

  if (!res.ok) {
    let errorMessage = `请求失败 (${res.status})`;
    try {
      const err = await res.json();
      errorMessage = err.message || err.error || errorMessage;
      if (err.statusCode === 401) {
        errorMessage = '登录已过期，请重新登录';
      }
    } catch {
      // 非 JSON 响应
    }
    throw new Error(errorMessage);
  }

  if (raw) {
    return res as unknown as T;
  }

  // 处理 204 无内容响应
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

/**
 * 从 localStorage 获取 token
 */
export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

/**
 * 保存 token 到 localStorage
 */
export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('token', token);
}

/**
 * 清除 token（退出登录）
 */
export function clearToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
}

/**
 * 构建带查询参数的 URL
 */
export function buildUrl(path: string, params?: Record<string, any>): string {
  if (!params) return path;
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}
