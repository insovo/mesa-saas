import { useEffect, useState } from "react";
import { Modal, Button, I } from "./Primitives.jsx";

// 重新解析前的 JD 确认弹窗 — 被 CandidateDetail 与 Candidates 列表页共用。
// jobIdOverride 语义传给后端 (POST /resumes/parse):
//   ""(本组件 onConfirm 会规范化为 null)  → 取消 JD 关联,只刷新简历字段
//   uuid                                   → 切到该 JD,跑 match,同步 candidate.jobId
export default function ReparseConfirmModal({ open, onClose, onConfirm, currentJob, jobs, candidateName, reparsing }) {
  const [selectedJobId, setSelectedJobId] = useState(currentJob?.id || "");
  useEffect(() => { if (open) setSelectedJobId(currentJob?.id || ""); }, [open, currentJob?.id]);
  if (!open) return null;

  const targetJob = jobs.find((j) => j.id === selectedJobId);
  const willMatch = !!targetJob;

  function handleConfirm() {
    onConfirm(selectedJobId || null);
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
          系统将重新调 Kimi 解析 <span className="font-bold text-[#1B254B]">{candidateName || "候选人"}</span> 的简历附件,
          确认投递岗位 → 决定是否同步生成 JD 匹配评估。
        </p>

        <div className="mb-5">
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
              ? "→ 跑 Kimi 二次评估,生成 JD 匹配度 / 风险 / 亮点 / 洞察"
              : "→ 仅刷新工作经历、教育、技能等结构化字段,清空所有 JD 相关字段"}
          </p>
        </div>

        <p className="text-[10px] text-[#A3AED0] mb-4">
          ⚠ 已有的工作经历 / 教育 / 技能等字段会被新解析覆盖(LLM 返回空时保留旧值)。原始简历附件不变。
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={reparsing}>取消</Button>
          <Button onClick={handleConfirm} disabled={reparsing} icon={<I name={reparsing ? "loader" : "zap"} size={12} className={reparsing ? "animate-spin" : ""} />}>
            {reparsing ? "解析中..." : "开始解析"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
