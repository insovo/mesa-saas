// 联系方式确认页:顶部小波浪球轮询抽取状态并预填;三条提示语;确认后放行
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { campus } from "../../../lib/campusApi.js";
import { Button, I, LiquidLoader, toast } from "../../../components/Primitives.jsx";
import { Shell, useCampus, base, Spinner, toastErr, TaskBanner } from "./shell.jsx";

const inputCls = "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-gray-50 disabled:text-gray-500";
const DEGREES = ["大专", "本科", "硕士", "博士"];

export default function CampusContact() {
  const { slug, me, info, ready, reload } = useCampus();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || base(slug);
  const [form, setForm] = useState(null);
  const [parse, setParse] = useState({ status: "pending" });
  const [confirm, setConfirm] = useState(false);
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
    setConfirm(!!me.contactConfirmed);
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
    if (!confirm) return toast("请勾选确认联系方式可直接联系到本人", "error");
    if (!/^\+?\d{6,15}$/.test(form.phone.replace(/[\s-]/g, ""))) return toast("请填写正确的手机号", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return toast("请填写正确的邮箱", "error");
    if (!/^\d{4}$/.test(String(form.gradYear)) || Number(form.gradYear) < 1990 || Number(form.gradYear) > 2100) return toast("请填写正确的毕业年份", "error");
    setBusy(true);
    try {
      await campus.updateMe({ name: form.name.trim() || null, school: form.school.trim() || null, major: form.major.trim() || null, degree: form.degree || null, ...(yearEdited.current ? { gradYear: Number(form.gradYear) } : {}) });
      await campus.confirmContact({ phone: form.phone.trim(), email: form.email.trim(), wechat: form.wechat.trim() || null, name: form.name.trim() || null });
      await reload();
      toast("已确认", "success");
      nav(next, { replace: true });
    } catch (err) { toastErr(err, "保存失败"); }
    finally { setBusy(false); }
  }

  if (!me || !form) return <Shell title="确认联系方式" back><Spinner /></Shell>;
  const parsing = parse.status === "running" || parse.status === "pending";
  return (
    <Shell title="确认联系方式" back>
      <div className="bg-white rounded-card shadow-card p-5">
        <div className="flex items-center gap-3">
          <LiquidLoader size={44} level={parse.status === "done" ? 100 : parsing ? 55 : 0} loading={parsing} instant />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">请确认联系方式</h2>
            <p className="text-xs text-gray-600 mt-0.5">{parsing ? "正在读取你的简历,学校 / 专业会自动填好…" : parse.status === "done" ? "简历已读取,请核对下方信息" : parse.status === "failed" || parse.status === "cancelled" ? "可直接手动填写,不影响投递" : "请核对下方信息"}</p>
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
          <label className="flex items-start gap-2 text-sm text-navy-700 ml-1">
            <input type="checkbox" className="accent-brand mt-0.5 w-4 h-4 shrink-0" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>我确认以上联系方式准确,电话或微信可以直接联系到本人</span>
          </label>
          <Button type="submit" className="w-full !h-12" disabled={busy} icon={busy ? <I name="loader" size={16} className="animate-spin" /> : <I name="check" size={16} />}>{busy ? "保存中…" : "确认并继续"}</Button>
        </form>
      </div>
    </Shell>
  );
}
