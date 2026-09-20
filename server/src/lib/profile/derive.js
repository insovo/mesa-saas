// 计算层 — 从简历 profile(resume.v1)确定性派生指标(纯函数,可单测,不调 LLM)
// 年限 / 行业年限 / 领域年限 / 海外年限 / 管理年限 / 最高学历 / 应届判定 / 跳槽 / 时间线冲突 / 能力标签 / 资料质量
// 为什么不让 LLM 或 Jev 算:Jev 官方明确不做算数与日期比较;Kimi 心算年限已被证明不可靠(见 kimi.js computeYearsExp 注释)。

import { ancestors, inFamily, normalizeCity, isOverseasLocation, normalizeTag } from "../taxonomy/index.js";

const NOW_RE = /至今|今|present|now|current|在职|目前|现在/i;

// "YYYY-MM" / "YYYY.MM" / "YYYY/M" / "YYYY年M月" / "YYYY" → 绝对月序号(year*12 + month-1);无法解析 → null
export function ymToAbs(s) {
  if (s == null) return null;
  const str = String(s).trim();
  const m = /(19|20)\d{2}/.exec(str);
  if (!m) return null;
  const year = parseInt(m[0], 10);
  const tail = str.slice(m.index + 4, m.index + 9);
  const mm = /^\s*[.\-/年]?\s*(\d{1,2})/.exec(tail);
  const month = mm ? Math.min(12, Math.max(1, parseInt(mm[1], 10))) : 1;
  return year * 12 + (month - 1);
}

// 一段经历 → [startAbs, endAbs] 或 null;now 可注入便于测试
function segmentRange(seg, nowAbs) {
  if (!seg || typeof seg !== "object") return null;
  const start = ymToAbs(seg.startDate);
  if (start == null) return null;
  let end;
  if (seg.current === true || (seg.endDate != null && NOW_RE.test(String(seg.endDate)))) end = nowAbs;
  else end = ymToAbs(seg.endDate);
  if (end == null) return null;
  end = Math.min(end, nowAbs);
  if (end < start) return null;
  return [start, end];
}

// 合并重叠/相邻区间后的总月数
export function mergedMonths(ranges) {
  const rs = ranges.filter(Boolean).sort((a, b) => a[0] - b[0]);
  if (!rs.length) return 0;
  let total = 0;
  let [cs, ce] = rs[0];
  for (let i = 1; i < rs.length; i++) {
    const [s, e] = rs[i];
    if (s <= ce + 1) ce = Math.max(ce, e);
    else { total += ce - cs + 1; [cs, ce] = [s, e]; }
  }
  return total + (ce - cs + 1);
}
const years = (months) => Math.round((months / 12) * 10) / 10;

function nowAbsOf(now) {
  return now.getFullYear() * 12 + now.getMonth();
}

// 经历的所有 tag(含祖先)是否命中 family
function segHits(seg, field, familyIds) {
  const tags = Array.isArray(seg?.[field]) ? seg[field] : [];
  return tags.some((t) => inFamily(t, familyIds));
}

// 按 tag 聚合年限:{ [tag]: years },tag 含祖先(auto.nev 的月数同时计入 auto)
function yearsByTag(segments, field, nowAbs) {
  const byTag = new Map();
  for (const seg of segments) {
    const r = segmentRange(seg, nowAbs);
    if (!r) continue;
    const tags = new Set();
    for (const t of Array.isArray(seg[field]) ? seg[field] : []) {
      if (!t || String(t).startsWith("other:")) continue;
      tags.add(t);
      for (const a of ancestors(t)) tags.add(a);
    }
    for (const t of tags) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(r);
    }
  }
  const out = {};
  for (const [t, rs] of byTag) out[t] = years(mergedMonths(rs));
  return out;
}

export const DEGREE_RANK = { 教授: 6, 博士后: 5, 博士: 4, 硕士: 3, 本科: 2, 大专: 1, 专科: 1, 函授: 1, Other: 0 };
export function degreeRankOf(d) {
  return DEGREE_RANK[d] ?? -1;
}

function jobHopping(segments, nowAbs) {
  const fiveYearsAgo = nowAbs - 60;
  let segmentsLast5y = 0, shortSegmentsLast5y = 0, tenureSum = 0, tenureCount = 0;
  for (const seg of segments) {
    const r = segmentRange(seg, nowAbs);
    if (!r) continue;
    const months = r[1] - r[0] + 1;
    tenureSum += months; tenureCount++;
    if (r[1] >= fiveYearsAgo) {
      segmentsLast5y++;
      if (months < 12 && !(seg.current === true)) shortSegmentsLast5y++;
    }
  }
  return { segmentsLast5y, shortSegmentsLast5y, avgTenureMonths: tenureCount ? Math.round(tenureSum / tenureCount) : null };
}

function timelineIssues(profile, nowAbs) {
  const issues = [];
  const segs = (Array.isArray(profile.experience) ? profile.experience : [])
    .map((s, i) => ({ i, r: segmentRange(s, nowAbs), s }))
    .filter((x) => x.r)
    .sort((a, b) => a.r[0] - b.r[0]);
  for (let k = 1; k < segs.length; k++) {
    const prev = segs[k - 1], cur = segs[k];
    const overlap = prev.r[1] - cur.r[0] + 1;
    if (overlap > 3) issues.push({ kind: "overlap", months: overlap, a: prev.s.company, b: cur.s.company });
    const gap = cur.r[0] - prev.r[1] - 1;
    if (gap > 12) issues.push({ kind: "gap", months: gap, after: prev.s.company, before: cur.s.company });
  }
  for (const s of Array.isArray(profile.experience) ? profile.experience : []) {
    const st = ymToAbs(s?.startDate), en = ymToAbs(s?.endDate);
    if ((st != null && st > nowAbs) || (en != null && en > nowAbs + 1)) issues.push({ kind: "future_date", company: s.company });
  }
  return issues;
}

function highestEducation(edu) {
  let best = null, bestRank = -2;
  for (const e of Array.isArray(edu) ? edu : []) {
    const rank = degreeRankOf(e?.degree);
    if (rank > bestRank) { bestRank = rank; best = e; }
  }
  return best;
}

function latestGraduation(edu, nowAbs) {
  let latest = null;
  for (const e of Array.isArray(edu) ? edu : []) {
    const end = e?.current ? nowAbs + 6 : ymToAbs(e?.endDate);
    if (end != null && (latest == null || end > latest)) latest = end;
  }
  return latest;
}

// 语言等级归一阶梯(03 号 §4.3):native > working > fluent > intermediate > basic
export const LANGUAGE_LEVEL_RANK = { native: 5, working: 4, fluent: 3, intermediate: 2, basic: 1 };
export function normalizeLanguageLevel(lang) {
  if (!lang || typeof lang !== "object") return null;
  const raw = `${lang.level || ""} ${lang.levelRaw || ""} ${lang.raw || ""} ${(lang.exams || []).map((e) => `${e?.name || ""} ${e?.score || ""}`).join(" ")}`.toLowerCase();
  if (lang.businessCapable === true) return "working";
  if (/母语|native|mother tongue/.test(raw)) return "native";
  if (/工作语言|working|商务流利|business fluent|专业八级|tem-?8|专八/.test(raw)) return "working";
  const ielts = /ielts|雅思/.test(raw) ? parseFloat((/(\d(?:\.\d)?)/.exec(raw.replace(/ielts|雅思/g, "")) || [])[1]) : NaN;
  if (!Number.isNaN(ielts)) return ielts >= 7 ? "working" : ielts >= 6.5 ? "fluent" : ielts >= 6 ? "intermediate" : "basic";
  const toefl = /toefl|托福/.test(raw) ? parseInt((/(\d{2,3})/.exec(raw) || [])[1], 10) : NaN;
  if (!Number.isNaN(toefl)) return toefl >= 100 ? "working" : toefl >= 90 ? "fluent" : toefl >= 80 ? "intermediate" : "basic";
  if (/c2|c1/.test(raw)) return "working";
  if (/b2/.test(raw)) return "fluent";
  if (/b1|cet-?6|六级|n2\b/.test(raw)) return "intermediate";
  if (/a2|a1|cet-?4|四级|n3|n4|n5/.test(raw)) return "basic";
  if (/n1\b|jlpt\s*n1/.test(raw)) return "working";
  if (/流利|fluent|精通|proficient/.test(raw)) return "fluent";
  if (/良好|熟练|good|intermediate|一般|中等/.test(raw)) return "intermediate";
  if (/基础|basic|入门|beginner|初级/.test(raw)) return "basic";
  if (["native", "working", "fluent", "intermediate", "basic"].includes(lang.level)) return lang.level;
  return null;
}

// 能力标签:skills.* 的 tag ∪ experience/projects 的 domainTags,按出现次数 + 所在经历时长加权
function capabilityTags(profile, nowAbs) {
  const score = new Map();
  const bump = (tag, w) => { if (!tag || String(tag).startsWith("other:")) return; score.set(tag, (score.get(tag) || 0) + w); };
  const sk = profile.skills || {};
  for (const group of ["professional", "tools", "industry", "soft"]) for (const s of Array.isArray(sk[group]) ? sk[group] : []) bump(s?.tag, 1);
  for (const seg of Array.isArray(profile.experience) ? profile.experience : []) {
    const r = segmentRange(seg, nowAbs);
    const w = 1 + (r ? Math.min(5, (r[1] - r[0] + 1) / 12) : 0);
    for (const t of seg?.domainTags || []) bump(t, w);
    for (const t of seg?.functionTags || []) bump(t, w * 0.5);
  }
  for (const p of Array.isArray(profile.projects) ? profile.projects : []) for (const t of p?.domainTags || []) bump(t, 1);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);
}

function profileQuality(profile) {
  let s = 0;
  const id = profile.identity || {};
  if (id.name) s += 5;
  if ((id.phones || []).length || (id.emails || []).length) s += 5;
  if (id.currentCity) s += 3;
  const edu = Array.isArray(profile.education) ? profile.education : [];
  if (edu.length) s += 8;
  if (edu.some((e) => e?.degree && e?.school && e?.major)) s += 5;
  if (edu.some((e) => e?.endDate || e?.startDate)) s += 4;
  const exp = Array.isArray(profile.experience) ? profile.experience : [];
  if (exp.length) s += 10;
  const withContent = exp.filter((e) => (e?.duties || []).length + (e?.achievements || []).length >= 2).length;
  s += Math.min(15, withContent * 5);
  if (exp.every((e) => e?.startDate)) s += 5;
  if (exp.some((e) => (e?.quantified || []).length)) s += 5;
  if ((profile.projects || []).length) s += 8;
  const sk = profile.skills || {};
  if ((sk.professional || []).length + (sk.tools || []).length >= 3) s += 8;
  if ((profile.languages || []).length) s += 4;
  if ((profile.certificates || []).length) s += 3;
  if (profile.intent && (profile.intent.targetTitles || []).length) s += 2;
  return Math.min(100, Math.round(s));
}

// 主入口:profile(resume.v1)→ derived
export function deriveProfile(profile, now = new Date()) {
  const p = profile && typeof profile === "object" ? profile : {};
  const nowAbs = nowAbsOf(now);
  // 实习单列在 profile.internships,合并进来统一处理(employmentType=intern 不计入总年限)
  const experience = [
    ...(Array.isArray(p.experience) ? p.experience : []),
    ...(Array.isArray(p.internships) ? p.internships.map((e) => ({ ...e, employmentType: "intern" })) : []),
  ].filter((e) => e && typeof e === "object");
  const fulltime = experience.filter((e) => e.employmentType !== "intern");
  const ranges = fulltime.map((e) => segmentRange(e, nowAbs)).filter(Boolean);

  const overseasRanges = fulltime.filter((e) => e.isOverseas === true || isOverseasLocation(e.country || e.location) === true).map((e) => segmentRange(e, nowAbs)).filter(Boolean);
  const mgmtRanges = fulltime.filter((e) => e.isManagement === true || (typeof e.teamSize === "number" && e.teamSize > 0)).map((e) => segmentRange(e, nowAbs)).filter(Boolean);

  const edu = Array.isArray(p.education) ? p.education : [];
  const best = highestEducation(edu);
  const gradAbs = latestGraduation(edu, nowAbs);
  const jobStatus = p.identity?.jobStatus || null;
  const isFreshGraduate = jobStatus === "fresh" || (gradAbs != null && gradAbs >= nowAbs - 6 && gradAbs <= nowAbs + 18 && fulltime.length === 0);

  const languageLevels = {};
  for (const l of Array.isArray(p.languages) ? p.languages : []) {
    const id = normalizeTag("languages", l?.name || l?.raw) || null;
    const lvl = normalizeLanguageLevel(l);
    if (id && lvl) {
      const prev = languageLevels[id];
      if (!prev || LANGUAGE_LEVEL_RANK[lvl] > LANGUAGE_LEVEL_RANK[prev]) languageLevels[id] = lvl;
    }
  }
  const certificateTags = [...new Set((Array.isArray(p.certificates) ? p.certificates : []).map((c) => c?.tag || normalizeTag("certificates", c?.name)).filter((t) => t && !String(t).startsWith("other:")))];
  const toolTags = [...new Set((p.skills?.tools || []).map((t) => t?.tag).filter((t) => t && !String(t).startsWith("other:")))];
  const city = normalizeCity(p.identity?.currentCity);

  return {
    totalYears: years(mergedMonths(ranges)),
    internshipYears: years(mergedMonths(experience.filter((e) => e.employmentType === "intern").map((e) => segmentRange(e, nowAbs)).filter(Boolean))),
    industryYears: yearsByTag(fulltime, "companyIndustryTags", nowAbs),
    domainYears: yearsByTag(fulltime, "domainTags", nowAbs),
    functionYears: yearsByTag(fulltime, "functionTags", nowAbs),
    overseasYears: years(mergedMonths(overseasRanges)),
    managementYears: years(mergedMonths(mgmtRanges)),
    maxTeamSize: Math.max(0, ...fulltime.map((e) => (typeof e.teamSize === "number" ? e.teamSize : 0))),
    highestDegree: best?.degree || null,
    highestSchool: best?.school || null,
    highestMajor: best?.major || null,
    highestMajorTag: best ? (best.majorTag || normalizeTag("majors", best.major)) : null,
    overseasDegree: edu.some((e) => e?.overseas === true),
    latestGraduation: gradAbs != null ? `${Math.floor(gradAbs / 12)}-${String((gradAbs % 12) + 1).padStart(2, "0")}` : null,
    graduationYear: gradAbs != null ? Math.floor(gradAbs / 12) : null,
    isFreshGraduate,
    jobHopping: jobHopping(fulltime, nowAbs),
    timelineIssues: timelineIssues(p, nowAbs),
    currentCityNorm: city?.city || null,
    currentCountry: city?.country || null,
    capabilityTags: capabilityTags(p, nowAbs),
    languageLevels,
    certificateTags,
    toolTags,
    profileQuality: profileQuality(p),
    derivedAt: now.toISOString(),
    derivedVersion: "derive.v1",
  };
}
