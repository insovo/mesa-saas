// admin 审计日志 — 时间线展示,支持 action / actor / 时间窗 filter
// GSAP:首屏 stagger 进场 + 翻页时新行 fade-in

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { api } from "../lib/api.js";
import { I, Avatar, LoadingBlock, Empty, Button } from "../components/Primitives.jsx";

const ACTION_GROUPS = {
  "auth.": { label: "认证", color: "bg-emerald-50 text-emerald-700", icon: "log-in" },
  "user.": { label: "用户管理", color: "bg-brand-50 text-brand", icon: "user-cog" },
  "share.": { label: "分享", color: "bg-amber-50 text-amber-700", icon: "share-2" },
  "candidate.": { label: "候选人", color: "bg-blue-50 text-blue-700", icon: "users" },
  "default": { label: "其他", color: "bg-gray-100 text-gray-700", icon: "file-text" },
};

function tone(action) {
  for (const [prefix, meta] of Object.entries(ACTION_GROUPS)) {
    if (prefix !== "default" && action?.startsWith(prefix)) return meta;
  }
  return ACTION_GROUPS.default;
}

const ACTION_LABEL = {
  "auth.login": "登录成功",
  "auth.login_failed": "登录失败",
  "auth.login_blocked": "登录被拒(已停用)",
  "auth.forgot_password": "申请重置密码",
  "auth.forgot_password_unknown": "尝试重置不存在的邮箱",
  "auth.reset_password": "通过验证码重置密码",
  "auth.change_password": "修改密码(旧密码模式)",
  "auth.change_password_via_code": "修改密码(验证码模式)",
  "auth.request_password_code": "申请改密码验证码",
  "auth.request_email_change": "申请改邮箱验证码",
  "auth.change_email": "修改邮箱",
  "user.create": "创建用户",
  "user.update": "更新用户信息",
  "user.deactivate": "停用用户",
  "user.activate": "启用用户",
  "user.delete": "删除用户",
  "user.policy.update": "更新权限策略",
  "user.reset_password": "管理员重置密码",
  "user.batch_deactivate": "批量停用用户",
};

export default function AuditLog() {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ action: "", from: "", to: "" });
  const [skip, setSkip] = useState(0);
  const take = 50;
  const listRef = useRef(null);

  async function load() {
    setItems(null);
    try {
      const params = { skip, take };
      if (filter.action) params.action = filter.action;
      if (filter.from) params.from = filter.from;
      if (filter.to) params.to = filter.to;
      const { data } = await api.get("/audit-logs", { params });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [skip]);

  useEffect(() => {
    if (!items || !listRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".audit-row", {
        x: -10,
        opacity: 0,
        duration: 0.35,
        stagger: 0.025,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    }, listRef);
    return () => ctx.revert();
  }, [items]);

  return (
    <div className="px-3 md:px-6 py-6 max-w-[1280px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-navy-700">审计日志</h1>
          <p className="text-xs text-gray-600 mt-1">
            登录、用户管理、权限变更、分享等关键动作都会留痕,只有 ADMIN 可查看。
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-card shadow-card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">事件类型</label>
          <select
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value })}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand bg-white"
          >
            <option value="">全部</option>
            <option value="auth.">认证类(auth.*)</option>
            <option value="user.">用户管理(user.*)</option>
            <option value="share.">分享(share.*)</option>
            <option value="candidate.">候选人(candidate.*)</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">从</label>
          <input
            type="datetime-local"
            value={filter.from}
            onChange={(e) => setFilter({ ...filter, from: e.target.value })}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">到</label>
          <input
            type="datetime-local"
            value={filter.to}
            onChange={(e) => setFilter({ ...filter, to: e.target.value })}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
          />
        </div>
        <Button onClick={() => { setSkip(0); load(); }} icon={<I name="search" size={12} />}>查询</Button>
        <Button variant="ghost" onClick={() => { setFilter({ action: "", from: "", to: "" }); setSkip(0); setTimeout(load, 0); }} icon={<I name="rotate-ccw" size={12} />}>重置</Button>
        <div className="ml-auto text-xs text-gray-600">
          共 {total} 条 · 当前 {skip + 1}-{Math.min(skip + take, total)}
        </div>
      </div>

      <div ref={listRef} className="bg-white rounded-card shadow-card overflow-hidden">
        {items === null && <LoadingBlock label="加载日志..." />}
        {items?.length === 0 && <Empty icon="file-text" title="没有日志" desc="试试放宽 filter 条件" />}
        {items && items.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {items.map((row) => {
              const t = tone(row.action);
              return (
                <li key={row.id} className="audit-row p-3 md:p-4 flex items-start gap-3 hover:bg-lightPrimary/40 transition">
                  <div className={`w-9 h-9 rounded-xl ${t.color} flex items-center justify-center shrink-0`}>
                    <I name={t.icon} size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <p className="text-sm font-bold text-navy-700">
                        {ACTION_LABEL[row.action] || row.action}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.color} font-mono`}>{row.action}</span>
                      {row.entityType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                          {row.entityType}:{row.entityId?.slice(0, 8) || "—"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 mt-0.5">
                      {row.actorEmail || <span className="italic">系统/匿名</span>} · {row.ip || "-"}
                    </p>
                    {row.diff && Object.keys(row.diff).length > 0 && (
                      <pre className="mt-2 text-[11px] text-gray-700 bg-lightPrimary rounded p-2 overflow-x-auto font-mono">
                        {JSON.stringify(row.diff, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-600 whitespace-nowrap shrink-0">
                    {new Date(row.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <Button variant="ghost" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - take))} icon={<I name="chevron-left" size={12} />}>上一页</Button>
        <Button variant="ghost" disabled={skip + take >= total} onClick={() => setSkip(skip + take)} icon={<I name="chevron-right" size={12} />}>下一页</Button>
      </div>
    </div>
  );
}
