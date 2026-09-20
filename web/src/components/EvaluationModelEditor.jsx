// 评估标准编辑器 — JD 评价模型(evaluationModel)的 HR 编辑面板,嵌在 JdDescModal「评估标准」tab。
// 数据流:AI 结构化 JD(extract-facts)→ 生成评估草稿(suggest,模板 + 可选 Kimi 措辞)→ HR 调 tier / 权重 / 措辞 → PATCH job。
// 权重与分类由后端代码计算;这里只维护规则,不出分。
import { useEffect, useMemo, useState } from "react";
import { api, LONG_TIMEOUT } from "../lib/api.js";
import { Button, I, toast } from "./Primitives.jsx";

const TIERS = [
  { v: "MUST", l: "硬性", desc: "不满足直接判 D" },
  { v: "CORE", l: "核心", desc: "主要加权项" },
  { v: "PREFERRED", l: "优先", desc: "次要加权项" },
  { v: "BONUS", l: "加分", desc: "只加分,封顶 bonusCap" },
  { v: "INFO", l: "仅记录", desc: "不参与评估" },
];
const METHOD_META = {
  code: { l: "规则", icon: "calculator", desc: "由代码按派生指标判定" },
  jev_noul: { l: "AI 判定(是/否)", icon: "sparkles", desc: "Jev 回答是否" },
  jev_score: { l: "AI 判定(等级)", icon: "sparkles", desc: "Jev 按情境等级打分" },
  code_then_jev: { l: "规则→AI", icon: "git-branch", desc: "规则能判就用规则,缺信息再问 AI" },
  none: { l: "仅记录", icon: "info", desc: "不评估" },
};
const UNKNOWN_POLICIES = [
  { v: "review", l: "人工复核" },
  { v: "interview", l: "面试验证" },
  { v: "ignore", l: "忽略" },
  { v: "fail", l: "判不满足" },
];
const OP_LABEL = { ">=": "≥", ">": ">", "==": "=", in: "∈", in_family: "属于专业族", has_all: "全部包含", has_any: "任一包含", "degree>=": "学历 ≥", "level>=": "语言等级 ≥", city_in: "城市 ∈", year_in: "毕业年份 ∈" };
const FIELD_LABEL = {
  "derived.highestDegree": "最高学历", "derived.highestMajorTag": "专业族", "derived.totalYears": "总工作年限", "derived.industryYears": "行业年限", "derived.domainYears": "领域年限",
  "derived.functionYears": "职能年限", "derived.overseasYears": "海外年限", "derived.managementYears": "管理年限", "derived.maxTeamSize": "最大团队规模", "derived.languageLevels": "语言等级",
  "derived.certificateTags": "证书", "derived.toolTags": "工具", "derived.currentCityNorm": "现居城市", "derived.graduationYear": "毕业年份", "derived.isFreshGraduate": "应届",
  "profile.intent.acceptTravel": "接受出差", "profile.intent.acceptOverseas": "接受海外", "profile.intent.acceptRelocation": "接受搬迁", "profile.intent.acceptOvertime": "接受加班",
};

function humanizeCode(code) {
  if (!code) return "";
  const parts = String(code.field || "").split(".");
  const base = parts.slice(0, 2).join(".");
  const tail = parts.slice(2).join(".");
  const field = `${FIELD_LABEL[base] || base}${tail ? `(${tail})` : ""}`;
  const value = Array.isArray(code.value) ? code.value.join(" / ") : String(code.value ?? "");
  return `${field} ${OP_LABEL[code.op] || code.op} ${value}${code.lang ? ` [${code.lang}]` : ""}`;
}

// 客户端轻量体检(与后端 lint 口径对齐)
function clientLint(r) {
  const w = [];
  if (!r.label?.trim()) w.push("缺少名称");
  if (r.tier === "INFO" && r.method !== "none") w.push("仅记录层不能评估");
  if (["jev_noul", "jev_score", "code_then_jev"].includes(r.method)) {
    const q = r.jev || {};
    if (!q.instructions || q.instructions.trim().length < 4) w.push("题目措辞过短");
    if (q.instructions && q.instructions.length > 600) w.push("题目措辞超过 600 字符");
    if (/且|并且|同时/.test(q.instructions || "")) w.push("题目疑似包含多个判断,建议拆分");
    if (q.type === "score") {
      const c = Array.isArray(q.criteria) ? q.criteria : [];
      if (c.length < 2 || c.length > 10) w.push("等级须 2-10 级");
      if (c.some((x) => /^(一般|良好|优秀|较好|很好|差|中等)$/.test(String(x).trim()))) w.push("等级描述过于抽象,请写具体情境");
    }
  }
  if (/年龄|性别|婚|育|民族/.test(r.label || "") && r.tier !== "INFO") w.push("涉及年龄/性别等,建议改为仅记录");
  return w;
}

function newRequirement(existing) {
  let n = 1;
  let key = `custom_${n}`;
  while (existing.some((r) => r.key === key)) key = `custom_${++n}`;
  return {
    key, label: "", tier: "CORE", method: "jev_score", source: "manual", weight: 10, unknownPolicy: "review",
    jev: { type: "score", instructions: "根据 `resume`、`profile.experience` 与 `profile.projects`,判断候选人在该项上的经验深度。", criteria: ["简历未提及相关信息", "仅在技能栏或职责里提到,无具体案例", "有 1-2 段经历包含具体职责或成果", "长期或独立负责并有量化成果"] },
  };
}

let templatesCache = null;

export default function EvaluationModelEditor({ job, canEdit = false, onSaved }) {
  const [jdFacts, setJdFacts] = useState(job?.jdFacts || null);
  const [model, setModel] = useState(job?.evaluationModel || null);
  const [templates, setTemplates] = useState(templatesCache || []);
  const [templateId, setTemplateId] = useState(job?.evaluationModel?.templateId || "");
  const [wording, setWording] = useState(true);
  const [busy, setBusy] = useState("");             // "extract" | "suggest" | "save"
  const [dirty, setDirty] = useState(false);
  const [lint, setLint] = useState({});             // key -> string[](后端)
  const [serverErrors, setServerErrors] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    setJdFacts(job?.jdFacts || null);
    setModel(job?.evaluationModel || null);
    setTemplateId(job?.evaluationModel?.templateId || "");
    setDirty(false); setLint({}); setServerErrors([]);
  }, [job?.id, job?.evaluationModelVersion]);

  useEffect(() => {
    if (templatesCache) return;
    api.get("/jobs/evaluation/templates").then((r) => { templatesCache = r.data.items || []; setTemplates(templatesCache); }).catch(() => {});
  }, []);

  const reqs = model?.requirements || [];
  const weightSum = useMemo(() => reqs.filter((r) => r.tier !== "INFO" && r.tier !== "BONUS").reduce((s, r) => s + (Number(r.weight) || 0), 0), [reqs]);

  function patchModel(fn) {
    setModel((m) => { const next = fn({ ...(m || { requirements: [], tierWeights: { MUST: 25, CORE: 45, PREFERRED: 15, STABILITY: 15 }, bonusCap: 8, thresholds: { A: 85, B: 70, C: 55 }, confidenceGate: 0.5, fixedQuestions: ["stability", "sufficiency", "inflation"] }) }); return next; });
    setDirty(true);
  }
  function patchReq(idx, patch) {
    patchModel((m) => ({ ...m, requirements: m.requirements.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  }
  function patchJev(idx, patch) {
    patchModel((m) => ({ ...m, requirements: m.requirements.map((r, i) => (i === idx ? { ...r, jev: { ...(r.jev || {}), ...patch } } : r)) }));
  }
  function removeReq(idx) {
    patchModel((m) => ({ ...m, requirements: m.requirements.filter((_, i) => i !== idx) }));
  }
  function addReq() {
    patchModel((m) => ({ ...m, requirements: [...m.requirements, newRequirement(m.requirements)] }));
  }
  function toggle(key) {
    setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function extractFacts() {
    setBusy("extract");
    try {
      const { data } = await api.post(`/jobs/${job.id}/extract-facts`, {}, { timeout: LONG_TIMEOUT });
      setJdFacts(data.jdFacts); setDirty(true);
      const unverified = data.warnings?.find((w) => w.code === "quote_unverified")?.keys?.length || 0;
      toast(`已结构化 JD${unverified ? ` · ${unverified} 处引文待核对` : ""}`, "success");
    } catch (e) {
      toast(e.response?.data?.message || (e.response?.status === 424 ? "LLM 未配置" : "JD 结构化失败"), "error");
    } finally { setBusy(""); }
  }
  async function suggest() {
    if (!jdFacts) return toast("请先「AI 结构化 JD」", "error");
    setBusy("suggest");
    try {
      const { data } = await api.post(`/jobs/${job.id}/evaluation-model/suggest`, { jdFacts, templateId: templateId || undefined, wording }, { timeout: LONG_TIMEOUT });
      setModel(data.evaluationModel); setLint(data.lint || {}); setDirty(true); setServerErrors([]);
      setTemplateId(data.evaluationModel?.templateId || templateId);
      toast(`已生成 ${data.evaluationModel?.requirements?.length || 0} 条评估条目${data.wordingMeta ? " · AI 已补写措辞" : ""}`, "success");
    } catch (e) {
      toast(e.response?.data?.message || "生成草稿失败", "error");
    } finally { setBusy(""); }
  }
  async function save() {
    if (!model) return;
    setBusy("save"); setServerErrors([]);
    try {
      const { data } = await api.patch(`/jobs/${job.id}`, { jdFacts: jdFacts || null, evaluationModel: { ...model, templateId: templateId || model.templateId } });
      setDirty(false);
      toast(`评估标准已保存 · v${data.job?.evaluationModelVersion ?? ""}`, "success");
      onSaved?.(data.job);
    } catch (e) {
      const d = e.response?.data;
      if (e.response?.status === 422 && d?.errors) { setServerErrors(d.errors); if (d.warnings?.length) setLint((l) => ({ ...l, _global: d.warnings })); }
      toast(d?.message || "保存失败", "error");
    } finally { setBusy(""); }
  }

  const readOnly = !canEdit;
  const inputCls = "w-full h-9 px-2.5 rounded-lg border border-[#E9ECEF] text-xs text-[#1B254B] bg-white focus:border-[#422AFB] focus:ring-2 focus:ring-[#422AFB]/20 outline-none disabled:opacity-60 disabled:bg-[#F4F7FE]";
  const numCls = "w-full h-9 px-2.5 rounded-lg border border-[#E9ECEF] text-xs text-[#1B254B] bg-white outline-none focus:border-[#422AFB] disabled:opacity-60 disabled:bg-[#F4F7FE]";

  return (
    <div className="space-y-4">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-[#F4F7FE]">
        <div className="flex items-center gap-2 min-w-[200px]">
          <span className="text-[11px] font-bold text-[#707EAE] whitespace-nowrap">岗位模板</span>
          <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); }} disabled={readOnly} className={inputCls + " !h-8"}>
            <option value="">自动推断</option>
            {templates.map((t) => <option key={t.id} value={t.id} title={t.description}>{t.name}</option>)}
          </select>
        </div>
        {canEdit && (
          <>
            <Button size="sm" variant="ghost" onClick={extractFacts} disabled={!!busy} icon={<I name={busy === "extract" ? "loader" : "wand-2"} size={12} className={busy === "extract" ? "animate-spin" : ""} />}>
              {busy === "extract" ? "结构化中(10-40s)" : jdFacts ? "重新 AI 结构化 JD" : "AI 结构化 JD"}
            </Button>
            <Button size="sm" variant="ghost" onClick={suggest} disabled={!!busy || !jdFacts} icon={<I name={busy === "suggest" ? "loader" : "sparkles"} size={12} className={busy === "suggest" ? "animate-spin" : ""} />}>
              {busy === "suggest" ? "生成中" : model ? "重新生成评估草稿" : "生成评估草稿"}
            </Button>
            <label className="text-[11px] text-[#707EAE] flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={wording} onChange={(e) => setWording(e.target.checked)} className="accent-[#422AFB]" />
              让 AI 补写题目措辞
            </label>
          </>
        )}
        <span className="ml-auto text-[11px] text-[#A3AED0] flex items-center gap-1">
          <I name={jdFacts ? "check-circle-2" : "circle-dashed"} size={12} className={jdFacts ? "text-green-600" : ""} />
          {jdFacts ? "JD 已结构化" : "JD 未结构化"}
        </span>
      </div>

      {!model ? (
        <div className="py-10 text-center text-sm text-[#707EAE]">
          <I name="list-checks" size={28} className="mx-auto mb-2 text-[#A3AED0]" />
          尚未配置评估标准
          {canEdit && <p className="text-[11px] text-[#A3AED0] mt-1">先「AI 结构化 JD」,再「生成评估草稿」,或直接「添加条目」手动配置</p>}
          {canEdit && <Button size="sm" variant="ghost" className="mt-3" onClick={addReq} icon={<I name="plus" size={12} />}>添加条目</Button>}
        </div>
      ) : (
        <>
          {lint._global?.length > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-50 text-[11px] text-amber-800 space-y-0.5">{lint._global.map((w, i) => <p key={i}>⚠ {w}</p>)}</div>
          )}
          {/* 条目表 */}
          <div className="rounded-xl border border-[#E9ECEF] overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_84px_120px_130px_110px_28px] gap-2 px-3 py-2 bg-[#F4F7FE] text-[10px] font-bold uppercase tracking-wide text-[#A3AED0]">
              <span>要求</span><span>层级</span><span>判定方式</span><span>权重</span><span>缺信息时</span><span />
            </div>
            <div className="divide-y divide-[#F4F7FE] max-h-[42vh] overflow-y-auto">
              {reqs.map((r, idx) => {
                const warns = [...(lint[r.key] || []), ...clientLint(r)];
                const mm = METHOD_META[r.method] || METHOD_META.none;
                const open = expanded.has(r.key);
                const isJev = ["jev_noul", "jev_score", "code_then_jev"].includes(r.method);
                return (
                  <div key={r.key} className="px-3 py-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_84px_120px_130px_110px_28px] gap-2 items-center">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <button type="button" onClick={() => toggle(r.key)} className="text-[#A3AED0] hover:text-[#422AFB] shrink-0" title="展开">
                          <I name={open ? "chevron-down" : "chevron-right"} size={14} />
                        </button>
                        <input value={r.label || ""} onChange={(e) => patchReq(idx, { label: e.target.value })} disabled={readOnly} placeholder="要求名称" className={inputCls + " !h-8"} />
                      </div>
                      <select value={r.tier} disabled={readOnly} onChange={(e) => { const tier = e.target.value; patchReq(idx, { tier, ...(tier === "INFO" ? { method: "none", weight: 0 } : (r.method === "none" ? { method: "jev_score" } : {})) }); }} className={inputCls + " !h-8"}>
                        {TIERS.map((t) => <option key={t.v} value={t.v} title={t.desc}>{t.l}</option>)}
                      </select>
                      <span className="text-[11px] text-[#1B254B] flex items-center gap-1 truncate" title={mm.desc}><I name={mm.icon} size={12} className="text-[#422AFB] shrink-0" />{mm.l}</span>
                      {r.tier === "BONUS" ? (
                        <div className="flex items-center gap-1 text-[11px] text-[#707EAE]">+<input type="number" min="0" max="20" value={r.bonus ?? 0} disabled={readOnly} onChange={(e) => patchReq(idx, { bonus: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} className={numCls + " !h-8 !w-16"} />分</div>
                      ) : r.tier === "INFO" ? (
                        <span className="text-[11px] text-[#A3AED0]">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input type="range" min="0" max="100" value={r.weight ?? 0} disabled={readOnly} onChange={(e) => patchReq(idx, { weight: Number(e.target.value) })} className="w-16 accent-[#422AFB]" />
                          <input type="number" min="0" max="100" value={r.weight ?? 0} disabled={readOnly} onChange={(e) => patchReq(idx, { weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className={numCls + " !h-8 !w-14 !px-1.5"} />
                        </div>
                      )}
                      {r.tier === "INFO" ? <span className="text-[11px] text-[#A3AED0]">—</span> : (
                        <select value={r.unknownPolicy || "review"} disabled={readOnly} onChange={(e) => patchReq(idx, { unknownPolicy: e.target.value })} className={inputCls + " !h-8"}>
                          {UNKNOWN_POLICIES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                        </select>
                      )}
                      {canEdit ? (
                        <button type="button" onClick={() => removeReq(idx)} className="w-7 h-7 rounded-full text-[#A3AED0] hover:text-red-500 hover:bg-red-50 flex items-center justify-center" title="删除"><I name="trash-2" size={12} /></button>
                      ) : <span />}
                    </div>
                    {warns.length > 0 && (
                      <div className="mt-1 ml-6 text-[10px] text-amber-700 flex flex-wrap gap-x-3">{warns.map((w, i) => <span key={i}>⚠ {w}</span>)}</div>
                    )}
                    {r.compliance && <p className="mt-1 ml-6 text-[10px] text-amber-700">⚠ {r.compliance}</p>}
                    {open && (
                      <div className="mt-2 ml-6 p-3 rounded-lg bg-[#F4F7FE] space-y-2 text-xs">
                        {r.source && <p className="text-[10px] text-[#A3AED0]">来源:{r.source} · key:{r.key}</p>}
                        {r.code && (
                          <div className="flex items-start gap-2"><I name="calculator" size={12} className="text-[#422AFB] mt-0.5 shrink-0" /><span className="text-[#1B254B]">规则:{humanizeCode(r.code)}</span></div>
                        )}
                        {isJev && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <I name="sparkles" size={12} className="text-[#422AFB] shrink-0" />
                              <span className="text-[#707EAE]">AI 题目({r.jev?.type === "noul" ? "是/否" : "等级"})</span>
                              {canEdit && (
                                <select value={r.jev?.type || "score"} onChange={(e) => { const type = e.target.value; patchJev(idx, { type, criteria: type === "noul" ? { true: "", false: "无证据,或简历未提及" } : ["简历未提及相关信息", "有少量相关信息", "有具体相关经历", "深度相关并有成果"] }); }} className={inputCls + " !h-7 !w-24"}>
                                  <option value="score">等级</option><option value="noul">是/否</option>
                                </select>
                              )}
                            </div>
                            <textarea value={r.jev?.instructions || ""} disabled={readOnly} onChange={(e) => patchJev(idx, { instructions: e.target.value })} rows={2} placeholder="题目措辞,用反引号引用 `resume` / `profile.experience` / `derived.*`" className="w-full p-2 rounded-lg border border-[#E9ECEF] text-xs text-[#1B254B] outline-none focus:border-[#422AFB] disabled:bg-white/60 resize-y" />
                            {r.jev?.type === "noul" ? (
                              <div className="grid grid-cols-2 gap-2">
                                {["true", "false"].map((k) => (
                                  <div key={k}>
                                    <p className="text-[10px] text-[#A3AED0] mb-0.5">{k === "true" ? "何为「是」" : "何为「否」(须覆盖未提及)"}</p>
                                    <textarea value={r.jev?.criteria?.[k] || ""} disabled={readOnly} onChange={(e) => patchJev(idx, { criteria: { ...(r.jev?.criteria || {}), [k]: e.target.value } })} rows={2} className="w-full p-2 rounded-lg border border-[#E9ECEF] text-xs text-[#1B254B] outline-none focus:border-[#422AFB] disabled:bg-white/60 resize-y" />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {(Array.isArray(r.jev?.criteria) ? r.jev.criteria : []).map((c, ci) => (
                                  <div key={ci} className="flex items-center gap-1.5">
                                    <span className="w-5 h-5 rounded-md bg-white text-[#422AFB] text-[10px] font-bold flex items-center justify-center shrink-0">{ci}</span>
                                    <input value={c} disabled={readOnly} onChange={(e) => { const arr = [...r.jev.criteria]; arr[ci] = e.target.value; patchJev(idx, { criteria: arr }); }} className={inputCls + " !h-8"} />
                                    {canEdit && r.jev.criteria.length > 2 && (
                                      <button type="button" onClick={() => patchJev(idx, { criteria: r.jev.criteria.filter((_, i) => i !== ci) })} className="text-[#A3AED0] hover:text-red-500"><I name="x" size={12} /></button>
                                    )}
                                  </div>
                                ))}
                                {canEdit && (r.jev?.criteria?.length || 0) < 10 && (
                                  <button type="button" onClick={() => patchJev(idx, { criteria: [...(r.jev?.criteria || []), ""] })} className="text-[11px] text-[#422AFB] hover:underline inline-flex items-center gap-1"><I name="plus" size={11} />加一级</button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {r.hint && <p className="text-[10px] text-[#707EAE]">提示:{r.hint}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-[#F4F7FE] text-[11px] text-[#707EAE]">
              <span>共 {reqs.length} 条 · 加权项权重合计 {weightSum}(无需凑 100,系统自动归一)</span>
              {canEdit && <Button size="sm" variant="ghost" onClick={addReq} icon={<I name="plus" size={12} />}>添加条目</Button>}
            </div>
          </div>

          {serverErrors.length > 0 && (
            <div className="p-2.5 rounded-lg bg-red-50 text-[11px] text-red-700 space-y-0.5">{serverErrors.map((e, i) => <p key={i}>✕ {e}</p>)}</div>
          )}

          {/* 全局参数 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-xl bg-[#F4F7FE]">
            <div className="col-span-2 md:col-span-4 text-[11px] font-bold text-[#707EAE]">分类阈值与维度权重</div>
            {["A", "B", "C"].map((k) => (
              <label key={k} className="text-[11px] text-[#707EAE]">{k} 类 ≥
                <input type="number" min="0" max="100" value={model.thresholds?.[k] ?? ""} disabled={readOnly} onChange={(e) => patchModel((m) => ({ ...m, thresholds: { ...(m.thresholds || {}), [k]: Number(e.target.value) } }))} className={numCls + " mt-1"} />
              </label>
            ))}
            <label className="text-[11px] text-[#707EAE]">置信门控
              <input type="number" min="0" max="1" step="0.05" value={model.confidenceGate ?? 0.5} disabled={readOnly} onChange={(e) => patchModel((m) => ({ ...m, confidenceGate: Number(e.target.value) }))} className={numCls + " mt-1"} />
            </label>
            {["MUST", "CORE", "PREFERRED", "STABILITY"].map((k) => (
              <label key={k} className="text-[11px] text-[#707EAE]">{{ MUST: "硬性", CORE: "核心", PREFERRED: "优先", STABILITY: "稳定性" }[k]}维度权重
                <input type="number" min="0" max="100" value={model.tierWeights?.[k] ?? ""} disabled={readOnly} onChange={(e) => patchModel((m) => ({ ...m, tierWeights: { ...(m.tierWeights || {}), [k]: Number(e.target.value) } }))} className={numCls + " mt-1"} />
              </label>
            ))}
            <label className="text-[11px] text-[#707EAE]">加分封顶
              <input type="number" min="0" max="30" value={model.bonusCap ?? 8} disabled={readOnly} onChange={(e) => patchModel((m) => ({ ...m, bonusCap: Number(e.target.value) }))} className={numCls + " mt-1"} />
            </label>
          </div>
        </>
      )}

      {/* 页脚 */}
      <div className="flex items-center justify-between gap-3 flex-wrap text-[11px] text-[#A3AED0]">
        <span>
          {job?.evaluationModelVersion ? `v${job.evaluationModelVersion}` : "未保存"}
          {job?.evaluationModelSource && ` · 来源 ${{ draft: "模板草稿", kimi_suggested: "AI 建议", manual: "人工编辑" }[job.evaluationModelSource] || job.evaluationModelSource}`}
          {job?.evaluationModelUpdatedAt && ` · ${new Date(job.evaluationModelUpdatedAt).toLocaleString("zh-CN")}`}
          {dirty && <span className="ml-2 text-amber-700">● 有未保存改动</span>}
        </span>
        {canEdit && (
          <Button size="sm" onClick={save} disabled={!!busy || !model || !dirty} icon={<I name={busy === "save" ? "loader" : "check"} size={12} className={busy === "save" ? "animate-spin" : ""} />}>
            {busy === "save" ? "保存中" : "保存评估标准"}
          </Button>
        )}
      </div>
    </div>
  );
}
