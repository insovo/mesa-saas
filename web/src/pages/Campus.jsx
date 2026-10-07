// 校招模块后台:台账 · 专场 · 岗位 · 数据 · 设置(设计:校招模块/校招模块设计规划.html §6)
// 学生端公开页 /campus/:slug 在 Phase 1 加入(pages/campus/public/*)。
import { useCallback, useEffect, useState } from "react";
import { resources } from "../lib/api.js";
import { useMe } from "../lib/authContext.jsx";
import { hasModule, isAdmin } from "../lib/permissions.js";
import { I, LoadingBlock, toast } from "../components/Primitives.jsx";
import CampusLedger from "../components/campus/CampusLedger.jsx";
import CampusSessions from "../components/campus/CampusSessions.jsx";
import CampusJobs from "../components/campus/CampusJobs.jsx";
import CampusSettings from "../components/campus/CampusSettings.jsx";
import CampusStats from "../components/campus/CampusStats.jsx";

export default function Campus() {
  const me = useMe();
  const admin = isAdmin(me);
  const canManage = admin || hasModule(me, "campus.manage");
  const [tab, setTab] = useState("ledger");
  const [sessions, setSessions] = useState(null);

  const loadSessions = useCallback(async () => {
    try { setSessions(await resources.campus.listSessions()); }
    catch (e) { toast(e.response?.data?.message || e.message, "error"); setSessions([]); }
  }, []);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const tabs = [
    { key: "ledger", label: "台账", icon: "table-2" },
    { key: "sessions", label: "专场", icon: "calendar-days" },
    { key: "jobs", label: "岗位", icon: "briefcase" },
    { key: "stats", label: "数据", icon: "bar-chart-3" },
    ...(canManage ? [{ key: "settings", label: "设置", icon: "settings" }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap max-w-full items-center gap-1 bg-white rounded-card shadow-card p-1.5 w-fit">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition ${tab === t.key ? "bg-brand-gradient text-white shadow-button" : "text-gray-700 hover:bg-lightPrimary"}`}>
            <I name={t.icon} size={15} />{t.label}
          </button>
        ))}
      </div>
      {sessions === null ? <LoadingBlock height="h-48" /> : (
        <>
          {tab === "ledger" && <CampusLedger sessions={sessions} onSessionsChanged={loadSessions} />}
          {tab === "sessions" && <CampusSessions sessions={sessions} canManage={canManage} onChanged={loadSessions} />}
          {tab === "jobs" && <CampusJobs sessions={sessions} canManage={canManage} onChanged={loadSessions} />}
          {tab === "stats" && <CampusStats sessions={sessions} />}
          {tab === "settings" && canManage && <CampusSettings isAdmin={admin} />}
        </>
      )}
    </div>
  );
}
