import assert from "node:assert/strict";
import test from "node:test";

import { deriveProfile, mergedMonths, ymToAbs, normalizeLanguageLevel } from "./derive.js";
import { sanitizeProfile, profileToLegacy, legacyToProfile, isProfileShape, normalizeYm } from "./normalize.js";

const NOW = new Date("2026-09-20T00:00:00Z");

const SAMPLE = {
  schemaVersion: "resume.v1",
  identity: { name: "李明", gender: "male", age: 29, phones: ["138****1234"], emails: ["liming@example.com"], currentCity: "上海", jobStatus: "employed" },
  intent: { targetTitles: ["海外产品质量工程师"], acceptTravel: true, acceptOverseas: true },
  education: [{ school: "同济大学", degree: "本科", major: "车辆工程", startDate: "2015-09", endDate: "2019-06", courses: ["汽车构造", "质量管理"] }],
  experience: [
    { company: "上汽通用汽车有限公司", title: "海外产品质量工程师", startDate: "2021-03", current: true, location: "上海/斯图加特", isOverseas: true, teamSize: 4,
      companyIndustryTags: ["auto.oem"], domainTags: ["quality.overseas", "quality.analysis"], functionTags: ["quality"], duties: ["负责欧洲市场整车质量问题分析与闭环"], achievements: ["千台故障率下降 32%"], tools: ["8D", "SPC"] },
    { company: "博世汽车部件(苏州)有限公司", title: "质量工程师", startDate: "2019-07", endDate: "2021-02", location: "苏州",
      companyIndustryTags: ["auto.parts"], domainTags: ["quality.customer"], functionTags: ["quality"], duties: ["客户投诉处理"], achievements: [] },
  ],
  projects: [{ name: "XX 新能源车型欧洲上市项目", role: "海外质量负责人", startDate: "2022-01", endDate: "2023-06", type: "launch", domainTags: ["cert.overseas"], outcomes: ["量产 SOP 前问题清零"] }],
  skills: { professional: [{ name: "海外质量问题分析", tag: "quality.analysis" }], tools: [{ name: "8D" }, { name: "SPC" }, { name: "Minitab" }], soft: [{ name: "跨部门协作", behaviors: ["协调研发、制造、供应商解决问题"] }] },
  languages: [{ name: "英语", exams: [{ name: "IELTS", score: "7.0" }], businessCapable: true }, { name: "德语", levelRaw: "A2" }],
  certificates: [{ name: "六西格玛绿带", obtainedAt: "2022" }, { name: "PMP", obtainedAt: "2023" }],
  campus: { roles: ["班长", "汽车协会副会长"], competitions: [{ name: "全国大学生方程式汽车大赛", level: "national", award: "一等奖", role: "车队质量负责人" }], scholarships: ["校一等奖学金(2017)"] },
  awards: ["校一等奖学金(2017)"],
};

const SOURCE = "2015.09 – 2019.06 同济大学 2021.03 – 至今 上汽通用 2019.07 – 2021.02 博世 2022.01 – 2023.06 项目 2017 2022 2023";

test("ymToAbs / mergedMonths 基础", () => {
  assert.equal(ymToAbs("2021-03"), 2021 * 12 + 2);
  assert.equal(ymToAbs("2021"), 2021 * 12);
  assert.equal(ymToAbs("至今"), null);
  assert.equal(mergedMonths([[0, 11], [6, 23]]), 24);        // 重叠合并
  assert.equal(mergedMonths([[0, 11], [12, 23]]), 24);       // 相邻合并
  assert.equal(mergedMonths([[0, 11], [24, 35]]), 24);       // 分离相加
});

test("normalizeYm / 语言阶梯", () => {
  assert.equal(normalizeYm("2021.3"), "2021-03");
  assert.equal(normalizeYm("2021年11月"), "2021-11");
  assert.equal(normalizeYm("2021"), "2021");
  assert.equal(normalizeYm("GCSE"), null);
  assert.equal(normalizeLanguageLevel({ exams: [{ name: "IELTS", score: "7.0" }] }), "working");
  assert.equal(normalizeLanguageLevel({ exams: [{ name: "雅思", score: "6.5" }] }), "fluent");
  assert.equal(normalizeLanguageLevel({ levelRaw: "CET-6" }), "intermediate");
  assert.equal(normalizeLanguageLevel({ levelRaw: "可作为工作语言" }), "working");
  assert.equal(normalizeLanguageLevel({ levelRaw: "A2" }), "basic");
});

test("sanitizeProfile 词表归一 + 校园/证书/课程 保留 + PII 白名单", () => {
  const { profile, warnings } = sanitizeProfile({ ...SAMPLE, identity: { ...SAMPLE.identity, idNumber: "310101..." } }, SOURCE);
  assert.equal(profile.schemaVersion, "resume.v1");
  assert.equal(profile.identity.idNumber, undefined);                       // 非白名单键被丢弃
  assert.deepEqual(profile.experience[0].companyIndustryTags, ["auto.oem"]);
  assert.deepEqual(profile.experience[0].tools, ["tool.8d", "tool.spc"]);
  assert.equal(profile.experience[0].current, true);
  assert.equal(profile.experience[0].endDate, null);
  assert.equal(profile.education[0].majorTag, "major.vehicle");
  assert.deepEqual(profile.education[0].courses, ["汽车构造", "质量管理"]);
  assert.deepEqual(profile.campus.roles, ["班长", "汽车协会副会长"]);
  assert.equal(profile.campus.competitions[0].level, "national");
  assert.equal(profile.certificates[0].tag, "cert.six_sigma_gb");
  assert.equal(profile.certificates[1].tag, "cert.pmp");
  assert.equal(profile.languages[0].name, "en");
  assert.equal(profile.skills.tools.find((t) => t.name === "Minitab").tag, "tool.minitab");
  assert.equal(profile.skills.soft[0].tag, "soft.cross_team");
  assert.ok(Array.isArray(warnings));
});

test("sanitizeProfile 日期反幻觉:原文没有的年份被清空并记警告", () => {
  const { profile, warnings } = sanitizeProfile({ experience: [{ company: "X", title: "Y", startDate: "2008-01", endDate: "2009-01" }] }, "2021.03 至今");
  assert.equal(profile.experience[0].startDate, null);
  assert.equal(profile.experience[0].endDate, null);
  assert.ok(warnings.some((w) => w.code === "date_scrubbed"));
});

test("sanitizeProfile 占位名清理", () => {
  const { profile, warnings } = sanitizeProfile({ identity: { name: "张三" } });
  assert.equal(profile.identity.name, null);
  assert.ok(warnings.some((w) => w.code === "placeholder_name"));
});

test("deriveProfile 年限 / 行业年限 / 海外 / 管理 / 应届 / 跳槽 / 语言 / 证书", () => {
  const { profile } = sanitizeProfile(SAMPLE, SOURCE);
  const d = deriveProfile(profile, NOW);
  assert.equal(d.totalYears, 7.3);                    // 2019.07 → 2026.09 含首尾共 87 个月
  assert.equal(d.industryYears.auto, 7.3);            // 祖先聚合:auto.oem + auto.parts
  assert.equal(d.industryYears["auto.oem"], 5.6);     // 2021.03 → 2026.09
  assert.equal(d.domainYears["quality.overseas"], 5.6);
  assert.equal(d.functionYears.quality, 7.3);
  assert.equal(d.overseasYears, 5.6);
  assert.equal(d.managementYears, 5.6);
  assert.equal(d.maxTeamSize, 4);
  assert.equal(d.highestDegree, "本科");
  assert.equal(d.highestMajorTag, "major.vehicle");
  assert.equal(d.graduationYear, 2019);
  assert.equal(d.isFreshGraduate, false);
  assert.equal(d.jobHopping.segmentsLast5y, 1);       // 博世 2021.02 结束在 5 年前(2021.09)之前
  assert.equal(d.jobHopping.shortSegmentsLast5y, 0);
  assert.equal(d.languageLevels.en, "working");
  assert.equal(d.languageLevels.de, "basic");
  assert.deepEqual(d.certificateTags, ["cert.six_sigma_gb", "cert.pmp"]);
  assert.ok(d.toolTags.includes("tool.8d"));
  assert.ok(d.capabilityTags.includes("quality.overseas"));
  assert.equal(d.currentCityNorm, "上海");
  assert.ok(d.profileQuality >= 60);
  assert.deepEqual(d.timelineIssues, []);
});

test("deriveProfile 应届生判定 + 实习不计入年限", () => {
  const { profile } = sanitizeProfile({
    identity: { jobStatus: null },
    education: [{ school: "A", degree: "硕士", major: "计算机", endDate: "2026-06" }],
    internships: [{ company: "B", title: "实习生", startDate: "2025-07", endDate: "2025-12" }],
  }, "2026.06 2025.07 2025.12");
  const d = deriveProfile(profile, NOW);
  assert.equal(d.isFreshGraduate, true);
  assert.equal(d.totalYears, 0);
  assert.equal(d.internshipYears, 0.5);
  assert.equal(d.graduationYear, 2026);
});

test("deriveProfile 跳槽 + 时间线冲突", () => {
  const { profile } = sanitizeProfile({
    experience: [
      { company: "A", title: "x", startDate: "2025-01", current: true },
      { company: "B", title: "x", startDate: "2024-01", endDate: "2024-06" },
      { company: "C", title: "x", startDate: "2023-01", endDate: "2023-05" },
      { company: "D", title: "x", startDate: "2019-01", endDate: "2021-06" },
    ],
  }, "2025.01 2024.01 2024.06 2023.01 2023.05 2019.01 2021.06");
  const d = deriveProfile(profile, NOW);
  assert.equal(d.jobHopping.segmentsLast5y, 3);
  assert.equal(d.jobHopping.shortSegmentsLast5y, 2);
  assert.ok(d.timelineIssues.some((i) => i.kind === "gap" && i.months > 12));
});

test("profileToLegacy 兼容旧 16 键 + legacyToProfile 反向", () => {
  const { profile } = sanitizeProfile(SAMPLE, SOURCE);
  const legacy = profileToLegacy(profile);
  assert.equal(legacy.name, "李明");
  assert.equal(legacy.location, "上海");
  assert.deepEqual(legacy.phones, ["138****1234"]);
  assert.equal(legacy.educationHistory[0].period, "2015.09 – 2019.06");
  assert.equal(legacy.experience[0].period, "2021.03 – 至今");
  assert.equal(legacy.experience[0].reports, 4);
  assert.ok(legacy.skills.includes("8D"));
  assert.ok(legacy.awards.some((a) => a.startsWith("六西格玛绿带")));
  assert.ok(legacy.projects[0].responsibility.includes("海外质量负责人"));
  assert.equal(legacy.languages[0].name, "英语");

  assert.equal(isProfileShape(SAMPLE), true);
  assert.equal(isProfileShape(legacy), false);
  const back = legacyToProfile(legacy, SOURCE).profile;
  assert.equal(back.identity.name, "李明");
  assert.equal(back.experience[0].startDate, "2021-03");
  assert.equal(back.experience[0].current, true);
  assert.equal(back.education[0].endDate, "2019-06");
});

test("legacyToProfile 兼容更早版本项目键 + 占位串归 null", () => {
  const { profile } = legacyToProfile({
    name: "郑凯戈", location: "未提供",
    projects: [{ name: "国家重点研发计划项目", role: "核心成员", period: "2021.09 – 2023.06", description: "负责护理床硬件电路", achievements: ["完成项目验收"] }],
  }, "2021.09 2023.06");
  assert.equal(profile.identity.currentCity, null);
  assert.equal(profile.projects.length, 1);
  assert.equal(profile.projects[0].name, "国家重点研发计划项目");
  assert.equal(profile.projects[0].role, "核心成员");
  assert.equal(profile.projects[0].startDate, "2021-09");
  assert.deepEqual(profile.projects[0].duties, ["负责护理床硬件电路"]);
  assert.deepEqual(profile.projects[0].outcomes, ["完成项目验收"]);
});
