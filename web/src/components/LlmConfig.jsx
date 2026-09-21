// MESA Recruit · LLM 配置入口(按钮 + 配置 Modal + Prompt 编辑 Modal)
// 原内嵌在 Sidebar,侧栏改为 StaggeredMenu 后上抽为独立组件复用。
// 权限:admin 或被授权 system.llm pageKey 的用户可见,否则渲染 null。
// 三层架构(2026-09-20):新增 TextIn 文档层 / Jev 评估层 / 评估规则 三组配置;凭证类仅 admin 可写(后端同样校验)。

import { useEffect, useState } from "react";
import { I, Modal, Button, toast } from "./Primitives.jsx";
import { api } from "../lib/api.js";
import { useMe } from "../lib/authContext.jsx";
import { hasPage as canSeePage, isAdmin as checkIsAdmin } from "../lib/permissions.js";

const PROVIDER_LABELS = {
  kimi: "Kimi (Moonshot AI)",
  deepseek: "DeepSeek",
};

const PROMPT_META = {
  "kimi.prompt": { title: "简历解析 Prompt 编辑器", label: "解析 Prompt", desc: "Kimi 输出 profile(resume.v1)结构化 JSON:教育/工作/项目/技能/证书/校园经历等,系统据此拼装简报并计算年限。保存后下次解析立即生效。" },
  "kimi.jd_schema_prompt": { title: "JD 结构化 Prompt 编辑器", label: "JD 结构化 Prompt", desc: "把岗位描述抽成 jdFacts(jd.v1)事实 JSON,只记录原文写了什么,不定权重。" },
  "kimi.report_prompt": { title: "评估报告 Prompt 编辑器", label: "评估报告 Prompt", desc: "分数与分类已由系统确定,Kimi 只负责解释:亮点/风险附原文引文、面试验证问题。引文会做原文校验。" },
};

const REPORT_POLICIES = [
  { v: "auto_ab", l: "A/B 类自动生成报告(推荐)" },
  { v: "auto_all", l: "全部自动生成" },
  { v: "on_demand", l: "全部按需生成" },
];

function StatusChip({ ok, label }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
      {label}
    </span>
  );
}

// 凭证行:mask 展示 + 编辑(密码输入)+ 删除回退 env;仅 admin
function SecretRow({ label, settingKey, placeholder, row, onChanged, extra }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!pending || pending.length < 8) return toast("至少 8 字符", "error");
    setSaving(true);
    try {
      await api.put(`/system/settings/${settingKey}`, { value: pending });
      toast(`${label} 已加密保存`, "success");
      setPending(""); setEditing(false);
      await onChanged();
    } catch (e) { toast(e.response?.data?.message || "保存失败", "error"); } finally { setSaving(false); }
  }
  async function remove() {
    if (!confirm(`回退到 .env 的 ${label} 配置?`)) return;
    try { await api.delete(`/system/settings/${settingKey}`); toast("已删除 DB 中的值,回退到 env fallback", "success"); await onChanged(); }
    catch (e) { toast(e.response?.data?.message || "删除失败", "error"); }
  }
  return (
    <div>
      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">{label}</p>
      {!editing ? (
        <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
          <code className="font-mono text-xs text-gray-700 flex-1 truncate">{row?.maskedValue || "(未配置)"}</code>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-lightPrimary text-gray-700 font-bold">{row?.source === "db" ? "DB" : row?.source === "env" ? "env" : "无"}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} icon={<I name="pencil" size={12} />}>编辑</Button>
          {extra}
        </div>
      ) : (
        <div className="space-y-2">
          <input type="password" autoFocus placeholder={placeholder} value={pending} onChange={(e) => setPending(e.target.value)} disabled={saving}
            className="w-full px-3 py-2 rounded-lg border border-amber-300 text-sm font-mono outline-none focus:border-amber-500 bg-white" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setPending(""); }} disabled={saving}>取消</Button>
            <Button size="sm" onClick={save} disabled={saving} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>{saving ? "保存中" : "加密保存"}</Button>
          </div>
        </div>
      )}
      {row?.source === "db" && (
        <button onClick={remove} className="text-[11px] text-gray-600 hover:text-red-500 mt-1.5 inline-flex items-center gap-1"><I name="trash-2" size={11} /> 删除 DB 中的值,回退到 .env 配置</button>
      )}
    </div>
  );
}

// 非凭证配置:开关 / 下拉 / 文本,PUT 即存;value 取 DB > env > 默认
function SettingField({ label, settingKey, row, type = "text", options, hint, onChanged, fallback = "", disabled }) {
  const value = row?.maskedValue ?? fallback;
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  async function put(v) {
    try { await api.put(`/system/settings/${settingKey}`, { value: String(v) }); toast(`${label} 已保存`, "success"); await onChanged(); }
    catch (e) { toast(e.response?.data?.message || "保存失败", "error"); }
  }
  if (type === "bool") {
    const on = /^(1|true|yes|on)$/i.test(String(value));
    return (
      <div className="flex items-center justify-between p-3 bg-white rounded-lg">
        <div>
          <p className="text-sm font-bold text-navy-700">{label}</p>
          {hint && <p className="text-[11px] text-gray-600 mt-0.5">{hint}</p>}
        </div>
        <button type="button" disabled={disabled} onClick={() => put(!on)} className={`relative w-11 h-6 rounded-full transition ${on ? "bg-brand" : "bg-gray-300"} disabled:opacity-50`} aria-pressed={on}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
    );
  }
  if (type === "select") {
    return (
      <div className="p-3 bg-white rounded-lg">
        <p className="text-xs font-bold text-gray-700 mb-1">{label}</p>
        <select value={value} disabled={disabled} onChange={(e) => put(e.target.value)} className="w-full bg-transparent text-sm text-navy-700 outline-none cursor-pointer">
          {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
      </div>
    );
  }
  return (
    <div className="p-3 bg-white rounded-lg">
      <p className="text-xs font-bold text-gray-700 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <input value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} className="flex-1 bg-transparent text-sm text-navy-700 outline-none border-b border-gray-200 focus:border-brand" />
        <Button size="sm" variant="ghost" disabled={disabled || draft === value} onClick={() => put(draft)} icon={<I name="check" size={12} />}>保存</Button>
      </div>
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  );
}

// 阈值 A/B/C 三输入 → eval.thresholds JSON
function ThresholdsField({ row, onChanged, disabled }) {
  const parsed = (() => { try { return JSON.parse(row?.maskedValue || ""); } catch { return { A: 85, B: 70, C: 55 }; } })();
  const [t, setT] = useState(parsed);
  useEffect(() => { setT(parsed); }, [row?.maskedValue]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    const A = Number(t.A), B = Number(t.B), C = Number(t.C);
    if (!(A > B && B > C)) return toast("需满足 A > B > C", "error");
    try { await api.put("/system/settings/eval.thresholds", { value: JSON.stringify({ A, B, C }) }); toast("分类阈值已保存", "success"); await onChanged(); }
    catch (e) { toast(e.response?.data?.message || "保存失败", "error"); }
  }
  return (
    <div className="p-3 bg-white rounded-lg">
      <p className="text-xs font-bold text-gray-700 mb-1">分类阈值(总分 ≥)</p>
      <div className="flex items-center gap-2">
        {["A", "B", "C"].map((k) => (
          <label key={k} className="flex items-center gap-1 text-sm text-navy-700">
            <span className="font-bold">{k}</span>
            <input type="number" min={0} max={100} value={t[k] ?? ""} disabled={disabled} onChange={(e) => setT({ ...t, [k]: e.target.value })} className="w-14 bg-transparent border-b border-gray-200 focus:border-brand outline-none text-center" />
          </label>
        ))}
        <span className="text-[11px] text-gray-500">D = 其余</span>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={save} icon={<I name="check" size={12} />}>保存</Button>
      </div>
    </div>
  );
}

export default function LlmConfig({ className = "", onOpenChange }) {
  const me = useMe();
  const isAdmin = checkIsAdmin(me);
  const canLlmAccess = isAdmin || (me ? canSeePage(me, "system.llm") : false);

  const [llm, setLlm] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("mesa.llm.model") || "");
  const [adminSettings, setAdminSettings] = useState(null);
  const [testing, setTesting] = useState(null);

  // prompt 编辑(按 key 参数化)
  const [promptKey, setPromptKey] = useState(null);
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  useEffect(() => {
    api.get("/resumes/llm-status").then((r) => {
      setLlm(r.data);
      if (!selectedModel && r.data?.model) setSelectedModel(r.data.model);
    }).catch(() => setLlm({ configured: false }));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!modalOpen || !canLlmAccess) return;
    api.get("/system/settings").then((r) => setAdminSettings(r.data.items)).catch(() => setAdminSettings([]));
  }, [modalOpen, canLlmAccess]);

  function setOpen(v) { setModalOpen(v); onOpenChange?.(v); }
  function onPickModel(modelId) { setSelectedModel(modelId); localStorage.setItem("mesa.llm.model", modelId); }

  async function refreshLlmStatus() {
    const r = await api.get("/resumes/llm-status");
    setLlm(r.data);
    const r2 = await api.get("/system/settings");
    setAdminSettings(r2.data.items);
  }

  async function saveSystemModel(modelId) {
    try { await api.put("/system/settings/kimi.model", { value: modelId }); toast(`系统默认模型已改为 ${modelId}`, "success"); await refreshLlmStatus(); }
    catch (e) { toast(e.response?.data?.message || "保存失败", "error"); }
  }

  async function testProvider(name) {
    setTesting(name);
    try {
      if (name === "kimi") { const { data } = await api.post("/system/settings/kimi.api_key/test"); toast(`✓ Kimi 可用 · ${data.modelsCount ?? "?"} 个模型可访问`, "success"); }
      if (name === "textin") { const { data } = await api.post("/system/settings/textin/test"); toast(`✓ TextIn 凭证有效(code ${data.code})`, "success"); }
      if (name === "jev") { const { data } = await api.post("/system/settings/jev/test"); toast(`✓ Jev 可用 · ${data.model} · ${data.latencyMs}ms`, "success"); }
    } catch (e) { toast(e.response?.data?.message || "探活失败", "error"); } finally { setTesting(null); }
  }

  async function openPromptEditor(key) {
    setPromptKey(key); setPromptLoading(true);
    try { const { data } = await api.get(`/system/settings/${key}/full`); setPromptText(data.value || ""); }
    catch (e) { toast(e.response?.data?.message || "拉取 prompt 失败", "error"); } finally { setPromptLoading(false); }
  }
  async function savePrompt() {
    if (!promptText || promptText.length < 50) return toast("Prompt 至少 50 字符", "error");
    setSavingPrompt(true);
    try { await api.put(`/system/settings/${promptKey}`, { value: promptText }); toast("Prompt 已保存,下次调用生效", "success"); setPromptKey(null); await refreshLlmStatus(); }
    catch (e) { toast(e.response?.data?.message || "保存失败", "error"); } finally { setSavingPrompt(false); }
  }
  async function resetPrompt() {
    if (!confirm("回退到内置默认 prompt(删除 DB 中的自定义)?")) return;
    try { await api.delete(`/system/settings/${promptKey}`); toast("已回退到内置 prompt", "success"); const { data } = await api.get(`/system/settings/${promptKey}/full`); setPromptText(data.value || ""); await refreshLlmStatus(); }
    catch (e) { toast(e.response?.data?.message || "回退失败", "error"); }
  }

  if (!canLlmAccess) return null;

  const ready = !!llm?.configured;
  const providers = llm?.providers || {};
  const chipClass = ready ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
  const row = (key) => adminSettings?.find((s) => s.key === key);
  const modelRow = row("kimi.model");
  const promptMeta = promptKey ? PROMPT_META[promptKey] : null;

  const PromptRow = ({ settingKey }) => (
    <div>
      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">{PROMPT_META[settingKey].label}</p>
      <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
        <I name="file-text" size={16} className="text-gray-400" />
        <span className="text-xs text-gray-700 flex-1">
          {settingKey === "kimi.prompt" && llm?.promptStatus === "legacy_ignored"
            ? <span className="text-red-600 font-bold">旧版自定义,已被忽略(请「回退默认」后再自定义)</span>
            : row(settingKey)?.source === "db" ? "已自定义" : "内置默认"}
        </span>
        <Button size="sm" variant="ghost" onClick={() => openPromptEditor(settingKey)} icon={<I name="pencil" size={12} />}>查看 / 编辑</Button>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className={`rounded-xl bg-lightPrimary flex items-center gap-2 px-3 py-2 hover:ring-2 hover:ring-brand/20 transition ${className}`}>
        <I name="key-round" size={16} className="text-brand" />
        <span className="text-sm font-bold text-navy-700">LLM Key</span>
        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold ${chipClass}`}>{ready ? "已就绪" : "待配置"}</span>
      </button>

      {/* === LLM 配置 Modal === */}
      <Modal open={modalOpen} onClose={() => setOpen(false)} maxWidth="max-w-2xl">
        <div className="p-7 space-y-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-navy-700 flex items-center gap-2">
              <I name="key-round" size={20} className="text-brand" />
              AI 服务配置
            </h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-navy-700"><I name="x" size={20} /></button>
          </div>

          {!llm ? (
            <div className="text-sm text-gray-700 py-6 text-center"><I name="loader" size={16} className="animate-spin inline mr-2" />加载中...</div>
          ) : (
            <>
              {/* 三家供应商状态 */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">理解层 · {PROVIDER_LABELS[llm.provider] || llm.provider}</p>
                  <div className="mt-1 flex items-center justify-between gap-2"><p className="font-bold text-navy-700 text-xs truncate">{llm.model}</p><StatusChip ok={ready} label={ready ? "已就绪" : "待配置"} /></div>
                </div>
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">文档层 · TextIn xParse</p>
                  <div className="mt-1 flex items-center justify-between gap-2"><p className="font-bold text-navy-700 text-xs">{providers.textin?.enabled ? "已启用" : providers.textin?.configured ? "已配置未启用" : "未配置"}</p><StatusChip ok={!!providers.textin?.enabled} label={providers.textin?.enabled ? "在用" : "回退链"} /></div>
                </div>
                <div className="p-3 bg-lightPrimary rounded-xl">
                  <p className="text-xs text-gray-700">评估层 · Jev</p>
                  <div className="mt-1 flex items-center justify-between gap-2"><p className="font-bold text-navy-700 text-xs">{providers.jev?.enabled ? (providers.jev.mode === "primary" ? "主用" : "影子模式") : providers.jev?.configured ? "已配置未启用" : "未配置"}</p><StatusChip ok={!!providers.jev?.enabled} label={providers.jev?.enabled ? "在用" : "legacy"} /></div>
                </div>
              </div>

              {/* === Kimi === */}
              <div className="border-2 border-amber-100 bg-amber-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <I name="shield-check" size={16} className="text-amber-700" />
                  <p className="text-sm font-bold text-amber-900">Kimi(简历结构化 / JD 结构化 / 评估报告)</p>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => testProvider("kimi")} disabled={testing === "kimi"} icon={<I name={testing === "kimi" ? "loader" : "activity"} size={12} className={testing === "kimi" ? "animate-spin" : ""} />}>测试连接</Button>
                </div>
                {isAdmin && <SecretRow label="Kimi API Key" settingKey="kimi.api_key" placeholder="sk-... (写入 DB 时 AES-256-GCM 加密)" row={row("kimi.api_key")} onChanged={refreshLlmStatus} />}
                <div>
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">系统默认模型</p>
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg">
                    <select value={modelRow?.maskedValue || llm.model} onChange={(e) => saveSystemModel(e.target.value)} className="flex-1 bg-transparent text-sm text-navy-700 outline-none cursor-pointer">
                      {!(llm.availableModels || []).some((m) => m.id === (modelRow?.maskedValue || llm.model)) && <option value={modelRow?.maskedValue || llm.model}>{modelRow?.maskedValue || llm.model}(账号不可用,将自动回退)</option>}
                      {(llm.availableModels || []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-lightPrimary text-gray-700 font-bold">{modelRow?.source === "db" ? "DB" : "env"}</span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">配置的模型若不在账号可用列表,后端会自动按偏好回退 · 共 {llm.availableModels?.length || 0} 个可用</p>
                </div>
                <PromptRow settingKey="kimi.prompt" />
                <PromptRow settingKey="kimi.jd_schema_prompt" />
                <PromptRow settingKey="kimi.report_prompt" />
              </div>

              {/* === TextIn === */}
              <div className="border-2 border-blue-100 bg-blue-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <I name="file-scan" size={16} className="text-blue-700" />
                  <p className="text-sm font-bold text-blue-900">TextIn 文档解析(PDF / Word / 扫描件 / 图片 → Markdown)</p>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => testProvider("textin")} disabled={testing === "textin" || !providers.textin?.configured} icon={<I name={testing === "textin" ? "loader" : "activity"} size={12} className={testing === "textin" ? "animate-spin" : ""} />}>测试连接</Button>
                </div>
                {isAdmin && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <SecretRow label="x-ti-app-id" settingKey="textin.app_id" placeholder="TextIn 控制台 · 开发者信息" row={row("textin.app_id")} onChanged={refreshLlmStatus} />
                    <SecretRow label="x-ti-secret-code" settingKey="textin.secret_code" placeholder="TextIn 控制台 · 开发者信息" row={row("textin.secret_code")} onChanged={refreshLlmStatus} />
                  </div>
                )}
                <SettingField type="bool" label="启用 TextIn 文档层" settingKey="textin.enabled" row={row("textin.enabled")} fallback="false" onChanged={refreshLlmStatus} hint="关闭时走 pdftotext → Kimi Files 旧回退链;解析失败也会自动回退" />
                <SettingField label="单文件最多解析页数" settingKey="textin.max_pages" row={row("textin.max_pages")} fallback="10" onChanged={refreshLlmStatus} hint="按成功页计费(0.05 T币/页),防止超长 PDF 烧额度" />
              </div>

              {/* === Jev === */}
              <div className="border-2 border-violet-100 bg-violet-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <I name="scale" size={16} className="text-violet-700" />
                  <p className="text-sm font-bold text-violet-900">Jev 评估模型(TypeSafe AI · 逐项判定 + 置信度)</p>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => testProvider("jev")} disabled={testing === "jev" || !providers.jev?.configured} icon={<I name={testing === "jev" ? "loader" : "activity"} size={12} className={testing === "jev" ? "animate-spin" : ""} />}>测试连接</Button>
                </div>
                {isAdmin && <SecretRow label="Jev API Key" settingKey="jev.api_key" placeholder="apikey_... (api.typesafe.ai 控制台)" row={row("jev.api_key")} onChanged={refreshLlmStatus} />}
                <SettingField type="bool" label="启用 Jev 评估层" settingKey="jev.enabled" row={row("jev.enabled")} fallback="false" onChanged={refreshLlmStatus} hint="关闭或调用失败时自动回退 Kimi 基础评估(legacy)" />
                <div className="grid sm:grid-cols-2 gap-3">
                  <SettingField type="select" label="运行模式" settingKey="jev.mode" row={row("jev.mode")} fallback="shadow" onChanged={refreshLlmStatus}
                    options={[{ v: "shadow", l: "影子模式(双写不切 UI)" }, { v: "primary", l: "主用(Jev 结果写入候选人)" }]} hint="影子模式:Jev 结果只落评估表,列表与快照仍用基础评估,用于灰度对比" />
                  <SettingField label="模型" settingKey="jev.model" row={row("jev.model")} fallback="jev-latest" onChanged={refreshLlmStatus} />
                </div>
              </div>

              {/* === 评估规则 === */}
              <div className="border-2 border-gray-200 bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <I name="sliders-horizontal" size={16} className="text-gray-700" />
                  <p className="text-sm font-bold text-navy-700">评估规则(分数与分类由代码计算,AI 只判定)</p>
                </div>
                <SettingField type="select" label="报告生成策略" settingKey="eval.report_policy" row={row("eval.report_policy")} fallback="auto_ab" onChanged={refreshLlmStatus} options={REPORT_POLICIES} hint="按需时 C/D 类在候选人详情点「生成报告」再调 Kimi" />
                <ThresholdsField row={row("eval.thresholds")} onChanged={refreshLlmStatus} />
                <div className="grid sm:grid-cols-2 gap-3">
                  <SettingField label="核心题置信门槛(0-1)" settingKey="eval.confidence_gate" row={row("eval.confidence_gate")} fallback="0.5" onChanged={refreshLlmStatus} hint="任一核心题置信低于此值 → C 类待复核" />
                  <SettingField type="bool" label="发送 Jev 前脱敏" settingKey="eval.pii_strip" row={row("eval.pii_strip")} fallback="true" onChanged={refreshLlmStatus} hint="抹去姓名 / 电话 / 邮箱 / 链接 / 身份证行" disabled={!isAdmin} />
                </div>
              </div>

              {/* 个人偏好(任何用户) */}
              {ready && llm.availableModels?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">个人解析模型偏好</p>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {llm.availableModels.map((m) => {
                      const checked = selectedModel === m.id;
                      const isSysDefault = m.id === llm.model;
                      return (
                        <button key={m.id} onClick={() => onPickModel(m.id)}
                          className={`w-full text-left p-2.5 rounded-xl border-2 transition flex items-start gap-3 ${checked ? "border-brand bg-brand-50" : "border-gray-200 hover:border-gray-300 bg-white"}`}>
                          <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${checked ? "border-brand bg-brand" : "border-gray-300"}`}>
                            {checked && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-navy-700 flex items-center gap-2">
                              {m.label}
                              {isSysDefault && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-lightPrimary text-gray-700">系统默认</span>}
                            </p>
                            <p className="text-[11px] text-gray-700 mt-0.5">{m.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-600 mt-2">选择仅对你本人下次上传生效 · 存浏览器 localStorage</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                <Button variant="ghost" onClick={() => setOpen(false)}>关闭</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* === Prompt 编辑 Modal === */}
      <Modal open={!!promptKey} onClose={() => setPromptKey(null)} maxWidth="max-w-4xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
              <I name="file-text" size={18} className="text-brand" />
              {promptMeta?.title || "Prompt 编辑器"}
            </h3>
            <button onClick={() => setPromptKey(null)} className="text-gray-400 hover:text-navy-700"><I name="x" size={20} /></button>
          </div>
          <p className="text-xs text-gray-700">{promptMeta?.desc} <strong className="text-amber-700">保存后下次调用立即生效。</strong></p>
          {promptLoading ? (
            <div className="text-sm text-gray-700 py-12 text-center"><I name="loader" size={16} className="animate-spin inline mr-2" />加载中...</div>
          ) : (
            <>
              <textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} disabled={savingPrompt} spellCheck={false}
                className="w-full h-[480px] p-3 rounded-xl border-2 border-gray-200 font-mono text-xs leading-relaxed outline-none focus:border-brand resize-none" />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600">{promptText.length} 字符 · 上限 20,000</p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={resetPrompt} icon={<I name="rotate-ccw" size={12} />}>回退默认</Button>
                  <Button variant="ghost" onClick={() => setPromptKey(null)} disabled={savingPrompt}>取消</Button>
                  <Button onClick={savePrompt} disabled={savingPrompt} icon={<I name={savingPrompt ? "loader" : "check"} size={12} className={savingPrompt ? "animate-spin" : ""} />}>{savingPrompt ? "保存中" : "保存"}</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
