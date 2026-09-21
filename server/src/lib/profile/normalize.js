// 简历 profile(resume.v1)的确定性闸门与新旧形状互转(纯函数,可单测)
//   sanitizeProfile(json, sourceText) — LLM 输出 → 合法 profile:PII 白名单 / 枚举归一 / 词表归一 / 日期反幻觉 / 去重
//   profileToLegacy(profile)          — profile → 旧 16 键 parsed(assembleSummary / buildResumeDisplayFields / 旧列全部照旧)
//   legacyToProfile(parsed)           — 旧 prompt(生产 DB 可能仍是自定义旧 prompt)输出 → 最小 profile,保证下游统一
//   isProfileShape(json)              — 判断 LLM 返回的是 v1 profile 还是旧形状

import { normalizeTag, normalizeTags, normalizeCity, isOverseasLocation } from "../taxonomy/index.js";

export const PROFILE_VERSION = "resume.v1";
const DEGREE_ENUM = new Set(["函授", "专科", "大专", "本科", "硕士", "博士", "博士后", "教授", "Other"]);

export function isProfileShape(json) {
  return !!(json && typeof json === "object" && (json.schemaVersion === PROFILE_VERSION || json.identity || json.intent));
}

// ─── 基础工具 ───
const PLACEHOLDER_RE = /^(未提供|未解析到|未提供或未解析到|未知|无|暂无|null|none|n\/a|-)$/i;
const str = (v, max = 300) => {
  if (v == null) return null;
  const t = String(v).trim().slice(0, max);
  return !t || PLACEHOLDER_RE.test(t) ? null : t;
};
const arrStr = (v, max = 200, limit = 40) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, limit) : []);
const bool = (v) => (v === true ? true : v === false ? false : null);
const int = (v, lo = 0, hi = 100000) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arrObj = (v, limit = 30) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, limit) : []);
const dedupeBy = (items, keyFn) => {
  const seen = new Set();
  return items.filter((it) => { const k = keyFn(it); if (!k || seen.has(k)) return false; seen.add(k); return true; });
};

export function normalizeDegreeEnum(raw) {
  const d = str(raw, 60);
  if (!d) return null;
  if (DEGREE_ENUM.has(d)) return d;
  if (/教授|professor/i.test(d)) return "教授";
  if (/博士后|postdoc/i.test(d)) return "博士后";
  if (/博士|ph\.?\s?d|doctor/i.test(d)) return "博士";
  if (/硕士|master|m\.?sc|mba|m\.?eng|mphil/i.test(d)) return "硕士";
  if (/本科|学士|bachelor|licence|undergrad|b\.?sc|b\.?eng|b\.?a\b|b\.?s\b/i.test(d)) return "本科";
  if (/大专|专科|associate|hnd|diploma|college/i.test(d)) return "大专";
  if (/函授/.test(d)) return "函授";
  return "Other";
}

// "2021.03" / "2021-3" / "2021年3月" / "2021" → "YYYY-MM" | "YYYY";无法识别 → null
export function normalizeYm(raw) {
  const s = str(raw, 40);
  if (!s) return null;
  const m = /(19|20)\d{2}/.exec(s);
  if (!m) return null;
  const y = m[0];
  const tail = s.slice(m.index + 4, m.index + 9);
  const mm = /^\s*[.\-/年]?\s*(\d{1,2})/.exec(tail);
  if (!mm) return y;
  const month = Math.min(12, Math.max(1, parseInt(mm[1], 10)));
  return `${y}-${String(month).padStart(2, "0")}`;
}
const NOW_RE = /至今|今|present|now|current|在职|目前|现在/i;

// 日期反幻觉:年份必须出现在原文;原文该年有月份信息而 LLM 给的月份对不上 → 只保留年份
function collectOriginDates(text) {
  const years = new Set();
  const yms = new Set();
  for (const m of String(text || "").matchAll(/(19|20)\d{2}(?:\s*[.\-/年]\s*(\d{1,2}))?/g)) {
    years.add(m[0].slice(0, 4));
    if (m[2]) yms.add(`${m[0].slice(0, 4)}-${String(Math.min(12, Math.max(1, parseInt(m[2], 10)))).padStart(2, "0")}`);
  }
  return { years, yms };
}
function guardDate(ym, origin) {
  if (!ym) return null;
  if (!origin) return ym;
  const y = ym.slice(0, 4);
  if (!origin.years.has(y)) return null;                 // 原文没这个年份 → 编造
  if (ym.length === 4) return ym;
  if (origin.yms.has(ym)) return ym;
  // 原文该年是否出现过带月份写法;若出现过但对不上 → 月份是编的,退化为年
  for (const k of origin.yms) if (k.startsWith(y)) return y;
  return ym;                                             // 原文该年无月份信息 → 放过
}

function normalizeSegment(raw, origin, { intern = false } = {}) {
  const e = obj(raw);
  const location = str(e.location, 100);
  const country = str(e.country, 60);
  const teamSize = int(e.teamSize ?? e.reports, 0, 100000);
  const endRaw = e.endDate ?? e.end;
  const current = e.current === true || (endRaw != null && NOW_RE.test(String(endRaw)));
  const overseas = bool(e.isOverseas) ?? isOverseasLocation(country || location);
  return {
    company: str(e.company, 200),
    department: str(e.department, 100),
    title: str(e.title ?? e.position, 150),
    level: str(e.level, 60),
    companyIndustryTags: normalizeTags("industries", e.companyIndustryTags ?? e.companyIndustry ?? e.industryTags ?? (e.industry ? [e.industry] : [])),
    companyType: ["oem", "tier1", "tier2", "internet", "consulting", "public", "startup", "other"].includes(e.companyType) ? e.companyType : null,
    companySize: str(e.companySize, 60),
    location, country,
    isOverseas: overseas,
    startDate: guardDate(normalizeYm(e.startDate ?? e.start), origin),
    endDate: current ? null : guardDate(normalizeYm(endRaw), origin),
    current,
    employmentType: intern ? "intern" : (["fulltime", "parttime", "intern", "contract"].includes(e.employmentType) ? e.employmentType : "fulltime"),
    reportsTo: str(e.reportsTo, 100),
    teamSize,
    isManagement: bool(e.isManagement) ?? (teamSize != null ? teamSize > 0 : null),
    duties: arrStr(e.duties ?? e.responsibilities, 300, 20),
    achievements: arrStr(e.achievements, 300, 20),
    quantified: arrObj(e.quantified, 15).map((q) => ({ metric: str(q.metric, 80), value: str(q.value, 40), unit: str(q.unit, 20), context: str(q.context, 200) })).filter((q) => q.metric || q.value),
    tools: normalizeTags("tools", e.tools),
    technologies: arrStr(e.technologies, 60, 30),
    domainTags: normalizeTags("domains", e.domainTags),
    functionTags: normalizeTags("functions", e.functionTags),
    regionTags: arrStr(e.regionTags, 30, 10),
    projectRefs: Array.isArray(e.projectRefs) ? e.projectRefs.map((x) => int(x, 0, 100)).filter((x) => x != null) : [],
  };
}

function normalizeEducation(raw, origin) {
  const e = obj(raw);
  const endRaw = e.endDate ?? e.end ?? e.graduation;
  const current = e.current === true || (endRaw != null && NOW_RE.test(String(endRaw)));
  const gpa = obj(e.gpa);
  const major = str(e.major, 120);
  return {
    school: str(e.school, 200),
    college: str(e.college, 120),
    major,
    majorTag: normalizeTag("majors", e.majorTag) || normalizeTag("majors", major) || null,
    degree: normalizeDegreeEnum(e.degree ?? e.education),
    degreeTitle: str(e.degreeTitle, 100),
    startDate: guardDate(normalizeYm(e.startDate ?? e.start), origin),
    endDate: current ? null : guardDate(normalizeYm(endRaw), origin),
    current,
    fullTime: bool(e.fullTime),
    overseas: bool(e.overseas) ?? isOverseasLocation(e.country || e.location) ?? false,
    gpa: (gpa.value != null || typeof e.gpa === "number" || typeof e.gpa === "string") ? { value: str(gpa.value ?? e.gpa, 20), scale: str(gpa.scale, 10) } : null,
    ranking: str(e.ranking, 60),
    courses: arrStr(e.courses, 60, 30),           // 专业课程(用户要求)
    researchDirection: str(e.researchDirection, 200),
    thesis: str(e.thesis, 200),
    scholarships: arrStr(e.scholarships, 100, 10),
    honors: arrStr(e.honors, 100, 15),
  };
}

function normalizeProject(raw, origin) {
  const p = obj(raw);
  const endRaw = p.endDate ?? p.end;
  const current = p.current === true || (endRaw != null && NOW_RE.test(String(endRaw)));
  return {
    name: str(p.name ?? p.title, 200),
    type: ["mass_production", "rnd", "certification", "launch", "it", "research", "other"].includes(p.type) ? p.type : null,
    background: str(p.background, 300),
    goal: str(p.goal, 300),
    startDate: guardDate(normalizeYm(p.startDate ?? p.start), origin),
    endDate: current ? null : guardDate(normalizeYm(endRaw), origin),
    current,
    stage: ["concept", "development", "validation", "mass_production", "after_sales"].includes(p.stage) ? p.stage : null,
    role: str(p.role, 100),
    teamSize: int(p.teamSize, 0, 100000),
    collaborators: arrStr(p.collaborators, 60, 15),
    client: str(p.client, 100),
    duties: arrStr(p.duties ?? p.responsibilities ?? (p.responsibility ? [p.responsibility] : []), 300, 15),
    contributions: arrStr(p.contributions, 300, 15),
    outcomes: arrStr(p.outcomes ?? (p.output ? [p.output] : []), 300, 15),
    metrics: arrObj(p.metrics, 10).map((q) => ({ metric: str(q.metric, 80), value: str(q.value, 40), unit: str(q.unit, 20), context: str(q.context, 200) })).filter((q) => q.metric || q.value),
    technologies: arrStr(p.technologies, 60, 30),
    tools: normalizeTags("tools", p.tools),
    domainTags: normalizeTags("domains", p.domainTags),
    regionTags: arrStr(p.regionTags, 30, 10),
    experienceRef: int(p.experienceRef, 0, 100),
  };
}

function normalizeSkillList(items, kind, limit = 40) {
  return dedupeBy(
    arrObj(items, limit).map((s) => ({
      name: str(s.name, 80),
      tag: normalizeTag(kind, s.tag) || normalizeTag(kind, s.name) || (str(s.name, 40) ? `other:${str(s.name, 40)}` : null),
      level: ["expert", "proficient", "familiar"].includes(s.level) ? s.level : null,
      behaviors: arrStr(s.behaviors, 200, 5),
      evidenceRefs: arrObj(s.evidenceRefs, 5).map((r) => ({ section: str(r.section, 20), index: int(r.index, 0, 100) })).filter((r) => r.section && r.index != null),
    })).filter((s) => s.name),
    (s) => s.tag && !s.tag.startsWith("other:") ? s.tag : `n:${s.name}`,
  );
}

function normalizeLanguage(raw) {
  const l = obj(raw);
  const name = str(l.name, 40);
  return {
    name: normalizeTag("languages", name) || null,
    raw: name,
    level: ["native", "working", "fluent", "intermediate", "basic"].includes(l.level) ? l.level : null,
    levelRaw: str(l.levelRaw ?? (typeof l.level === "string" ? l.level : null), 60),
    exams: arrObj(l.exams, 5).map((e) => ({ name: str(e.name, 40), score: str(e.score, 20) })).filter((e) => e.name),
    businessCapable: bool(l.businessCapable),
  };
}

function normalizeCertificate(raw, origin) {
  const c = obj(raw);
  const name = str(c.name, 120);
  return {
    name,
    tag: normalizeTag("certificates", c.tag) || normalizeTag("certificates", name) || null,
    type: ["professional", "language", "industry", "software", "license", "other"].includes(c.type) ? c.type : "other",
    issuer: str(c.issuer, 100),
    obtainedAt: guardDate(normalizeYm(c.obtainedAt), origin),
    validUntil: normalizeYm(c.validUntil),
  };
}

// ─── 主闸门 ───
export function sanitizeProfile(json, sourceText = "") {
  const j = obj(json);
  const origin = sourceText ? collectOriginDates(sourceText) : null;
  const warnings = [];
  const identity = obj(j.identity);
  const intent = obj(j.intent);
  const campus = obj(j.campus);
  const research = obj(j.research);
  const skills = obj(j.skills);

  const profile = {
    schemaVersion: PROFILE_VERSION,
    identity: {
      name: str(identity.name, 60),
      gender: ["male", "female"].includes(identity.gender) ? identity.gender : "unknown",
      age: int(identity.age, 14, 90),
      phones: arrStr(identity.phones, 40, 5),
      emails: arrStr(identity.emails, 100, 5).filter((e) => /@/.test(e)),
      currentCity: str(identity.currentCity, 60),
      currentCountry: str(identity.currentCountry, 60),
      currentTitle: str(identity.currentTitle, 120),
      currentCompany: str(identity.currentCompany, 200),
      jobStatus: ["employed", "unemployed", "fresh"].includes(identity.jobStatus) ? identity.jobStatus : null,
      links: arrObj(identity.links, 5).map((l) => ({ type: ["github", "linkedin", "portfolio", "other"].includes(l.type) ? l.type : "other", url: str(l.url, 300) })).filter((l) => l.url),
    },
    intent: {
      targetTitles: arrStr(intent.targetTitles, 80, 8),
      targetFunctions: normalizeTags("functions", intent.targetFunctions),
      targetIndustries: normalizeTags("industries", intent.targetIndustries),
      targetCities: arrStr(intent.targetCities, 40, 8),
      targetRegions: arrStr(intent.targetRegions, 40, 8),
      expectedSalary: intent.expectedSalary && typeof intent.expectedSalary === "object"
        ? { min: int(intent.expectedSalary.min, 0, 100000), max: int(intent.expectedSalary.max, 0, 100000), unit: str(intent.expectedSalary.unit, 20), raw: str(intent.expectedSalary.raw, 60) }
        : null,
      availability: intent.availability && typeof intent.availability === "object" ? { raw: str(intent.availability.raw, 60), withinDays: int(intent.availability.withinDays, 0, 365) } : null,
      employmentType: ["fulltime", "parttime", "intern", "contract"].includes(intent.employmentType) ? intent.employmentType : null,
      acceptTravel: bool(intent.acceptTravel),
      acceptOverseas: bool(intent.acceptOverseas),
      acceptRelocation: bool(intent.acceptRelocation),
      acceptOvertime: bool(intent.acceptOvertime),
    },
    education: arrObj(j.education ?? j.educationHistory, 10).map((e) => normalizeEducation(e, origin)).filter((e) => e.school || e.degree || e.major),
    experience: arrObj(j.experience, 20).map((e) => normalizeSegment(e, origin)).filter((e) => e.company || e.title),
    internships: arrObj(j.internships, 10).map((e) => normalizeSegment(e, origin, { intern: true })).filter((e) => e.company || e.title),
    projects: arrObj(j.projects, 20).map((p) => normalizeProject(p, origin)).filter((p) => p.name || p.duties.length || p.outcomes.length),
    skills: {
      professional: normalizeSkillList(skills.professional, "domains"),
      tools: normalizeSkillList(skills.tools, "tools"),
      industry: normalizeSkillList(skills.industry, "industries", 15),
      soft: normalizeSkillList(skills.soft, "soft", 15),
    },
    languages: dedupeBy(arrObj(j.languages, 10).map(normalizeLanguage).filter((l) => l.raw), (l) => l.name || l.raw),
    certificates: dedupeBy(arrObj(j.certificates, 20).map((c) => normalizeCertificate(c, origin)).filter((c) => c.name), (c) => (c.tag && c.tag !== "cert.other" ? c.tag : `n:${c.name}`)),
    campus: {
      roles: arrStr(campus.roles, 100, 10),               // 学生干部 / 班干部(用户要求)
      clubs: arrStr(campus.clubs, 100, 10),
      competitions: arrObj(campus.competitions, 15).map((c) => ({
        name: str(c.name, 150), level: ["school", "city", "province", "national", "international"].includes(c.level) ? c.level : null,
        rank: str(c.rank, 40), award: str(c.award, 60), role: str(c.role, 60), contribution: str(c.contribution, 200),
      })).filter((c) => c.name),
      research: arrStr(campus.research, 150, 10),
      volunteer: arrStr(campus.volunteer, 100, 10),
      scholarships: arrStr(campus.scholarships, 100, 10),
      honors: arrStr(campus.honors, 100, 15),
    },
    research: {
      papers: arrObj(research.papers, 20).map((p) => ({ title: str(p.title, 200), venue: str(p.venue, 100), tier: ["sci", "ei", "core", "other"].includes(p.tier) ? p.tier : null, authorRole: ["first", "co-first", "corresponding", "co-author"].includes(p.authorRole) ? p.authorRole : null, year: int(p.year, 1950, 2100) })).filter((p) => p.title),
      patents: arrObj(research.patents, 20).map((p) => ({ title: str(p.title, 200), type: ["invention", "utility", "design"].includes(p.type) ? p.type : null, status: ["granted", "pending"].includes(p.status) ? p.status : null })).filter((p) => p.title),
      projects: arrObj(research.projects, 10).map((p) => ({ name: str(p.name, 200), funder: str(p.funder, 100), role: str(p.role, 60) })).filter((p) => p.name),
      labs: arrStr(research.labs, 100, 5),
    },
    awards: arrStr(j.awards, 120, 20),                    // 奖项(用户要求;证书单列在 certificates)
    tags: arrStr(j.tags, 20, 8),
    appliedFor: str(j.appliedFor, 100),
  };

  // 空条目 / 明显占位名清理
  if (profile.identity.name && /^(张三|李四|王五|候选人|未知|unknown|n\/a)$/i.test(profile.identity.name)) {
    warnings.push({ code: "placeholder_name", message: `姓名疑似占位:${profile.identity.name}` });
    profile.identity.name = null;
  }
  // 日期被闸门清掉的段落记警告(便于 HR 核对)
  for (const [i, e] of profile.experience.entries()) {
    if (!e.startDate && (json?.experience?.[i]?.startDate || json?.experience?.[i]?.start)) warnings.push({ code: "date_scrubbed", section: "experience", index: i, message: `${e.company || "经历"} 的起始日期在原文中找不到,已清空` });
  }
  const otherTags = [...profile.experience.flatMap((e) => [...e.companyIndustryTags, ...e.domainTags]), ...profile.skills.professional.map((s) => s.tag)].filter((t) => t && t.startsWith("other:"));
  if (otherTags.length) warnings.push({ code: "unmapped_tags", count: otherTags.length, samples: [...new Set(otherTags)].slice(0, 5) });

  return { profile, warnings };
}

// ─── 旧形状 → 最小 profile(兼容生产 DB 自定义旧 prompt / 存量数据升级) ───
export function legacyToProfile(parsed, sourceText = "") {
  const p = obj(parsed);
  const json = {
    identity: {
      name: p.name, gender: p.gender, age: p.age,
      phones: Array.isArray(p.phones) ? p.phones : (p.phone ? [p.phone] : []),
      emails: Array.isArray(p.emails) ? p.emails : (p.email ? [p.email] : []),
      currentCity: p.location, currentTitle: p.currentTitle,
    },
    intent: { targetTitles: p.appliedFor ? [p.appliedFor] : [] },
    education: arrObj(p.educationHistory).map((e) => ({ school: e.school, degree: e.degree, major: e.major, startDate: splitPeriod(e.period)[0], endDate: splitPeriod(e.period)[1] })),
    experience: arrObj(p.experience).map((e) => ({ company: e.company, title: e.title, location: e.location, startDate: splitPeriod(e.period)[0], endDate: splitPeriod(e.period)[1], teamSize: e.reports, duties: e.duties, achievements: e.achievements })),
    // 旧 prompt 各版本的项目键不一:方案 B {responsibility,output};更早版本 {name/title, role, description/content/summary, achievements/result}
    projects: arrObj(p.projects).map((x) => ({
      name: x.name ?? x.title ?? x.project ?? null,
      role: x.role ?? null,
      startDate: splitPeriod(x.period)[0], endDate: splitPeriod(x.period)[1],
      duties: [x.responsibility, x.description, x.content, x.summary, ...(Array.isArray(x.duties) ? x.duties : []), ...(Array.isArray(x.responsibilities) ? x.responsibilities : [])].filter(Boolean),
      outcomes: [x.output, x.result, x.achievement, ...(Array.isArray(x.achievements) ? x.achievements : []), ...(Array.isArray(x.outcomes) ? x.outcomes : [])].filter(Boolean),
    })),
    skills: { professional: arrStr(p.skills).map((s) => ({ name: s })) },
    languages: arrObj(p.languages).map((l) => ({ name: l.name, levelRaw: l.level, level: null })),
    awards: p.awards,
    tags: p.tags,
    appliedFor: p.appliedFor,
  };
  return sanitizeProfile(json, sourceText);
}

function splitPeriod(period) {
  if (typeof period !== "string") return [null, null];
  const parts = period.split(/\s*[–—~\-至到]+\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]];
  if (parts.length === 1) return [null, parts[0]]; // 单边时间当作结束(教育常只写毕业时间)
  return [null, null];
}

// ─── profile → 旧 16 键 parsed(供 assembleSummary / buildResumeDisplayFields / 旧列写入) ───
function period(seg) {
  const s = seg.startDate ? seg.startDate.replace("-", ".") : "";
  const e = seg.current ? "至今" : (seg.endDate ? seg.endDate.replace("-", ".") : "");
  if (s && e) return `${s} – ${e}`;
  return s || e || null;
}
export function profileToLegacy(profile) {
  const p = obj(profile);
  const id = obj(p.identity);
  const sk = obj(p.skills);
  const allExp = [...arrObj(p.experience), ...arrObj(p.internships)];
  const skillNames = [
    ...arrObj(sk.professional).map((s) => s.name),
    ...arrObj(sk.tools).map((s) => s.name),
    ...arrObj(sk.industry).map((s) => s.name),
  ].filter(Boolean);
  const awards = [
    ...arrStr(p.awards),
    ...arrObj(p.certificates).map((c) => (c.obtainedAt ? `${c.name}(${c.obtainedAt.slice(0, 4)})` : c.name)),
    ...arrObj(obj(p.campus).competitions).map((c) => [c.name, c.award].filter(Boolean).join(" ")),
  ].filter(Boolean);
  return {
    name: id.name ?? null,
    currentTitle: id.currentTitle ?? null,
    location: id.currentCity ?? null,
    gender: id.gender ?? "unknown",
    age: id.age ?? null,
    phones: arrStr(id.phones),
    emails: arrStr(id.emails),
    languages: arrObj(p.languages).map((l) => ({ name: l.raw || l.name, level: l.levelRaw || l.level || "" })),
    skills: [...new Set(skillNames)],
    awards: [...new Set(awards)],
    appliedFor: p.appliedFor || arrStr(obj(p.intent).targetTitles)[0] || "",
    tags: arrStr(p.tags),
    yearsExp: null,
    educationHistory: arrObj(p.education).map((e) => ({ school: e.school, degree: e.degree, major: e.major, period: period(e) })),
    experience: allExp.map((e) => ({
      company: e.company, title: e.employmentType === "intern" && e.title ? `${e.title}(实习)` : e.title, period: period(e), location: e.location,
      reports: e.teamSize, duties: arrStr(e.duties), achievements: arrStr(e.achievements),
    })),
    projects: arrObj(p.projects).map((x) => ({
      responsibility: [x.name, x.role ? `角色:${x.role}` : null, ...arrStr(x.duties), ...arrStr(x.contributions)].filter(Boolean).join(";"),
      output: [...arrStr(x.outcomes), ...arrObj(x.metrics).map((m) => [m.metric, m.value, m.unit].filter(Boolean).join(" "))].filter(Boolean).join(";"),
    })),
  };
}
