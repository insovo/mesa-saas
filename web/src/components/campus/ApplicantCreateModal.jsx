// HR 手工登记学生(线下收简历也能用):基本信息 + 可选简历(上传即抽取)+ 可选直接投递岗位
import { useMemo, useState } from "react";
import { resources } from "../../lib/api.js";
import { Button, Input, Modal, I, toast } from "../Primitives.jsx";
import { Field, Select, KindTag, uploadResumeToR2, errMsg, RESUME_ACCEPT, DEGREE_OPTIONS } from "./ui.jsx";

const EMPTY = { name: "", phone: "", email: "", wechat: "", school: "", major: "", degree: "", gradYear: "", contactConfirmed: false };

export default function ApplicantCreateModal({ open, onClose, session, sessionJobs, onCreated }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, school: session?.school || "" }));
  const [jobIds, setJobIds] = useState([]);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const maxJobs = session?.maxApplyJobs ?? 3;
  const grouped = useMemo(() => ({ onsite: sessionJobs.filter((j) => j.kind === "onsite"), referral: sessionJobs.filter((j) => j.kind === "referral") }), [sessionJobs]);

  function toggleJob(id) {
    setJobIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= maxJobs ? (toast(`最多投递 ${maxJobs} 个岗位`, "info"), prev) : [...prev, id]));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.phone.trim()) return toast("请填写手机号", "error");
    setSaving(true);
    try {
      let resume = null;
      if (file) {
        try { resume = await uploadResumeToR2(file); }
        catch (err) {
          if (err.response?.status === 503) toast("R2 未配置,本次仅登记信息不上传简历", "info");
          else throw err;
        }
      }
      const body = {
        name: form.name.trim() || null, phone: form.phone.trim(), email: form.email.trim() || null, wechat: form.wechat.trim() || null,
        school: form.school.trim() || null, major: form.major.trim() || null, degree: form.degree || null,
        gradYear: form.gradYear ? Number(form.gradYear) : null, contactConfirmed: form.contactConfirmed, jobIds, resume,
      };
      const created = await resources.campus.createApplicant(session.id, body);
      toast(resume ? "已登记,简历解析中" : "已登记", "success");
      onCreated?.(created);
      setForm({ ...EMPTY, school: session?.school || "" }); setJobIds([]); setFile(null);
      onClose();
    } catch (err) {
      toast(errMsg(err, "登记失败"), "error");
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-navy-700">登记学生</h3>
            <p className="text-xs text-gray-600 mt-0.5">{session?.name} · 现场收到的简历可在此录入,上传后自动抽取学校 / 专业 / 学历</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-lightPrimary text-gray-500"><I name="x" size={16} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="手机号" required value={form.phone} onChange={set("phone")} placeholder="13800000000" />
          <Input label="姓名" value={form.name} onChange={set("name")} placeholder="可留空,解析简历后自动补" />
          <Input label="邮箱" type="email" value={form.email} onChange={set("email")} placeholder="student@example.com" />
          <Input label="微信号" value={form.wechat} onChange={set("wechat")} />
          <Input label="学校" value={form.school} onChange={set("school")} />
          <Input label="专业" value={form.major} onChange={set("major")} />
          <Field label="学历">
            <Select value={form.degree} onChange={set("degree")}>
              <option value="">未填</option>
              {DEGREE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Input label="毕业年份" type="number" min="1990" max="2100" value={form.gradYear} onChange={set("gradYear")} placeholder="2027" />
        </div>

        <Field label="简历文件" hint="PDF / Word,≤ 20MB;上传成功即后台抽取,不阻塞登记">
          <label className="flex items-center gap-3 h-12 px-4 rounded-xl border border-dashed border-gray-300 bg-white/40 cursor-pointer hover:border-brand/60 text-sm text-navy-700">
            <I name="file-up" size={16} className="text-brand" />
            <span className="truncate flex-1">{file ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)` : "点击选择文件"}</span>
            {file && <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-gray-500 hover:text-red-500"><I name="x" size={14} /></button>}
            <input type="file" accept={RESUME_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        </Field>

        <Field label={`投递岗位(最多 ${maxJobs} 个)`}>
          {sessionJobs.length === 0 ? (
            <p className="text-xs text-gray-500 ml-3">专场还没有配置岗位,可先登记,之后在学生详情里补投递</p>
          ) : (
            <div className="space-y-3">
              {["onsite", "referral"].map((kind) => grouped[kind].length > 0 && (
                <div key={kind}>
                  <p className="text-[11px] text-gray-500 ml-3 mb-1.5"><KindTag kind={kind} /></p>
                  <div className="flex flex-wrap gap-2">
                    {grouped[kind].map((sj) => {
                      const on = jobIds.includes(sj.jobId);
                      return (
                        <button key={sj.id} type="button" onClick={() => toggleJob(sj.jobId)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${on ? "bg-brand-gradient text-white shadow-button" : "bg-lightPrimary text-navy-700 hover:bg-white hover:shadow-card"}`}>
                          {sj.job?.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm text-navy-700 ml-3">
          <input type="checkbox" checked={form.contactConfirmed} onChange={(e) => setForm((f) => ({ ...f, contactConfirmed: e.target.checked }))} className="accent-brand w-4 h-4" />
          已与学生确认联系方式畅通
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={saving} icon={saving ? <I name="loader" size={16} className="animate-spin" /> : <I name="user-plus" size={16} />}>{saving ? "提交中…" : "登记"}</Button>
        </div>
      </form>
    </Modal>
  );
}
