// 加权与分类(纯函数,可单测)— AI 负责逐项判定,代码负责最终计算。
//   normalizeAnswers(evaluationModel, hardFilter, jevAnswers, questionMap) → items[]
//   composite(evaluationModel, items, jevAnswers, settings)               → { dimensions, overallScore, bonus, classification, reviewPriority, reasons, flags, minConfidence }
// 分类顺序(先命中先出):MUST 不满足 → D;信息不足 → C;核心题低置信 → C;MUST 未知 → 上限 C;夸大 → 降一级;阈值分档。

const TIER_ORDER = ["MUST", "CORE", "PREFERRED", "BONUS"];

function verdictOf(n, opts = {}) {
  if (opts.unknown) return "未提及";
  if (n >= 0.75) return "满足";
  if (n >= 0.4) return "部分满足";
  return "不满足";
}

// ─── 逐题归一 ───
export function normalizeAnswers(evaluationModel, hardFilter, jevAnswers = {}, questionMap = {}) {
  const items = [];
  const hf = new Map((hardFilter?.items || []).map((i) => [i.key, i]));
  const reqs = Array.isArray(evaluationModel?.requirements) ? evaluationModel.requirements : [];
  const byKey = new Map(Object.entries(questionMap).map(([qid, key]) => [key, qid]));

  for (const r of reqs) {
    if (!r || r.tier === "INFO" || r.method === "none") continue;
    const h = hf.get(r.key);
    const qid = byKey.get(r.key);
    const a = qid ? jevAnswers?.[qid] : null;
    const base = { key: r.key, label: r.label, tier: r.tier, method: r.method, weight: r.weight ?? 0, bonus: r.bonus ?? 0, unknownPolicy: r.unknownPolicy || "review" };

    if (h && (h.result === "PASS" || h.result === "FAIL")) {
      items.push({ ...base, source: "code", normalized: h.result === "PASS" ? 1 : 0, verdict: h.result === "PASS" ? "满足" : "不满足", confidence: 1, raw: { code: h } });
      continue;
    }
    if (a && a.type === "noul") {
      const p = Number(a.noul);
      items.push({ ...base, source: "jev", normalized: p, verdict: verdictOf(p >= 0.7 ? 1 : p >= 0.3 ? 0.5 : 0), confidence: Math.round(Math.abs(p - 0.5) * 2 * 10000) / 10000, raw: { noul: p, code: h || null } });
      continue;
    }
    if (a && a.type === "score") {
      const levels = Object.keys(a.legend || a.probabilities || {}).length || 4;
      const s = Number(a.score);
      const probs = a.probabilities || {};
      let argmax = 0, best = -1;
      for (const [k, v] of Object.entries(probs)) if (v > best) { best = v; argmax = Number(k); }
      const unknown = argmax === 0 && best >= 0.5;
      const n = unknown ? 0 : Math.round(Math.max(0, Math.min(1, s / Math.max(1, levels - 1))) * 10000) / 10000;
      items.push({ ...base, source: "jev", normalized: n, verdict: verdictOf(n, { unknown }), confidence: typeof a.confidence === "number" ? a.confidence : 0.5, raw: { score: s, levels, argmax, confidence: a.confidence, code: h || null } });
      continue;
    }
    // 既无代码判定也无 Jev 答案:UNKNOWN / IGNORED / MISMATCH
    const result = h?.result || "UNKNOWN";
    items.push({ ...base, source: "none", normalized: null, verdict: result === "MISMATCH" ? "待确认" : "未提及", confidence: 0, raw: { code: h || null }, unknown: true });
  }
  return items;
}

// ─── 加权 + 分类 ───
export function composite(evaluationModel, items, jevAnswers = {}, settings = {}) {
  const tw = { MUST: 25, CORE: 45, PREFERRED: 15, STABILITY: 15, ...(settings.tierWeights || evaluationModel?.tierWeights || {}) };
  const thresholds = { A: 85, B: 70, C: 55, ...(settings.thresholds || evaluationModel?.thresholds || {}) };
  const gate = settings.confidenceGate ?? evaluationModel?.confidenceGate ?? 0.5;
  const bonusCap = settings.bonusCap ?? evaluationModel?.bonusCap ?? 8;
  const reasons = [];
  const flags = [];

  // 维度分:UNKNOWN 且 policy=ignore/interview 不入分母;policy=review 的 UNKNOWN 也不入分母(由分类规则处理)
  const dims = {};
  for (const tier of ["MUST", "CORE", "PREFERRED"]) {
    let num = 0, den = 0;
    for (const it of items) {
      if (it.tier !== tier || it.unknown || it.normalized == null) continue;
      const w = it.weight > 0 ? it.weight : 1;
      num += w * it.normalized; den += w;
    }
    dims[tier] = den > 0 ? Math.round((num / den) * 100) : null;
  }
  // 稳定性维度
  const stab = jevAnswers?.meta_stability;
  let stabilityScore = null;
  if (stab && stab.type === "score") {
    const levels = Object.keys(stab.legend || stab.probabilities || {}).length || 4;
    stabilityScore = Math.round((Number(stab.score) / Math.max(1, levels - 1)) * 100);
  }
  dims.STABILITY = stabilityScore;

  // 总分:只对有值的维度加权
  let wsum = 0, ssum = 0;
  for (const k of ["MUST", "CORE", "PREFERRED", "STABILITY"]) {
    if (dims[k] == null) continue;
    wsum += tw[k] || 0; ssum += (tw[k] || 0) * dims[k];
  }
  const overallBase = wsum > 0 ? ssum / wsum : 0;
  // BONUS:封顶
  let bonus = 0;
  for (const it of items) if (it.tier === "BONUS" && !it.unknown && it.normalized != null) bonus += (it.bonus || 0) * it.normalized;
  bonus = Math.min(bonusCap, Math.round(bonus * 10) / 10);
  const overallScore = Math.max(0, Math.min(100, Math.round(overallBase + bonus)));

  // 置信:只看 Jev 判定的 CORE / PREFERRED
  const confs = items.filter((it) => it.source === "jev" && (it.tier === "CORE" || it.tier === "PREFERRED")).map((it) => it.confidence);
  const minConfidence = confs.length ? Math.round(Math.min(...confs) * 10000) / 10000 : null;

  // 分类
  let classification = null;
  const mustFail = items.find((it) => it.tier === "MUST" && it.verdict === "不满足" && (it.source === "code" || (it.source === "jev" && it.normalized < 0.3)));
  if (mustFail) { classification = "D"; reasons.push(`hard_fail:${mustFail.key}`); }
  const suff = jevAnswers?.meta_sufficiency?.noul;
  if (!classification && typeof suff === "number" && suff > 0.6) { classification = "C"; reasons.push("insufficient_info"); flags.push("insufficient_info"); }
  const lowConf = items.find((it) => it.source === "jev" && it.tier === "CORE" && it.confidence < gate);
  if (!classification && lowConf) { classification = "C"; reasons.push(`low_confidence:${lowConf.key}`); }
  const mustUnknown = items.filter((it) => it.tier === "MUST" && it.unknown && it.unknownPolicy === "review");
  let cap = null;
  if (mustUnknown.length) { cap = "C"; reasons.push(...mustUnknown.map((it) => `must_unknown:${it.key}`)); }
  if (!classification) {
    classification = overallScore >= thresholds.A ? "A" : overallScore >= thresholds.B ? "B" : overallScore >= thresholds.C ? "C" : "D";
    reasons.push(`threshold:${classification}`);
  }
  const infl = jevAnswers?.meta_inflation?.noul;
  if (typeof infl === "number" && infl > 0.7) {
    flags.push("inflation");
    if (classification === "A") classification = "B"; else if (classification === "B") classification = "C";
    reasons.push("inflation_downgrade");
  }
  if (cap === "C" && (classification === "A" || classification === "B")) classification = "C";
  const reviewPriority = classification === "A" || classification === "B" ? "HIGH" : classification === "C" ? "REVIEW" : "LOW";
  // 待面试验证项(unknownPolicy=interview 且未判定)
  const interviewKeys = items.filter((it) => it.unknown && it.unknownPolicy === "interview").map((it) => it.key);

  return {
    dimensions: ["MUST", "CORE", "PREFERRED", "STABILITY"].map((k) => ({ key: k, score: dims[k], weight: tw[k] || 0 })),
    overallScore,
    overallBase: Math.round(overallBase),
    bonus,
    classification,
    reviewPriority,
    reasons,
    flags,
    minConfidence,
    interviewKeys,
    thresholds,
  };
}
