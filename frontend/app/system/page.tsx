'use client';
import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';

export default function SystemManagementPage() {
  const [activeTab, setActiveTab] = useState('departments');
  const [departments, setDepartments] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [selectedRolePerms, setSelectedRolePerms] = useState<string[]>([]);

  const tabs = [
    { key: 'departments', label: '部门管理' },
    { key: 'roles', label: '角色管理' },
    { key: 'users', label: '用户管理' },
  ];

  useEffect(() => {
    if (activeTab === 'departments') loadDepartments();
    if (activeTab === 'roles') loadRoles();
    if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  const loadDepartments = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/departments?tree=true');
      setDepartments(res || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadRoles = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/roles');
      setRoles(res.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/users?pageSize=100');
      setUsers(res.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadPermissions = async () => {
    try {
      const res = await apiRequest('/api/roles/permissions');
      setPermissions(res || {});
    } catch (e) { console.error(e); }
  };

  const saveDepartment = async (data: any) => {
    try {
      if (editingDept) {
        await apiRequest(`/api/departments/${editingDept.id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await apiRequest('/api/departments', { method: 'POST', body: JSON.stringify(data) });
      }
      setShowDeptModal(false);
      loadDepartments();
    } catch (e: any) { alert(e.message || '保存失败'); }
  };

  const saveRole = async (data: any) => {
    try {
      if (editingRole) {
        await apiRequest(`/api/roles/${editingRole.id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await apiRequest('/api/roles', { method: 'POST', body: JSON.stringify(data) });
      }
      setShowRoleModal(false);
      loadRoles();
    } catch (e: any) { alert(e.message || '保存失败'); }
  };

  const saveUser = async (data: any) => {
    try {
      if (editingUser) {
        await apiRequest(`/api/users/${editingUser.id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(data) });
      }
      setShowUserModal(false);
      loadUsers();
    } catch (e: any) { alert(e.message || '保存失败'); }
  };

  const deleteDepartment = async (id: string) => {
    if (!confirm('确定删除该部门？')) return;
    try {
      await apiRequest(`/api/departments/${id}`, { method: 'DELETE' });
      loadDepartments();
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  const deleteRole = async (id: string) => {
    if (!confirm('确定删除该角色？')) return;
    try {
      await apiRequest(`/api/roles/${id}`, { method: 'DELETE' });
      loadRoles();
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('确定删除该用户？')) return;
    try {
      await apiRequest(`/api/users/${id}`, { method: 'DELETE' });
      loadUsers();
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  const openPermModal = async (role: any) => {
    setEditingRole(role);
    await loadPermissions();
    const roleDetail = await apiRequest(`/api/roles/${role.id}`);
    const perms = roleDetail?.permissions?.map((p: any) => p.permissionId) || [];
    setSelectedRolePerms(perms);
    setShowPermModal(true);
  };

  const savePermissions = async () => {
    try {
      await apiRequest(`/api/roles/${editingRole.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissionIds: selectedRolePerms }),
      });
      setShowPermModal(false);
      alert('权限保存成功');
    } catch (e: any) { alert(e.message || '保存失败'); }
  };

  const togglePerm = (code: string) => {
    setSelectedRolePerms((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const renderDeptTree = (items: any[], level = 0) => {
    return items.map((item) => (
      <div key={item.id}>
        <div className="flex items-center py-2 px-3 hover:bg-white/50 rounded" style={{ paddingLeft: `${level * 24 + 12}px` }}>
          <span className="flex-1 font-medium">{item.name}</span>
          <span className="text-sm text-gray-500 mr-4">{item.code}</span>
          <button className="text-blue-500 text-sm mr-2" onClick={() => { setEditingDept(item); setShowDeptModal(true); }}>编辑</button>
          <button className="text-red-500 text-sm" onClick={() => deleteDepartment(item.id)}>删除</button>
        </div>
        {item.children?.length > 0 && renderDeptTree(item.children, level + 1)}
      </div>
    ));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">系统管理</h1>
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === tab.key ? 'bg-blue-500 text-white' : 'bg-white/60 hover:bg-white/80'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 部门管理 */}
      {activeTab === 'departments' && (
        <div className="bg-white/60 backdrop-blur rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">部门列表</h2>
            <button className="bg-blue-500 text-white px-4 py-2 rounded-lg" onClick={() => { setEditingDept(null); setShowDeptModal(true); }}>
              + 新增部门
            </button>
          </div>
          {loading ? <div className="text-center py-8">加载中...</div> : (
            <div className="border rounded-lg overflow-hidden">
              {departments.length === 0 ? <div className="text-center py-8 text-gray-500">暂无部门</div> : renderDeptTree(departments)}
            </div>
          )}
        </div>
      )}

      {/* 角色管理 */}
      {activeTab === 'roles' && (
        <div className="bg-white/60 backdrop-blur rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">角色列表</h2>
            <div className="flex gap-2">
              <button className="bg-gray-500 text-white px-4 py-2 rounded-lg" onClick={() => apiRequest('/api/roles/permissions/init', { method: 'POST' }).then(() => alert('权限初始化完成'))}>
                初始化权限
              </button>
              <button className="bg-blue-500 text-white px-4 py-2 rounded-lg" onClick={() => { setEditingRole(null); setShowRoleModal(true); }}>
                + 新增角色
              </button>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4">角色编码</th>
                <th className="text-left py-3 px-4">角色名称</th>
                <th className="text-left py-3 px-4">数据权限</th>
                <th className="text-left py-3 px-4">用户数</th>
                <th className="text-left py-3 px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b hover:bg-white/50">
                  <td className="py-3 px-4">{role.code}</td>
                  <td className="py-3 px-4">{role.name}</td>
                  <td className="py-3 px-4">{role.dataScope === 'ALL' ? '全部' : role.dataScope === 'DEPARTMENT' ? '本部门' : '仅本人'}</td>
                  <td className="py-3 px-4">{role._count?.userRoles || 0}</td>
                  <td className="py-3 px-4">
                    <button className="text-blue-500 mr-2" onClick={() => openPermModal(role)}>配置权限</button>
                    <button className="text-blue-500 mr-2" onClick={() => { setEditingRole(role); setShowRoleModal(true); }}>编辑</button>
                    <button className="text-red-500" onClick={() => deleteRole(role.id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 用户管理 */}
      {activeTab === 'users' && (
        <div className="bg-white/60 backdrop-blur rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">用户列表</h2>
            <button className="bg-blue-500 text-white px-4 py-2 rounded-lg" onClick={() => { setEditingUser(null); setShowUserModal(true); }}>
              + 新增用户
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4">用户名</th>
                <th className="text-left py-3 px-4">姓名</th>
                <th className="text-left py-3 px-4">手机号</th>
                <th className="text-left py-3 px-4">部门</th>
                <th className="text-left py-3 px-4">角色</th>
                <th className="text-left py-3 px-4">状态</th>
                <th className="text-left py-3 px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-white/50">
                  <td className="py-3 px-4">{user.username}</td>
                  <td className="py-3 px-4">{user.displayName}</td>
                  <td className="py-3 px-4">{user.phone || '-'}</td>
                  <td className="py-3 px-4">{user.department?.name || '-'}</td>
                  <td className="py-3 px-4">{user.userRoles?.map((r: any) => r.role.name).join(', ') || '-'}</td>
                  <td className="py-3 px-4">{user.status === 'ACTIVE' ? '正常' : '禁用'}</td>
                  <td className="py-3 px-4">
                    <button className="text-blue-500 mr-2" onClick={() => { setEditingUser(user); setShowUserModal(true); }}>编辑</button>
                    <button className="text-red-500" onClick={() => deleteUser(user.id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 部门弹窗 */}
      {showDeptModal && (
        <Modal title={editingDept ? '编辑部门' : '新增部门'} onClose={() => setShowDeptModal(false)}>
          <DepartmentForm initial={editingDept} departments={departments} onSubmit={saveDepartment} />
        </Modal>
      )}

      {/* 角色弹窗 */}
      {showRoleModal && (
        <Modal title={editingRole ? '编辑角色' : '新增角色'} onClose={() => setShowRoleModal(false)}>
          <RoleForm initial={editingRole} onSubmit={saveRole} />
        </Modal>
      )}

      {/* 用户弹窗 */}
      {showUserModal && (
        <Modal title={editingUser ? '编辑用户' : '新增用户'} onClose={() => setShowUserModal(false)}>
          <UserForm initial={editingUser} departments={departments} roles={roles} onSubmit={saveUser} />
        </Modal>
      )}

      {/* 权限配置弹窗 */}
      {showPermModal && (
        <Modal title={`配置权限 - ${editingRole?.name}`} onClose={() => setShowPermModal(false)} wide>
          <div className="max-h-96 overflow-y-auto">
            {Object.entries(permissions).map(([menu, perms]: [string, any]) => (
              <div key={menu} className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="font-semibold mb-2">{menu}</div>
                <div className="flex flex-wrap gap-2">
                  {perms.map((p: any) => (
                    <label key={p.id} className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={selectedRolePerms.includes(p.id)} onChange={() => togglePerm(p.id)} />
                      <span className="text-sm">{p.name.split('-').pop()}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button className="bg-blue-500 text-white px-6 py-2 rounded-lg" onClick={savePermissions}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className={`bg-white rounded-2xl p-6 ${wide ? 'w-3/4 max-w-4xl' : 'w-full max-w-md'}`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function DepartmentForm({ initial, departments, onSubmit }: any) {
  const [form, setForm] = useState({ name: '', code: '', parentId: '', sort: 0, remark: '', ...initial });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">部门名称 *</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">部门编码 *</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">上级部门</label>
          <select className="w-full border rounded-lg px-3 py-2" value={form.parentId || ''} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
            <option value="">无（顶级部门）</option>
            {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">备注</label>
          <textarea className="w-full border rounded-lg px-3 py-2" value={form.remark || ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => window.location.reload()}>取消</button>
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-lg">保存</button>
      </div>
    </form>
  );
}

function RoleForm({ initial, onSubmit }: any) {
  const [form, setForm] = useState({ code: '', name: '', description: '', dataScope: 'ALL', ...initial });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">角色编码 *</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required disabled={!!initial} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">角色名称 *</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">数据权限</label>
          <select className="w-full border rounded-lg px-3 py-2" value={form.dataScope} onChange={(e) => setForm({ ...form, dataScope: e.target.value })}>
            <option value="ALL">全部数据</option>
            <option value="DEPARTMENT">本部门数据</option>
            <option value="SELF">仅本人数据</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">描述</label>
          <textarea className="w-full border rounded-lg px-3 py-2" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => window.location.reload()}>取消</button>
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-lg">保存</button>
      </div>
    </form>
  );
}

function UserForm({ initial, departments, roles, onSubmit }: any) {
  const [form, setForm] = useState({ username: '', password: '', displayName: '', phone: '', email: '', departmentId: '', roleIds: [] as string[], status: 'ACTIVE', ...initial });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">用户名 *</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required disabled={!!initial} />
        </div>
        {!initial && (
          <div>
            <label className="block text-sm font-medium mb-1">密码 *</label>
            <input type="password" className="w-full border rounded-lg px-3 py-2" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">姓名 *</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">手机号</label>
          <input className="w-full border rounded-lg px-3 py-2" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">部门</label>
          <select className="w-full border rounded-lg px-3 py-2" value={form.departmentId || ''} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">请选择部门</option>
            {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">角色</label>
          <div className="flex flex-wrap gap-2">
            {roles.map((r: any) => (
              <label key={r.id} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={form.roleIds?.includes(r.id)} onChange={(e) => {
                  const newRoles = e.target.checked ? [...(form.roleIds || []), r.id] : (form.roleIds || []).filter((id: string) => id !== r.id);
                  setForm({ ...form, roleIds: newRoles });
                }} />
                <span className="text-sm">{r.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => window.location.reload()}>取消</button>
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-lg">保存</button>
      </div>
    </form>
  );
}
