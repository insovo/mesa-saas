import assert from "node:assert/strict";
import test from "node:test";

import { runHardFilter, evaluateCodeRule } from "./hardFilter.js";
import { draftEvaluationModel, validateEvaluationModel, inferTemplateId } from "./templates.js";
import { buildQuestions, buildState, stripPii, truncateResume, lintQuestion } from "./questions.js";
import { normalizeAnswers, composite } from "./composite.js";
import { sanitizeReport, candidateSnapshotFromReport } from "./report.js";
import { legacyToEvaluation } from "./legacyAdapter.js";
import { sanitizeJdFacts } from "../jd/normalize.js";

const JD_JSON = {
  basics: { title: "海外产品质量工程师", direction: "产品质量", functionTag: "quality", locations: [{ city: "上海", country: "CN" }], recruitType: "social" },
  responsibilities: [{ name: "海外产品质量管理", description: "负责欧洲市场产品质量问题闭环,推动跨部门解决客户反馈问题", actions: ["质量问题分析"], importance: "core", domainTags: ["quality.overseas"] }],
  education: { minDegree: "本科", majors: [{ raw: "车辆工程", tag: "major.vehicle" }, { raw: "机械工程" }], majorType: "related" },
  experienceYears: { total: { min: 5 }, industry: [{ industryTag: "auto", raw: "汽车行业", min: 5 }], relevant: [{ domainTag: "quality.overseas", raw: "海外质量", min: 3 }] },
  professionalSkills: [{ name: "海外质量问题分析", tag: "quality.analysis", required: true, evidenceHint: "有海外客户质量问题处理经历" }],
  tools: [{ name: "8D", tag: "tool.8d", required: true }, { name: "SPC", required: true }],
  languages: [{ language: "en", raw: "英语", level: "working", required: true }],
  industries: [{ industryTag: "auto", subIndustryTag: "auto.nev", raw: "新能源汽车", required: false }],
  projectRequirements: [{ type: "mass_production", domain: "车型", regionTags: ["europe"], required: false }],
  certificates: [{ name: "PMP", required: false }],
  softSkills: [{ name: "跨部门协作", behaviors: ["协调研发、质量、供应商共同解决复杂问题"] }],
  workConditions: { travel: { required: true, frequency: "high", daysPerYear: 150 } },
  restrictions: { age: { max: 35, raw: "35 岁以下" } },
  sourceQuotes: { "education.minDegree": "本科及以上", "experienceYears.industry[0]": "5年以上汽车行业工作经验", "x": "原文里没有的话" },
};
const JD_TEXT = "本科及以上,车辆工程、机械工程相关专业;5年以上汽车行业工作经验,3年以上海外质量工作经验;英语可作为工作语言;熟悉8D、SPC等质量工具;有欧洲项目经验优先。35 岁以下。";

const CAND = {
  profile: { identity: { name: "李明", phones: ["13812341234"], emails: ["a@b.com"] }, intent: { acceptTravel: null }, experience: [], projects: [], skills: {}, languages: [], certificates: [], education: [] },
  derived: { highestDegree: "本科", highestMajorTag: "major.vehicle", totalYears: 7.3, industryYears: { auto: 7.3, "auto.oem": 5.6 }, domainYears: { "quality.overseas": 5.6 }, overseasYears: 5.6, managementYears: 5.6, languageLevels: { en: "working" }, certificateTags: ["cert.pmp"], toolTags: ["tool.8d", "tool.spc"], currentCityNorm: "上海", graduationYear: 2019, isFreshGraduate: false },
};

test("sanitizeJdFacts 归一 + 引文校验 + restrictions 单列", () => {
  const { facts, warnings } = sanitizeJdFacts(JD_JSON, JD_TEXT);
  assert.equal(facts.education.minDegree, "本科");
  assert.equal(facts.education.majors[1].tag, "major.mech");
  assert.equal(facts.tools[1].tag, "tool.spc");
  assert.equal(facts.certificates[0].tag, "cert.pmp");
  assert.equal(facts.softSkills[0].tag, "soft.cross_team");
  assert.equal(facts.basics.locations[0].cityNorm, "上海");
  assert.equal(facts.restrictions.age.max, 35);
  assert.deepEqual(Object.keys(facts.sourceQuotes).sort(), ["education.minDegree", "experienceYears.industry[0]"]);
  assert.deepEqual(facts.unverifiedQuotes, ["x"]);
  assert.ok(warnings.some((w) => w.code === "quote_unverified"));
});

test("draftEvaluationModel 模板推断 + 条目生成 + 校验通过", () => {
  const { facts } = sanitizeJdFacts(JD_JSON, JD_TEXT);
  assert.equal(inferTemplateId(facts), "tpl.quality.overseas");
  const model = draftEvaluationModel(facts);
  const keys = model.requirements.map((r) => r.key);
  for (const k of ["edu_min", "major_rel", "years_total", "years_ind_auto", "years_rel_quality_overseas", "lang_en", "cap_quality_analysis", "tools_req", "ind_auto_nev", "cert_pmp", "soft_cross_team", "cond_travel", "cond_location", "resp_0", "info_restrictions"]) {
    assert.ok(keys.includes(k), `missing ${k}`);
  }
  const byKey = Object.fromEntries(model.requirements.map((r) => [r.key, r]));
  assert.equal(byKey.edu_min.tier, "MUST");
  assert.equal(byKey.edu_min.method, "code");
  assert.equal(byKey.lang_en.method, "code_then_jev");
  assert.equal(byKey.lang_en.code.op, "level>=");
  assert.equal(byKey.years_rel_quality_overseas.tier, "CORE");
  assert.equal(byKey.years_rel_quality_overseas.weight, 22);      // 海外质量模板覆盖
  assert.equal(byKey.cert_pmp.tier, "BONUS");
  assert.equal(byKey.info_restrictions.tier, "INFO");
  assert.equal(byKey.info_restrictions.method, "none");
  assert.equal(byKey.cond_travel.unknownPolicy, "interview");
  assert.equal(byKey.ind_auto_nev.unknownPolicy, "ignore");
  const v = validateEvaluationModel(model);
  assert.deepEqual(v.errors, []);
  assert.ok(v.ok);
});

test("validateEvaluationModel 拒绝非法模型", () => {
  const v = validateEvaluationModel({ requirements: [{ key: "a", label: "x", tier: "INFO", method: "jev_noul" }, { key: "a", label: "y", tier: "MUST", method: "code" }], thresholds: { A: 50, B: 70, C: 55 } });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("INFO")));
  assert.ok(v.errors.some((e) => e.includes("重复")));
  assert.ok(v.errors.some((e) => e.includes("缺 field/op")));
  assert.ok(v.errors.some((e) => e.includes("A > B > C")));
});

test("hardFilter 三态:PASS / FAIL / UNKNOWN / MISMATCH", () => {
  const { facts } = sanitizeJdFacts(JD_JSON, JD_TEXT);
  const model = draftEvaluationModel(facts);
  const hf = runHardFilter(model, CAND);
  const m = Object.fromEntries(hf.items.map((i) => [i.key, i.result]));
  assert.equal(m.edu_min, "PASS");
  assert.equal(m.major_rel, "PASS");
  assert.equal(m.years_total, "PASS");
  assert.equal(m.years_ind_auto, "PASS");
  assert.equal(m.years_rel_quality_overseas, "PASS");
  assert.equal(m.lang_en, "PASS");
  assert.equal(m.tools_req, "PASS");
  assert.equal(m.cert_pmp, "PASS");
  assert.equal(m.ind_auto_nev, "UNKNOWN");                 // 没有 auto.nev 标签 → 交 Jev 再判(policy=ignore 只影响计分)
  assert.equal(m.cond_travel, "UNKNOWN");                  // acceptTravel=null
  assert.equal(m.cond_location, "PASS");
  assert.equal(hf.result, "PASS");
  assert.equal(hf.items.find((i) => i.key === "info_restrictions"), undefined);   // INFO 不进硬筛

  // FAIL:学历不够;UNKNOWN:学历 Other;MISMATCH:城市不同
  assert.equal(evaluateCodeRule({ field: "derived.highestDegree", op: "degree>=", value: "本科" }, { derived: { highestDegree: "大专" } }).result, "FAIL");
  assert.equal(evaluateCodeRule({ field: "derived.highestDegree", op: "degree>=", value: "本科" }, { derived: { highestDegree: "Other" } }).result, "UNKNOWN");
  assert.equal(evaluateCodeRule({ field: "derived.currentCityNorm", op: "city_in", value: ["上海"] }, { derived: { currentCityNorm: "苏州" } }).result, "MISMATCH");
  assert.equal(evaluateCodeRule({ field: "derived.industryYears.semi", op: ">=", value: 3 }, CAND).result, "UNKNOWN");
  assert.equal(evaluateCodeRule({ field: "profile.identity.name", op: "==", value: "李明" }, CAND).result, "UNKNOWN"); // 不在白名单
  // unknownPolicy=fail(HR 显式)才把 UNKNOWN 判 FAIL
  const hf2 = runHardFilter({ requirements: [{ key: "k", label: "l", tier: "MUST", method: "code", unknownPolicy: "fail", code: { field: "derived.industryYears.semi", op: ">=", value: 3 } }] }, CAND);
  assert.equal(hf2.result, "FAIL");
});

test("buildQuestions:代码已判定不出题;UNKNOWN 出题;固定题;level0 兜底", () => {
  const { facts } = sanitizeJdFacts(JD_JSON, JD_TEXT);
  const model = draftEvaluationModel(facts);
  const hf = runHardFilter(model, CAND);
  const { questions, map } = buildQuestions(model, hf);
  assert.equal(questions.req_edu_min, undefined);
  assert.equal(questions.req_lang_en, undefined);            // 代码 PASS 不再问
  assert.ok(questions.req_cond_travel);                      // UNKNOWN → 问
  assert.equal(questions.req_cond_travel.type, "noul");
  assert.ok(questions.req_cap_quality_analysis);             // jev_score 必问
  assert.ok(questions.req_ind_auto_nev);                     // UNKNOWN(policy=ignore)也问 Jev
  assert.equal(questions.req_cap_quality_analysis.type, "score");
  assert.equal(questions.req_cap_quality_analysis.criteria[0], "简历未提及相关信息");
  assert.ok(questions.meta_stability && questions.meta_sufficiency && questions.meta_inflation);
  assert.equal(questions.meta_relocation, undefined);        // 城市 PASS 不问搬迁
  assert.equal(map.req_cond_travel, "cond_travel");
  assert.equal(questions.req_info_restrictions, undefined);
  assert.deepEqual(lintQuestion({ type: "score", instructions: "候选人是否超过 5 年经验且英语好", criteria: ["一般", "良好"] }).length >= 2, true);
});

test("stripPii / truncateResume / buildState", () => {
  const md = "# 李明\n手机:13812341234 邮箱 liming@example.com https://github.com/x\n身份证:310101199001011234\n## 工作经历\n2021.03 至今 上汽通用 李明 负责欧洲质量";
  const s = stripPii(md, { identity: { name: "李明" } });
  assert.ok(!s.includes("李明"));
  assert.ok(!s.includes("13812341234"));
  assert.ok(!s.includes("example.com"));
  assert.ok(!s.includes("身份证"));
  assert.ok(s.includes("2021.03"));                          // 日期不能被当成电话抹掉
  assert.ok(s.includes("[候选人]"));
  const long = "# 头\n概要\n## 自我评价\n" + "x".repeat(20000) + "\n## 工作经历\n" + "工作".repeat(800) + "\n## 教育\n教育内容";
  const t = truncateResume(long, 4000);
  assert.equal(t.truncated, true);
  assert.ok(t.text.includes("工作经历"));
  assert.ok(!t.text.includes("xxxxxxxxxx"));                 // 低优先级段被丢
  const { state, meta } = buildState({ markdown: md, profile: { identity: { name: "李明" }, experience: [{ company: "上汽通用", title: "QE", startDate: "2021-03", current: true, duties: ["a"] }] }, derived: { totalYears: 5 }, jdFacts: null, job: { title: "QE", requirements: ["本科"] } });
  assert.ok(!state.resume.includes("李明"));
  assert.equal(state.profile.experience[0].period, "2021-03 ~ 至今");
  assert.equal(state.job.title, "QE");
  assert.ok(meta.stateTokensEst > 0);
  assert.equal(meta.piiStripped, true);
});

test("normalizeAnswers + composite:B 类主路径", () => {
  const { facts } = sanitizeJdFacts(JD_JSON, JD_TEXT);
  const model = draftEvaluationModel(facts);
  const hf = runHardFilter(model, CAND);
  const { questions, map } = buildQuestions(model, hf);
  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === "noul") answers[id] = { type: "noul", noul: id === "meta_sufficiency" || id === "meta_inflation" ? 0.05 : 0.9 };
    else answers[id] = { type: "score", score: 2.4, confidence: 0.8, legend: Object.fromEntries(q.criteria.map((c, i) => [i, c])), probabilities: { 0: 0, 1: 0.1, 2: 0.4, 3: 0.5 } };
  }
  const items = normalizeAnswers(model, hf, answers, map);
  const edu = items.find((i) => i.key === "edu_min");
  assert.equal(edu.source, "code"); assert.equal(edu.normalized, 1); assert.equal(edu.verdict, "满足");
  const cap = items.find((i) => i.key === "cap_quality_analysis");
  assert.equal(cap.source, "jev"); assert.equal(cap.normalized, 0.8); assert.equal(cap.verdict, "满足");
  const travel = items.find((i) => i.key === "cond_travel");
  assert.equal(travel.source, "jev"); assert.equal(travel.verdict, "满足");
  const nev = items.find((i) => i.key === "ind_auto_nev");
  assert.equal(nev.source, "jev");                          // 代码未知 → Jev 判定深度
  assert.equal(nev.verdict, "满足");
  const c = composite(model, items, answers);
  assert.equal(c.dimensions.find((d) => d.key === "MUST").score, 100);
  assert.ok(c.overallScore >= 70 && c.overallScore <= 100, `overall ${c.overallScore}`);
  assert.ok(["A", "B"].includes(c.classification));
  assert.equal(c.reviewPriority, "HIGH");
  assert.ok(c.minConfidence >= 0.8);
});

test("composite 分类规则:hard_fail → D;信息不足 → C;低置信 → C;MUST 未知 → 上限 C;夸大降级;BONUS 封顶", () => {
  const model = { requirements: [
    { key: "m1", label: "MUST", tier: "MUST", method: "code", weight: 10 },
    { key: "c1", label: "CORE", tier: "CORE", method: "jev_score", weight: 30 },
    { key: "b1", label: "BONUS", tier: "BONUS", method: "jev_noul", weight: 0, bonus: 20 },
  ], bonusCap: 8, thresholds: { A: 85, B: 70, C: 55 } };
  const good = (extra = {}) => ({ req_c1: { type: "score", score: 3, confidence: 0.9, legend: { 0: "a", 1: "b", 2: "c", 3: "d" }, probabilities: { 3: 1 } }, req_b1: { type: "noul", noul: 1 }, meta_sufficiency: { type: "noul", noul: 0.1 }, meta_inflation: { type: "noul", noul: 0.1 }, ...extra });
  const map = { req_c1: "c1", req_b1: "b1" };
  // hard fail
  let items = normalizeAnswers(model, { items: [{ key: "m1", result: "FAIL" }] }, good(), map);
  let c = composite(model, items, good());
  assert.equal(c.classification, "D"); assert.ok(c.reasons[0].startsWith("hard_fail"));
  // pass → A,bonus 封顶 8
  items = normalizeAnswers(model, { items: [{ key: "m1", result: "PASS" }] }, good(), map);
  c = composite(model, items, good());
  assert.equal(c.classification, "A"); assert.equal(c.bonus, 8); assert.equal(c.overallScore, 100);
  // 信息不足 → C
  c = composite(model, items, good({ meta_sufficiency: { type: "noul", noul: 0.9 } }));
  assert.equal(c.classification, "C"); assert.ok(c.reasons.includes("insufficient_info"));
  // 低置信 → C
  const low = good({ req_c1: { type: "score", score: 3, confidence: 0.3, legend: { 0: "a", 1: "b", 2: "c", 3: "d" }, probabilities: { 3: 1 } } });
  items = normalizeAnswers(model, { items: [{ key: "m1", result: "PASS" }] }, low, map);
  c = composite(model, items, low);
  assert.equal(c.classification, "C"); assert.ok(c.reasons.some((r) => r.startsWith("low_confidence")));
  // MUST 未知 → 上限 C
  items = normalizeAnswers(model, { items: [{ key: "m1", result: "UNKNOWN" }] }, good(), map);
  c = composite(model, items, good());
  assert.equal(c.classification, "C"); assert.ok(c.reasons.some((r) => r.startsWith("must_unknown")));
  // 夸大 → A 降 B
  items = normalizeAnswers(model, { items: [{ key: "m1", result: "PASS" }] }, good(), map);
  c = composite(model, items, good({ meta_inflation: { type: "noul", noul: 0.9 } }));
  assert.equal(c.classification, "B"); assert.ok(c.flags.includes("inflation"));
  // score argmax=0(未提及) → normalized 0 / verdict 未提及
  const unk = good({ req_c1: { type: "score", score: 0.2, confidence: 0.9, legend: { 0: "未提及", 1: "b", 2: "c", 3: "d" }, probabilities: { 0: 0.9, 1: 0.1 } } });
  items = normalizeAnswers(model, { items: [{ key: "m1", result: "PASS" }] }, unk, map);
  assert.equal(items.find((i) => i.key === "c1").verdict, "未提及");
});

test("sanitizeReport 引文校验 + 快照写回;legacy 适配器", () => {
  const resume = "负责欧洲市场整车质量问题分析与闭环,对接德国客户。2023 年欧洲市场千台故障率下降 32%";
  const rep = sanitizeReport({
    matchReason: "满足硬性要求",
    highlights: [{ reqKey: "cap_x", text: "有欧洲质量闭环经验", evidence: { quote: "负责欧洲市场整车质量问题分析与闭环" } }, { reqKey: "nope", text: "编造", evidence: { quote: "这句原文没有" } }],
    risks: [{ text: "无半导体经验" }],
    insights: [{ kind: "up", text: "ok" }, { kind: "sideways", text: "bad" }],
    interviewProbes: [{ reqKey: "cap_x", question: "请描述一次闭环案例", why: "验证深度" }],
    matchedFor: ["行业经验"], againstFor: [], aiSuggestedTags: ["海外质量"],
  }, { resumeText: resume, items: [{ key: "cap_x" }], detail: [{ page: 2, text: "负责欧洲市场整车质量问题分析与闭环" }] });
  assert.equal(rep.highlights[0].evidence.verified, true);
  assert.equal(rep.highlights[0].evidence.page, 2);
  assert.equal(rep.highlights[1].evidence, null);
  assert.equal(rep.highlights[1].reqKey, null);
  assert.equal(rep.stats.droppedQuotes, 1);
  assert.equal(rep.insights.length, 1);
  const snap = candidateSnapshotFromReport(rep, { overallScore: 81, classification: "B", reviewPriority: "HIGH" });
  assert.equal(snap.jdMatch, 81);
  assert.deepEqual(snap.highlights, ["有欧洲质量闭环经验", "编造"]);
  assert.equal(snap.classification, "B");
  const lg = legacyToEvaluation({ jdMatch: 72, risks: ["r"], highlights: ["h"], insights: [{ kind: "up", text: "x" }] });
  assert.equal(lg.engine, "legacy"); assert.equal(lg.classification, "B"); assert.equal(lg.overallScore, 72);
});
