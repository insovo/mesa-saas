// 公开绩效评价页 — /performance-eval/:token（自评或主管，按 token 识别角色）
// 默认中英双语 UI；30s 自动保存草稿

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import {
  Card, Button, Input, I, toast, LoadingBlock, ToastHost, LiquidLoader, RequiredMark,
} from "../components/Primitives.jsx";
import { gsap, D, E, ensureMotionPref } from "../anim/gsap.js";

export default function PublicPerformanceEval() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rubricOpen, setRubricOpen] = useState(false);
  const dirtyRef = useRef(false);
  const formRef = useRef(null);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/public/performance-eval/${token}`);
      setMeta(data.meta);
      setForm(data.evaluation);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setError(msg || "链接无效");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [token]);

  // 30s autosave
  useEffect(() => {
    if (!form || meta?.readonly) return undefined;
    const id = setInterval(async () => {
      if (!dirtyRef.current || !formRef.current) return;
      try {
        setSaving(true);
        const payload = { ...buildPatch(formRef.current, meta.role), autosave: true };
        const { data } = await api.patch(`/public/performance-eval/${token}`, payload);
        setForm(data.evaluation);
        setMeta(data.meta);
        dirtyRef.current = false;
      } catch {
        /* soft */
      } finally {
        setSaving(false);
      }
    }, 30000);
    return () => clearInterval(id);
  }, [form, meta?.readonly, meta?.role, token]);

  const role = meta?.role;
  const readonly = meta?.readonly;

  const liveManagerTotal = useMemo(() => {
    if (!form?.scores) return null;
    const all = form.scores.every((s) => s.managerScore != null && s.managerScore !== "");
    // 五项未齐时不回落服务端旧总分，避免拖动时「滞后感」
    if (!all) return null;
    let sum = 0;
    for (const s of form.scores) {
      sum += (Number(s.weight) * Number(s.managerScore)) / 100;
    }
    return Math.round(sum * 10) / 10;
  }, [form]);

  const liveSelfTotal = useMemo(() => {
    if (!form?.scores) return null;
    const all = form.scores.every((s) => s.selfScore != null && s.selfScore !== "");
    if (!all) return null;
    let sum = 0;
    for (const s of form.scores) {
      sum += (Number(s.weight) * Number(s.selfScore)) / 100;
    }
    return Math.round(sum * 10) / 10;
  }, [form]);

  // 与后端 ratingFor / pipTriggeredFor 镜像 — 跟主管加权总分实时联动
  const liveRating = useMemo(() => ratingForTotal(liveManagerTotal), [liveManagerTotal]);
  const livePip = useMemo(() => pipTriggeredForTotal(liveManagerTotal), [liveManagerTotal]);

  function patchForm(updater) {
    if (readonly) return;
    dirtyRef.current = true;
    setForm((prev) => updater(prev));
  }

  function setScore(key, field, value) {
    patchForm((prev) => ({
      ...prev,
      scores: prev.scores.map((s) =>
        s.key === key ? { ...s, [field]: value === "" ? null : value } : s
      ),
    }));
  }

  async function saveNow() {
    if (!form || readonly) return;
    setSaving(true);
    try {
      const payload = buildPatch(form, role);
      const { data } = await api.patch(`/public/performance-eval/${token}`, payload);
      setForm(data.evaluation);
      setMeta(data.meta);
      dirtyRef.current = false;
      toast("已保存草稿 / Draft saved", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit() {
    // 次数用尽时字段只读，但仍允许提交已填内容
    if (!form || (!meta?.canSubmit && readonly)) return;
    if (!meta?.canSubmit) return;

    // 自评：目标·成果·发展提交时必填（草稿不校验）
    if (role === "self") {
      const summaryChecks = [
        { key: "achievements", label: "本期主要成果" },
        { key: "developmentPlan", label: "改进与发展计划" },
        { key: "nextGoals", label: "下一周期目标" },
      ];
      for (const f of summaryChecks) {
        if (!String(form[f.key] || "").trim()) {
          toast(`请填写「${f.label}」后再提交`, "error");
          document.getElementById("perf-summary-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      if (!readonly) {
        const payload = buildPatch(form, role);
        await api.patch(`/public/performance-eval/${token}`, payload);
      }
      const { data } = await api.post(`/public/performance-eval/${token}/submit`);
      setForm(data.evaluation);
      setMeta(data.meta);
      dirtyRef.current = false;
      toast(role === "manager" ? "主管评价已提交，整单已锁定" : "自评已提交", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function onExport(lang = "zh-en") {
    try {
      const res = await api.get(`/public/performance-eval/${token}/export.xlsx`, {
        params: { lang },
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `绩效评价_${form?.employeeName || "export"}_${lang}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-lightPrimary flex items-center justify-center">
        <LoadingBlock height="h-32" label="加载评价表…" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-lightPrimary flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-3">
          <I name="link-off" size={36} className="text-[#A0AEC0] mx-auto" />
          <h1 className="text-lg font-bold text-navy-700">无法打开评价链接</h1>
          <p className="text-sm text-[#707EAE]">{error || "Not found"}</p>
        </Card>
        <ToastHost />
      </div>
    );
  }

  const displayTotal = role === "self" ? liveSelfTotal : liveManagerTotal;
  const roleTitle = role === "self"
    ? "员工自评 / Employee Self-assessment"
    : "主管评价 / Manager Evaluation";

  return (
    <div className="min-h-screen bg-lightPrimary pb-24">
      <ToastHost />
      <header className="bg-white border-b border-[#E9ECEF] sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] font-bold text-brand tracking-wide uppercase">
              MESA Recruit · Performance
            </div>
            <h1 className="text-lg font-bold text-navy-700">{roleTitle}</h1>
            <p className="text-xs text-[#707EAE]">
              {form.employeeName}
              {form.reviewPeriod ? ` · ${form.reviewPeriod}` : ""}
              {saving ? " · 保存中…" : ""}
              {readonly ? " · 只读" : ""}
              {meta?.maxEdits != null && !meta?.editsExhausted && (
                <> · 剩余可保存 {meta.editsRemaining}/{meta.maxEdits} 次</>
              )}
              {meta?.editsExhausted && meta?.canSubmit && (
                <span className="text-rose-600"> · 修改次数已用尽，请尽快提交</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LiquidLoader
              level={displayTotal != null ? Math.min(100, displayTotal) : 0}
              label={displayTotal != null ? displayTotal : ""}
              size={64}
              loading={displayTotal == null}
            />
            <div className="flex flex-col items-stretch gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setRubricOpen(true)}>
                <I name="book-open" size={14} /> 评分标准
              </Button>
              <div className="text-xs text-[#707EAE] text-center tabular-nums">
                Rating:{" "}
                <b className="text-navy-700">
                  {ratingLetterForTotal(displayTotal)
                    ?? (readonly ? ratingLetterFromText(form.rating) : null)
                    ?? "—"}
                </b>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold text-navy-700">
            一、被评价人信息 / Employee Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="姓名 / Name" value={form.employeeName} readOnly />
            <Field
              label="岗位 / Position"
              value={form.position || ""}
              readOnly={readonly || role !== "self"}
              onChange={(v) => patchForm((p) => ({ ...p, position: v }))}
            />
            <Field
              label="工号 / ID"
              value={form.employeeNo || ""}
              readOnly={readonly || role !== "self"}
              onChange={(v) => patchForm((p) => ({ ...p, employeeNo: v }))}
            />
            <Field
              label="直属主管 / Line Manager"
              value={form.lineManager || ""}
              readOnly={readonly}
              onChange={(v) => patchForm((p) => ({ ...p, lineManager: v }))}
            />
            <Field
              label="部门 / Department"
              value={form.department || ""}
              readOnly={readonly || role !== "self"}
              onChange={(v) => patchForm((p) => ({ ...p, department: v }))}
            />
            <Field
              label="职级 / Level"
              value={form.level || ""}
              readOnly={readonly || role !== "self"}
              onChange={(v) => patchForm((p) => ({ ...p, level: v }))}
            />
            <Field label="评价周期 / Review Period" value={form.reviewPeriod} readOnly />
            <Field
              label="评价日期 / Date"
              value={form.evalDate ? String(form.evalDate).slice(0, 10) : ""}
              readOnly
            />
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold text-navy-700">
            二、绩效评分 / Performance Scoring
            <span className="ml-2 text-[11px] font-normal text-[#707EAE]">
              每项 1–100 · 权重合计 100
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[880px]">
              <thead>
                <tr className="text-left text-[#A0AEC0] border-b border-[#E9ECEF]">
                  <th className="py-2 pr-2 w-8">No.</th>
                  <th className="py-2 pr-2">评价维度 / Dimension</th>
                  <th className="py-2 pr-2 w-14">权重%</th>
                  <th className="py-2 pr-3 w-[168px]">自评 Self {role === "self" && <RequiredMark />}</th>
                  <th className="py-2 pr-3 w-[168px]">主管 Manager {role === "manager" && <RequiredMark />}</th>
                  <th className="py-2">证据与说明 / Evidence</th>
                </tr>
              </thead>
              <tbody>
                {(form.scores || []).map((s, idx) => (
                  <tr key={s.key} className="border-b border-[#F4F7FE] align-top">
                    <td className="py-3 text-[#A0AEC0]">{idx + 1}</td>
                    <td className="py-3">
                      <div className="font-bold text-navy-700">{s.name}</div>
                      <div className="text-[10px] text-[#707EAE] mt-0.5">{s.nameEn}</div>
                      <div className="text-[10px] text-[#A0AEC0] mt-1">{s.observation}</div>
                    </td>
                    <td className="py-3 font-mono">{s.weight}</td>
                    <td className="py-3 pr-3">
                      <ScoreSlider
                        value={s.selfScore}
                        disabled={readonly || role !== "self"}
                        onChange={(v) => setScore(s.key, "selfScore", v)}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <ScoreSlider
                        value={s.managerScore}
                        disabled={readonly || role !== "manager"}
                        onChange={(v) => setScore(s.key, "managerScore", v)}
                      />
                    </td>
                    <td className="py-3">
                      <textarea
                        rows={2}
                        disabled={readonly}
                        value={s.evidence || ""}
                        onChange={(e) => setScore(s.key, "evidence", e.target.value)}
                        className="w-full rounded-xl border border-[#E9ECEF] px-2 py-1.5 text-xs outline-none focus:border-brand disabled:bg-gray-50"
                        placeholder="事实与数据 / Facts & data"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-[#707EAE]">
            <span>自评参考总分 Self: <b className="text-navy-700">{liveSelfTotal ?? "—"}</b></span>
            <span>主管加权总分 Manager: <b className="text-navy-700">{liveManagerTotal ?? "—"}</b></span>
            <span>
              等级 Rating:{" "}
              <b className="text-navy-700">
                {liveRating ?? (readonly ? form.rating || "—" : "—")}
              </b>
            </span>
            {(livePip === true || (livePip == null && readonly && form.pipTriggered === true)) && (
              <span className="text-amber-700 font-bold">触发 PIP / PIP triggered</span>
            )}
          </div>
        </Card>

        <Card id="perf-summary-section" className="p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-navy-700">
              三、目标·成果·发展 / Goals, Achievements & Development
            </h2>
            <p className="text-[11px] text-[#A0AEC0] mt-1">
              {role === "self"
                ? "由员工自评填写；提交时三项均必填，保存草稿不校验。"
                : "由员工自评填写；主管只读，不可修改。"}
            </p>
          </div>
          <TextArea
            label="本期主要成果 / Key achievements"
            value={form.achievements || ""}
            disabled={readonly || role !== "self"}
            required={role === "self"}
            onChange={(v) => patchForm((p) => ({ ...p, achievements: v }))}
          />
          <TextArea
            label="改进与发展计划 / Improvement & development"
            value={form.developmentPlan || ""}
            disabled={readonly || role !== "self"}
            required={role === "self"}
            onChange={(v) => patchForm((p) => ({ ...p, developmentPlan: v }))}
          />
          <TextArea
            label="下一周期目标 / Next-period goals"
            value={form.nextGoals || ""}
            disabled={readonly || role !== "self"}
            required={role === "self"}
            onChange={(v) => patchForm((p) => ({ ...p, nextGoals: v }))}
          />
        </Card>
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-[#E9ECEF] z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-[#707EAE]">
            基于事实与岗位相关行为打分 · GDPR/LOPDGDD 目的限定
          </div>
          <div className="flex gap-2 flex-wrap">
            {meta?.canExport && (
              <Button size="sm" variant="ghost" onClick={() => onExport("zh-en")}>
                <I name="download" size={14} /> 导出 Excel
              </Button>
            )}
            {!readonly && (
              <Button size="sm" variant="ghost" disabled={saving} onClick={saveNow}>
                保存草稿
              </Button>
            )}
            {meta?.canSubmit && (
              <Button size="sm" disabled={submitting} onClick={onSubmit}>
                {submitting ? "提交中…" : role === "manager" ? "提交主管评价" : "提交自评"}
              </Button>
            )}
            {!meta?.canSubmit && readonly && !meta?.canExport && (
              <span className="text-xs text-[#A0AEC0] self-center">已提交或已锁定</span>
            )}
          </div>
        </div>
      </footer>

      {rubricOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setRubricOpen(false)}>
          <div
            className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-navy-700">评分标准 / Scoring Criteria</h3>
              <button type="button" onClick={() => setRubricOpen(false)}>
                <I name="x" size={20} className="text-[#A0AEC0]" />
              </button>
            </div>
            <div className="space-y-3">
              {(meta?.scoringRubric || []).map((r) => (
                <div key={r.range} className="rounded-xl border border-[#E9ECEF] p-3">
                  <div className="text-xs font-bold text-brand">{r.range}</div>
                  <div className="text-sm font-bold text-navy-700 mt-0.5">{r.level}</div>
                  <p className="text-xs text-[#707EAE] mt-1 leading-relaxed">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildPatch(form, role) {
  return {
    scores: (form.scores || []).map((s) => ({
      key: s.key,
      weight: s.weight,
      selfScore: s.selfScore,
      managerScore: s.managerScore,
      evidence: s.evidence,
    })),
    lineManager: form.lineManager,
    ...(role === "self"
      ? {
          achievements: form.achievements,
          developmentPlan: form.developmentPlan,
          nextGoals: form.nextGoals,
          employeeNo: form.employeeNo,
          position: form.position,
          department: form.department,
          level: form.level,
        }
      : {}),
  };
}

function Field({ label, value, onChange, readOnly }) {
  return (
    <label className="block text-[11px] font-bold text-[#707EAE]">
      {label}
      <Input
        className="mt-1"
        value={value || ""}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </label>
  );
}

/**
 * 1–100 拖动评分条（Claude/Codex 倍率条风格）
 * 仅 UI；写入仍为整数分，Excel 导出字段不变。
 */
/** 镜像 server ratingFor — 主管加权总分 → 等级文案 */
function ratingForTotal(total) {
  if (total == null || Number.isNaN(Number(total))) return null;
  const t = Number(total);
  if (t >= 90) return "A 优秀/Excellent";
  if (t >= 80) return "B 良好/Good";
  if (t >= 60) return "C 胜任/Competent";
  if (t >= 40) return "D 待改进/Needs improvement";
  return "E 不胜任/Unsatisfactory";
}

/** 顶部 sticky 只展示字母，与评分球总分实时联动 */
function ratingLetterForTotal(total) {
  const full = ratingForTotal(total);
  return full ? full.charAt(0) : null;
}

function ratingLetterFromText(rating) {
  if (!rating || typeof rating !== "string") return null;
  const m = rating.trim().match(/^[ABCDE]/i);
  return m ? m[0].toUpperCase() : null;
}

function pipTriggeredForTotal(total) {
  if (total == null || Number.isNaN(Number(total))) return null;
  return Number(total) < 60;
}

function ScoreSlider({ value, onChange, disabled }) {
  const numRef = useRef(null);
  const thumbGlowRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const n = value == null || value === "" ? null : Number(value);
  const score = n != null && Number.isFinite(n) ? Math.min(100, Math.max(1, Math.round(n))) : null;
  const pct = score == null ? 0 : score;

  useEffect(() => {
    ensureMotionPref();
  }, []);

  useEffect(() => {
    if (score == null || !numRef.current) return;
    gsap.fromTo(
      numRef.current,
      { scale: 1.22, y: -3 },
      { scale: 1, y: 0, duration: D.fast, ease: E.out, overwrite: "auto" },
    );
    if (thumbGlowRef.current) {
      gsap.fromTo(
        thumbGlowRef.current,
        { scale: 1.35, opacity: 0.55 },
        { scale: 1, opacity: 0, duration: 0.35, ease: E.out, overwrite: "auto" },
      );
    }
  }, [score]);

  function handleChange(raw) {
    const v = Math.min(100, Math.max(1, Math.round(Number(raw))));
    if (!Number.isFinite(v)) return;
    onChange(v);
  }

  return (
    <div
      className={`w-[148px] select-none ${disabled ? "opacity-45 pointer-events-none" : ""}`}
    >
      <div className="flex items-end justify-between mb-1.5 min-h-[22px]">
        <span
          ref={numRef}
          className={`text-lg font-bold tabular-nums leading-none tracking-tight ${
            score == null ? "text-[#A0AEC0]" : "text-brand"
          }`}
        >
          {score ?? "—"}
        </span>
        <span className="text-[10px] text-[#A0AEC0] pb-0.5">/100</span>
      </div>

      <div className="relative h-9 flex items-center">
        {/* 轨道 */}
        <div className="absolute inset-x-0 h-2.5 rounded-full bg-[#E9ECEF] overflow-hidden shadow-inner">
          <div
            className="h-full rounded-full bg-brand-gradient origin-left"
            style={{
              width: `${pct}%`,
              transition: dragging ? "none" : "width 120ms ease-out",
            }}
          />
        </div>

        {/* 拖动时拇指光晕 */}
        {score != null && (
          <div
            ref={thumbGlowRef}
            aria-hidden
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full bg-brand/30"
            style={{ left: `${pct}%` }}
          />
        )}

        {/* 拖动气泡 */}
        {dragging && score != null && (
          <div
            className="pointer-events-none absolute -top-7 -translate-x-1/2 z-20"
            style={{ left: `${pct}%` }}
          >
            <div className="px-2 py-0.5 rounded-md bg-navy-700 text-white text-[11px] font-bold tabular-nums shadow-card whitespace-nowrap">
              {score}
            </div>
          </div>
        )}

        <input
          type="range"
          min={1}
          max={100}
          step={1}
          disabled={disabled}
          value={score ?? 1}
          aria-valuemin={1}
          aria-valuemax={100}
          aria-valuenow={score ?? undefined}
          aria-valuetext={score == null ? "未评分" : String(score)}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onChange={(e) => handleChange(e.target.value)}
          className={[
            "relative z-10 w-full h-9 appearance-none bg-transparent cursor-pointer",
            "[&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
            "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand",
            "[&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(66,42,251,0.35)]",
            "[&::-webkit-slider-thumb]:mt-[-3px] [&::-webkit-slider-thumb]:transition-transform",
            "active:[&::-webkit-slider-thumb]:scale-125",
            "[&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-brand",
            "[&::-moz-range-thumb]:shadow-[0_2px_8px_rgba(66,42,251,0.35)]",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange, disabled, required = false }) {
  return (
    <label className="block text-[11px] font-bold text-[#707EAE]">
      {label}
      {required && <RequiredMark />}
      <textarea
        rows={3}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[#E9ECEF] px-3 py-2 text-sm text-navy-700 outline-none focus:border-brand disabled:bg-gray-50"
      />
    </label>
  );
}
