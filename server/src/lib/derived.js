// 候选人 derived 字段计算 — read 时算,不存 DB
// 当前只有 profileCompletion(资料完整度)。所有 endpoint 返回 candidate 之前应包一层 withDerivedCandidate。

export function computeProfileCompletion(c) {
  if (!c) return 0;
  let s = 0;
  if (c.phone) s += 5;
  if (c.email) s += 5;
  if (c.education) s += 5;
  if (c.school) s += 5;
  if (c.major) s += 5;
  if (c.location) s += 5;
  if (c.age != null) s += 5;
  if (c.yearsExp != null) s += 5;
  if (Array.isArray(c.skills) && c.skills.length > 0) s += 15;
  if (Array.isArray(c.experience) && c.experience.length > 0) s += 15;
  if (Array.isArray(c.educationHistory) && c.educationHistory.length > 0) s += 10;
  if (typeof c.aiSummary === "string" && c.aiSummary.length > 100) s += 15;
  const hasHi = Array.isArray(c.highlights) && c.highlights.length > 0;
  const hasRi = Array.isArray(c.risks) && c.risks.length > 0;
  if (hasHi || hasRi) s += 5;
  return Math.min(100, Math.round(s));
}

export function withDerivedCandidate(c) {
  if (!c) return c;
  return { ...c, profileCompletion: computeProfileCompletion(c) };
}
