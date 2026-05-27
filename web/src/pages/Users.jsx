import { useEffect, useMemo, useState } from "react";
import { resources } from "../lib/api.js";
import { getUser } from "../lib/auth.js";
import {
  Card,
  Avatar,
  Button,
  I,
  Empty,
  LoadingBlock,
  toast,
} from "../components/Primitives.jsx";

const ROLES = [
  { value: "ADMIN", label: "管理员", tone: "bg-violet-100 text-violet-700" },
  { value: "RECRUITER", label: "招聘官", tone: "bg-blue-100 text-blue-700" },
  { value: "VIEWER", label: "只读", tone: "bg-gray-100 text-gray-700" },
];

const PERM_LABEL = {
  "system.llm_config": "LLM 系统配置",
};
const PERM_DESC = {
  "system.llm_config": "可在 Sidebar 打开 LLM Key 弹窗,修改 Kimi/DeepSeek 配置",
};

function RolePill({ role }) {
  const r = ROLES.find((x) => x.value === role) || ROLES[2];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${r.tone}`}>
      {r.label}
    </span>
  );
}

export default function Users() {
  const [items, setItems] = useState([]);
  const [allowedPerms, setAllowedPerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const me = getUser();

  async function load() {
    setLoading(true);
    try {
      const { items, allowedPermissions } = await resources.users.list();
      setItems(items);
      setAllowedPerms(allowedPermissions || []);
    } catch (e) {
      toast(e.response?.data?.message || e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patchUser(id, data, optimistic) {
    setSavingId(id);
    const prev = items;
    setItems((cur) => cur.map((u) => (u.id === id ? { ...u, ...optimistic } : u)));
    try {
      const updated = await resources.users.update(id, data);
      setItems((cur) => cur.map((u) => (u.id === id ? updated : u)));
      toast("已保存", "success");
    } catch (e) {
      setItems(prev);
      toast(e.response?.data?.message || e.message || "保存失败", "error");
    } finally {
      setSavingId(null);
    }
  }

  function onChangeRole(u, role) {
    if (u.id === me?.id && role !== "ADMIN") {
      toast("不能修改自己的管理员角色", "error");
      return;
    }
    patchUser(u.id, { role }, { role });
  }

  function onTogglePerm(u, perm) {
    const has = (u.permissions || []).includes(perm);
    const next = has
      ? (u.permissions || []).filter((p) => p !== perm)
      : [...(u.permissions || []), perm];
    patchUser(u.id, { permissions: next }, { permissions: next });
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ra = ROLES.findIndex((x) => x.value === a.role);
      const rb = ROLES.findIndex((x) => x.value === b.role);
      if (ra !== rb) return ra - rb;
      return (a.email || "").localeCompare(b.email || "");
    });
  }, [items]);

  if (loading) return <LoadingBlock height="h-64" />;

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="title-card flex items-center gap-2">
              <I name="users-round" size={18} className="text-brand" />
              用户与权限
            </h2>
            <p className="text-xs text-gray-700 mt-1">
              管理员视角 · 修改角色 / 单独勾选额外能力。改完立即生效,被修改者下次刷新或重新登录可见。
            </p>
          </div>
        </div>
      </Card>

      {sorted.length === 0 ? (
        <Card className="p-6">
          <Empty icon="users-round" title="暂无用户" />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-gray-700 bg-lightPrimary">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">用户</th>
                  <th className="text-left px-3 py-3 font-medium">邮箱</th>
                  <th className="text-left px-3 py-3 font-medium">角色</th>
                  <th className="text-left px-3 py-3 font-medium">额外能力</th>
                  <th className="text-left px-3 py-3 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((u) => {
                  const isMe = u.id === me?.id;
                  const isSaving = savingId === u.id;
                  return (
                    <tr key={u.id} className={isSaving ? "opacity-60" : ""}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name || u.email} src={u.avatar} size={40} />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-navy-700 truncate flex items-center gap-2">
                              {u.name || "—"}
                              {isMe && (
                                <span className="text-[10px] text-gray-700 font-normal bg-gray-100 px-1.5 py-0.5 rounded">我</span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-700 truncate">{u.jobTitle || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-navy-700">{u.email}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <RolePill role={u.role} />
                          <select
                            value={u.role}
                            onChange={(e) => onChangeRole(u, e.target.value)}
                            disabled={isSaving || isMe}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:border-brand outline-none disabled:opacity-60"
                            title={isMe ? "不能修改自己的角色" : "切换角色"}
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {u.role === "ADMIN" ? (
                          <span className="text-[11px] text-gray-700">管理员默认拥有全部能力</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {allowedPerms.map((perm) => {
                              const checked = (u.permissions || []).includes(perm);
                              return (
                                <label
                                  key={perm}
                                  className={`inline-flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-[11px] transition ${
                                    checked
                                      ? "bg-brand/10 border-brand/30 text-brand"
                                      : "bg-white border-gray-200 text-gray-700 hover:border-brand/30"
                                  } ${isSaving ? "pointer-events-none" : ""}`}
                                  title={PERM_DESC[perm] || perm}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onTogglePerm(u, perm)}
                                    className="accent-brand"
                                  />
                                  {PERM_LABEL[perm] || perm}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-700">
                        {u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
