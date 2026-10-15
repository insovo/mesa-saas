import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMe } from "../lib/authContext.jsx";
import { Button, Card, Empty, I, LoadingBlock, Modal, toast } from "../components/Primitives.jsx";
import QueueBoard from "../components/interview-queue/QueueBoard.jsx";
import QueueSetupModal from "../components/interview-queue/QueueSetupModal.jsx";
import QueueShareModal from "../components/interview-queue/QueueShareModal.jsx";
import { queueApi, QUEUE_ROLE_LABELS, queueErrorMessage } from "../lib/interviewQueueApi.js";

export default function InterviewQueue({ screen = false }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const canWrite = me?.role !== "VIEWER";
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState("");
  const [setupSession, setSetupSession] = useState(null);
  const [share, setShare] = useState(null);
  const [stopping, setStopping] = useState(null);
  const [busy, setBusy] = useState(false);
  const read = useMemo(() => (revision) => queueApi.data(sessionId, revision), [sessionId]);
  const write = useMemo(() => (body) => queueApi.action(sessionId, body), [sessionId]);
  const loadJob = useMemo(() => (jobId) => queueApi.job(sessionId, jobId), [sessionId]);
  const load = useCallback(async () => {
    try { const result = await queueApi.list(); setSessions(result.sessions); setError(""); }
    catch (err) { setError(queueErrorMessage(err)); }
  }, []);
  useEffect(() => { if (!sessionId) load(); }, [sessionId, load]);
  async function enter(session, largeScreen = false) {
    setBusy(true);
    try {
      if (!session.queueId) await queueApi.ensure(session.id);
      navigate(largeScreen ? `/interview-queue/screen/${session.id}` : `/interviews/${session.id}`);
    } catch (err) { toast(queueErrorMessage(err), "error"); } finally { setBusy(false); }
  }
  async function stop() {
    setBusy(true);
    try { await queueApi.stop(stopping.session.id, stopping.kind); setStopping(null); await load(); toast("已停止分享，原链接立即失效", "success"); }
    catch (err) { toast(queueErrorMessage(err), "error"); } finally { setBusy(false); }
  }
  if (sessionId) return <div>{!screen && <Link to="/interviews" className="inline-flex items-center gap-2 text-sm text-brand mb-5"><I name="arrow-left" size={16} />返回大学专场</Link>}<QueueBoard key={sessionId} read={read} write={write} loadJob={loadJob} canWrite={canWrite} screen={screen} /></div>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-navy-700">大学专场面试排队</h1><p className="text-sm text-gray-600 mt-2">关联校招创建的全部大学专场 · 专业面试 → 文化面试 → 定薪／待定</p></div><div className="flex gap-2"><Button as={Link} to="/interviews/schedule" size="sm" variant="ghost">面试日程</Button><Button size="sm" variant="secondary" onClick={load}>刷新</Button></div></div>
    {error && <p className="text-sm text-red-500">{error}</p>}
    {!sessions ? <LoadingBlock height="h-60" /> : sessions.length === 0 ? <Card><Empty title="暂无大学专场" desc="请先在校招页面创建大学专场" /></Card> : <div className="grid lg:grid-cols-2 gap-5">{sessions.map((session) => <Card key={session.id} className="p-5 gap-5">
      <div className="flex justify-between gap-3"><div className="min-w-0"><div className="flex gap-2 items-center"><I name="graduation-cap" size={22} className="text-brand shrink-0" /><h2 className="text-xl font-bold break-words">{session.name}</h2></div><p className="text-sm text-gray-600 mt-2">{session.school || session.name} · {session.count} 位登记人员</p></div><span className={`rounded-lg self-start px-2 py-1 text-xs whitespace-nowrap ${session.status === "live" ? "bg-green-50 text-green-700" : "bg-lightPrimary text-gray-700"}`}>{{ live: "上线中", draft: "草稿", closed: "已结束" }[session.status] || session.status}</span></div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || (!canWrite && !session.queueId)} onClick={() => enter(session)}>{session.queueId ? "进入面试排队" : "创建面试排队"}</Button><Button variant="secondary" disabled={busy || (!canWrite && !session.queueId)} onClick={() => enter(session, true)}>大屏展示</Button>{canWrite && <><Button variant="secondary" onClick={() => setSetupSession(session)}>面试官与流程设置</Button><Button variant="secondary" onClick={() => setShare({ session, kind: "registration" })}>排队登记 · 二维码／链接</Button></>}</div>
      {canWrite && <div className="space-y-3 border-t border-gray-100 pt-4">{["professional", "culture", "hr"].map((kind) => { const link = session.links.find((item) => item.kind === kind); const active = link?.active && (!link.expiresAt || new Date(link.expiresAt) > new Date()); return <div key={kind} className="flex flex-wrap justify-between items-center gap-2"><div className="flex gap-2 items-center"><span className={`w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-gray-300"}`} /><span className="text-sm text-gray-700">{QUEUE_ROLE_LABELS[kind]}</span></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setShare({ session, kind })}>分享给{QUEUE_ROLE_LABELS[kind]}</Button><Button size="sm" variant="ghost" disabled={!active || busy} onClick={() => setStopping({ session, kind })}>停止分享</Button></div></div>; })}</div>}
    </Card>)}</div>}
    {setupSession && <QueueSetupModal session={setupSession} onClose={() => setSetupSession(null)} onSaved={load} />}
    {share && <QueueShareModal key={`${share.session.id}-${share.kind}`} session={share.session} kind={share.kind} existing={share.session.links.find((link) => link.kind === share.kind)} onClose={() => setShare(null)} onSaved={load} />}
    {stopping && <Modal open onClose={() => !busy && setStopping(null)} maxWidth="max-w-md"><div className="p-6 space-y-4"><h2 className="font-bold text-xl">停止分享给{QUEUE_ROLE_LABELS[stopping.kind]}</h2><p className="text-sm text-gray-600">{stopping.session.name} 的原链接和已打开的页面将立即失效。</p><div className="flex justify-end gap-3"><Button variant="ghost" disabled={busy} onClick={() => setStopping(null)}>取消</Button><Button variant="danger" disabled={busy} onClick={stop}>确认停止分享</Button></div></div></Modal>}
  </div>;
}
