// 学生详情抽屉:基本信息(可编辑)+ 投递(状态流转 / 补投递 / 移除)+ 简历版本(下载 / 重试解析 / 代传新版)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resources } from "../../lib/api.js";
import { useHasModule, useMe } from "../../lib/authContext.jsx";
import { isAdmin } from "../../lib/permissions.js";
import { CAMPUS_APP_STATUS, CAMPUS_APP_STATUS_LABEL } from "../../lib/constants.js";
import { Button, Input, Modal, I, LiquidLoader, toast, Avatar } from "../Primitives.jsx";
import { Field, Select, Toggle, KindTag, AppStatusPill, ParseTag, sourceLabel, fmtDateTime, fmtSize, uploadResumeToR2, errMsg, RESUME_ACCEPT, DEGREE_OPTIONS } from "./ui.jsx";

export default function ApplicantDrawer({ applicantId, open, initialEdit = false, onClose, sessionJobs, onChanged }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("applications");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [addJobId, setAddJobId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [ivFor, setIvFor] = useState(null);     // 正在安排面试的投递
  const [mergeOpen, setMergeOpen] = useState(false);
  const fileRef = useRef(null);
  const initialEditDone = useRef(false);
  const me = useMe();
  const hasManage = useHasModule("campus.manage");
  const canManage = isAdmin(me) || hasManage;
  const canDownload = useHasModule("candidate.attachments");

  const load = useCallback(async () => {
    if (!applicantId) return;
    try { setData(await resources.campus.getApplicant(applicantId)); }
    catch (e) { toast(errMsg(e, "加载失败"), "error"); }
  }, [applicantId]);

  useEffect(() => { if (open) { initialEditDone.current = false; setData(null); setEditing(false); setTab("applications"); load(); } }, [open, load]);

  // 有解析中的版本 → 3s 轮询
  const running = !!data?.applicant?.versions?.some((v) => v.parseStatus === "running") || !!data?.matchRuns?.some((r) => r.status === "running" || r.status === "queued");
  useEffect(() => {
    if (!open || !running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [open, running, load]);

  const a = data?.applicant;
  useEffect(() => {
    if (open && initialEdit && a?.id === applicantId && !initialEditDone.current) {
      initialEditDone.current = true;
      startEdit();
    }
  }, [open, initialEdit, a, applicantId]);
  const session = data?.session;
  const activeApps = useMemo(() => (a?.applications || []).filter((x) => x.status !== "withdrawn"), [a]);
  const quotaLeft = session ? Math.max(0, session.maxApplyJobs - activeApps.filter((x) => x.status !== "rejected").length) : 0;
  const availableJobs = useMemo(() => sessionJobs.filter((sj) => !(a?.applications || []).some((x) => x.jobId === sj.jobId && x.status !== "withdrawn")), [sessionJobs, a]);

  function startEdit() {
    setForm({ name: a.name || "", phone: a.phone || "", email: a.email || "", wechat: a.wechat || "", school: a.school || "", major: a.major || "", degree: a.degree || "", gradYear: a.gradYear || "", extraUploads: a.extraUploads || 0, contactConfirmed: !!a.contactConfirmedAt });
    setEditing(true);
  }
  async function saveEdit() {
    setSaving(true);
    try {
      const body = { name: form.name.trim() || null, email: form.email.trim() || null, wechat: form.wechat.trim() || null, school: form.school.trim() || null, major: form.major.trim() || null, degree: form.degree || null, gradYear: form.gradYear ? Number(form.gradYear) : null, extraUploads: Number(form.extraUploads) || 0, contactConfirmed: form.contactConfirmed };
      if (form.phone && form.phone !== a.phone) body.phone = form.phone.trim();
      await resources.campus.updateApplicant(a.id, body);
      toast("已保存", "success"); setEditing(false); await load(); onChanged?.();
    } catch (e) { toast(errMsg(e), "error"); } finally { setSaving(false); }
  }
  async function changeStatus(app, status) {
    let advance = false;
    if (status === "passed") advance = confirm(`「${app.job?.title}」标记为已通过。\n\n是否同时把候选人状态改为「待入职」并进入入职管理?\n确定 = 是(推荐)   取消 = 只改投递状态`);
    try { await resources.campus.updateApplication(app.id, { status, advance }); if (advance) toast("已进入入职管理(待入职)", "success"); await load(); onChanged?.(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function removeApp(app) {
    if (!confirm(`移除「${app.job?.title}」的投递记录?`)) return;
    try { await resources.campus.removeApplication(app.id); await load(); onChanged?.(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function addApp() {
    if (!addJobId) return;
    try { await resources.campus.addApplication(a.id, addJobId); setAddJobId(""); toast("已添加投递", "success"); await load(); onChanged?.(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function onPickFile(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const resume = await uploadResumeToR2(file);
      const r = await resources.campus.addResume(a.id, resume);
      toast(r.taskId ? "已上传,解析中" : "已上传(未配置 LLM,未解析)", "success");
      await load(); onChanged?.();
    } catch (err) {
      if (err.response?.status === 503) toast("R2 未配置,无法上传", "error");
      else toast(errMsg(err, "上传失败"), "error");
    } finally { setUploading(false); }
  }
  async function cancelParse(v) {
    try { await resources.campus.cancelParse(a.id, v.id); toast("已取消解析", "success"); await load(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function reparse(v) {
    try { await resources.campus.reparseResume(a.id, v.id); toast("已重新开始解析", "success"); await load(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function startMatch() {
    try { await resources.campus.startMatch(a.id); toast("已发起匹配", "success"); await load(); }
    catch (e) { toast(errMsg(e, "发起失败"), "error"); }
  }
  async function cancelMatch(r) {
    try { await resources.campus.cancelMatch(a.id, r.id); toast("已取消匹配", "success"); await load(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function removeApplicant() {
    if (!confirm(`删除「${a.name || a.phone}」在本专场的登记?候选人档案保留,投递与简历版本记录会一起删除。`)) return;
    try { await resources.campus.removeApplicant(a.id); toast("已删除", "success"); onClose(); onChanged?.(); }
    catch (e) { toast(errMsg(e), "error"); }
  }

  const uploadsLeft = a ? Math.max(0, a.uploadsAllowed - a.resumeUploadCount) : 0;

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-3xl">
      {!a ? (
        <div className="p-10 text-center text-sm text-gray-600"><I name="loader" size={16} className="animate-spin inline mr-2" />加载中…</div>
      ) : (
        <div className="p-6 space-y-5">
          {/* 头部 */}
          <div className="flex items-start gap-4">
            <Avatar name={a.name || "?"} size={52} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-navy-700 truncate">{a.name || "未填姓名"}</h3>
                {a.contactConfirmedAt ? <span className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><I name="check" size={10} />联系方式已确认</span> : <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">联系方式未确认</span>}
                <ParseTag status={a.currentVersion?.parseStatus} />
              </div>
              <p className="text-xs text-gray-600 mt-1 truncate">{[a.school, a.major, a.degree, a.gradYear && `${a.gradYear} 届`].filter(Boolean).join(" · ") || "学校 / 专业待补"}</p>
              <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1"><I name="phone" size={11} />{a.phone}</span>
                {a.email && <span className="inline-flex items-center gap-1"><I name="mail" size={11} />{a.email}</span>}
                {a.wechat && <span className="inline-flex items-center gap-1"><I name="message-circle" size={11} />{a.wechat}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {a.bestMatchScore != null && <LiquidLoader size={48} level={a.bestMatchScore} label={a.bestMatchScore} instant />}
              <Link to={`/candidates/${a.candidateId}`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline"><I name="external-link" size={12} />候选人详情</Link>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-lightPrimary text-gray-500"><I name="x" size={16} /></button>
            </div>
          </div>

          {/* 编辑表单 */}
          {editing ? (
            <div className="rounded-card bg-lightPrimary/60 p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input label="手机号" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input label="邮箱" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input label="微信号" value={form.wechat} onChange={(e) => setForm({ ...form, wechat: e.target.value })} />
                <Input label="学校" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
                <Input label="专业" value={form.major} onChange={(e) => setForm({ ...form, major: e.target.value })} />
                <Field label="学历"><Select value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })}><option value="">未填</option>{DEGREE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
                <Input label="毕业年份" type="number" value={form.gradYear} onChange={(e) => setForm({ ...form, gradYear: e.target.value })} />
                <Input label="额外上传次数" type="number" min="0" max="50" value={form.extraUploads} onChange={(e) => setForm({ ...form, extraUploads: e.target.value })} />
                <div className="flex items-end pb-3 ml-3"><Toggle checked={form.contactConfirmed} onChange={(v) => setForm({ ...form, contactConfirmed: v })} label="联系方式已确认" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
                <Button size="sm" disabled={saving} onClick={saveEdit}>{saving ? "保存中…" : "保存"}</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="ghost" icon={<I name="pencil" size={14} />} onClick={startEdit}>编辑信息</Button>
              <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 text-xs font-medium text-navy-700 cursor-pointer hover:bg-lightPrimary ${uploadsLeft === 0 || uploading ? "opacity-50 pointer-events-none" : ""}`}>
                {uploading ? <I name="loader" size={14} className="animate-spin" /> : <I name="file-up" size={14} />}
                {uploading ? "上传中…" : `代传新版简历(剩 ${uploadsLeft} 次)`}
                <input ref={fileRef} type="file" accept={RESUME_ACCEPT} className="hidden" onChange={onPickFile} />
              </label>
              <Button size="sm" variant="ghost" icon={<I name="git-merge" size={14} />} onClick={() => setMergeOpen(true)}>合并电脑端上传</Button>
              <Link to={`/candidates/${a.candidateId}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 text-xs font-medium text-navy-700 hover:bg-lightPrimary"><I name="qr-code" size={14} />面试评价二维码</Link>
              {canManage && <Button size="sm" variant="ghost" className="text-red-600 ml-auto" icon={<I name="trash-2" size={14} />} onClick={removeApplicant}>删除登记</Button>}
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-100">
            {[["applications", `投递(${activeApps.length}/${session?.maxApplyJobs ?? 3})`], ["versions", `简历版本(${a.versions.length}/${a.uploadsAllowed})`], ["runs", `匹配记录(${data.matchRuns?.length || 0})`]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px transition ${tab === k ? "border-brand text-brand" : "border-transparent text-gray-600 hover:text-navy-700"}`}>{label}</button>
            ))}
          </div>

          {tab === "applications" && (
            <div className="space-y-3">
              {a.applications.length === 0 && <p className="text-xs text-gray-500 text-center py-6">还没有投递记录</p>}
              {a.applications.map((app) => (
                <div key={app.id} className="flex items-center gap-3 p-3 rounded-xl bg-lightPrimary/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-navy-700 truncate">{app.job?.title || "岗位已删除"}</span>
                      <KindTag kind={app.kind} />
                      <span className="text-[11px] text-gray-500">{sourceLabel(app.source)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{app.job?.dept || ""} · 投递于 {fmtDateTime(app.createdAt)} · 状态更新 {fmtDateTime(app.statusChangedAt)}</p>
                  </div>
                  {app.scoreShown != null && <div className="text-right shrink-0"><p className="text-sm font-bold text-navy-700">{app.scoreShown}</p><p className="text-[10px] text-gray-500">原始 {app.scoreRaw}</p></div>}
                  <AppStatusPill status={app.status} />
                  <Select small value={app.status} onChange={(e) => changeStatus(app, e.target.value)} className="w-28">
                    {CAMPUS_APP_STATUS.map((s) => <option key={s} value={s}>{CAMPUS_APP_STATUS_LABEL[s]}</option>)}
                  </Select>
                  {app.kind === "onsite" && ["applied", "screening", "onsite_interview"].includes(app.status) && <button type="button" onClick={() => setIvFor(app)} className="p-1.5 rounded-lg text-gray-500 hover:text-brand hover:bg-white" title="安排现场面试"><I name="calendar-plus" size={14} /></button>}
                  <button type="button" onClick={() => removeApp(app)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-white" title="移除"><I name="trash-2" size={14} /></button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Select small value={addJobId} onChange={(e) => setAddJobId(e.target.value)} className="flex-1" disabled={quotaLeft === 0}>
                  <option value="">{quotaLeft === 0 ? "投递额度已用完" : "选择岗位补投递…"}</option>
                  {availableJobs.map((sj) => <option key={sj.id} value={sj.jobId}>{sj.job?.title}({sj.kind === "onsite" ? "现场面试" : "内推"})</option>)}
                </Select>
                <Button size="sm" variant="secondary" disabled={!addJobId} onClick={addApp} icon={<I name="plus" size={14} />}>添加</Button>
              </div>
            </div>
          )}

          {tab === "versions" && (
            <div className="space-y-2">
              {a.versions.length === 0 && <p className="text-xs text-gray-500 text-center py-6">还没有上传简历</p>}
              {a.versions.map((v) => {
                const isCurrent = v.id === a.currentResumeVersionId;
                return (
                  <div key={v.id} className={`flex items-center gap-3 p-3 rounded-xl ${isCurrent ? "bg-brand-50/60 ring-1 ring-brand/20" : "bg-lightPrimary/50"}`}>
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${isCurrent ? "bg-brand text-white" : "bg-white text-navy-700"}`}>v{v.version}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-navy-700 truncate">{v.filename || v.id}{isCurrent && <span className="ml-2 text-[10px] text-brand font-bold">当前版</span>}</p>
                      <p className="text-[11px] text-gray-500">{fmtDateTime(v.uploadedAt)} · {fmtSize(v.size)}{v.uploadedBy ? " · HR 代传" : " · 学生上传"}{v.parseError && v.parseStatus === "failed" ? ` · ${v.parseError}` : ""}</p>
                    </div>
                    <ParseTag status={v.parseStatus} />
                    {v.parseStatus === "running" && (
                      <button type="button" onClick={() => cancelParse(v)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-white" title="取消解析"><I name="square" size={14} /></button>
                    )}
                    {isCurrent && (v.parseStatus === "failed" || v.parseStatus === "skipped" || v.parseStatus === "pending" || v.parseStatus === "cancelled") && (
                      <button type="button" onClick={() => reparse(v)} className="p-1.5 rounded-lg text-gray-500 hover:text-brand hover:bg-white" title="重试解析"><I name="refresh-cw" size={14} /></button>
                    )}
                    {canDownload && <a href={resources.campus.resumeDownloadUrl(a.id, v.id)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-gray-500 hover:text-brand hover:bg-white" title="下载"><I name="download" size={14} /></a>}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "runs" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">学生端发起或 HR 代跑;结果为快照,原始分仅 HR 可见</p>
                <Button size="sm" variant="secondary" disabled={!a.currentResumeVersionId || !session?.matchEnabled || (data.matchRuns || []).some((r) => r.status === "running" || r.status === "queued")} onClick={startMatch} icon={<I name="sparkles" size={14} />}>代跑匹配</Button>
              </div>
              {(data.matchRuns || []).length === 0 && <p className="text-xs text-gray-500 text-center py-6">还没有智能匹配记录</p>}
              {(data.matchRuns || []).map((r) => (
                <div key={r.id} className="p-3 rounded-xl bg-lightPrimary/50 text-xs text-navy-700">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{fmtDateTime(r.startedAt)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === "done" ? "bg-green-100 text-green-700" : r.status === "failed" ? "bg-red-100 text-red-700" : r.status === "cancelled" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-700"}`}>{{ done: "已完成", failed: "失败", cancelled: "已取消", running: `进行中 ${r.progress ?? 0}%`, queued: "排队中" }[r.status] || r.status}</span>
                    {r.stale && <span className="text-gray-500">已过期(有新版简历)</span>}
                    {(r.status === "running" || r.status === "queued") && <button type="button" onClick={() => cancelMatch(r)} className="ml-auto text-red-600 font-bold">取消</button>}
                    {r.error && <span className="text-red-600">{r.error}</span>}
                  </div>
                  {r.status === "done" && Array.isArray(r.results) && (
                    <div className="mt-2 space-y-1">
                      {r.results.map((x) => (
                        <div key={x.jobId} className="flex items-center gap-2">
                          <KindTag kind={x.kind} />
                          <span className="flex-1 truncate">{x.title}</span>
                          {x.excluded ? <span className="text-gray-500">硬筛不通过</span> : x.error ? <span className="text-red-600">评估失败</span> : <span><b>{x.scoreShown}</b><span className="text-gray-500"> / 原始 {x.scoreRaw} · {x.classification}</span></span>}
                        </div>
                      ))}
                      {r.costs && <p className="text-[10px] text-gray-400 mt-1">{r.costs.jobs} 岗位 · Jev 缓存 {r.costs.jevCached} · 评估耗时 {Math.round((r.costs.latencyMs || 0) / 1000)}s</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {ivFor && <InterviewModal app={ivFor} session={session} onClose={() => setIvFor(null)} onDone={async () => { setIvFor(null); await load(); onChanged?.(); }} />}
      {mergeOpen && a && <MergeModal applicant={a} onClose={() => setMergeOpen(false)} onDone={async () => { setMergeOpen(false); await load(); onChanged?.(); }} />}
    </Modal>
  );
}

// 安排现场面试:创建 Interview(线下 / 专场地点)并把投递推进到「现场面试」
export function InterviewModal({ app, apps, session, onClose, onDone }) {
  const list = apps || [app];
  const [form, setForm] = useState({ scheduledAt: "", location: session?.location || "", interviewer: "", round: "现场面试", notes: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!form.scheduledAt) return toast("请选择面试时间", "error");
    setBusy(true);
    try {
      const body = { scheduledAt: new Date(form.scheduledAt).toISOString(), location: form.location || null, interviewer: form.interviewer || null, round: form.round || null, notes: form.notes || null };
      if (apps) { const r = await resources.campus.bulkInterview({ ids: apps.map((x) => x.id), ...body }); toast(`已安排 ${r.created} 场现场面试${r.skipped ? `,跳过 ${r.skipped} 条内推投递` : ""}`, "success"); }
      else { await resources.campus.scheduleInterview(app.id, body); toast("已安排现场面试", "success"); }
      onDone?.();
    } catch (err) { toast(errMsg(err, "安排失败"), "error"); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={submit} className="p-6 space-y-4">
        <div><h3 className="text-lg font-bold text-navy-700">安排现场面试</h3><p className="text-xs text-gray-600 mt-0.5">{apps ? `${list.length} 条投递` : app.job?.title} · 将创建面试记录(线下)并把投递推进到「现场面试」</p></div>
        <Input label="面试时间" required type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
        <Input label="地点" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={session?.location || "专场现场"} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="面试官" value={form.interviewer} onChange={(e) => setForm({ ...form, interviewer: e.target.value })} />
          <Input label="轮次" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} />
        </div>
        <Input label="备注" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={onClose}>取消</Button><Button type="submit" disabled={busy} icon={<I name="calendar-plus" size={15} />}>{busy ? "安排中…" : "安排"}</Button></div>
      </form>
    </Modal>
  );
}

// 合并电脑端上传:搜索公开上传进来的候选人(按姓名 / 手机),把其简历并入学生作为新版本
function MergeModal({ applicant, onClose, onDone }) {
  const [q, setQ] = useState(applicant.phone || applicant.name || "");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => { resources.candidates.list({ q: q.trim() || undefined, take: 20 }).then((r) => setItems((r.items || []).filter((c) => c.id !== applicant.candidateId && c.attachment))).catch(() => setItems([])); }, 300);
    return () => clearTimeout(t);
  }, [q, applicant.candidateId]);
  async function merge(c) {
    if (!confirm(`把「${c.name}」(${c.source || "来源未知"})的简历并入本学生作为新版本?源候选人会标记「已合并到校招」并置为已淘汰。`)) return;
    setBusy(c.id);
    try { await resources.campus.merge(applicant.id, c.id); toast("已合并,简历解析中", "success"); onDone?.(); }
    catch (e) { toast(errMsg(e, "合并失败"), "error"); } finally { setBusy(null); }
  }
  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6 space-y-4">
        <div><h3 className="text-lg font-bold text-navy-700">合并电脑端上传</h3><p className="text-xs text-gray-600 mt-0.5">学生用电脑上传链接传的简历会进入候选人列表,在这里按姓名 / 手机找到它并并入本学生</p></div>
        <Input icon={<I name="search" size={16} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="姓名 / 手机 / 邮箱" />
        <div className="max-h-72 overflow-y-auto space-y-2">
          {items.length === 0 && <p className="text-xs text-gray-500 text-center py-6">没有带简历附件的匹配候选人</p>}
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-lightPrimary/50">
              <Avatar name={c.name} size={32} />
              <div className="flex-1 min-w-0"><p className="text-sm font-bold text-navy-700 truncate">{c.name}</p><p className="text-[11px] text-gray-500 truncate">{[c.phone, c.email, c.source].filter(Boolean).join(" · ")}</p></div>
              <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => merge(c)}>{busy === c.id ? "合并中…" : "并入"}</Button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
