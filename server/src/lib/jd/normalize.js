// JD 事实层 jdFacts(jd.v1)闸门:枚举归一 / 词表归一 / 引文校验(纯函数,可单测)
// required 只记录原文语气(true=必须 / false=优先);真正的 tier 在评价模型层由模板决定。
// restrictions(年龄/性别)单独存放,永不进评价模型(合规)。

import { normalizeTag, normalizeTags, normalizeCity } from "../taxonomy/index.js";
import { normalizeDegreeEnum } from "../profile/normalize.js";

export const JD_FACTS_VERSION = "jd.v1";

const str = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null);
const arrStr = (v, max = 200, limit = 30) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, limit) : []);
const bool = (v) => (v === true ? true : v === false ? false : null);
const num = (v, lo = 0, hi = 100000) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arrObj = (v, limit = 30) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, limit) : []);
const LEVELS = new Set(["native", "working", "fluent", "intermediate", "basic"]);
const SKILL_LEVELS = new Set(["expert", "proficient", "familiar"]);

// 引文归一子串匹配(去空白 / 全半角标点差异)
function squash(s) {
  return String(s || "").toLowerCase().replace(/[\s,，。.;；:：、()（）\-–—/·]+/g, "");
}
export function verifyQuotes(sourceQuotes, text) {
  const body = squash(text);
  const verified = {};
  const unverified = [];
  for (const [k, q] of Object.entries(obj(sourceQuotes))) {
    const qq = str(q, 80);
    if (!qq) continue;
    if (body && body.includes(squash(qq))) verified[k] = qq;
    else unverified.push(k);
  }
  return { verified, unverified };
}

export function sanitizeJdFacts(json, sourceText = "") {
  const j = obj(json);
  const b = obj(j.basics);
  const edu = obj(j.education);
  const ey = obj(j.experienceYears);
  const wc = obj(j.workConditions);
  const rs = obj(j.restrictions);
  const campus = obj(j.campus);
  const salary = obj(b.salary);
  const startBy = obj(b.startBy);
  const teamSize = obj(b.teamSize);
  const { verified, unverified } = verifyQuotes(j.sourceQuotes, sourceText);
  const warnings = [];
  if (unverified.length) warnings.push({ code: "quote_unverified", keys: unverified });

  const facts = {
    schemaVersion: JD_FACTS_VERSION,
    basics: {
      title: str(b.title, 100),
      direction: str(b.direction, 60),
      functionTag: normalizeTag("functions", b.functionTag) || normalizeTag("functions", b.direction) || normalizeTag("functions", b.title) || null,
      department: str(b.department, 100),
      level: str(b.level, 60),
      openings: num(b.openings, 0, 9999),
      locations: arrObj(b.locations, 10).map((l) => {
        const c = normalizeCity(l.city);
        return { city: str(l.city, 60), cityNorm: c?.city || null, country: str(l.country, 10) || c?.country || null };
      }).filter((l) => l.city),
      reportsTo: str(b.reportsTo, 100),
      teamSize: { min: num(teamSize.min, 0, 10000), max: num(teamSize.max, 0, 10000) },
      employmentType: ["fulltime", "parttime", "intern", "contract"].includes(b.employmentType) ? b.employmentType : null,
      recruitType: ["social", "campus", "both"].includes(b.recruitType) ? b.recruitType : null,
      salary: { min: num(salary.min), max: num(salary.max), unit: str(salary.unit, 20), raw: str(salary.raw, 60) },
      startBy: { raw: str(startBy.raw, 60), withinDays: num(startBy.withinDays, 0, 365) },
    },
    responsibilities: arrObj(j.responsibilities, 15).map((r) => ({
      name: str(r.name, 100), description: str(r.description, 400), actions: arrStr(r.actions, 60, 10), businessArea: str(r.businessArea, 100),
      objects: arrStr(r.objects, 60, 10), outcomes: arrStr(r.outcomes, 100, 10), importance: r.importance === "core" ? "core" : "normal",
      domainTags: normalizeTags("domains", r.domainTags), regionTags: arrStr(r.regionTags, 30, 6),
    })).filter((r) => r.name || r.description),
    education: {
      minDegree: normalizeDegreeEnum(edu.minDegree),
      degreeTypes: arrStr(edu.degreeTypes, 30, 5),
      majors: arrObj(edu.majors, 15).map((m) => ({ raw: str(m.raw ?? m.name, 80), tag: normalizeTag("majors", m.tag) || normalizeTag("majors", m.raw ?? m.name) || null })).filter((m) => m.raw),
      majorType: ["related", "strict", "any"].includes(edu.majorType) ? edu.majorType : (arrObj(edu.majors).length ? "related" : "any"),
      schoolRequirement: str(edu.schoolRequirement, 100),
      acceptOverseasDegree: bool(edu.acceptOverseasDegree),
      acceptFresh: bool(edu.acceptFresh),
    },
    experienceYears: {
      total: { min: num(obj(ey.total).min, 0, 60), max: num(obj(ey.total).max, 0, 60) },
      industry: arrObj(ey.industry, 5).map((x) => ({ industryTag: normalizeTag("industries", x.industryTag) || normalizeTag("industries", x.raw) || null, raw: str(x.raw, 60), min: num(x.min, 0, 60) })).filter((x) => x.industryTag || x.raw),
      relevant: arrObj(ey.relevant, 5).map((x) => ({ domainTag: normalizeTag("domains", x.domainTag) || normalizeTag("domains", x.raw) || null, raw: str(x.raw, 60), min: num(x.min, 0, 60) })).filter((x) => x.domainTag || x.raw),
      management: ey.management && typeof ey.management === "object" ? { min: num(ey.management.min, 0, 60) } : null,
      overseas: ey.overseas && typeof ey.overseas === "object" ? { min: num(ey.overseas.min, 0, 60) } : null,
    },
    professionalSkills: arrObj(j.professionalSkills, 20).map((s) => ({
      name: str(s.name, 80), tag: normalizeTag("domains", s.tag) || normalizeTag("domains", s.name) || null,
      level: SKILL_LEVELS.has(s.level) ? s.level : null, required: bool(s.required) ?? true, evidenceHint: str(s.evidenceHint, 200),
    })).filter((s) => s.name),
    tools: arrObj(j.tools, 20).map((t) => ({ name: str(t.name, 60), tag: normalizeTag("tools", t.tag) || normalizeTag("tools", t.name) || null, level: SKILL_LEVELS.has(t.level) ? t.level : null, required: bool(t.required) ?? true })).filter((t) => t.name),
    languages: arrObj(j.languages, 5).map((l) => ({
      language: normalizeTag("languages", l.language) || normalizeTag("languages", l.raw) || null, raw: str(l.raw ?? l.language, 40),
      level: LEVELS.has(l.level) ? l.level : null, exams: arrObj(l.exams, 4).map((e) => ({ name: str(e.name, 40), score: str(e.score, 20) })).filter((e) => e.name),
      scenarios: arrStr(l.scenarios, 20, 5), required: bool(l.required) ?? true,
    })).filter((l) => l.language || l.raw),
    industries: arrObj(j.industries, 10).map((x) => ({
      industryTag: normalizeTag("industries", x.industryTag) || normalizeTag("industries", x.raw) || null, subIndustryTag: normalizeTag("industries", x.subIndustryTag) || null,
      raw: str(x.raw, 80), productType: str(x.productType, 60), regionTags: arrStr(x.regionTags, 30, 6),
      experienceType: ["project", "work", "any"].includes(x.experienceType) ? x.experienceType : "any", required: bool(x.required) ?? false,
    })).filter((x) => x.industryTag || x.raw),
    projectRequirements: arrObj(j.projectRequirements, 10).map((p) => ({
      type: ["mass_production", "rnd", "certification", "launch", "other"].includes(p.type) ? p.type : null, domain: str(p.domain, 80),
      regionTags: arrStr(p.regionTags, 30, 6), stage: str(p.stage, 40), role: str(p.role, 60), required: bool(p.required) ?? false,
    })).filter((p) => p.type || p.domain),
    certificates: arrObj(j.certificates, 15).map((c) => ({ name: str(c.name, 80), tag: normalizeTag("certificates", c.tag) || normalizeTag("certificates", c.name) || null, required: bool(c.required) ?? false })).filter((c) => c.name),
    softSkills: arrObj(j.softSkills, 15).map((s) => ({ name: str(s.name, 60), tag: normalizeTag("soft", s.tag) || normalizeTag("soft", s.name) || null, behaviors: arrStr(s.behaviors, 200, 5) })).filter((s) => s.name),
    workConditions: {
      locations: arrStr(wc.locations, 60, 10),
      relocation: bool(wc.relocation),
      overseasPosting: wc.overseasPosting && typeof wc.overseasPosting === "object" ? { required: bool(wc.overseasPosting.required), raw: str(wc.overseasPosting.raw, 100) } : null,
      travel: wc.travel && typeof wc.travel === "object" ? { required: bool(wc.travel.required), frequency: ["high", "medium", "low"].includes(wc.travel.frequency) ? wc.travel.frequency : null, daysPerYear: num(wc.travel.daysPerYear, 0, 366), regions: arrStr(wc.travel.regions, 30, 6) } : null,
      overtime: bool(wc.overtime), shifts: bool(wc.shifts), remote: bool(wc.remote),
    },
    restrictions: {
      age: rs.age && typeof rs.age === "object" ? { min: num(rs.age.min, 14, 90), max: num(rs.age.max, 14, 90), raw: str(rs.age.raw, 60) } : null,
      gender: str(rs.gender, 20),
      other: arrStr(rs.other, 100, 10),
    },
    campus: {
      candidateType: ["fresh", "experienced", "any"].includes(campus.candidateType) ? campus.candidateType : null,
      graduationYears: (Array.isArray(campus.graduationYears) ? campus.graduationYears : []).map((y) => num(y, 1990, 2100)).filter((y) => y != null).slice(0, 5),
      degrees: arrStr(campus.degrees, 20, 5).map(normalizeDegreeEnum).filter(Boolean),
      internshipRequired: bool(campus.internshipRequired), batch: str(campus.batch, 40),
    },
    preferred: arrObj(j.preferred, 15).map((p) => ({ raw: str(p.raw, 150), mappedTo: str(p.mappedTo, 60) })).filter((p) => p.raw),
    sourceQuotes: verified,
    unverifiedQuotes: unverified,
  };
  return { facts, warnings };
}
