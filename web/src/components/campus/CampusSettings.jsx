// 校招设置(admin 可改;campus.manage 只读):匹配并发 / 学生会话 / 验证码限流 / 联系方式提示语 / 电脑上传兜底
import { useEffect, useState } from "react";
import { resources } from "../../lib/api.js";
import { Card, Button, Input, I, LoadingBlock, toast } from "../Primitives.jsx";
import { Field, Toggle, errMsg } from "./ui.jsx";

export default function CampusSettings({ isAdmin }) {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { resources.campus.getSettings().then(setS).catch((e) => toast(errMsg(e), "error")); }, []);
  if (!s) return <LoadingBlock height="h-40" />;
  const hints = s.contactHints || [];
  async function save() {
    setSaving(true);
    try {
      const saved = await resources.campus.saveSettings({ matchConcurrency: Number(s.matchConcurrency), authJwtTtl: s.authJwtTtl, contactHints: hints.filter((h) => h.trim()), pcUploadEnabled: !!s.pcUploadEnabled });
      setS(saved); toast("已保存", "success");
    } catch (e) { toast(errMsg(e), "error"); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="p-5 space-y-5">
        <div><h3 className="text-base font-bold text-navy-700">任务与会话</h3><p className="text-xs text-gray-600">抽取 / 匹配任务共用一个进程内并发闸;当前 运行 {s.gate?.running ?? 0} · 排队 {s.gate?.queued ?? 0}</p></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="抽取 / 匹配并发数" type="number" min="1" max="20" value={s.matchConcurrency} disabled={!isAdmin} onChange={(e) => setS({ ...s, matchConcurrency: e.target.value })} />
          <Input label="学生匿名会话有效期" value={s.authJwtTtl} disabled={!isAdmin} onChange={(e) => setS({ ...s, authJwtTtl: e.target.value })} placeholder="30d / 7d" />
          <Field label="学生端电脑上传兜底" className="flex flex-col"><div className="h-12 flex items-center ml-3"><Toggle checked={!!s.pcUploadEnabled} disabled={!isAdmin} onChange={(v) => setS({ ...s, pcUploadEnabled: v })} label={s.pcUploadEnabled ? "开启" : "关闭"} /></div></Field>
        </div>
      </Card>
      <Card className="p-5 space-y-4">
        <div><h3 className="text-base font-bold text-navy-700">联系方式确认页提示语</h3><p className="text-xs text-gray-600">学生上传简历后在确认页看到的提示,最多 5 条</p></div>
        <div className="space-y-2">
          {hints.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={h} disabled={!isAdmin} onChange={(e) => setS({ ...s, contactHints: hints.map((x, j) => (j === i ? e.target.value : x)) })} containerClassName="flex-1" />
              {isAdmin && <button type="button" onClick={() => setS({ ...s, contactHints: hints.filter((_, j) => j !== i) })} className="p-2 text-gray-400 hover:text-red-500"><I name="x" size={14} /></button>}
            </div>
          ))}
          {isAdmin && hints.length < 5 && <Button size="sm" variant="ghost" icon={<I name="plus" size={14} />} onClick={() => setS({ ...s, contactHints: [...hints, ""] })}>添加一条</Button>}
        </div>
      </Card>
      {isAdmin && <div className="flex justify-end"><Button disabled={saving} onClick={save}>{saving ? "保存中…" : "保存设置"}</Button></div>}
    </div>
  );
}
