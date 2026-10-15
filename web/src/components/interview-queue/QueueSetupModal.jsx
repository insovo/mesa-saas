import { useEffect, useState } from "react";
import { Button, Input, LoadingBlock, Modal, toast } from "../Primitives.jsx";
import { queueApi, queueErrorMessage, QUEUE_ROLE_LABELS } from "../../lib/interviewQueueApi.js";

const newStation = (role, n) => ({ id: crypto.randomUUID(), role, name: `${role === "professional" ? "专业" : "文化"}面试官 ${n}` });

export default function QueueSetupModal({ session, onClose, onSaved }) {
  const [previous, setPrevious] = useState(null);
  const [setup, setSetup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    queueApi.ensure(session.id).then(() => queueApi.data(session.id)).then((data) => {
      if (!active) return;
      const original = data.queue.setup;
      setPrevious(original);
      setSetup(original.stations.length ? original : { cultureOnsite: original.cultureOnsite, stations: [newStation("professional", 1), ...(original.cultureOnsite ? [newStation("culture", 1)] : [])] });
    }).catch((err) => { if (active) setError(queueErrorMessage(err)); });
    return () => { active = false; };
  }, [session.id]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await queueApi.setup(session.id, setup, previous); onSaved(); onClose(); toast("面试官与流程设置已保存，请由 HR 分配排队人员并重新下载海报", "success"); }
    catch (err) { setError(queueErrorMessage(err)); } finally { setBusy(false); }
  }
  return <Modal open onClose={() => !busy && onClose()} maxWidth="max-w-2xl"><form onSubmit={save} className="p-6 space-y-5">
    <h2 className="text-xl font-bold">面试官与流程设置</h2><p className="text-sm text-gray-600">{session.name} · HR 手动分配。每个席位独立排队、计时；同一人当前只能分配给一个席位。</p>
    {error && <p className="text-sm text-red-500">{error}</p>}
    {!setup ? <LoadingBlock height="h-32" /> : <>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={setup.cultureOnsite} disabled={busy} onChange={(e) => setSetup({ ...setup, cultureOnsite: e.target.checked })} />现场安排文化面试官</label>
      {!setup.cultureOnsite && <p className="text-sm rounded-xl bg-amber-50 text-amber-800 p-3">专业面通过后进入待线上文化面阶段，海报与学生页面提示等待 HR 联系。后续文化面、定薪等流程线上联系；不会自动跳过文化面。可不配置文化席位，线上安排好后再添加。</p>}
      {["professional", "culture"].map((role) => <section key={role} className="space-y-3"><div className="flex justify-between items-center"><h3 className="font-bold">{QUEUE_ROLE_LABELS[role]} · {setup.stations.filter((s) => s.role === role).length} 位</h3><Button type="button" size="sm" variant="secondary" disabled={busy || setup.stations.length >= 40} onClick={() => setSetup({ ...setup, stations: [...setup.stations, newStation(role, setup.stations.filter((s) => s.role === role).length + 1)] })}>添加{QUEUE_ROLE_LABELS[role]}</Button></div>{setup.stations.filter((s) => s.role === role).map((station) => <div key={station.id} className="flex gap-2 items-center"><Input label="席位名称／面试官姓名" aria-label={`${role}席位名称`} value={station.name} maxLength={40} required disabled={busy} containerClassName="flex-1" onChange={(e) => setSetup({ ...setup, stations: setup.stations.map((s) => s.id === station.id ? { ...s, name: e.target.value } : s) })} /><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setSetup({ ...setup, stations: setup.stations.filter((s) => s.id !== station.id) })}>移除</Button></div>)}</section>)}
      <p className="text-xs text-gray-600">保存后，专业／文化面试官按席位链接查看自己分配到的人员。已有人员会等待 HR 分配；移除席位前需先转派其排队人员。</p>
      <div className="flex justify-end gap-3"><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy}>{busy ? "保存中…" : "保存设置"}</Button></div>
    </>}
  </form></Modal>;
}
