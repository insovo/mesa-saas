import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Input, LoadingBlock, toast } from "../components/Primitives.jsx";
import QueueBoard from "../components/interview-queue/QueueBoard.jsx";
import RegistrationJobPicker from "../components/interview-queue/RegistrationJobPicker.jsx";
import { readQueueRegistrationDraft, saveQueueRegistrationDraft, clearQueueRegistrationDraft } from "../lib/queueRegistrationDraft.js";
import { publicQueueApi, studentQueueToken, QUEUE_ROLE_LABELS, QUEUE_STAGE_LABELS, queueResult, queueErrorMessage } from "../lib/interviewQueueApi.js";

function PublicShell({ children }) {
  return <main className="min-h-screen bg-gradient-to-b from-lightPrimary to-white text-navy-700 px-4 py-6 md:py-10"><div className="max-w-[1500px] mx-auto"><div className="flex flex-wrap justify-between items-center gap-3 mb-6"><Link to="/interview-queue/mine" className="font-bold text-brand">MESA · 面试排队</Link><Link className="text-sm text-brand" to="/interview-queue/mine">找回／查看我的记录</Link></div>{children}</div></main>;
}

export default function PublicInterviewQueue({ mode }) {
  const { token } = useParams();
  return <PublicShell>{mode === "share" ? <SharePage /> : mode === "register" ? <RegisterPage key={token} /> : <MinePage />}</PublicShell>;
}

function SharePage() {
  const { token: linkToken } = useParams();
  const [info, setInfo] = useState(null);
  const [stationId, setStationId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState(false);
  const cacheKey = `mesa.queue.share.${linkToken}${stationId ? `.${stationId}` : ""}`;
  const stations = info?.setup?.stations || [];
  const requiresStation = info?.setup?.routingEnabled && ["professional", "culture"].includes(info.kind);
  const validStation = !requiresStation || stations.some((s) => s.id === stationId);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = { professional: "专业面试", culture: "文化面试", hr: "定薪" }[info?.kind] || "面试排队";
    return () => { document.title = previousTitle; };
  }, [info?.kind]);
  useEffect(() => {
    let active = true;
    setInfo(null); setToken(""); setFatal(false); setError("");
    publicQueueApi.link(linkToken).then((result) => {
      if (!active) return;
      if (result.kind === "registration") { setError("请打开排队登记链接"); setFatal(true); return; }
      setInfo(result);
      const requested = new URLSearchParams(window.location.search).get("station");
      const seats = result.setup?.stations || [];
      setStationId(seats.some((s) => s.id === requested) ? requested : seats.length === 1 ? seats[0].id : "");
    }).catch((err) => { if (active) { setError(queueErrorMessage(err)); setFatal(true); } });
    return () => { active = false; };
  }, [linkToken]);
  useEffect(() => {
    if (!info || !validStation) return;
    let active = true;
    const saved = sessionStorage.getItem(cacheKey);
    if (saved) setToken(saved);
    else if (!info.requireKey) {
      setBusy(true);
      publicQueueApi.open(linkToken, undefined, stationId || undefined).then((session) => { if (active) { setToken(session.token); sessionStorage.setItem(cacheKey, session.token); setError(""); } }).catch((err) => { if (active) { setError(queueErrorMessage(err)); if (err.response?.status === 410) setFatal(true); } }).finally(() => { if (active) setBusy(false); });
    }
    return () => { active = false; };
  }, [info, validStation, stationId, linkToken, cacheKey]);
  const read = useMemo(() => (revision) => publicQueueApi.data(token, revision), [token]);
  const write = useMemo(() => (body) => publicQueueApi.action(token, body), [token]);
  const loadJob = useMemo(() => (jobId) => publicQueueApi.shareJob(token, jobId), [token]);
  const onFatal = useCallback((err) => {
    setToken(""); sessionStorage.removeItem(cacheKey); setError(queueErrorMessage(err));
    if ([403, 410].includes(err.response?.status)) setFatal(true);
  }, [cacheKey]);
  async function open(event) {
    event.preventDefault(); setBusy(true);
    try { const session = await publicQueueApi.open(linkToken, key, stationId || undefined); setToken(session.token); setError(""); sessionStorage.setItem(cacheKey, session.token); }
    catch (err) { setError(queueErrorMessage(err)); if (err.response?.status === 410) setFatal(true); }
    finally { setBusy(false); }
  }
  if (token && info && !fatal) return <QueueBoard key={token} read={read} write={write} loadJob={loadJob} role={info.kind} onFatal={onFatal} />;
  if (!info && !error) return <LoadingBlock height="h-60" />;
  return <Card className="p-6 max-w-md mx-auto gap-4"><h1 className="font-bold text-xl">{info?.session.name || "面试排队分享"}</h1>{info && <p className="text-sm text-gray-600">{QUEUE_ROLE_LABELS[info.kind]} · 无需登录</p>}{error && <p className="text-sm text-red-500">{error}</p>}{info && !fatal && <form onSubmit={open} className="space-y-4">{requiresStation && <label className="block text-sm font-bold">选择你的面试官席位<select aria-label="面试官席位" required className="block mt-2 w-full border border-gray-200 rounded-xl p-3" value={stationId} onChange={(e) => { setStationId(e.target.value); setToken(""); setError(""); }}><option value="">请选择 HR 指定的席位</option>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><span className="block mt-2 text-xs text-gray-600 font-normal">{stations.length ? "仅查看与操作 HR 分配给该席位的候选人；请使用自己的席位。" : "尚未配置此阶段的面试官，请联系 HR 安排。"}</span></label>}{info.requireKey && <Input type="password" label="访问密钥" aria-label="访问密钥" value={key} autoComplete="off" required onChange={(e) => setKey(e.target.value)} />}<Button type="submit" disabled={busy || !validStation} className="w-full">{busy ? "验证中…" : "进入面试排队"}</Button></form>}</Card>;
}

function RegisterPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [form, setForm] = useState(() => readQueueRegistrationDraft(token));
  useEffect(() => {
    let active = true;
    publicQueueApi.link(token).then((result) => { if (active) { if (result.kind !== "registration") { setError("此链接用于面试官，请打开排队登记链接"); return; } setInfo(result); setForm((current) => ({ ...current, school: current.school || result.session.school || result.session.name })); } }).catch((err) => { if (active) setError(queueErrorMessage(err)); });
    return () => { active = false; };
  }, [token]);
  useEffect(() => { if (info) saveQueueRegistrationDraft(token, form); }, [token, form, info]);
  const onsiteJobs = (info?.jobs || []).filter((job) => job.kind === "onsite");
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (!onsiteJobs.some((job) => job.title === form.jobDirection)) { setError("请选择当前标记为现场面试的校招岗位"); return; }
    setBusy(true); setError("");
    try { const result = await publicQueueApi.register(token, { ...form, gradYear: Number(form.gradYear) }); studentQueueToken.set(result.token); clearQueueRegistrationDraft(token); navigate("/interview-queue/mine", { replace: true }); toast("登记成功，可随时回来查看阶段和结果", "success"); }
    catch (err) { setError(queueErrorMessage(err)); } finally { setBusy(false); }
  }
  if (!info) return error ? <Card className="max-w-lg mx-auto p-6 text-red-500">{error}<Link to="/interview-queue/mine" className="text-brand mt-4">找回已有记录</Link></Card> : <LoadingBlock height="h-60" />;
  return <Card className="max-w-2xl mx-auto p-5 md:p-7 gap-5"><div><h1 className="text-2xl font-bold">排队登记</h1><p className="text-sm text-gray-600 mt-2">{info.session.name} · 登记后可退出，后续用邮箱找回记录</p></div>{info.setup?.cultureOnsite === false && <p className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">本专场无现场文化面试。专业面试通过后，请等待 HR 联系安排线上文化面试及后续流程。</p>}<form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
    {[["name", "姓名"], ["school", "学校"], ["major", "专业"]].map(([key, label]) => <Input key={key} id={`queue-${key}`} label={label} required value={form[key]} maxLength={key === "name" ? 100 : 200} onChange={(e) => change(key, e.target.value)} />)}
    <label className="text-sm font-bold ml-3">学历（当前在读）<span className="text-red-500"> *</span><select required aria-label="学历（当前在读）" className="block w-full border border-gray-200 rounded-xl p-3 mt-2 font-normal" value={form.degree} onChange={(e) => change("degree", e.target.value)}><option>本科</option><option>硕士</option><option>博士</option><option>专科</option></select></label>
    <Input id="queue-gradYear" label="毕业时间" type="number" required min={2000} max={2100} value={form.gradYear} onChange={(e) => change("gradYear", e.target.value)} />
    <div><Input id="queue-languageAbility" label="语言能力" required list="queue-language-options" maxLength={200} value={form.languageAbility} onChange={(e) => change("languageAbility", e.target.value)} placeholder="可选择或自行填写" /><datalist id="queue-language-options">{["CET-4", "CET-6", "雅思", "托福"].map((language) => <option key={language} value={language} />)}</datalist><div className="flex flex-wrap gap-1 mt-2">{["CET-4", "CET-6", "雅思", "托福"].map((language) => <button key={language} type="button" className="text-xs px-2 py-1 rounded-lg bg-lightPrimary text-brand" onClick={() => change("languageAbility", language)}>{language}</button>)}</div></div>
    <Input id="queue-phone" label="联系电话" type="tel" required maxLength={30} value={form.phone} onChange={(e) => change("phone", e.target.value)} />
    <div><label htmlFor="queue-jobDirection" className="text-sm font-bold ml-3 block mb-2">岗位方向<span className="text-red-500"> *</span></label><select id="queue-jobDirection" aria-label="岗位方向" required disabled={busy} className="w-full border border-gray-200 rounded-xl p-3 bg-white text-sm" value={form.jobDirection} onChange={(e) => change("jobDirection", e.target.value)}><option value="" disabled>请选择现场面试岗位</option>{form.jobDirection && !onsiteJobs.some((job) => job.title === form.jobDirection) && <option value={form.jobDirection} disabled>{form.jobDirection}（请重新选择）</option>}{onsiteJobs.map((job) => <option key={job.id} value={job.title}>{job.title}</option>)}</select><button type="button" disabled={busy} className="text-sm text-brand font-medium mt-2" onClick={() => setPickerOpen(true)}>浏览校招岗位与 JD →</button></div>
    <Input id="queue-email" label="邮箱" type="email" required maxLength={254} value={form.email} onChange={(e) => change("email", e.target.value)} containerClassName="sm:col-span-2" />
    <p className="text-xs text-gray-600 sm:col-span-2">邮箱用于清理缓存、更换设备后找回记录，以及查看当前面试阶段和结果。</p>{error && <p className="text-sm text-red-500 sm:col-span-2">{error}</p>}<Button type="submit" disabled={busy} className="sm:col-span-2">{busy ? "登记中…" : "提交排队登记"}</Button>
  </form>{pickerOpen && <RegistrationJobPicker token={token} jobs={info.jobs} selectedTitle={form.jobDirection} onClose={() => setPickerOpen(false)} onSelect={(title) => { change("jobDirection", title); setPickerOpen(false); }} />}</Card>;
}

function MinePage() {
  const [token, setToken] = useState(studentQueueToken.get);
  const [entries, setEntries] = useState(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [recovering, setRecovering] = useState(!token);
  useEffect(() => {
    if (!token) return;
    let active = true; let polling = false;
    async function load() {
      if (polling) return; polling = true;
      try { const result = await publicQueueApi.mine(token); if (active) { setEntries(result.entries); setError(""); } }
      catch (err) { if (active) { setError(queueErrorMessage(err)); if (err.response?.status === 401) { studentQueueToken.clear(); setToken(""); setRecovering(true); } } }
      finally { polling = false; }
    }
    load(); const timer = setInterval(load, 2000); return () => { active = false; clearInterval(timer); };
  }, [token]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown((value) => value - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function sendCode() {
    setBusy(true); setError("");
    try { const result = await publicQueueApi.sendCode(email); setMessage(result.message); setCooldown(60); }
    catch (err) { setError(queueErrorMessage(err)); } finally { setBusy(false); }
  }
  async function recover(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await publicQueueApi.recover(email, code); studentQueueToken.set(result.token); setToken(result.token); setRecovering(false); setMessage(""); }
    catch (err) { setError(queueErrorMessage(err)); } finally { setBusy(false); }
  }
  return <div className="max-w-2xl mx-auto space-y-5"><div className="flex flex-wrap justify-between items-center gap-3"><h1 className="font-bold text-2xl">我的面试排队记录</h1>{token && <Button size="sm" variant="secondary" onClick={() => setRecovering(!recovering)}>{recovering ? "返回记录" : "用邮箱找回其他记录"}</Button>}</div>
    {error && <p className="text-sm text-red-500">{error}</p>}
    {recovering ? <Card className="p-6 gap-4"><h2 className="font-bold">邮箱找回记录</h2><p className="text-sm text-gray-600">输入登记时的邮箱，验证后可查看该邮箱的所有大学专场记录。</p><form onSubmit={recover} className="space-y-4"><Input id="recover-email" label="邮箱" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} /><Button type="button" variant="secondary" disabled={busy || !email || cooldown > 0} onClick={sendCode}>{cooldown > 0 ? `${cooldown} 秒后重发` : "发送验证码"}</Button><Input id="recover-code" label="邮箱验证码" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />{message && <p className="text-xs text-gray-600">{message}</p>}<Button type="submit" disabled={busy} className="w-full">验证并找回</Button></form></Card> : !entries ? <LoadingBlock height="h-60" /> : entries.length === 0 ? <Card className="p-6">暂无登记记录，请扫描现场的排队登记二维码。</Card> : entries.map((entry) => <Card key={entry.id} className="p-6 gap-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm text-gray-600">{entry.session.name}</p><h2 className="font-bold text-2xl mt-1">{entry.name}</h2></div><span className="rounded-xl px-4 py-2 bg-lightPrimary text-brand font-bold self-start">{QUEUE_STAGE_LABELS[entry.stage]}</span></div><p className="text-sm">{entry.school} · {entry.major} · {entry.degree} · {entry.gradYear} 届</p><p className="text-sm">岗位方向：{entry.jobDirection}</p>{entry.stage === "culture" && entry.cultureOnsite === false ? <p className="text-lg text-brand font-bold">{entry.professionalResult === "passed" ? "专业面试已通过" : "已进入文化阶段"}，请等待 HR 联系安排线上文化面试及后续流程。</p> : ["professional", "culture"].includes(entry.stage) && <p className="text-lg text-brand font-bold">{entry.routingEnabled && !entry.stationName ? "等待 HR 分配面试官，请留意现场安排" : (entry.stage === "professional" ? entry.professionalStartedAt : entry.cultureStartedAt) ? `面试计时中${entry.stationName ? ` · ${entry.stationName}` : ""}` : `${entry.stationName ? `${entry.stationName} · ` : ""}前面还有 ${entry.ahead} 人，请留意叫号`}</p>}<div className="grid sm:grid-cols-3 gap-3">{[["professionalResult", "专业面试"], ["cultureResult", "文化面试"], ["salaryStatus", "定薪"]].map(([key, label]) => <div key={key} className="bg-lightPrimary rounded-xl p-3"><p className="text-xs text-gray-600">{label}</p><p className="font-bold mt-1">{queueResult(entry[key])}</p></div>)}</div>{entry.stage === "salary" && <p className="text-sm">基础薪资：{entry.salaryBase} · 基数：{entry.salaryFactor}{entry.salaryStatus === "accepted" ? " · 已标记接受" : " · 请等待 HR 沟通"}</p>}<p className="text-xs text-gray-600">实时更新，可退出页面；清理缓存或换设备后，用登记邮箱找回。</p></Card>)}
  </div>;
}
