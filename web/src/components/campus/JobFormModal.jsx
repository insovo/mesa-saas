// 校招岗位 JD 新建 / 编辑:新建 = 创建 Job 并挂到当前专场;编辑 = 改 Job 本身(其它专场 / 社招共用时同步生效)
import { useCallback, useEffect, useState } from "react";
import { resources } from "../../lib/api.js";
import { Button, Input, Modal, I, toast } from "../Primitives.jsx";
import { Field, Select, Toggle, errMsg, fmtDate } from "./ui.jsx";

const EMPLOYMENTS = ["全职", "实习", "兼职", "合同制"];
const EMPTY = {
  title: "", dept: "", location: "", employment: "全职", salary: "", educationRequirement: "", languageRequirement: "", openings: 1, deadline: "",
  responsibilities: "", requirements: "", nice: "", benefits: "", description: "",
  kind: "onsite", matchEnabled: true,
};
const TA_CLS = "w-full p-3 rounded-xl border border-gray-200 bg-white/40 text-sm text-navy-700 outline-none placeholder:text-gray-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 transition-all resize-y leading-relaxed";

// 多行 → 数组:去掉行首的「- • * 1. 1、」等编号,空行丢弃
const lines = (s) => s.split("\n").map((x) => x.replace(/^\s*(?:[-•*]|\d+[.、)])\s*/, "").trim()).filter(Boolean);
const str = (v) => (v || "").trim() || null;

function TextArea({ label, hint, rows = 4, className = "", ...rest }) {
  return <Field label={label} hint={hint} className={className}><textarea aria-label={label} rows={rows} className={TA_CLS} {...rest} /></Field>;
}

export default function JobFormModal({ open, onClose, session, sessionJob, onSaved }) {
  const job = sessionJob?.job || null;
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const close = useCallback(() => { if (!saving && !extracting) onClose(); }, [saving, extracting, onClose]);
  useEffect(() => {
    if (!open) return;
    setForm(job ? {
      ...EMPTY,
      title: job.title || "", dept: job.dept || "", location: job.location || "", employment: job.employment || "全职", salary: job.salary || "",
      educationRequirement: job.educationRequirement || "", languageRequirement: job.languageRequirement || "", openings: job.openings ?? 1,
      deadline: job.deadline ? fmtDate(job.deadline) : "",
      responsibilities: (job.responsibilities || []).join("\n"), requirements: (job.requirements || []).join("\n"), nice: (job.nice || []).join("\n"), benefits: (job.benefits || []).join("\n"),
      description: job.description || "", kind: sessionJob.kind, matchEnabled: sessionJob.matchEnabled,
    } : EMPTY);
  }, [open, sessionJob]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function extractText() {
    if (!form.title.trim() || form.description.trim().length < 10) return toast("请填写岗位名称并粘贴至少 10 字 JD 原文", "error");
    setExtracting(true);
    try {
      const { job: draft } = await resources.jobs.parseText({ title: form.title.trim(), text: form.description.trim() });
      setForm((f) => ({ ...f, ...draft,
        employment: draft.employment || f.employment, openings: draft.openings ?? f.openings,
        responsibilities: draft.responsibilities.join("\n"), requirements: draft.requirements.join("\n"),
        nice: draft.nice.join("\n"), benefits: draft.benefits.join("\n"),
      }));
      toast("AI 已抽取字段,请核对后保存", "success");
    } catch (err) { toast(errMsg(err, "JD 抽取失败"), "error"); }
    finally { setExtracting(false); }
  }

  async function submit(e) {
    e.preventDefault();
    if (saving || extracting) return;
    if (!form.title.trim()) return toast("请填写岗位名称", "error");
    for (const [key, label, limit] of [["responsibilities", "岗位职责", 500], ["requirements", "任职要求", 500], ["nice", "加分项", 500], ["benefits", "福利待遇", 200]]) {
      const items = lines(form[key]);
      if (items.length > 20) return toast(`${label}最多填写 20 条,请整理后再保存`, "error");
      if (items.some((item) => item.length > limit)) return toast(`${label}每条最多 ${limit} 字`, "error");
    }
    const openings = Number(form.openings);
    if (!Number.isInteger(openings) || openings < 0 || openings > 999) return toast("招聘名额须为 0–999 的整数", "error");
    const body = {
      title: form.title.trim(), dept: str(form.dept), location: str(form.location), employment: str(form.employment), salary: str(form.salary),
      educationRequirement: str(form.educationRequirement), languageRequirement: str(form.languageRequirement),
      openings,
      deadline: form.deadline ? (job?.deadline && form.deadline === fmtDate(job.deadline) ? job.deadline : new Date(`${form.deadline}T23:59:59`).toISOString()) : null,
      responsibilities: lines(form.responsibilities), requirements: lines(form.requirements), nice: lines(form.nice), benefits: lines(form.benefits),
      description: str(form.description),
    };
    setSaving(true);
    try {
      const saved = sessionJob
        ? await resources.campus.updateSessionJobJd(session.id, sessionJob.id, body)
        : await resources.campus.createSessionJob(session.id, { ...body, kind: form.kind, matchEnabled: !!form.matchEnabled });
      toast(sessionJob ? (job.hasEvaluationModel ? "JD 已保存,内容变更后请重新生成评价模型" : "JD 已保存") : "岗位已创建并加入专场", "success");
      onSaved?.(saved); onClose();
    } catch (err) { toast(errMsg(err, "保存失败"), "error"); }
    finally { setSaving(false); }
  }

  const sharedElsewhere = job && (job.sessionsCount || 0) > 1;

  return (
    <Modal open={open} onClose={close} maxWidth="max-w-3xl">
      <form onSubmit={submit} className="p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-navy-700">{job ? "编辑岗位 JD" : "新建岗位 JD"}</h3>
            <p className="text-xs text-gray-600 mt-0.5">{job ? `岗位会同步到系统「岗位」页${sharedElsewhere ? `,且另有 ${job.sessionsCount - 1} 个专场共用该岗位,修改一并生效` : ""}` : `创建后自动加入「${session?.name || ""}」,并出现在系统「岗位」页`}</p>
          </div>
          <button type="button" aria-label="关闭岗位表单" disabled={saving} onClick={close} className="p-1.5 rounded-lg hover:bg-lightPrimary text-gray-500"><I name="x" size={16} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input id="campus-job-岗位名称" label="岗位名称" maxLength={200} required value={form.title} onChange={set("title")} placeholder="嵌入式软件工程师(2027 届)" containerClassName="md:col-span-2" />
          {!job && <div className="md:col-span-2 space-y-2">
            <TextArea maxLength={20000} label="粘贴 JD 原文" hint="填写岗位名称并粘贴原文,AI 可自动提取职责、要求和其他明确写出的信息" rows={8} value={form.description} onChange={set("description")} placeholder="粘贴完整岗位介绍、职责、要求、福利…" />
            <Button type="button" size="sm" disabled={extracting || saving || !form.title.trim() || form.description.trim().length < 10} onClick={extractText} icon={<I name={extracting ? "loader" : "sparkles"} size={14} className={extracting ? "animate-spin" : ""} />}>{extracting ? "AI 抽取中…" : "AI 提取岗位信息"}</Button>
            <p className="text-[11px] text-gray-500">抽取结果会回填下方字段,保存前可修改。</p>
          </div>}
          {!job && (
            <div className="md:col-span-2 flex items-end gap-6 flex-wrap">
              <Field label="岗位类型" className="min-w-[200px]">
                <Select aria-label="岗位类型" value={form.kind} onChange={set("kind")}><option value="onsite">现场面试</option><option value="referral">内推</option></Select>
              </Field>
              <div className="pb-3"><Toggle checked={form.matchEnabled} onChange={(v) => setForm({ ...form, matchEnabled: v })} label="参与智能匹配(需先生成评价模型)" /></div>
            </div>
          )}
          <Input id="campus-job-部门" label="部门" maxLength={100} value={form.dept} onChange={set("dept")} placeholder="海外研发中心" />
          <Input id="campus-job-工作地点" label="工作地点" maxLength={100} value={form.location} onChange={set("location")} placeholder="南京 / 上海" />
          <Field label="用工类型">
            <Select aria-label="用工类型" value={form.employment} onChange={set("employment")}>{(EMPLOYMENTS.includes(form.employment) ? EMPLOYMENTS : [...EMPLOYMENTS, form.employment]).map((x) => <option key={x} value={x}>{x}</option>)}</Select>
          </Field>
          <Input id="campus-job-薪资" label="薪资" maxLength={200} value={form.salary} onChange={set("salary")} placeholder="15K-20K · 14 薪(是否对学生展示由专场开关控制)" />
          <Input id="campus-job-学历要求" label="学历要求" maxLength={100} value={form.educationRequirement} onChange={set("educationRequirement")} placeholder="本科及以上" />
          <Input id="campus-job-语言要求" label="语言要求" maxLength={200} value={form.languageRequirement} onChange={set("languageRequirement")} placeholder="英语 CET-6 / 可工作交流" />
          <Input id="campus-job-openings" label="招聘名额" type="number" min="0" max="999" value={form.openings} onChange={set("openings")} />
          <Input id="campus-job-deadline" label="投递截止日期" type="date" value={form.deadline} onChange={set("deadline")} />

          <TextArea label="岗位职责" hint="每行一条,学生端按列表展示" rows={5} value={form.responsibilities} onChange={set("responsibilities")} placeholder={"负责车载娱乐系统功能模块开发\n参与需求分析与技术方案设计"} className="md:col-span-2" />
          <TextArea label="任职要求" hint="每行一条;毕业批次 / 专业 / 技能写清楚,AI 结构化与匹配按这里判定" rows={5} value={form.requirements} onChange={set("requirements")} placeholder={"2027 届本科及以上,计算机 / 电子相关专业\n熟悉 C/C++,了解 Linux"} className="md:col-span-2" />
          <TextArea label="加分项" hint="每行一条" rows={3} value={form.nice} onChange={set("nice")} placeholder={"有竞赛获奖 / 开源项目经历"} />
          <TextArea label="福利待遇" hint="每行一条" rows={3} value={form.benefits} onChange={set("benefits")} placeholder={"六险一金\n海外轮岗机会"} />
          {job && <TextArea maxLength={20000} label="JD 全文 / 补充描述" hint="职责 / 要求为空时学生端显示这里的内容。AI 结构化会同时读取以上所有字段" rows={8} value={form.description} onChange={set("description")} placeholder="粘贴完整 JD…" className="md:col-span-2" />}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          <p className="text-[11px] text-gray-500">{job?.hasEvaluationModel ? "JD 内容有变时,保存后请在岗位卡片点「重新生成评价模型」" : "保存后可在岗位卡片一键生成评价模型(校园招聘模板)"}</p>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" disabled={saving || extracting} onClick={close}>取消</Button>
            <Button type="submit" disabled={saving || extracting} icon={<I name="check" size={14} />}>{saving ? "保存中…" : job ? "保存" : "创建并加入专场"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
