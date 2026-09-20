import { useEffect, useState } from "react";
import { Modal, Button, I } from "./Primitives.jsx";

// 重新解析前的确认弹窗 — 被 CandidateDetail 与 Candidates 列表页共用。
// onConfirm(jobIdOverride, mode):
//   jobIdOverride: ""(本组件规范化为 null)→ 取消 JD 关联,只刷新简历字段;uuid → 切到该 JD 并评估
//   mode(三层流水线粒度,第二参数可选,旧调用方只传 jobId 时后端默认 reextract):
//     reevaluate 只重跑评估(秒级,不读简历,需要 JD)/ reextract 复用已识别文本重新结构化 / full 重新识别文档(TextIn 计费)
const MODES = [
  { value: "reevaluate", label: "重新评估", desc: "只重跑评估,秒级;不重新读简历", needsJob: true, icon: "scan-search" },
  { value: "reextract", label: "重新抽取", desc: "复用已识别文本,重新结构化 + 评估,约 1 分钟", icon: "sparkles" },
  { value: "full", label: "重新识别文档", desc: "重新读取文件,会产生文档解析费用", icon: "file-scan" },
];

export default function ReparseConfirmModal({ open, onClose, onConfirm, currentJob, jobs, candidateName, reparsing, hasProfile = true, defaultMode = "reextract" }) {
  const [selectedJobId, setSelectedJobId] = useState(currentJob?.id || "");
  const [mode, setMode] = useState(defaultMode);
  useEffect(() => { if (open) { setSelectedJobId(currentJob?.id || ""); setMode(defaultMode); } }, [open, currentJob?.id, defaultMode]);
  useEffect(() => { if (!selectedJobId && mode === "reevaluate") setMode("reextract"); }, [selectedJobId, mode]);
  if (!open) return null;

  const targetJob = jobs.find((j) => j.id === selectedJobId);
  const willMatch = !!targetJob;

  function handleConfirm() {
    onConfirm(selectedJobId || null, mode);
  }

  return (
    <Modal open={open} onClose={reparsing ? () => {} : onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2">
            <I name="sparkles" size={18} className="text-[#422AFB]" />
            重新解析简历
          </h3>
          <button onClick={onClose} disabled={reparsing} className="text-gray-400 hover:text-[#1B254B] disabled:opacity-30"><I name="x" size={20} /></button>
        </div>

        <p className="text-sm text-[#707EAE] mb-4">
          对 <span className="font-bold text-[#1B254B]">{candidateName || "候选人"}</span> 的简历重新跑三层流水线(文档识别 → 结构化 → 硬筛 + Jev 评估),
          先确认投递岗位与解析粒度。
        </p>

        <div className="mb-4">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5 block">投递岗位</label>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            disabled={reparsing}
            className="w-full h-10 px-3 rounded-xl border border-[#E9ECEF] text-sm text-[#1B254B] bg-white focus:border-[#422AFB] focus:ring-2 focus:ring-[#422AFB]/20 outline-none transition disabled:opacity-50"
          >
            <option value="">— 不评估 JD(仅刷新简历字段)—</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}{j.dept ? ` · ${j.dept}` : ""}</option>
            ))}
          </select>
          <p className="text-[10px] text-[#A3AED0] mt-2">
            {willMatch
              ? "→ 硬筛 + Jev 逐项判定,生成分类 / 维度分 / 风险 / 亮点 / 面试验证点"
              : "→ 仅刷新工作经历、教育、技能等结构化字段,清空所有 JD 相关字段"}
          </p>
        </div>

        <div className="mb-5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5 block">解析粒度</label>
          <div className="space-y-1.5">
            {MODES.map((m) => {
              const disabled = reparsing || (m.needsJob && !willMatch);
              const active = mode === m.value;
              return (
                <label
                  key={m.value}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${active ? "border-[#422AFB] bg-[#F4F7FE]" : "border-[#E9ECEF] hover:border-[#422AFB]/40"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <input type="radio" name="reparse-mode" value={m.value} checked={active} disabled={disabled} onChange={() => setMode(m.value)} className="mt-1 accent-[#422AFB]" />
                  <span className="min-w-0">
                    <span className="text-sm font-bold text-[#1B254B] flex items-center gap-1.5"><I name={m.icon} size={13} className="text-[#422AFB]" />{m.label}</span>
                    <span className="block text-[11px] text-[#707EAE] mt-0.5">{m.desc}{m.needsJob && !willMatch ? "(需先选择投递岗位)" : ""}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {!hasProfile && mode === "reevaluate" && (
            <p className="text-[10px] text-amber-700 mt-2 flex items-start gap-1">
              <I name="alert-triangle" size={10} className="mt-0.5 shrink-0" /> 该候选人尚无结构化档案,只重评时硬筛将基于旧字段,建议选「重新抽取」
            </p>
          )}
        </div>

        {mode !== "reevaluate" && (
          <p className="text-[10px] text-[#A3AED0] mb-4">
            ⚠ 已有的工作经历 / 教育 / 技能等字段会被新解析覆盖(LLM 返回空时保留旧值)。原始简历附件不变。
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={reparsing}>取消</Button>
          <Button onClick={handleConfirm} disabled={reparsing} icon={<I name={reparsing ? "loader" : "zap"} size={12} className={reparsing ? "animate-spin" : ""} />}>
            {reparsing ? (mode === "reevaluate" ? "评估中..." : "解析中...") : (mode === "reevaluate" ? "开始评估" : "开始解析")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
