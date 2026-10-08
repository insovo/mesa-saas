// 联系方式确认页:顶部小波浪球轮询抽取状态并预填;三条提示语;确认后放行
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { campus, campusErr } from "../../../lib/campusApi.js";
import { Button, I, LiquidLoader, toast } from "../../../components/Primitives.jsx";
import { Shell, useCampus, base, Spinner, toastErr, TaskBanner } from "./shell.jsx";

const inputCls = "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-gray-50 disabled:text-gray-500";
const DEGREES = ["大专", "本科", "硕士", "博士"];

export default function CampusContact() {
  const { slug, me, info, session, ready, reload } = useCampus();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || base(slug);
  const [form, setForm] = useState(null);
  const [parse, setParse] = useState({ status: "pending" });
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const prefilled = useRef(false);
  const yearEdited = useRef(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const hints = info?.contactHints?.length ? info.contactHints : ["请务必保持电话、邮箱、微信畅通", "最好电话或微信能直接联系到本人", "面试与录用通知将通过以上渠道发出"];

  useEffect(() => {
    if (ready && !me) nav(`${base(slug)}/upload?next=${encodeURIComponent(next)}`, { replace: true });
  }, [ready, me, nav, slug, next]);

  useEffect(() => {
    if (!me || form) return;
    setForm({ name: me.name || "", phone: me.phone || "", email: me.email || "", wechat: me.wechat || "", school: me.school || "", major: me.major || "", degree: me.degree || "", gradYear: me.gradYear ?? 2026 });
  }, [me, form]);

  // 轮询抽取状态(2s,最多 2 分钟);基础信息只补空,毕业年份覆盖默认值但保留手动修改。
  useEffect(() => {
    const vid = me?.currentVersion?.id;
    if (!vid || !form) return;
    let alive = true, n = 0;
    const tick = async () => {
      try {
        const r = await campus.parseStatus(vid);
        if (!alive) return;
        setParse(r);
        if (r.status === "done" && r.prefill && !prefilled.current) {
          prefilled.current = true;
          setForm((f) => f && ({ ...f, name: f.name || r.prefill.name || "", school: f.school || r.prefill.school || "", major: f.major || r.prefill.major || "", degree: f.degree || r.prefill.degree || "", gradYear: yearEdited.current ? f.gradYear : r.prefill.gradYear ?? f.gradYear }));
        }
        if ((r.status === "running" || r.status === "pending") && n++ < 60) setTimeout(tick, 2000);
      } catch { /* ignore */ }
    };
    tick();
    return () => { alive = false; };
  }, [me?.currentVersion?.id, !!form, pollKey]);

  async function cancelParse() {
    setTaskBusy(true);
    try { const r = await campus.cancelParse(me.currentVersion.id); setParse({ status: r.status }); toast("已取消解析", "success"); }
    catch (err) { toastErr(err, "取消失败"); } finally { setTaskBusy(false); }
  }
  async function retryParse() {
    setTaskBusy(true);
    try { await campus.reparse(me.currentVersion.id); setParse({ status: "running" }); prefilled.current = false; setPollKey((k) => k + 1); }
    catch (err) { toastErr(err, "重新解析失败"); } finally { setTaskBusy(false); }
  }
  async function submit(e) {
    e.preventDefault();
    if (!/^\+?\d{6,15}$/.test(form.phone.replace(/[\s-]/g, ""))) return toast("请填写正确的手机号", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return toast("请填写正确的邮箱", "error");
    if (form.gradYear && (!/^\d{4}$/.test(String(form.gradYear)) || Number(form.gradYear) < 1990 || Number(form.gradYear) > 2100)) return toast("请填写正确的毕业年份", "error");
    setBusy(true);
    try {
      await campus.updateMe({ name: form.name.trim() || null, school: form.school.trim() || null, major: form.major.trim() || null, degree: form.degree || null, ...(yearEdited.current && form.gradYear ? { gradYear: Number(form.gradYear) } : {}) });
      await campus.confirmContact({ phone: form.phone.trim(), email: form.email.trim(), wechat: form.wechat.trim() || null, name: form.name.trim() || null });
      let matchError = null, matchStatus = null;
      if (session?.matchEnabled) {
        try {
          const latest = await campus.latestMatch().catch(() => null);
          const current = latest && !latest.stale && latest.resumeVersionId === me.currentVersion?.id && ["queued", "running", "done"].includes(latest.status);
          matchStatus = current ? latest.status : (await campus.startMatch()).status;
        } catch (err) {
          if (err.response?.data?.error === "campus_match_in_progress") matchStatus = "running";
          else matchError = campusErr(err, "匹配暂未启动");
        }
      }
      await reload();
      if (next === `${base(slug)}/match`) setSaved({ matchError, matchStatus });
      else { toast(matchError ? `联系方式已保存，${matchError}` : "联系方式已保存", matchError ? "info" : "success"); nav(next, { replace: true }); }
    } catch (err) { toastErr(err, "保存失败"); }
    finally { setBusy(false); }
  }

  if (!me || !form) return <Shell title="确认联系方式" back><Spinner /></Shell>;
  const parsing = parse.status === "running" || parse.status === "pending";
  if (saved) return (
    <Shell title="资料已提交" back>
      <div className="rounded-card bg-white p-6 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600"><I name="check" size={28} /></div>
        <h2 className="mt-4 text-lg font-bold">手机号和邮箱已保存</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{saved.matchError ? `匹配暂未启动：${saved.matchError}。可进入结果页重试。` : saved.matchStatus === "done" ? "岗位匹配结果已就绪。现在可以关闭页面，之后返回本专场查看。" : session?.matchEnabled ? "智能匹配正在后台进行。现在可以关闭页面，之后返回本专场查看岗位匹配度。" : "现在可以关闭页面，之后返回本专场查看资料与投递记录。"}</p>
        <p className="mt-2 text-xs text-gray-500">换设备时可用手机号和邮箱找回记录。</p>
        {session?.matchEnabled && <Button className="mt-5 w-full !h-12" as={Link} to={`${base(slug)}/match`}>{saved.matchError ? "进入结果页重试" : "查看匹配进度"}</Button>}
        <Button variant="secondary" className="mt-2 w-full !h-12" as={Link} to={base(slug)}>返回专场首页</Button>
      </div>
    </Shell>
  );
  return (
    <Shell title="确认联系方式" back>
      <div className="bg-white rounded-card shadow-card p-5">
        <div className="flex items-center gap-3">
          <LiquidLoader size={44} level={parse.status === "done" ? 100 : parsing ? 55 : 0} loading={parsing} instant />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">请确认联系方式</h2>
            <p className="text-xs text-gray-600 mt-0.5">填写手机号和邮箱后即可保存并离开，匹配会在后台进行。其他资料可选填。</p>
          </div>
        </div>
        <div className="mt-3"><TaskBanner status={parse.status} running={parsing} label="正在后台读取简历" onCancel={cancelParse} onRetry={retryParse} busy={taskBusy} /></div>

        <ul className="mt-4 space-y-1.5">
          {hints.map((h, i) => <li key={i} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2"><I name="bell-ring" size={13} className="shrink-0 mt-0.5" />{h}</li>)}
        </ul>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs font-bold ml-1">姓名</label><input className={`${inputCls} mt-1.5`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={parsing ? "读取中…" : "你的姓名"} /></div>
            <div className="col-span-2"><label className="text-xs font-bold ml-1">手机号<span className="text-red-500 ml-0.5">*</span></label><input className={`${inputCls} mt-1.5`} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs font-bold ml-1">邮箱<span className="text-red-500 ml-0.5">*</span><span className="ml-2 text-[11px] font-normal text-gray-500">可用于找回上传、投递记录</span></label><input className={`${inputCls} mt-1.5`} type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div>
            <div className="col-span-2"><label className="text-xs font-bold ml-1">微信号<span className="ml-2 text-[11px] font-normal text-gray-500">选填</span></label><input className={`${inputCls} mt-1.5`} value={form.wechat} onChange={(e) => setForm({ ...form, wechat: e.target.value })} placeholder="方便 HR 直接联系" /></div>
            <div className="col-span-2"><label className="text-xs font-bold ml-1">学校</label><input className={`${inputCls} mt-1.5`} value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder={parsing ? "读取中…" : ""} /></div>
            <div><label className="text-xs font-bold ml-1">专业</label><input className={`${inputCls} mt-1.5`} value={form.major} onChange={(e) => setForm({ ...form, major: e.target.value })} /></div>
            <div><label className="text-xs font-bold ml-1">学历</label><select className={`${inputCls} mt-1.5`} value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })}><option value="">未填</option>{DEGREES.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
            <div className="col-span-2"><label className="text-xs font-bold ml-1">毕业年份<span className="ml-2 text-[11px] font-normal text-gray-500">默认 2026，简历识别后自动更新，也可修改</span></label><input className={`${inputCls} mt-1.5`} inputMode="numeric" value={form.gradYear} onChange={(e) => { yearEdited.current = true; setForm({ ...form, gradYear: e.target.value.replace(/\D/g, "").slice(0, 4) }); }} placeholder="2026" /></div>
          </div>
          <Button type="submit" className="w-full !h-12" disabled={busy} icon={busy ? <I name="loader" size={16} className="animate-spin" /> : <I name="check" size={16} />}>{busy ? "保存中…" : "保存联系方式"}</Button>
        </form>
      </div>
    </Shell>
  );
}
