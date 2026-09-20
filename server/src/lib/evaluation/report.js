// 报告层:Kimi 只解释不改分;引文必须在简历原文中存在(归一子串匹配),否则丢弃引文保留文案。
//   sanitizeReport(raw, { resumeText, items, detail }) → report(可直接入库)
//   candidateSnapshotFromReport(report)                → 写回 Candidate 旧列(risks/highlights/insights/...)

function squash(s) {
  return String(s || "").toLowerCase().replace(/[\s,，。.;；:：、()（）\-–—/·"'“”‘’*_#>|]+/g, "");
}
const str = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null);
const arr = (v, limit) => (Array.isArray(v) ? v.slice(0, limit) : []);

// 从 TextIn detail(逐段 {page,text})反查引文所在页
function pageOfQuote(quote, detail) {
  if (!quote || !Array.isArray(detail) || !detail.length) return null;
  const q = squash(quote);
  for (const d of detail) if (d?.text && squash(d.text).includes(q)) return d.page ?? null;
  return null;
}

export function verifyQuote(quote, resumeText) {
  const q = str(quote, 120);
  if (!q) return { quote: null, verified: false };
  const body = squash(resumeText);
  const ok = body.length > 0 && body.includes(squash(q));
  return { quote: ok ? q : null, verified: ok, dropped: ok ? null : q };
}

export function sanitizeReport(raw, { resumeText = "", items = [], detail = [] } = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const validKeys = new Set(items.map((i) => i.key));
  const evidence = [];
  let droppedQuotes = 0;
  const withEvidence = (list, limit) => arr(list, limit).map((x) => {
    if (!x || typeof x !== "object") return { reqKey: null, text: str(x, 300), evidence: null };
    const v = verifyQuote(x.evidence?.quote, resumeText);
    if (!v.verified && v.dropped) droppedQuotes++;
    const reqKey = validKeys.has(x.reqKey) ? x.reqKey : null;
    if (v.verified) evidence.push({ reqKey, quote: v.quote, page: pageOfQuote(v.quote, detail), verified: true });
    return { reqKey, text: str(x.text, 300), evidence: v.verified ? { quote: v.quote, page: pageOfQuote(v.quote, detail), verified: true } : null };
  }).filter((x) => x.text);

  const highlights = withEvidence(r.highlights, 8);
  const risks = withEvidence(r.risks, 8);
  const report = {
    matchReason: str(r.matchReason, 400),
    highlights,
    risks,
    insights: arr(r.insights, 12).filter((i) => i && (i.kind === "up" || i.kind === "down") && typeof i.text === "string").map((i) => ({ kind: i.kind, text: i.text.slice(0, 300) })),
    interviewProbes: arr(r.interviewProbes, 8).filter((p) => p && typeof p === "object" && p.question).map((p) => ({ reqKey: validKeys.has(p.reqKey) ? p.reqKey : null, question: str(p.question, 300), why: str(p.why, 200) })),
    matchedFor: arr(r.matchedFor, 12).map((t) => str(t, 30)).filter(Boolean),
    againstFor: arr(r.againstFor, 12).map((t) => str(t, 30)).filter(Boolean),
    aiSuggestedTags: arr(r.aiSuggestedTags, 12).map((t) => str(t, 20)).filter(Boolean),
    evidence,
    stats: { droppedQuotes, verifiedQuotes: evidence.length },
  };
  return report;
}

// 写回 Candidate 旧列(前端 CandidateDetail / SharedCandidate / 飞书卡片零改动)
export function candidateSnapshotFromReport(report, evaluation) {
  const rep = report || {};
  return {
    jdMatch: evaluation?.overallScore ?? null,
    risks: (rep.risks || []).map((x) => x.text).filter(Boolean).slice(0, 8),
    highlights: (rep.highlights || []).map((x) => x.text).filter(Boolean).slice(0, 8),
    insights: rep.insights || [],
    matchedFor: rep.matchedFor || [],
    againstFor: rep.againstFor || [],
    aiSuggestedTags: rep.aiSuggestedTags || [],
    classification: evaluation?.classification ?? null,
    reviewPriority: evaluation?.reviewPriority ?? null,
  };
}
