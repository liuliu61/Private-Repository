/**
 * 前端权限控制工具
 * 基于用户角色判断按钮级权限
 */

export interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  departmentId?: string | null;
  departmentName?: string | null;
}

/** 从 localStorage 读取用户信息 */
export function getUserInfo(): UserInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return null;
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

/** 判断用户是否拥有某个角色 */
export function hasRole(user: UserInfo | null, role: string): boolean {
  if (!user || !user.roles) return false;
  return user.roles.includes(role);
}

/** 判断用户是否拥有某个权限点 */
export function hasPermission(user: UserInfo | null, permission: string): boolean {
  if (!user || !user.permissions) return false;
  return user.permissions.includes(permission);
}

/** 是否为管理员（超级管理员或普通管理员） */
export function isAdmin(user: UserInfo | null): boolean {
  if (!user) return false;
  return user.roles.includes("SUPER_ADMIN") || user.roles.includes("ADMIN");
}

/** 是否为财务角色 */
export function isFinance(user: UserInfo | null): boolean {
  if (!user) return false;
  return user.roles.includes("FINANCE");
}

/** 是否为商务角色 */
export function isBusiness(user: UserInfo | null): boolean {
  if (!user) return false;
  return user.roles.includes("BUSINESS");
}

/**
 * 按钮级权限判断
 * 规则：
 * - 管理员(SUPER_ADMIN/ADMIN) + 财务(FINANCE): 所有操作
 * - 商务(BUSINESS): 新增、编辑；不能删除、审批、确认入账
 * - 其他无角色用户: 只读
 */
export interface PermissionActions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canConfirm: boolean;
}

export function getPermissionActions(user: UserInfo | null): PermissionActions {
  if (!user) {
    return { canCreate: false, canEdit: false, canDelete: false, canApprove: false, canConfirm: false };
  }
  const admin = isAdmin(user);
  const finance = isFinance(user);
  const business = isBusiness(user);

  // 管理员和财务：全部权限
  if (admin || finance) {
    return { canCreate: true, canEdit: true, canDelete: true, canApprove: true, canConfirm: true };
  }

  // 商务：可新增编辑，不能删除/审批/确认
  if (business) {
    return { canCreate: true, canEdit: true, canDelete: false, canApprove: false, canConfirm: false };
  }

  // 其他用户：只读
  return { canCreate: false, canEdit: false, canDelete: false, canApprove: false, canConfirm: false };
}
