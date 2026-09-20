// 评估层输入构造(纯函数,可单测):
//   buildState({ markdown, profile, derived, jdFacts, job, piiStrip })  → Jev state(脱敏 + token 预算)
//   buildQuestions(evaluationModel, hardFilterResult, options)           → { questions, meta }
//   stripPii(markdown, profile)                                          → 去姓名/电话/邮箱/链接/照片/身份证行
// 题目 id:req_<key>(评价模型条目)/ meta_<name>(固定通用题)。

import { estimateTokens } from "../jev.js";
import { QUESTION_TEMPLATE_VERSION } from "./templates.js";

const STATE_BUDGET = { resume: 10000, profile: 4000, job: 1200 };

// ─── 脱敏 ───
export function stripPii(markdown, profile = {}) {
  let s = String(markdown || "");
  const id = profile?.identity || {};
  const name = (id.name || "").trim();
  if (name && name.length >= 2) {
    const variants = new Set([name, name.replace(/\s+/g, ""), name.split(/\s+/).join(" ")]);
    for (const v of variants) if (v) s = s.split(v).join("[候选人]");
  }
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[已隐藏]");                 // 邮箱
  s = s.replace(/(?<![\d.])(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{4}(?:[\s-]?\d{1,4})?(?![\d.])/g, (m) => (m.replace(/\D/g, "").length >= 7 && m.replace(/\D/g, "").length <= 15 && !/^(19|20)\d{2}$/.test(m.replace(/\D/g, "")) ? "[已隐藏]" : m)); // 电话
  s = s.replace(/1[3-9]\d\*{4}\d{4}/g, "[已隐藏]");                                              // 打码手机
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, "");                                                     // 图片
  s = s.replace(/https?:\/\/\S+|www\.\S+/gi, "[链接]");                                          // 链接
  s = s.split("\n").filter((line) => !/(身份证|出生年月|出生日期|家庭住址|住址|籍贯|民族|婚姻|婚育|政治面貌|户口)/.test(line)).join("\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

// ─── 简历 markdown 按段落优先级截断到预算(工作 > 项目 > 技能 > 教育 > 其它)───
const SECTION_PRIORITY = [
  [/工作经历|工作经验|职业经历|work experience|employment|professional experience/i, 1],
  [/项目经[历验]|projects?/i, 2],
  [/技能|专业能力|skills?/i, 3],
  [/教育|学历|education/i, 4],
  [/语言|证书|资质|languages?|certificat/i, 5],
  [/自我评价|个人评价|summary|profile/i, 6],
];
export function truncateResume(md, budgetTokens = STATE_BUDGET.resume) {
  const text = String(md || "");
  if (estimateTokens(text) <= budgetTokens) return { text, truncated: false };
  // 按 markdown 标题切段
  const parts = text.split(/\n(?=#{1,4}\s)/);
  const scored = parts.map((p, i) => {
    const head = p.split("\n")[0];
    let pr = 7;
    for (const [re, v] of SECTION_PRIORITY) if (re.test(head)) { pr = v; break; }
    if (i === 0) pr = 0; // 首段(姓名/概要)始终保留
    return { p, i, pr, tokens: estimateTokens(p) };
  }).sort((a, b) => a.pr - b.pr || a.i - b.i);
  let used = 0;
  const keep = new Set();
  for (const s of scored) {
    if (used + s.tokens <= budgetTokens) { keep.add(s.i); used += s.tokens; }
  }
  let out = parts.filter((_, i) => keep.has(i)).join("\n");
  if (estimateTokens(out) > budgetTokens) out = out.slice(0, Math.floor(out.length * (budgetTokens / estimateTokens(out))));
  return { text: out + "\n\n[…简历过长,已按段落优先级截断…]", truncated: true };
}

// ─── state ───
function projectProfile(profile) {
  const p = profile || {};
  const seg = (e) => ({
    company: e.company, title: e.title, period: `${e.startDate || "?"} ~ ${e.current ? "至今" : (e.endDate || "?")}`,
    location: e.location, isOverseas: e.isOverseas, teamSize: e.teamSize, isManagement: e.isManagement,
    duties: (e.duties || []).slice(0, 8), achievements: (e.achievements || []).slice(0, 8), quantified: (e.quantified || []).slice(0, 5),
    domainTags: e.domainTags, industryTags: e.companyIndustryTags, tools: e.tools,
  });
  return {
    education: (p.education || []).map((e) => ({ school: e.school, degree: e.degree, major: e.major, period: `${e.startDate || "?"} ~ ${e.endDate || (e.current ? "至今" : "?")}`, overseas: e.overseas, courses: (e.courses || []).slice(0, 10), honors: e.honors })),
    experience: (p.experience || []).map(seg),
    internships: (p.internships || []).map(seg),
    projects: (p.projects || []).map((x) => ({ name: x.name, role: x.role, period: `${x.startDate || "?"} ~ ${x.current ? "至今" : (x.endDate || "?")}`, type: x.type, stage: x.stage, regionTags: x.regionTags, duties: (x.duties || []).slice(0, 6), contributions: (x.contributions || []).slice(0, 6), outcomes: (x.outcomes || []).slice(0, 6), domainTags: x.domainTags })),
    skills: {
      professional: (p.skills?.professional || []).map((s) => s.name),
      tools: (p.skills?.tools || []).map((s) => s.name),
      industry: (p.skills?.industry || []).map((s) => s.name),
      soft: (p.skills?.soft || []).map((s) => ({ name: s.name, behaviors: s.behaviors })),
    },
    languages: (p.languages || []).map((l) => ({ name: l.raw || l.name, level: l.level || l.levelRaw, exams: (l.exams || []).map((e) => `${e.name} ${e.score || ""}`.trim()), businessCapable: l.businessCapable })),
    certificates: (p.certificates || []).map((c) => c.name),
    campus: p.campus ? { roles: p.campus.roles, competitions: (p.campus.competitions || []).map((c) => `${c.name}${c.award ? `·${c.award}` : ""}${c.role ? `·${c.role}` : ""}`), scholarships: p.campus.scholarships, honors: p.campus.honors } : undefined,
    intent: p.intent ? { targetTitles: p.intent.targetTitles, targetCities: p.intent.targetCities, acceptTravel: p.intent.acceptTravel, acceptOverseas: p.intent.acceptOverseas, acceptRelocation: p.intent.acceptRelocation } : undefined,
  };
}
function projectDerived(derived) {
  const d = derived || {};
  return {
    totalYears: d.totalYears, industryYears: d.industryYears, domainYears: d.domainYears, overseasYears: d.overseasYears, managementYears: d.managementYears,
    maxTeamSize: d.maxTeamSize, highestDegree: d.highestDegree, isFreshGraduate: d.isFreshGraduate, graduationYear: d.graduationYear,
    jobHopping: d.jobHopping, timelineIssues: d.timelineIssues, languageLevels: d.languageLevels, certificateTags: d.certificateTags, currentCity: d.currentCityNorm,
  };
}
function projectJob(job, jdFacts) {
  const f = jdFacts || {};
  return {
    title: job?.title || f.basics?.title,
    responsibilities: (f.responsibilities?.length ? f.responsibilities.map((r) => r.description || r.name) : job?.responsibilities || []).slice(0, 10),
    requirements: (job?.requirements || []).slice(0, 12),
    nice: (job?.nice || []).slice(0, 6),
    locations: (f.basics?.locations || []).map((l) => l.city).filter(Boolean).length ? (f.basics.locations || []).map((l) => l.city) : (job?.location ? [job.location] : []),
    travel: f.workConditions?.travel?.required ? `${f.workConditions.travel.frequency || ""}出差${f.workConditions.travel.daysPerYear ? ` 年≥${f.workConditions.travel.daysPerYear} 天` : ""}`.trim() : null,
    overseasPosting: f.workConditions?.overseasPosting?.required ? (f.workConditions.overseasPosting.raw || "需海外派驻") : null,
  };
}

export function buildState({ markdown, profile, derived, jdFacts, job, piiStrip = true }) {
  const resumeRaw = piiStrip ? stripPii(markdown, profile) : String(markdown || "");
  const { text: resume, truncated } = truncateResume(resumeRaw);
  const state = {
    resume,
    profile: projectProfile(profile),
    derived: projectDerived(derived),
    job: projectJob(job, jdFacts),
  };
  const tokens = estimateTokens(state);
  return { state, meta: { stateTokensEst: tokens, truncated, piiStripped: !!piiStrip } };
}

// ─── 固定通用题 ───
export const FIXED_QUESTIONS = {
  stability: {
    type: "score",
    instructions: "结合 `derived.jobHopping` 与 `profile.experience`,判断候选人任职稳定性。",
    criteria: ["近 5 年 4 段以上经历且多数不足 1 年", "有 1-2 段不足 1 年的短任职", "任职稳定,每段 2 年以上", "长期稳定且在同一公司有晋升"],
  },
  sufficiency: {
    type: "noul",
    instructions: "`resume` 的信息是否不足以判断与 `job.requirements` 的匹配?",
    criteria: { true: "经历只有公司和职位没有内容、大段空白、或与岗位相关的经历完全缺失", false: "工作/项目内容有具体职责与成果,可据此判断" },
  },
  inflation: {
    type: "noul",
    instructions: "`resume` 是否存在关键词堆砌而无具体事例支撑的技能声明?",
    criteria: { true: "技能栏罗列大量工具/能力,但工作与项目描述中找不到对应使用场景", false: "声明的技能在经历中有具体使用案例,或技能栏本身很克制" },
  },
  relocation: {
    type: "noul",
    instructions: "候选人当前所在地或求职意向是否与 `job.locations` 一致,或明确表示可搬迁/派驻?",
    criteria: { true: "现居地在岗位城市,或简历写明接受异地/海外/派驻", false: "现居地不同且未提及搬迁意愿,或明确只考虑本地" },
  },
};

function ensureLevelZero(criteria) {
  const arr = Array.isArray(criteria) ? criteria.map((c) => String(c)) : [];
  if (!arr.length) return ["简历未提及相关信息", "有少量相关信息", "有具体相关经历", "深度相关并有成果"];
  if (!/未提及|未涉及|没有|无相关|not mention/i.test(arr[0])) return ["简历未提及相关信息", ...arr].slice(0, 10);
  return arr.slice(0, 10);
}

// 题目措辞体检(保存 evaluationModel 时给 warning;这里不阻断)
export function lintQuestion(q) {
  const warnings = [];
  if (!q) return ["缺少题目"];
  if (/且|并且|同时/.test(q.instructions || "")) warnings.push("疑似包含多个判断,建议拆分");
  if (q.type === "score" && Array.isArray(q.criteria) && q.criteria.every((c) => /^(一般|良好|优秀|较好|很好|差|中等)$/.test(String(c).trim()))) warnings.push("等级只有程度词,请改成情境描述");
  if (!/`[a-zA-Z_.\[\]0-9]+`/.test(q.instructions || "")) warnings.push("建议用反引号引用 state 字段");
  if (/共\s*\d|合计|超过\s*\d+\s*年|是否大于|是否超过/.test(q.instructions || "") && !/derived\./.test(q.instructions || "")) warnings.push("涉及算数/年限比较,请改为引用 derived.* 指标");
  if ((q.instructions || "").length > 600) warnings.push("题目过长(>600 字符)");
  return warnings;
}

// ─── 题目生成 ───
// hardFilterResult.items: [{ key, result }];UNKNOWN / MISMATCH 的 code_then_jev 才出题
export function buildQuestions(evaluationModel, hardFilterResult, { includeFixed = true } = {}) {
  const questions = {};
  const map = {}; // questionId -> requirement key
  const hf = new Map((hardFilterResult?.items || []).map((i) => [i.key, i.result]));
  const reqs = Array.isArray(evaluationModel?.requirements) ? evaluationModel.requirements : [];
  let needRelocation = false;
  for (const r of reqs) {
    if (!r || r.tier === "INFO" || r.method === "none" || r.method === "code") continue;
    const hfr = hf.get(r.key);
    if (r.method === "code_then_jev" && hfr && hfr !== "UNKNOWN" && hfr !== "MISMATCH") continue; // 代码已判定
    if (hfr === "MISMATCH") needRelocation = true;
    const q = r.jev || {};
    const type = q.type === "noul" || r.method === "jev_noul" ? "noul" : "score";
    const id = `req_${r.key}`;
    if (type === "noul") {
      questions[id] = {
        type: "noul",
        instructions: q.instructions || `根据 \`resume\` 与 \`profile\`,候选人是否满足:${r.label}?`,
        criteria: q.criteria && typeof q.criteria === "object" && !Array.isArray(q.criteria)
          ? { true: String(q.criteria.true || `简历有明确证据显示满足「${r.label}」`), false: String(q.criteria.false || `无证据或简历未提及「${r.label}」`) }
          : { true: `简历有明确证据显示满足「${r.label}」`, false: `无证据或简历未提及「${r.label}」` },
      };
    } else {
      questions[id] = {
        type: "score",
        instructions: q.instructions || `根据 \`resume\`、\`profile.experience\` 与 \`profile.projects\`,判断候选人在「${r.label}」上的经验深度。`,
        criteria: ensureLevelZero(q.criteria || q.levels),
      };
    }
    map[id] = r.key;
  }
  if (includeFixed) {
    const fixed = Array.isArray(evaluationModel?.fixedQuestions) ? evaluationModel.fixedQuestions : ["stability", "sufficiency", "inflation"];
    for (const name of fixed) if (FIXED_QUESTIONS[name] && name !== "relocation") questions[`meta_${name}`] = FIXED_QUESTIONS[name];
    if (needRelocation && !questions.req_cond_location) questions.meta_relocation = FIXED_QUESTIONS.relocation;
  }
  return { questions, map, meta: { questionTemplate: QUESTION_TEMPLATE_VERSION, count: Object.keys(questions).length } };
}
