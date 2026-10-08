// 专场新建 / 编辑表单
import { useEffect, useState } from "react";
import { resources } from "../../lib/api.js";
import { Button, Input, Modal, I, toast } from "../Primitives.jsx";
import { Field, Toggle, errMsg } from "./ui.jsx";

const EMPTY = { name: "", slug: "", school: "", location: "", startsAt: "", endsAt: "", heroTitle: "", heroSubtitle: "", maxApplyJobs: 3, maxResumeUploads: 3, scoreFloor: 60, matchEnabled: true, showSalaryOnsite: true, showSalaryReferral: false };
const toLocal = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function SessionFormModal({ open, onClose, session, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(session ? {
      ...EMPTY, ...session,
      school: session.school ?? "", location: session.location ?? "",
      heroTitle: session.heroTitle ?? "", heroSubtitle: session.heroSubtitle ?? "",
      startsAt: toLocal(session.startsAt), endsAt: toLocal(session.endsAt), slug: session.slug || "",
    } : EMPTY);
  }, [open, session]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast("请填写专场名称", "error");
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(), school: form.school.trim() || null, location: form.location.trim() || null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null, endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        heroTitle: form.heroTitle.trim() || null, heroSubtitle: form.heroSubtitle.trim() || null,
        maxApplyJobs: Number(form.maxApplyJobs) || 3, maxResumeUploads: Number(form.maxResumeUploads) || 3, scoreFloor: Number(form.scoreFloor) ?? 60,
        matchEnabled: !!form.matchEnabled, showSalaryOnsite: !!form.showSalaryOnsite, showSalaryReferral: !!form.showSalaryReferral,
      };
      if (form.slug.trim()) body.slug = form.slug.trim();
      const saved = session ? await resources.campus.updateSession(session.id, body) : await resources.campus.createSession(body);
      toast(session ? "已保存" : "专场已创建", "success");
      onSaved?.(saved); onClose();
    } catch (err) { toast(errMsg(err, "保存失败"), "error"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div><h3 className="text-lg font-bold text-navy-700">{session ? "编辑专场" : "新建专场"}</h3><p className="text-xs text-gray-600 mt-0.5">学生端首页文案与投递 / 上传 / 评分规则都在这里配置</p></div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-lightPrimary text-gray-500"><I name="x" size={16} /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="专场名称" required value={form.name} onChange={set("name")} placeholder="10 月 8 日 南京理工大学专场" containerClassName="md:col-span-2" />
          <Input label="学校" value={form.school} onChange={set("school")} placeholder="南京理工大学" />
          <Input label="现场地点" value={form.location} onChange={set("location")} placeholder="学生活动中心 2 楼" />
          <Input label="开始时间" type="datetime-local" value={form.startsAt} onChange={set("startsAt")} />
          <Input label="结束时间" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} />
          <Input label="学生端 URL slug" value={form.slug} onChange={set("slug")} placeholder="留空自动生成,仅 a-z 0-9 -" containerClassName="md:col-span-2" />
          <Input label="首页标题" value={form.heroTitle} onChange={set("heroTitle")} placeholder="2027 届校园招聘" />
          <Input label="首页副标题" value={form.heroSubtitle} onChange={set("heroSubtitle")} placeholder="南京理工大学专场 · 现场面试 + 内推" />
          <Input label="每人最多投递岗位数" type="number" min="1" max="20" value={form.maxApplyJobs} onChange={set("maxApplyJobs")} />
          <Input label="每人最多上传简历次数" type="number" min="1" max="20" value={form.maxResumeUploads} onChange={set("maxResumeUploads")} />
          <Input label="学生端匹配分展示下限" type="number" min="0" max="100" value={form.scoreFloor} onChange={set("scoreFloor")} />
        </div>
        <Field label="开关">
          <div className="flex items-center gap-6 flex-wrap ml-3">
            <Toggle checked={form.matchEnabled} onChange={(v) => setForm({ ...form, matchEnabled: v })} label="开放智能匹配" />
            <Toggle checked={form.showSalaryOnsite} onChange={(v) => setForm({ ...form, showSalaryOnsite: v })} label="现场面试岗位展示薪资" />
            <Toggle checked={form.showSalaryReferral} onChange={(v) => setForm({ ...form, showSalaryReferral: v })} label="内推岗位展示薪资" />
          </div>
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={saving}>{saving ? "保存中…" : session ? "保存" : "创建"}</Button>
        </div>
      </form>
    </Modal>
  );
}
