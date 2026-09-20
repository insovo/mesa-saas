// legacy 适配器:把 kimi.js matchAgainstJob 的输出(jdMatch + risks/highlights/...)包成 CandidateEvaluation 同形
// 用于 jev.enabled=false / Jev 调用失败时的自动回退。engine="legacy",items=[],只有 CORE 维度=jdMatch。

export function legacyToEvaluation(match, { thresholds = { A: 85, B: 70, C: 55 } } = {}) {
  const score = typeof match?.jdMatch === "number" ? Math.max(0, Math.min(100, Math.round(match.jdMatch))) : 0;
  const classification = score >= thresholds.A ? "A" : score >= thresholds.B ? "B" : score >= thresholds.C ? "C" : "D";
  return {
    engine: "legacy",
    hardFilter: { result: "UNKNOWN", items: [] },
    items: [],
    dimensions: [{ key: "CORE", score, weight: 100 }],
    overallScore: score,
    bonus: 0,
    classification,
    reviewPriority: classification === "A" || classification === "B" ? "HIGH" : classification === "C" ? "REVIEW" : "LOW",
    reasons: [`legacy:${classification}`],
    flags: ["legacy"],
    minConfidence: null,
    report: {
      matchReason: match?.matchReason || null,
      highlights: (match?.highlights || []).map((t) => ({ reqKey: null, text: String(t).slice(0, 300), evidence: null })),
      risks: (match?.risks || []).map((t) => ({ reqKey: null, text: String(t).slice(0, 300), evidence: null })),
      insights: Array.isArray(match?.insights) ? match.insights.filter((i) => i && (i.kind === "up" || i.kind === "down") && typeof i.text === "string").slice(0, 20).map((i) => ({ kind: i.kind, text: i.text.slice(0, 300) })) : [],
      interviewProbes: [],
      matchedFor: (match?.matchedFor || []).slice(0, 12),
      againstFor: (match?.againstFor || []).slice(0, 12),
      aiSuggestedTags: (match?.aiSuggestedTags || []).slice(0, 12),
      evidence: [],
    },
    reportStatus: "done",
  };
}
