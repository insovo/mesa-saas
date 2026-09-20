// 岗位评价模板(HR 拥有,LLM 不定权重)+ jdFacts → evaluationModel 草稿生成器(纯函数,可单测)
// 每类要求的默认 tier / method / 权重由模板给;Kimi 只补 Jev 题目措辞;HR 在 UI 调 tier / 权重 / 措辞后保存。

import { displayName } from "../taxonomy/index.js";

export const EVAL_SCHEMA_VERSION = "eval.v1";
export const QUESTION_TEMPLATE_VERSION = "qt.v1";
export const TIERS = ["MUST", "CORE", "PREFERRED", "BONUS", "INFO"];
export const METHODS = ["code", "jev_noul", "jev_score", "code_then_jev", "none"];
export const UNKNOWN_POLICIES = ["review", "interview", "ignore", "fail"];

// 模板:各类要求的默认 tier / 权重(百分比份额,代码会归一)
const BASE = {
  minDegree: { tier: "MUST", weight: 10 },
  majors: { tier: "MUST", weight: 8 },
  yearsTotal: { tier: "MUST", weight: 10 },
  yearsIndustry: { tier: "MUST", weight: 12 },
  yearsRelevant: { tier: "CORE", weight: 20 },
  yearsManagement: { tier: "CORE", weight: 8 },
  yearsOverseas: { tier: "CORE", weight: 12 },
  languageRequired: { tier: "MUST", weight: 12 },
  languagePreferred: { tier: "BONUS", weight: 3 },
  professionalSkill: { tier: "CORE", weight: 12 },
  toolRequired: { tier: "CORE", weight: 6 },
  toolPreferred: { tier: "PREFERRED", weight: 4 },
  industryRequired: { tier: "CORE", weight: 10 },
  industryPreferred: { tier: "PREFERRED", weight: 6 },
  projectRequired: { tier: "CORE", weight: 10 },
  projectPreferred: { tier: "PREFERRED", weight: 6 },
  certificateRequired: { tier: "MUST", weight: 5 },
  certificatePreferred: { tier: "BONUS", weight: 3 },
  softSkill: { tier: "PREFERRED", weight: 5 },
  travel: { tier: "CORE", weight: 5 },
  overseasPosting: { tier: "CORE", weight: 6 },
  location: { tier: "CORE", weight: 4 },
  campusBatch: { tier: "MUST", weight: 5 },
  responsibility: { tier: "CORE", weight: 8 },
};

export const TEMPLATES = {
  "tpl.general": { id: "tpl.general", name: "通用岗位", description: "默认模板:学历/年限/语言硬性,专业能力核心,行业/项目按 JD 语气", overrides: {} },
  "tpl.quality.overseas": { id: "tpl.quality.overseas", name: "海外质量 / 工程", description: "海外经验、相关领域年限与语言权重更高", overrides: { yearsOverseas: { tier: "CORE", weight: 15 }, yearsRelevant: { tier: "CORE", weight: 22 }, languageRequired: { tier: "MUST", weight: 14 }, travel: { tier: "CORE", weight: 8 } } },
  "tpl.rnd.engineer": { id: "tpl.rnd.engineer", name: "研发 / 技术", description: "专业能力与项目经验权重更高,工具为核心", overrides: { professionalSkill: { tier: "CORE", weight: 16 }, projectRequired: { tier: "CORE", weight: 14 }, toolRequired: { tier: "CORE", weight: 10 }, yearsIndustry: { tier: "CORE", weight: 10 } } },
  "tpl.hr.bp": { id: "tpl.hr.bp", name: "HR / HRBP", description: "相关领域年限与软技能权重更高", overrides: { yearsRelevant: { tier: "CORE", weight: 22 }, softSkill: { tier: "CORE", weight: 10 }, professionalSkill: { tier: "CORE", weight: 14 } } },
  "tpl.sales.overseas": { id: "tpl.sales.overseas", name: "海外销售 / 商务", description: "语言、海外经验、出差意愿为核心", overrides: { languageRequired: { tier: "MUST", weight: 15 }, yearsOverseas: { tier: "CORE", weight: 15 }, travel: { tier: "CORE", weight: 10 }, industryRequired: { tier: "CORE", weight: 12 } } },
  "tpl.campus.general": { id: "tpl.campus.general", name: "校园招聘", description: "毕业批次与学历硬性;年限类不设硬性;实习/校园经历为核心", overrides: { yearsTotal: { tier: "INFO", weight: 0 }, yearsIndustry: { tier: "INFO", weight: 0 }, yearsRelevant: { tier: "PREFERRED", weight: 8 }, campusBatch: { tier: "MUST", weight: 10 }, projectRequired: { tier: "CORE", weight: 12 } } },
};

export function listTemplates() {
  return Object.values(TEMPLATES).map(({ id, name, description }) => ({ id, name, description }));
}

// 由 jdFacts 推断模板
export function inferTemplateId(jdFacts) {
  const f = jdFacts || {};
  const fn = f.basics?.functionTag || "";
  const title = `${f.basics?.title || ""} ${f.basics?.direction || ""}`;
  const overseas = /海外|国际|欧洲|北美|东南亚|出海|overseas|global/i.test(title) || (f.experienceYears?.overseas?.min > 0) || (f.workConditions?.overseasPosting?.required === true);
  if (f.basics?.recruitType === "campus" || f.campus?.candidateType === "fresh") return "tpl.campus.general";
  if (fn.startsWith("hr")) return "tpl.hr.bp";
  if (fn === "sales" || fn === "marketing") return overseas ? "tpl.sales.overseas" : "tpl.general";
  if (fn === "quality" || fn === "test" || fn === "manufacturing" || fn === "pm") return overseas ? "tpl.quality.overseas" : "tpl.general";
  if (fn.startsWith("rnd") || fn === "data") return "tpl.rnd.engineer";
  return "tpl.general";
}

function cfg(templateId, kind) {
  const t = TEMPLATES[templateId] || TEMPLATES["tpl.general"];
  return { ...BASE[kind], ...(t.overrides[kind] || {}) };
}
const slug = (s) => String(s || "").toLowerCase().replace(/^(soft|cert|tool)\./, "").replace(/[^a-z0-9一-鿿]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "x";

// 4 级情境描述的默认 levels(Kimi 补措辞前的兜底,保证草稿可直接用)
function defaultLevels(label) {
  return [
    "简历未提及相关信息",
    `仅在技能栏或职责里提到「${label}」,无具体案例`,
    `有 1-2 段经历包含「${label}」的具体职责或成果`,
    `长期或独立负责「${label}」并有量化成果`,
  ];
}
function defaultNoul(label, hint) {
  return { type: "noul", instructions: `根据 \`resume\` 与 \`profile\`,候选人是否满足:${label}?`, criteria: { true: hint || `简历有明确证据显示满足「${label}」`, false: `无证据或简历未提及「${label}」` } };
}
function defaultScore(label) {
  return { type: "score", instructions: `根据 \`resume\`、\`profile.experience\` 与 \`profile.projects\`,判断候选人在「${label}」上的经验深度。`, criteria: defaultLevels(label) };
}

// ─── 主入口:jdFacts → evaluationModel 草稿 ───
export function draftEvaluationModel(jdFacts, { templateId = null, defaultWeights = null } = {}) {
  const f = jdFacts || {};
  const tpl = templateId && TEMPLATES[templateId] ? templateId : inferTemplateId(f);
  const reqs = [];
  const keys = new Set();
  const push = (r) => {
    let k = r.key;
    let i = 2;
    while (keys.has(k)) k = `${r.key}_${i++}`;
    keys.add(k);
    reqs.push({ unknownPolicy: "review", ...r, key: k });
  };

  // 学历
  if (f.education?.minDegree) {
    const c = cfg(tpl, "minDegree");
    push({ key: "edu_min", label: `${f.education.minDegree}及以上`, tier: c.tier, method: "code", source: "education.minDegree", weight: c.weight,
      code: { field: "derived.highestDegree", op: "degree>=", value: f.education.minDegree } });
  }
  // 专业
  const majorTags = (f.education?.majors || []).map((m) => m.tag).filter(Boolean);
  if ((f.education?.majors || []).length) {
    const c = cfg(tpl, "majors");
    const label = `专业:${f.education.majors.map((m) => m.raw).join("/")}${f.education.majorType === "strict" ? "" : "(相关)"}`;
    push({ key: "major_rel", label, tier: f.education.majorType === "strict" ? "MUST" : c.tier, method: majorTags.length ? "code_then_jev" : "jev_noul", source: "education.majors", weight: c.weight,
      code: majorTags.length ? { field: "derived.highestMajorTag", op: "in_family", value: majorTags } : undefined,
      jev: { type: "noul", instructions: `候选人 \`profile.education\` 的专业是否与「${f.education.majors.map((m) => m.raw).join("/")}」相关(含近邻学科)?`, criteria: { true: "专业名称或主修课程明显属于该学科或近邻学科", false: "专业无关,或未提供专业信息" } } });
  }
  // 年限
  if (f.experienceYears?.total?.min != null) {
    const c = cfg(tpl, "yearsTotal");
    push({ key: "years_total", label: `工作年限 ≥${f.experienceYears.total.min} 年`, tier: c.tier, method: "code", source: "experienceYears.total", weight: c.weight,
      code: { field: "derived.totalYears", op: ">=", value: f.experienceYears.total.min } });
  }
  for (const [i, x] of (f.experienceYears?.industry || []).entries()) {
    const c = cfg(tpl, "yearsIndustry");
    const label = `${x.raw || displayName("industries", x.industryTag)}行业${x.min != null ? ` ≥${x.min} 年` : "经验"}`;
    push({ key: `years_ind_${slug(x.industryTag || x.raw)}`, label, tier: c.tier, method: x.industryTag ? "code_then_jev" : "jev_score", source: `experienceYears.industry[${i}]`, weight: c.weight,
      code: x.industryTag ? { field: `derived.industryYears.${x.industryTag}`, op: ">=", value: x.min ?? 0.5 } : undefined,
      jev: defaultScore(`${x.raw || displayName("industries", x.industryTag)}行业经验`) });
  }
  for (const [i, x] of (f.experienceYears?.relevant || []).entries()) {
    const c = cfg(tpl, "yearsRelevant");
    const label = `${x.raw || displayName("domains", x.domainTag)}${x.min != null ? ` ≥${x.min} 年` : "相关经验"}`;
    push({ key: `years_rel_${slug(x.domainTag || x.raw)}`, label, tier: c.tier, method: x.domainTag ? "code_then_jev" : "jev_score", source: `experienceYears.relevant[${i}]`, weight: c.weight,
      code: x.domainTag ? { field: `derived.domainYears.${x.domainTag}`, op: ">=", value: x.min ?? 0.5 } : undefined,
      jev: defaultScore(x.raw || displayName("domains", x.domainTag)) });
  }
  if (f.experienceYears?.management?.min != null) {
    const c = cfg(tpl, "yearsManagement");
    push({ key: "years_mgmt", label: `管理经验 ≥${f.experienceYears.management.min} 年`, tier: c.tier, method: "code_then_jev", source: "experienceYears.management", weight: c.weight,
      code: { field: "derived.managementYears", op: ">=", value: f.experienceYears.management.min }, jev: defaultScore("团队管理") });
  }
  if (f.experienceYears?.overseas?.min != null) {
    const c = cfg(tpl, "yearsOverseas");
    push({ key: "years_overseas", label: `海外经验 ≥${f.experienceYears.overseas.min} 年`, tier: c.tier, method: "code_then_jev", source: "experienceYears.overseas", weight: c.weight,
      code: { field: "derived.overseasYears", op: ">=", value: f.experienceYears.overseas.min }, jev: defaultScore("海外工作") });
  }
  // 语言
  for (const [i, l] of (f.languages || []).entries()) {
    const lang = l.language || "en";
    const name = l.raw || displayName("languages", lang);
    if (l.required) {
      const c = cfg(tpl, "languageRequired");
      const need = l.level || "working";
      push({ key: `lang_${lang}`, label: `${name}${need === "working" ? "可作为工作语言" : `达到 ${need}`}`, tier: c.tier, method: "code_then_jev", source: `languages[${i}]`, weight: c.weight,
        code: { field: "derived.languageLevels", op: "level>=", value: need, lang },
        jev: { type: "noul", instructions: `根据 \`resume\` 与 \`profile.experience\`,候选人是否有${name}${need === "working" ? "可作为工作语言" : "达到要求"}的证据?`, criteria: { true: "海外常驻工作、外语授课学历、高分语言考试、或明确写可作为工作语言", false: "无上述证据,或仅写一般/基础;未提及也算 false" } } });
    } else {
      const c = cfg(tpl, "languagePreferred");
      push({ key: `lang_${lang}_pref`, label: `${name}(加分)`, tier: c.tier, method: "code_then_jev", source: `languages[${i}]`, weight: 0, bonus: c.weight, unknownPolicy: "ignore",
        code: { field: "derived.languageLevels", op: "level>=", value: l.level || "fluent", lang }, jev: defaultNoul(`${name}能力`) });
    }
  }
  // 专业能力
  for (const [i, s] of (f.professionalSkills || []).entries()) {
    const c = cfg(tpl, "professionalSkill");
    push({ key: `cap_${slug(s.tag || s.name)}`, label: s.name, tier: s.required === false ? "PREFERRED" : c.tier, method: "jev_score", source: `professionalSkills[${i}]`, weight: c.weight, hint: s.evidenceHint || null,
      jev: defaultScore(s.name) });
  }
  // 工具
  const reqTools = (f.tools || []).filter((t) => t.required !== false && t.tag);
  const prefTools = (f.tools || []).filter((t) => t.required === false || !t.tag);
  if (reqTools.length) {
    const c = cfg(tpl, "toolRequired");
    push({ key: "tools_req", label: `工具:${reqTools.map((t) => t.name).join("/")}`, tier: c.tier, method: "code_then_jev", source: "tools", weight: c.weight,
      code: { field: "derived.toolTags", op: "has_all", value: reqTools.map((t) => t.tag) },
      jev: { type: "score", instructions: `候选人对 ${reqTools.map((t) => t.name).join("/")} 的实际使用深度(以 \`profile.experience\` 与 \`profile.projects\` 的具体案例为准)。`, criteria: ["简历未提及", "仅列在技能栏", "有具体使用案例", "主导过基于这些工具的改进并有结果"] } });
  }
  if (prefTools.length) {
    const c = cfg(tpl, "toolPreferred");
    push({ key: "tools_pref", label: `工具(优先):${prefTools.map((t) => t.name).join("/")}`, tier: c.tier, method: prefTools.some((t) => t.tag) ? "code_then_jev" : "jev_score", source: "tools", weight: c.weight, unknownPolicy: "ignore",
      code: prefTools.some((t) => t.tag) ? { field: "derived.toolTags", op: "has_any", value: prefTools.map((t) => t.tag).filter(Boolean) } : undefined,
      jev: defaultScore(prefTools.map((t) => t.name).join("/")) });
  }
  // 行业
  for (const [i, x] of (f.industries || []).entries()) {
    const c = cfg(tpl, x.required ? "industryRequired" : "industryPreferred");
    const tag = x.subIndustryTag || x.industryTag;
    const name = x.raw || displayName("industries", tag);
    push({ key: `ind_${slug(tag || name)}`, label: `${name}经验${x.regionTags?.length ? `(${x.regionTags.join("/")})` : ""}`, tier: c.tier, method: tag ? "code_then_jev" : "jev_score", source: `industries[${i}]`, weight: c.weight, unknownPolicy: x.required ? "review" : "ignore",
      code: tag ? { field: `derived.industryYears.${tag}`, op: ">", value: 0 } : undefined, jev: defaultScore(`${name}经验`) });
  }
  // 项目
  for (const [i, p] of (f.projectRequirements || []).entries()) {
    const c = cfg(tpl, p.required ? "projectRequired" : "projectPreferred");
    const name = [p.regionTags?.join("/"), p.domain, p.type === "mass_production" ? "量产" : p.type === "certification" ? "认证" : p.type === "launch" ? "上市" : p.type === "rnd" ? "研发" : null, "项目"].filter(Boolean).join("");
    push({ key: `proj_${slug(p.domain || p.type)}_${i}`, label: `${name}经验`, tier: c.tier, method: "jev_score", source: `projectRequirements[${i}]`, weight: c.weight, unknownPolicy: p.required ? "review" : "ignore",
      jev: { type: "score", instructions: `根据 \`profile.projects\` 与 \`profile.experience\`,候选人「${name}」经验的深度。`, criteria: ["简历未提及", "作为成员参与", "负责其中某个模块并对接客户/供应商", "作为负责人推动项目交付并有成果"] } });
  }
  // 证书
  for (const [i, cert] of (f.certificates || []).entries()) {
    const c = cfg(tpl, cert.required ? "certificateRequired" : "certificatePreferred");
    push({ key: `cert_${slug(cert.tag || cert.name)}`, label: `证书:${cert.name}`, tier: c.tier, method: cert.tag ? "code" : "jev_noul", source: `certificates[${i}]`, weight: cert.required ? c.weight : 0, bonus: cert.required ? 0 : c.weight, unknownPolicy: cert.required ? "review" : "ignore",
      code: cert.tag ? { field: "derived.certificateTags", op: "has_any", value: [cert.tag] } : undefined, jev: defaultNoul(`持有 ${cert.name} 证书`) });
  }
  // 软技能(只认可验证行为)
  for (const [i, s] of (f.softSkills || []).entries()) {
    const c = cfg(tpl, "softSkill");
    push({ key: `soft_${slug(s.tag || s.name)}`, label: s.name, tier: c.tier, method: "jev_score", source: `softSkills[${i}]`, weight: c.weight, unknownPolicy: "ignore",
      jev: { type: "score", instructions: `候选人「${s.name}」的证据强度${s.behaviors?.length ? `(岗位期望行为:${s.behaviors.join(";")})` : ""},只认可 \`profile.experience[].duties/achievements\` 里的具体行为。`, criteria: ["简历未提及", "仅自我描述(如“沟通能力强”),无事例", "有 1 个具体事例", "多段经历持续体现并有结果"] } });
  }
  // 工作条件
  const wc = f.workConditions || {};
  if (wc.travel?.required) {
    const c = cfg(tpl, "travel");
    push({ key: "cond_travel", label: `接受${wc.travel.frequency === "high" ? "高频" : ""}出差${wc.travel.daysPerYear ? `(年 ≥${wc.travel.daysPerYear} 天)` : ""}`, tier: c.tier, method: "code_then_jev", source: "workConditions.travel", weight: c.weight, unknownPolicy: "interview",
      code: { field: "profile.intent.acceptTravel", op: "==", value: true }, jev: { type: "noul", instructions: "简历是否显示候选人接受或已适应高频出差/派驻?", criteria: { true: "有海外常驻/高频出差经历,或求职意向写明接受出差/海外", false: "无相关经历且未表态,或明确不接受" } } });
  }
  if (wc.overseasPosting?.required) {
    const c = cfg(tpl, "overseasPosting");
    push({ key: "cond_overseas", label: "接受海外派驻", tier: c.tier, method: "code_then_jev", source: "workConditions.overseasPosting", weight: c.weight, unknownPolicy: "interview",
      code: { field: "profile.intent.acceptOverseas", op: "==", value: true }, jev: { type: "noul", instructions: "候选人是否有海外常驻经历,或明确表示接受海外派驻?", criteria: { true: "有海外常驻工作经历,或意向写明接受海外/派驻", false: "无海外经历且未表态,或明确只考虑国内" } } });
  }
  const cities = (f.basics?.locations || []).map((l) => l.cityNorm).filter(Boolean);
  if (cities.length) {
    const c = cfg(tpl, "location");
    push({ key: "cond_location", label: `工作地点:${cities.join("/")}`, tier: c.tier, method: "code_then_jev", source: "basics.locations", weight: c.weight, unknownPolicy: "interview",
      code: { field: "derived.currentCityNorm", op: "city_in", value: cities },
      jev: { type: "noul", instructions: `候选人当前所在地或求职意向是否与岗位城市(${cities.join("/")})一致,或明确表示可搬迁?`, criteria: { true: "现居地在岗位城市,或简历写明接受异地/搬迁", false: "现居地不同且未提及搬迁意愿,或明确只考虑本地" } } });
  }
  // 校招批次
  if (f.campus?.graduationYears?.length) {
    const c = cfg(tpl, "campusBatch");
    push({ key: "campus_batch", label: `${f.campus.graduationYears.join("/")} 届毕业生`, tier: c.tier, method: "code", source: "campus.graduationYears", weight: c.weight,
      code: { field: "derived.graduationYear", op: "year_in", value: f.campus.graduationYears } });
  }
  // 核心职责 → 岗位相似度(只取 importance=core,最多 3 条)
  for (const [i, r] of (f.responsibilities || []).filter((r) => r.importance === "core").slice(0, 3).entries()) {
    const c = cfg(tpl, "responsibility");
    push({ key: `resp_${i}`, label: `做过:${r.name || r.description?.slice(0, 20)}`, tier: c.tier, method: "jev_score", source: `responsibilities[${i}]`, weight: c.weight,
      jev: { type: "score", instructions: `候选人是否做过与岗位职责「${r.name || ""}:${(r.description || "").slice(0, 120)}」相近的工作(以 \`profile.experience[].duties/achievements\` 为准)。`, criteria: ["简历未提及相近工作", "做过其中个别环节", "做过大部分环节并有具体成果", "长期负责同类工作并有量化成果"] } });
  }
  // INFO:限制条件只记录
  if (f.restrictions?.age?.raw || f.restrictions?.gender) {
    push({ key: "info_restrictions", label: `限制条件(仅记录):${[f.restrictions.age?.raw, f.restrictions.gender].filter(Boolean).join(" / ")}`, tier: "INFO", method: "none", source: "restrictions", weight: 0, compliance: "年龄/性别不参与评估,请核对是否符合当地反歧视法规" });
  }

  return {
    version: 1,
    schemaVersion: EVAL_SCHEMA_VERSION,
    templateId: tpl,
    requirements: reqs,
    tierWeights: defaultWeights || { MUST: 25, CORE: 45, PREFERRED: 15, STABILITY: 15 },
    bonusCap: 8,
    thresholds: { A: 85, B: 70, C: 55 },
    confidenceGate: 0.5,
    fixedQuestions: ["stability", "sufficiency", "inflation"],
    source: "draft",
  };
}

// 保存前校验(routes/jobs.js 用):返回 { ok, errors[] , warnings[] }
export function validateEvaluationModel(model) {
  const errors = [];
  const warnings = [];
  if (!model || typeof model !== "object") return { ok: false, errors: ["evaluationModel 必须是对象"], warnings };
  if (!Array.isArray(model.requirements)) errors.push("requirements 必须是数组");
  const keys = new Set();
  for (const [i, r] of (model.requirements || []).entries()) {
    const at = `requirements[${i}]`;
    if (!r || typeof r !== "object") { errors.push(`${at} 非对象`); continue; }
    if (!r.key || typeof r.key !== "string" || r.key.length > 60) errors.push(`${at}.key 非法`);
    else if (keys.has(r.key)) errors.push(`${at}.key 重复:${r.key}`); else keys.add(r.key);
    if (!r.label || typeof r.label !== "string" || r.label.length > 120) errors.push(`${at}.label 非法`);
    if (!TIERS.includes(r.tier)) errors.push(`${at}.tier 非法`);
    if (!METHODS.includes(r.method)) errors.push(`${at}.method 非法`);
    if (r.tier === "INFO" && r.method !== "none") errors.push(`${at} INFO 层不得评估`);
    if (r.weight != null && (typeof r.weight !== "number" || r.weight < 0 || r.weight > 100)) errors.push(`${at}.weight 须 0-100`);
    if (r.bonus != null && (typeof r.bonus !== "number" || r.bonus < 0 || r.bonus > 20)) errors.push(`${at}.bonus 须 0-20`);
    if (r.unknownPolicy != null && !UNKNOWN_POLICIES.includes(r.unknownPolicy)) errors.push(`${at}.unknownPolicy 非法`);
    if (["code", "code_then_jev"].includes(r.method)) {
      if (!r.code || typeof r.code.field !== "string" || typeof r.code.op !== "string") errors.push(`${at}.code 缺 field/op`);
    }
    if (["jev_noul", "jev_score", "code_then_jev"].includes(r.method)) {
      const q = r.jev;
      if (!q || !["noul", "score"].includes(q.type)) errors.push(`${at}.jev.type 须为 noul|score`);
      else {
        if (typeof q.instructions !== "string" || q.instructions.length < 4 || q.instructions.length > 600) errors.push(`${at}.jev.instructions 长度须 4-600`);
        if (q.type === "score" && (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 10)) errors.push(`${at}.jev.criteria 须 2-10 级`);
        if (q.type === "score" && Array.isArray(q.criteria) && q.criteria.some((c) => /^(一般|良好|优秀|较好|很好|差)$/.test(String(c).trim()))) warnings.push(`${at} 等级描述过于抽象,请写具体情境`);
        if (/且|并且|同时/.test(q.instructions || "")) warnings.push(`${at} 题目疑似包含多个判断,建议拆分`);
      }
    }
    if (/年龄|性别|婚|育|民族/.test(r.label || "") && r.tier !== "INFO") warnings.push(`${at} 涉及年龄/性别等,建议改为 INFO(仅记录)`);
  }
  for (const k of ["MUST", "CORE", "PREFERRED", "STABILITY"]) {
    const w = model.tierWeights?.[k];
    if (w != null && (typeof w !== "number" || w < 0 || w > 100)) errors.push(`tierWeights.${k} 须 0-100`);
  }
  const th = model.thresholds || {};
  if (th.A != null && th.B != null && th.C != null && !(th.A > th.B && th.B > th.C)) errors.push("thresholds 须满足 A > B > C");
  return { ok: errors.length === 0, errors, warnings };
}
