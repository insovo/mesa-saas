// admin 用户管理 — 仅 pageKey "users" 通过 ADMIN 路由才能进
//
// GSAP 动画:
//   - 卡片列表 stagger 入场
//   - 创建/编辑成功后被改动卡片高亮闪一下
//   - 权限勾选面板用 Flip 在 chips 间过渡(暂用 transform-origin scale)
//
// 实现策略:
//   - 一屏内左侧用户列表 + 右侧详情/权限编辑面板
//   - 移动端只显示列表,点用户 push detail modal

import { useEffect, useRef, useState, useMemo } from "react";
import gsap from "gsap";
import { api } from "../lib/api.js";
import { I, Avatar, Button, Input, Modal, Empty, LoadingBlock, toast, RequiredMark } from "../components/Primitives.jsx";
import {
  PAGE_KEYS, MODULE_KEYS, PAGE_LABELS, MODULE_LABELS, MODULE_GROUPS,
} from "../lib/permissions.js";
import { POLICY_TEMPLATES, TEMPLATE_LIST } from "../lib/policyTemplates.js";
import { useAuth } from "../lib/authContext.jsx";

const ROLE_LABEL = { ADMIN: "管理员", RECRUITER: "招聘官", VIEWER: "只读" };
const ROLE_TONE = {
  ADMIN: "bg-brand-50 text-brand",
  RECRUITER: "bg-emerald-50 text-emerald-700",
  VIEWER: "bg-gray-100 text-gray-700",
};

export default function UsersPage() {
  const { me, refetch } = useAuth();
  const [users, setUsers] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [generatedCred, setGeneratedCred] = useState(null); // { email, password } 创建/重置后一次性展示
  const [departments, setDepartments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [batchIds, setBatchIds] = useState(() => new Set());
  const [batchDeactivateOpen, setBatchDeactivateOpen] = useState(false);
  const listRef = useRef(null);

  function toggleBatch(id) {
    setBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadUsers() {
    try {
      const { data } = await api.get("/users");
      setUsers(data.items);
      if (data.items.length && !selectedId) setSelectedId(data.items[0].id);
    } catch (e) {
      toast(e.response?.data?.message || "加载用户失败", "error");
      setUsers([]);
    }
  }

  useEffect(() => {
    loadUsers();
    api.get("/departments").then((r) => setDepartments(r.data.items || [])).catch(() => setDepartments([]));
    api.get("/jobs", { params: { take: 200 } }).then((r) => setJobs(r.data.items || [])).catch(() => setJobs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GSAP 列表 stagger 进场
  useEffect(() => {
    if (!users || !listRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".user-card", {
        y: 16,
        opacity: 0,
        duration: 0.45,
        stagger: 0.045,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    }, listRef);
    return () => ctx.revert();
  }, [users]);

  const selectedUser = useMemo(
    () => users?.find((u) => u.id === selectedId) || null,
    [users, selectedId],
  );

  async function reloadOne(id) {
    try {
      const { data } = await api.get(`/users/${id}`);
      setUsers((prev) => (prev ? prev.map((u) => (u.id === id ? data.user : u)) : prev));
      // 如果改的是自己,顺带 refetch /me
      if (me?.id === id) refetch();
    } catch (e) {
      toast(e.response?.data?.message || "刷新失败", "error");
    }
  }

  return (
    <div className="px-3 md:px-6 py-6 max-w-[1440px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">用户与权限管理</h1>
          <p className="text-xs text-gray-600 mt-1">
            ADMIN 可创建、停用、重置密码;为普通用户配置数据范围(部门 / JD)和模块权限。
          </p>
        </div>
        <div className="flex gap-2">
          {batchIds.size > 0 && (
            <>
              <Button variant="ghost" onClick={() => batchForceLogout(Array.from(batchIds), () => { setBatchIds(new Set()); loadUsers(); })} icon={<I name="log-out" size={14} />}>
                批量强制下线 ({batchIds.size})
              </Button>
              <Button variant="ghost" onClick={() => setBatchDeactivateOpen(true)} icon={<I name="shield-off" size={14} />}>
                批量停用 ({batchIds.size})
              </Button>
            </>
          )}
          <Button onClick={() => setCreateOpen(true)} icon={<I name="user-plus" size={14} />}>新建用户</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        {/* 左侧:用户列表 */}
        <div ref={listRef} className="space-y-2">
          {users === null && <LoadingBlock label="加载用户中..." />}
          {users?.length === 0 && <Empty icon="users" title="还没有用户" desc="点右上角新建用户" />}
          {users?.map((u) => {
            const active = u.id === selectedId;
            const checked = batchIds.has(u.id);
            const canBatch = u.role !== "ADMIN" && u.id !== me?.id && u.isActive;
            return (
              <div
                key={u.id}
                className={`user-card w-full p-3 rounded-card flex items-center gap-3 transition shadow-card bg-white
                  ${active ? "ring-2 ring-brand" : "hover:ring-2 hover:ring-brand/20"}
                  ${u.isActive === false ? "opacity-70" : ""}`}
              >
                {canBatch && (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBatch(u.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 shrink-0 accent-brand"
                    title="选择以批量停用"
                  />
                )}
                <button
                  onClick={() => setSelectedId(u.id)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <Avatar name={u.name || u.email} src={u.avatar} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-navy-700 truncate">{u.name || u.email.split("@")[0]}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${ROLE_TONE[u.role] || "bg-gray-100"}`}>
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                      {u.isActive === false && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-bold"
                          title={u.deactivatedReason || "无原因记录"}
                        >
                          已停用
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 truncate mt-0.5">{u.email}</p>
                    {u.isActive === false && u.deactivatedReason && (
                      <p className="text-[11px] text-red-500 mt-0.5 truncate">原因:{u.deactivatedReason}</p>
                    )}
                    {u.isActive && u.jobTitle && <p className="text-[11px] text-gray-600 mt-0.5">{u.jobTitle}</p>}
                  </div>
                  <I name="chevron-right" size={14} className="text-gray-400 shrink-0" />
                </button>
              </div>
            );
          })}
        </div>

        {/* 右侧:详情面板 */}
        <div>
          {selectedUser ? (
            <UserDetailPanel
              user={selectedUser}
              meId={me?.id}
              departments={departments}
              jobs={jobs}
              onReload={() => reloadOne(selectedUser.id)}
              onDeleted={() => {
                setUsers((prev) => prev?.filter((u) => u.id !== selectedUser.id) || null);
                setSelectedId(users?.find((u) => u.id !== selectedUser.id)?.id || null);
              }}
              onResetPassword={() => setResetTarget(selectedUser)}
            />
          ) : users?.length ? (
            <Empty icon="user" title="选择左侧用户" />
          ) : null}
        </div>
      </div>

      {createOpen && (
        <UserCreateModal
          onClose={() => setCreateOpen(false)}
          departments={departments}
          jobs={jobs}
          onCreated={(user, generatedPassword) => {
            setCreateOpen(false);
            loadUsers();
            setSelectedId(user.id);
            if (generatedPassword) {
              setGeneratedCred({ email: user.email, password: generatedPassword, kind: "create" });
            }
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={(password) => {
            setResetTarget(null);
            if (password) {
              setGeneratedCred({ email: resetTarget.email, password, kind: "reset" });
            }
          }}
        />
      )}

      {generatedCred && (
        <CredentialModal
          credential={generatedCred}
          onClose={() => setGeneratedCred(null)}
        />
      )}

      {batchDeactivateOpen && (
        <BatchDeactivateModal
          ids={Array.from(batchIds)}
          onClose={() => setBatchDeactivateOpen(false)}
          onDone={() => {
            setBatchDeactivateOpen(false);
            setBatchIds(new Set());
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// 用户详情面板:基础信息 + 权限策略 + 数据范围
// ============================================================
function UserDetailPanel({ user, meId, departments, jobs, onReload, onDeleted, onResetPassword }) {
  const isSelf = user.id === meId;
  const isAdminRole = user.role === "ADMIN";
  return (
    <div className="space-y-5">
      <UserBasicCard user={user} isSelf={isSelf} onReload={onReload} onDeleted={onDeleted} onResetPassword={onResetPassword} />
      {!isAdminRole && (
        <UserPolicyCard user={user} departments={departments} jobs={jobs} onReload={onReload} />
      )}
      {isAdminRole && (
        <div className="bg-brand-50 border-2 border-brand/20 rounded-card p-5 text-sm text-navy-700">
          <div className="flex items-start gap-3">
            <I name="shield-check" size={18} className="text-brand mt-0.5" />
            <div>
              <p className="font-bold text-base">该账号是 ADMIN — 默认拥有全部页面与模块权限</p>
              <p className="text-xs text-gray-700 mt-1">
                若要限制权限,先把角色降级为「招聘官 / 只读」,再在下方配置具体范围。系统会保护最后一个活跃 ADMIN 不被删除/停用/降级。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserBasicCard({ user, isSelf, onReload, onDeleted, onResetPassword }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    name: user.name || "",
    email: user.email,
    role: user.role,
    jobTitle: user.jobTitle || "",
    avatar: user.avatar || "",
    isActive: user.isActive !== false,
    deactivatedReason: user.deactivatedReason || "",
  }));
  useEffect(() => {
    setForm({
      name: user.name || "",
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle || "",
      avatar: user.avatar || "",
      isActive: user.isActive !== false,
      deactivatedReason: user.deactivatedReason || "",
    });
    setEditing(false);
  }, [user.id]);

  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body = {
        name: form.name || undefined,
        email: form.email,
        role: form.role,
        jobTitle: form.jobTitle || null,
        avatar: form.avatar || null,
        isActive: form.isActive,
        deactivatedReason: form.isActive ? null : (form.deactivatedReason || null),
      };
      await api.patch(`/users/${user.id}`, body);
      toast("用户信息已更新", "success");
      setEditing(false);
      onReload();
    } catch (e) {
      toast(e.response?.data?.message || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`确定删除用户「${user.email}」?候选人 ownerId 会变 NULL,分享链接会保留但 createdBy 变空。此操作不可恢复。`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      toast("用户已删除", "success");
      onDeleted();
    } catch (e) {
      toast(e.response?.data?.message || "删除失败", "error");
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="user-circle" size={18} className="text-brand" /> 基础信息
        </h3>
        {!editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onResetPassword} icon={<I name="key-round" size={12} />}>重置密码</Button>
            {!isSelf && (
              <Button size="sm" variant="ghost" onClick={() => forceLogoutOne(user.id, onReload)} icon={<I name="log-out" size={12} />}>强制下线</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} icon={<I name="pencil" size={12} />}>编辑</Button>
            {!isSelf && <Button size="sm" variant="ghost" onClick={remove} icon={<I name="trash-2" size={12} />}>删除</Button>}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>取消</Button>
            <Button size="sm" onClick={save} disabled={saving} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>保存</Button>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
          <KV label="昵称" value={user.name || "—"} />
          <KV label="邮箱" value={user.email} />
          <KV label="角色" value={ROLE_LABEL[user.role] || user.role} />
          <KV label="内部职位" value={user.jobTitle || "—"} />
          <KV label="状态" value={user.isActive === false ? "已停用" : "正常"} valueClass={user.isActive === false ? "text-red-600" : "text-emerald-600"} />
          <KV label="创建时间" value={new Date(user.createdAt).toLocaleString("zh-CN")} />
          {user.isActive === false && (
            <>
              <KV label="停用原因" value={user.deactivatedReason || "—"} valueClass="text-red-600" />
              <KV label="停用时间" value={user.deactivatedAt ? new Date(user.deactivatedAt).toLocaleString("zh-CN") : "—"} />
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <Field label="昵称">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如:张小明" />
          </Field>
          <Field label="邮箱">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="角色">
              <select
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand bg-white"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="ADMIN">管理员</option>
                <option value="RECRUITER">招聘官</option>
                <option value="VIEWER">只读</option>
              </select>
            </Field>
            <Field label="内部职位">
              <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="如:HR · 负责人" />
            </Field>
          </div>
          <Field label="头像 URL(可选)">
            <Input value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} placeholder="https://..." />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>启用账号(取消勾选 = 停用,无法登录)</span>
          </label>
          {!form.isActive && (
            <Field label="停用原因(可选,登录被拒时展示)">
              <Input
                value={form.deactivatedReason}
                onChange={(e) => setForm({ ...form, deactivatedReason: e.target.value })}
                placeholder="例:已离职 / 安全审计 / 转岗"
                maxLength={200}
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function UserPolicyCard({ user, departments, jobs, onReload }) {
  const initialPage = new Set(user.access?.pageKeys || []);
  const initialModule = new Set(user.access?.moduleKeys || []);
  const initialDepts = new Map((user.departmentScopes || []).map((s) => [s.departmentId, s.includeChildren !== false]));
  const initialJobs = new Set((user.jobScopes || []).map((s) => s.jobId));

  const [pageKeys, setPageKeys] = useState(initialPage);
  const [moduleKeys, setModuleKeys] = useState(initialModule);
  const [deptScopes, setDeptScopes] = useState(initialDepts);
  const [jobScopes, setJobScopes] = useState(initialJobs);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const chipsRef = useRef(null);

  useEffect(() => {
    setPageKeys(new Set(user.access?.pageKeys || []));
    setModuleKeys(new Set(user.access?.moduleKeys || []));
    setDeptScopes(new Map((user.departmentScopes || []).map((s) => [s.departmentId, s.includeChildren !== false])));
    setJobScopes(new Set((user.jobScopes || []).map((s) => s.jobId)));
    setDirty(false);
  }, [user.id]);

  function togglePage(key) {
    setPageKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  }
  function toggleModule(key) {
    setModuleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  }
  function toggleDept(id) {
    setDeptScopes((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, true);
      return next;
    });
    setDirty(true);
  }
  function setIncludeChildren(id, val) {
    setDeptScopes((prev) => {
      const next = new Map(prev);
      next.set(id, val);
      return next;
    });
    setDirty(true);
  }
  function toggleJob(id) {
    setJobScopes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  }

  // chips 加入/移除时,GSAP 用 scale + opacity 入场,模拟 Flip 效果
  useEffect(() => {
    if (!chipsRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".scope-chip-new", {
        scale: 0.6,
        opacity: 0,
        duration: 0.3,
        ease: "back.out(2)",
        transformOrigin: "center",
        clearProps: "transform,opacity",
      });
    }, chipsRef);
    return () => ctx.revert();
  }, [deptScopes, jobScopes]);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/policy`, {
        pageKeys: Array.from(pageKeys),
        moduleKeys: Array.from(moduleKeys),
        departmentScopes: Array.from(deptScopes.entries()).map(([departmentId, includeChildren]) => ({ departmentId, includeChildren })),
        jobScopes: Array.from(jobScopes).map((jobId) => ({ jobId })),
      });
      toast("权限策略已保存", "success");
      setDirty(false);
      onReload();
    } catch (e) {
      toast(e.response?.data?.message || "保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  const selectedDeptList = Array.from(deptScopes.keys())
    .map((id) => departments.find((d) => d.id === id))
    .filter(Boolean);
  const selectedJobList = Array.from(jobScopes)
    .map((id) => jobs.find((j) => j.id === id))
    .filter(Boolean);

  return (
    <div className="bg-white rounded-card shadow-card p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="settings-2" size={18} className="text-brand" /> 权限策略
        </h3>
        <div className="flex items-center gap-2">
          <TemplateApplyDropdown
            onApply={(t) => {
              setPageKeys(new Set(t.pageKeys));
              setModuleKeys(new Set(t.moduleKeys));
              setDirty(true);
              toast(`已套用「${t.name}」模板,保存后生效`, "info");
            }}
          />
          {dirty && (
            <>
              <span className="text-xs text-amber-600 font-bold">有未保存的修改</span>
              <Button size="sm" onClick={save} disabled={saving} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
                {saving ? "保存中" : "保存"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 页面权限 */}
      <section>
        <h4 className="text-sm font-bold text-gray-700 mb-2">📄 页面权限</h4>
        <p className="text-xs text-gray-600 mb-3">勾选的页面会出现在该用户的侧边栏;直接访问 URL 也以此为准。</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {PAGE_KEYS.map((k) => (
            <CheckCard
              key={k}
              checked={pageKeys.has(k)}
              label={PAGE_LABELS[k] || k}
              hint={k}
              onClick={() => togglePage(k)}
            />
          ))}
        </div>
      </section>

      {/* 模块权限 */}
      <section>
        <h4 className="text-sm font-bold text-gray-700 mb-2">🧩 模块权限</h4>
        <p className="text-xs text-gray-600 mb-3">控制候选人详情各模块、附件、分享、编辑/删除等。</p>
        <div className="space-y-3">
          {MODULE_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="text-[11px] uppercase tracking-wide font-bold text-gray-600 mb-1.5">{g.label}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {g.keys.map((k) => (
                  <CheckCard
                    key={k}
                    checked={moduleKeys.has(k)}
                    label={MODULE_LABELS[k] || k}
                    hint={k}
                    onClick={() => toggleModule(k)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 数据范围 — 部门 + JD */}
      <section ref={chipsRef}>
        <h4 className="text-sm font-bold text-gray-700 mb-2">🎯 数据范围</h4>
        <p className="text-xs text-gray-600 mb-3">
          普通用户的可见数据 = 自己创建的 + 授权部门(含子部门)的 + 授权 JD 的。
        </p>

        {/* 部门 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-700">授权部门 ({selectedDeptList.length})</p>
            <DropdownSelect
              placeholder="+ 添加部门"
              items={departments.filter((d) => !deptScopes.has(d.id))}
              renderLabel={(d) => d.name + (d.code ? ` · ${d.code}` : "")}
              onSelect={(d) => toggleDept(d.id)}
            />
          </div>
          {selectedDeptList.length === 0 ? (
            <p className="text-xs text-gray-500 italic">尚未授权任何部门</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedDeptList.map((d) => {
                const includeChildren = deptScopes.get(d.id);
                return (
                  <div key={d.id} className="scope-chip-new inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand text-xs font-medium">
                    <I name="building-2" size={12} />
                    <span>{d.name}</span>
                    <label className="flex items-center gap-1 text-[10px] text-gray-700">
                      <input
                        type="checkbox"
                        checked={includeChildren}
                        onChange={(e) => setIncludeChildren(d.id, e.target.checked)}
                      />
                      含子部门
                    </label>
                    <button onClick={() => toggleDept(d.id)} className="hover:text-red-500">
                      <I name="x" size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* JD */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-700">授权 JD ({selectedJobList.length})</p>
            <DropdownSelect
              placeholder="+ 添加 JD"
              items={jobs.filter((j) => !jobScopes.has(j.id))}
              renderLabel={(j) => j.title + (j.dept ? ` · ${j.dept}` : "")}
              onSelect={(j) => toggleJob(j.id)}
            />
          </div>
          {selectedJobList.length === 0 ? (
            <p className="text-xs text-gray-500 italic">尚未授权任何 JD</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedJobList.map((j) => (
                <div key={j.id} className="scope-chip-new inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                  <I name="briefcase" size={12} />
                  <span>{j.title}</span>
                  {j.dept && <span className="text-[10px] text-gray-600">{j.dept}</span>}
                  <button onClick={() => toggleJob(j.id)} className="hover:text-red-500">
                    <I name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CheckCard({ checked, label, hint, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-2 p-2 rounded-lg border-2 transition text-left
        ${checked ? "border-brand bg-brand-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
    >
      <span className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0
        ${checked ? "border-brand bg-brand" : "border-gray-300"}`}>
        {checked && <I name="check" size={10} className="text-white" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${checked ? "font-bold text-navy-700" : "text-gray-700"}`}>{label}</p>
        <p className="text-[10px] text-gray-500 truncate">{hint}</p>
      </div>
    </button>
  );
}

function DropdownSelect({ items, placeholder, renderLabel, onSelect }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = items.filter((it) => {
    if (!filter) return true;
    const label = renderLabel(it).toLowerCase();
    return label.includes(filter.toLowerCase());
  });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2 py-1 rounded-lg bg-lightPrimary text-brand font-bold hover:bg-brand/10"
      >
        {placeholder}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-30 p-2">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索…"
            className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 outline-none focus:border-brand mb-1.5"
          />
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-3">没有更多可添加</p>
            )}
            {filtered.map((it) => (
              <button
                key={it.id}
                onClick={() => {
                  onSelect(it);
                  setOpen(false);
                  setFilter("");
                }}
                className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-lightPrimary"
              >
                {renderLabel(it)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ label, value, valueClass = "" }) {
  return (
    <div>
      <p className="text-[11px] text-gray-600">{label}</p>
      <p className={`text-sm font-medium text-navy-700 ${valueClass}`}>{value}</p>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <p className="text-[11px] text-gray-600 mb-1">
        {label}
        {required && <RequiredMark />}
      </p>
      {children}
    </label>
  );
}

// ============================================================
// 创建用户弹窗
// ============================================================
function UserCreateModal({ onClose, onCreated, departments, jobs }) {
  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "RECRUITER",
    jobTitle: "",
    password: "",
    templateId: "RECRUITER", // 默认套招聘官模板
  });
  const [saving, setSaving] = useState(false);

  const tmpl = POLICY_TEMPLATES[form.templateId];

  async function submit() {
    if (!form.email.includes("@")) {
      toast("请输入合法邮箱", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        email: form.email.trim(),
        name: form.name || undefined,
        role: form.role,
        jobTitle: form.jobTitle || undefined,
        password: form.password || undefined,
      };
      // ADMIN 不用模板;普通用户套模板
      if (form.role !== "ADMIN" && tmpl) {
        body.pageKeys = tmpl.pageKeys;
        body.moduleKeys = tmpl.moduleKeys;
      }
      const { data } = await api.post("/users", body);
      toast("用户已创建", "success");
      onCreated(data.user, data.generatedPassword);
    } catch (e) {
      toast(e.response?.data?.message || e.response?.data?.error || "创建失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="user-plus" size={18} className="text-brand" /> 新建用户
        </h3>
        <p className="text-xs text-gray-600">
          创建后默认 ownerId 只能看到自己上传的候选人。需在右侧权限策略给具体页面/模块/数据范围。
        </p>
        <Field label="邮箱" required>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" type="email" />
        </Field>
        <Field label="昵称">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如:张小明" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="角色">
            <select
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand bg-white"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="ADMIN">管理员</option>
              <option value="RECRUITER">招聘官</option>
              <option value="VIEWER">只读</option>
            </select>
          </Field>
          <Field label="内部职位">
            <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="如:HR 负责人" />
          </Field>
        </div>
        <Field label="初始密码(留空 = 自动生成一次性显示)">
          <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="至少 8 位" type="password" />
        </Field>

        {form.role !== "ADMIN" && (
          <div className="border-2 border-brand/10 bg-brand-50/40 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-navy-700">应用权限模板</p>
            <div className="grid grid-cols-3 gap-1.5">
              {TEMPLATE_LIST.map((t) => {
                const active = form.templateId === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setForm({ ...form, templateId: t.id })}
                    className={`p-2 rounded-lg border-2 text-left transition ${active ? "border-brand bg-white" : "border-transparent bg-white/60 hover:border-brand/30"}`}
                  >
                    <p className={`text-xs font-bold ${active ? "text-brand" : "text-navy-700"}`}>{t.name}</p>
                    <p className="text-[10px] text-gray-700 leading-tight mt-0.5">
                      页面 {t.pageKeys.length} · 模块 {t.moduleKeys.length}
                    </p>
                  </button>
                );
              })}
            </div>
            {tmpl && <p className="text-[11px] text-gray-700">{tmpl.desc}</p>}
            <p className="text-[10px] text-gray-600">创建后可在权限策略卡片二次微调。</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving} icon={<I name={saving ? "loader" : "user-plus"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "创建中" : "创建"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// 重置密码弹窗
// ============================================================
function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const { data } = await api.post(`/users/${user.id}/reset-password`, {
        password: password || undefined,
        mustChange,
      });
      toast("密码已重置", "success");
      onDone(data.password); // password 仅在 admin 没传 password 时由后端返回
    } catch (e) {
      toast(e.response?.data?.message || "重置失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="key-round" size={18} className="text-brand" /> 重置密码
        </h3>
        <p className="text-xs text-gray-600">
          目标账号:<strong className="text-navy-700">{user.email}</strong>。系统不存明文密码,只能重置,不能查看原密码。
        </p>
        <Field label="新密码(留空 = 自动生成,一次性显示给你转交)">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" type="password" />
        </Field>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
          <span>要求该用户下次登录时强制改密</span>
        </label>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "重置中" : "确认重置"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// 一次性凭证展示弹窗 — 关闭后无法再看到
// ============================================================
function CredentialModal({ credential, onClose }) {
  const { email, password, kind } = credential;
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(`邮箱: ${email}\n密码: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="key-round" size={18} className="text-amber-600" /> {kind === "create" ? "用户已创建" : "密码已重置"}
        </h3>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 space-y-2 text-sm">
          <p className="text-xs font-bold text-amber-900">⚠ 此密码仅此一次显示,关闭后无法再查看。请立即复制并发给该用户。</p>
          <div className="font-mono text-xs bg-white rounded-lg p-3 space-y-1">
            <div><span className="text-gray-700">邮箱:</span> <strong className="text-navy-700">{email}</strong></div>
            <div><span className="text-gray-700">密码:</span> <strong className="text-navy-700 select-all">{password}</strong></div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={copy} icon={<I name={copied ? "check" : "copy"} size={12} />}>
            {copied ? "已复制" : "复制"}
          </Button>
          <Button onClick={onClose}>我已转交,关闭</Button>
        </div>
      </div>
    </Modal>
  );
}

// 模板应用下拉
function TemplateApplyDropdown({ onApply }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((o) => !o)}
        icon={<I name="layout-template" size={12} />}
      >
        应用模板
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-20 p-2 space-y-1">
          {TEMPLATE_LIST.map((t) => (
            <button
              key={t.id}
              onClick={() => { onApply(t); setOpen(false); }}
              className="block w-full text-left p-2.5 rounded-lg hover:bg-lightPrimary"
            >
              <p className="text-sm font-bold text-navy-700">{t.name}</p>
              <p className="text-[11px] text-gray-700 leading-tight mt-0.5">{t.desc}</p>
              <p className="text-[10px] text-gray-600 mt-1">
                页面 {t.pageKeys.length} · 模块 {t.moduleKeys.length}
              </p>
            </button>
          ))}
          <p className="text-[10px] text-gray-500 px-2 py-1 border-t border-gray-100">
            模板会覆盖当前页面/模块勾选(不影响部门/JD 范围),保存后生效。
          </p>
        </div>
      )}
    </div>
  );
}

// 批量停用弹窗
function BatchDeactivateModal({ ids, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const { data } = await api.post("/users/batch/deactivate", { userIds: ids, reason: reason || undefined });
      toast(`已停用 ${data.affected} 个用户`, "success");
      onDone();
    } catch (e) {
      toast(e.response?.data?.message || "批量停用失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
          <I name="shield-off" size={18} className="text-red-500" /> 批量停用 {ids.length} 个用户
        </h3>
        <p className="text-xs text-gray-700">
          停用后这些用户无法登录,他们创建的 ShareLink 公开访问会返回 410。ADMIN 会被自动跳过(防意外锁出)。
        </p>
        <label className="block">
          <p className="text-[11px] text-gray-600 mb-1">停用原因(可选,登录被拒时会展示给用户)</p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例:转岗 / 离职 / 安全审计" maxLength={200} />
        </label>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving} variant="danger" icon={<I name={saving ? "loader" : "shield-off"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "停用中" : "确认停用"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// 强制下线 helper —— 单个 / 批量复用
async function forceLogoutOne(id, onDone) {
  if (!confirm("强制该用户立即下线?其所有 token 全部失效,需要重新登录。")) return;
  try {
    await api.post(`/users/${id}/force-logout`);
    toast("已强制下线", "success");
    onDone?.();
  } catch (e) {
    toast(e.response?.data?.message || "操作失败", "error");
  }
}

async function batchForceLogout(ids, onDone) {
  if (!confirm(`强制 ${ids.length} 个用户立即下线?`)) return;
  try {
    const { data } = await api.post("/users/batch/force-logout", { userIds: ids });
    toast(`已强制下线 ${data.affected} 个用户`, "success");
    onDone?.();
  } catch (e) {
    toast(e.response?.data?.message || "操作失败", "error");
  }
}
