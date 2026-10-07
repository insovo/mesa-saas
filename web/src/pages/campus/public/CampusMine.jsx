// 我的投递:投递列表(可撤回)+ 简历版本 + 剩余次数 + 退出
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { campus } from "../../../lib/campusApi.js";
import { CAMPUS_APP_STATUS_LABEL } from "../../../lib/constants.js";
import { Button, I, toast } from "../../../components/Primitives.jsx";
import { KindTag, AppStatusPill, ParseTag, fmtDateTime } from "../../../components/campus/ui.jsx";
import { Shell, useCampus, base, Spinner, toastErr, TaskBanner } from "./shell.jsx";

export default function CampusMine() {
  const { slug, me, session, reload, logout, ready } = useCampus();
  const nav = useNavigate();
  const [busy, setBusy] = useState(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const parsing = me?.currentVersion?.parseStatus === "running" || me?.currentVersion?.parseStatus === "pending";
  // 后台解析中 → 5s 轮询刷新
  useEffect(() => { if (!parsing) return; const t = setInterval(() => reload(), 5000); return () => clearInterval(t); }, [parsing, reload]);
  async function cancelParse() { setTaskBusy(true); try { await campus.cancelParse(me.currentVersion.id); toast("已取消解析", "success"); await reload(); } catch (e) { toastErr(e, "取消失败"); } finally { setTaskBusy(false); } }
  async function retryParse() { setTaskBusy(true); try { await campus.reparse(me.currentVersion.id); toast("已重新开始解析", "success"); await reload(); } catch (e) { toastErr(e, "重新解析失败"); } finally { setTaskBusy(false); } }
  if (!ready) return <Shell title="我的投递" back><Spinner /></Shell>;
  if (!me) {
    return (
      <Shell title="我的投递" back>
        <div className="bg-white rounded-card shadow-card p-8 text-center">
          <I name="user-round" size={28} className="mx-auto text-gray-400 mb-3" />
          <p className="text-sm text-gray-700">这台设备上还没有投递记录</p>
          <p className="text-xs text-gray-500 mt-1">上传简历后即可投递;若曾在其他设备投递,可用手机号 + 邮箱找回</p>
          <div className="flex gap-2 justify-center mt-4">
            <Button variant="secondary" as={Link} to={`${base(slug)}/recover`} icon={<I name="key-round" size={14} />}>找回记录</Button>
            <Button as={Link} to={`${base(slug)}/upload?next=${encodeURIComponent(`${base(slug)}/mine`)}`}>上传简历</Button>
          </div>
        </div>
      </Shell>
    );
  }
  const apps = me.applications.filter((a) => a.status !== "withdrawn");
  const withdrawn = me.applications.filter((a) => a.status === "withdrawn");
  async function withdraw(a) {
    if (!confirm(`撤回对「${a.job?.title}」的投递?撤回后可改投其他岗位。`)) return;
    setBusy(a.id);
    try { await campus.withdraw(a.id); toast("已撤回", "success"); await reload(); }
    catch (e) { toastErr(e, "撤回失败"); } finally { setBusy(null); }
  }
  return (
    <Shell title="我的投递" back>
      <div className="bg-white rounded-card shadow-card p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-gradient text-white flex items-center justify-center text-lg font-bold">{(me.name || me.phone || "?").slice(0, 1)}</div>
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{me.name || "未填姓名"}</p>
            <p className="text-xs text-gray-600 truncate">{[me.school, me.major, me.degree].filter(Boolean).join(" · ") || me.phone}</p>
          </div>
          {me.contactConfirmed ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">联系方式已确认</span> : <Link to={`${base(slug)}/contact?next=${encodeURIComponent(`${base(slug)}/mine`)}`} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">去确认联系方式</Link>}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="bg-lightPrimary rounded-xl py-2"><p className="text-lg font-bold">{me.applied}<span className="text-xs text-gray-500 font-normal">/{session?.maxApplyJobs ?? me.maxApplyJobs}</span></p><p className="text-[11px] text-gray-600">已投岗位</p></div>
          <div className="bg-lightPrimary rounded-xl py-2"><p className="text-lg font-bold">{me.uploadsUsed}<span className="text-xs text-gray-500 font-normal">/{me.uploadsAllowed}</span></p><p className="text-[11px] text-gray-600">简历上传</p></div>
          <div className="bg-lightPrimary rounded-xl py-2"><p className="text-lg font-bold">{Math.max(0, (session?.maxApplyJobs ?? me.maxApplyJobs) - me.applied)}</p><p className="text-[11px] text-gray-600">剩余名额</p></div>
        </div>
      </div>

      {session?.matchEnabled && (
        <Link to={`${base(slug)}/match`} className="mt-4 flex items-center gap-3 bg-white rounded-card shadow-card p-4">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand flex items-center justify-center"><I name="sparkles" size={18} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">智能匹配</p>
            <p className="text-[11px] text-gray-500">{!me.latestMatchRun ? "还没有匹配过,看看哪些岗位最适合你" : me.latestMatchRun.status === "done" ? (me.latestMatchRun.stale ? "简历已更新,建议重新匹配" : `已完成 · ${fmtDateTime(me.latestMatchRun.finishedAt)}`) : me.latestMatchRun.status === "running" || me.latestMatchRun.status === "queued" ? "正在后台匹配,关闭页面也不会中断" : me.latestMatchRun.status === "cancelled" ? "上次已取消,可重新匹配" : "上次失败,可重新匹配"}</p>
          </div>
          <I name="chevron-right" size={16} className="text-gray-400" />
        </Link>
      )}

      <section className="mt-5">
        <div className="flex items-center justify-between px-1 mb-2"><h2 className="text-sm font-bold">投递记录</h2><Link to={`${base(slug)}/jobs`} className="text-xs text-brand font-medium">去看岗位</Link></div>
        {apps.length === 0 ? <div className="bg-white rounded-card shadow-card p-6 text-center text-sm text-gray-600">还没有投递,去「岗位列表」看看吧</div> : (
          <div className="space-y-2.5">
            {apps.map((a) => (
              <div key={a.id} className="bg-white rounded-card shadow-card p-4">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm flex-1 min-w-0 truncate">{a.job?.title || "岗位已下线"}</p>
                  <KindTag kind={a.kind} />
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <AppStatusPill status={a.status} />
                  <span className="text-[11px] text-gray-500">{a.source === "match" ? "智能匹配" : a.source === "hr" ? "现场登记" : "直接投递"} · {fmtDateTime(a.createdAt)}</span>
                  {a.scoreShown != null && <span className="text-[11px] text-brand font-bold ml-auto">匹配 {a.scoreShown}</span>}
                </div>
                {["applied", "screening"].includes(a.status) && session?.open && (
                  <div className="mt-2 text-right"><button type="button" disabled={busy === a.id} onClick={() => withdraw(a)} className="text-[11px] text-gray-500 hover:text-red-500">撤回投递</button></div>
                )}
              </div>
            ))}
          </div>
        )}
        {withdrawn.length > 0 && <p className="text-[11px] text-gray-400 px-1 mt-2">已撤回 {withdrawn.length} 条:{withdrawn.map((a) => a.job?.title).filter(Boolean).join("、")}</p>}
      </section>

      <section className="mt-5">
        {me.currentVersion && <div className="mb-3"><TaskBanner status={me.currentVersion.parseStatus} running={parsing} label="正在后台读取简历" onCancel={cancelParse} onRetry={session?.open ? retryParse : null} busy={taskBusy} /></div>}
        <div className="flex items-center justify-between px-1 mb-2"><h2 className="text-sm font-bold">我的简历</h2>{me.uploadsUsed < me.uploadsAllowed && session?.open && <Link to={`${base(slug)}/upload?next=${encodeURIComponent(`${base(slug)}/mine`)}`} className="text-xs text-brand font-medium">上传新版</Link>}</div>
        {me.versions.length === 0 ? <div className="bg-white rounded-card shadow-card p-6 text-center text-sm text-gray-600">还没有上传简历</div> : (
          <div className="bg-white rounded-card shadow-card divide-y divide-gray-50">
            {me.versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 p-3">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${v.id === me.currentVersion?.id ? "bg-brand text-white" : "bg-lightPrimary text-navy-700"}`}>v{v.version}</span>
                <div className="flex-1 min-w-0"><p className="text-sm truncate">{v.filename || "简历"}{v.id === me.currentVersion?.id && <span className="ml-2 text-[10px] text-brand font-bold">当前</span>}</p><p className="text-[11px] text-gray-500">{fmtDateTime(v.uploadedAt)}</p></div>
                <ParseTag status={v.parseStatus} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 text-center">
        <button type="button" onClick={() => { if (confirm("清除本设备上的会话?之后将无法在此设备查看投递记录(记录仍保留在系统中)。")) { logout(); nav(base(slug)); } }} className="text-xs text-gray-400">清除本设备会话</button>
      </div>
    </Shell>
  );
}
