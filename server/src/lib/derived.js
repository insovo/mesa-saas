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

// 「正在解析」超时阈值:parsingStartedAt 距今超过这个时长就不再算解析中。
// 兜底防卡死 — 若 backend 在解析途中重启,DB 里残留的 parsingStartedAt 不会让候选人永久显示解析中。
export const PARSING_TTL_MS = 10 * 60 * 1000;

// 候选人是否正在解析:parsingStartedAt 非空且距今未超时。Date 字段可能是 Date 实例或 ISO 字符串。
export function isParsing(parsingStartedAt) {
  if (!parsingStartedAt) return false;
  const t = parsingStartedAt instanceof Date ? parsingStartedAt.getTime() : new Date(parsingStartedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < PARSING_TTL_MS;
}

export function withDerivedCandidate(c) {
  if (!c) return c;
  return {
    ...c,
    profileCompletion: computeProfileCompletion(c),
    parsing: isParsing(c.parsingStartedAt),
  };
}
