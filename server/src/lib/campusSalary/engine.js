import { POLICY_CONFIGURED, BONUS_VALUES, BENEFITS, MONTHLY, DOCTOR, CATEGORIES, CATEGORY_LABELS, FIELD_LABELS, POLICY_VERSION, POLICY_HASH, TIER_LABELS, SPECIAL_RULES, SPECIAL_BONUS_SCHOOLS, BUILTIN_SCHOOLS, MAJOR_OVERRIDES, classifyMajor, salaryRange } from "./policy.js";
import { scopeEducationEvidence } from "./facts.js";

const degreeOrder = { 本科: 1, 硕士: 2, 博士: 3 };
const missing = (field, reason, materials) => ({ field, reason, materials });
const pendingSalary = () => ({ status: "pending", min: null, max: null });
const rule = (id, page, basis) => ({ id, page, basis });
const qsTier = (rank) => rank <= 100 ? "C9" : rank <= 300 ? "985" : rank <= 500 ? "211" : rank <= 1500 ? "ordinary" : null;
const salaryPackage = (salary, factor) => ({ salaryFactor: factor, status: factor && ["fixed", "range"].includes(salary.status) ? salary.status : salary.status === "negotiated" ? "negotiated" : "pending", annualMin: factor && salary.min != null ? Math.round(salary.min * factor * 100) / 100 : null, annualMax: factor && salary.max != null ? Math.round(salary.max * factor * 100) / 100 : null });

function cityType(context) {
  const city = context.contractCity?.trim().replace(/市$/, "");
  if (!city) return null;
  if (["北京", "上海", "广州", "深圳"].includes(city)) return "first";
  return context.cityType === "nonfirst" ? "nonfirst" : null;
}

export function evaluateSalary(facts = {}, context = {}, { schools = [] } = {}) {
  const confirmed = facts.confirmed || {};
  const education = confirmed.education || scopeEducationEvidence(facts.education || [], facts.evidence);
  const sorted = education.filter((e) => degreeOrder[e.degree]).sort((a, b) => degreeOrder[b.degree] - degreeOrder[a.degree]);
  const edu = sorted[0];
  const definitions = new Map([...BUILTIN_SCHOOLS, ...schools].map((s) => [s.name, s]));
  const getSchool = (e) => definitions.get(e?.school);
  const factor = Number.isFinite(context.salaryFactor) && context.salaryFactor > 0 && context.salaryFactor <= 1000 ? context.salaryFactor : null;
  const result = {
    policyVersion: POLICY_VERSION, policyHash: POLICY_HASH, salary: pendingSalary(),
    compensation: salaryPackage(pendingSalary(), factor),
    bonus: { status: "pending", monthlyStandard: null, conditions: "入职后前三年（不含实习），按当年在职月数年度兑现；年终考核胜任及以上，发放日须在职。" },
    missingFields: [], rules: [], scenarios: [], restrictions: [], benefits: {}, facts: { name: facts.name || null, education, context },
  };
  const need = (field, reason, materials) => result.missingFields.push(missing(field, reason, materials));
  if (!POLICY_CONFIGURED) { need("policy", "内部定薪政策尚未配置，不能生成金额", ["管理员加载当前有效政策"]); return result; }
  if (facts.conflicts?.length) { need("resume", facts.conflicts.join("；"), ["拆分后的单人简历"]); return result; }
  if (education.some((e) => !degreeOrder[e.degree] && (e.school || e.major))) {
    need("education", "部分教育经历学历未明确，不能推测最高学历", ["完整教育链及学位/在读证明"]); return result;
  }
  if (!edu) { need("education", "最高学历未识别或不在政策覆盖的本硕博范围", ["完整教育经历、学位/在读证明"]); return result; }
  if (sorted.filter((e) => e.degree === edu.degree).some((e) => e.school !== edu.school || e.major !== edu.major)) {
    need("education", "存在多个最高学历，请确认用于定薪的教育经历", ["最高学历及学位证明"]); return result;
  }
  const school = getSchool(edu);
  const city = cityType(context);
  const category = Object.hasOwn(confirmed, "majorCategory") ? confirmed.majorCategory : classifyMajor(edu.major, context.roleType);
  const field = confirmed.doctorField || null;
  let tier = school?.tier || null;
  let special = null;
  let blocked = false;
  if (context.cityType === "nonfirst" && ["北京", "上海", "广州", "深圳"].includes(context.contractCity?.trim().replace(/市$/, ""))) {
    need("contractCity", "合同城市与城市类别互相冲突", ["确认唯一的合同签署地及类别"]); blocked = true;
  }
  const overseas = school?.overseas;
  result.facts.qualifyingEducation = edu;
  result.facts.school = school ? { ...school } : null;
  result.facts.category = category;
  result.facts.cityType = city;
  if (!edu.graduationYear) need("graduationYear", "毕业年份未明确", ["毕业/预计毕业证明"]);
  else if (!(overseas ? [2026, 2027].includes(edu.graduationYear) : edu.graduationYear === 2027)) need("graduationYear", "毕业年份不在本次政策明确范围，需确认适用届别", ["适用届别及政策说明"]);
  if (overseas && edu.graduationYear === 2026) need("policyYear", "海外2026年毕业适用当年度薪资，当前仅有2027版金额，须补当年度执行口径", ["适用年度薪资政策"]);
  if (!city) need("contractCity", "需确认劳动合同签署城市及城市类别，不能使用现居地替代", ["拟录用劳动合同签署地"]);
  if (!factor) need("salaryFactor", "薪数尚未确认；不影响已可确定的政策月薪，完整定薪结果待补薪数", ["HR确认的薪数或Offer薪酬口径"]);

  const candidates = edu.degree === "博士" ? [] : SPECIAL_RULES.filter((r) => r.schools.includes(edu.school) && r.majors.includes(edu.major));
  if (candidates.length && !context.roleType) {
    need("roleType", "该院校专业存在特定规则，需确认录用组织/岗位", ["录用岗位和部门信息"]); blocked = true;
  }
  special = candidates.find((r) => r.role === context.roleType);
  if (special) {
    result.rules.push(rule(special.id, special.page, `${edu.school}、${edu.major}、指定录用组织/岗位联合适用（P4限制）`));
    tier = special.tier || tier;
    if (special.ambiguous) { need("policy", special.ambiguous, ["HR确认的正式政策执行口径"]); blocked = true; }
    if (city === "first") { need("policy", "特定院校规则与一线表的衔接口径未明确", ["一线城市特定院校执行口径"]); blocked = true; }
    if (special.overseas && (!confirmed.overseasCertification || edu.graduationYear !== 2027)) {
      need("overseasCertification", "海外特定院校要求2027年毕业且认证专业名称与适用范围一致", ["留服认证（含专业名称）", "2027年毕业证明"]); blocked = true;
    }
  } else if (!school) {
    need("school", "学校不在已核对字典，不能依据模型记忆分档", ["院校层次依据，海外还需QS榜单版本与排名"]); blocked = true;
  }
  if (overseas && !special) {
    if (edu.degree === "硕士") {
      const bachelor = education.find((e) => e.degree === "本科");
      const bachelorSchool = getSchool(bachelor);
      if (!school.qsRank || !school.qsVersion || !bachelorSchool || bachelorSchool.overseas !== false) {
        need("overseasMapping", "海外硕士需本科院校层次及已核对的QS榜单", ["本科学位/院校证明", "硕士QS排名及榜单版本"]); blocked = true;
      } else {
        const q = qsTier(school.qsRank);
        const b = bachelorSchool.tier === "C9" ? "985" : bachelorSchool.tier;
        const matrix = { "985": { C9: "C9", "985": "985", "211": "211" }, "211": { C9: "cap", "985": "985", "211": "211" }, first: { C9: "211", "985": "first", "211": "first" }, second: { C9: "first", "985": "second", "211": "second" } };
        tier = matrix[b]?.[q];
        result.rules.push(rule("overseas-master", 2, `本科${TIER_LABELS[b] || "未知"}＋海外硕士QS${school.qsRank}（${school.qsVersion}），映射${TIER_LABELS[tier] || "待确认"}`));
        if (tier === "cap") { need("policy", "仅明确上限C9起薪，未明确下限及执行方式", ["海外硕士上限规则执行口径"]); blocked = true; }
        if (!tier) { need("overseasMapping", "该海外本硕组合未被政策覆盖", ["适用政策说明"]); blocked = true; }
        if (!confirmed.jobRelevance) { need("jobRelevance", "海外毕业生需核对岗位相关性", ["拟录用岗位要求及专业相关性确认"]); blocked = true; }
        if (b === "second") result.restrictions.push("本科二本路径：原则上不招，需确认适用例外");
      }
    } else if (edu.degree === "博士") {
      if (!school.qsRank || !school.qsVersion || school.qsRank === 500 || school.qsRank > 1500) {
        need("school", "海外博士QS资料缺失、端点冲突或超出政策范围", ["QS榜单版本及博士政策执行口径"]); blocked = true;
      } else tier = qsTier(school.qsRank);
    } else { need("overseasMapping", "海外本科单独定薪方式未明确", ["海外本科适用政策"]); blocked = true; }
  }
  if (!tier && !blocked) { need("school", "院校分档未明确", ["院校层次依据"]); blocked = true; }
  if (edu.degree === "博士" && ["first", "second"].includes(tier)) tier = "ordinary";
  if (tier === "second") result.restrictions.push("二本：原则上不招；显示政策参考，不自动判断淘汰");
  result.facts.salaryTier = tier;
  const ready = !blocked && edu.graduationYear === 2027;

  if (edu.degree === "博士") {
    if (!field) need("doctorField", "需确认博士专业及研究课题所属领域", ["研究课题/论文摘要、个人项目贡献证明"]);
    if (ready && city && field && DOCTOR[tier]) {
      result.salary = salaryRange(DOCTOR[tier][["regular", "key", "scarce"].indexOf(field)]);
      result.rules.push(rule(`doctor-${tier}-${field}`, 1, `博士、${TIER_LABELS[tier]}、${FIELD_LABELS[field]}；一线同标准（P5）`));
    }
    if (ready && DOCTOR[tier]) for (const [index, key] of ["regular", "key", "scarce"].entries()) {
      if (!field || key === field) result.scenarios.push({ kind: "salary", label: `若研究方向经确认为${FIELD_LABELS[key]}`, condition: `专业与研究课题属于${FIELD_LABELS[key]}，且适用届别和合同地已确认`, salary: salaryRange(DOCTOR[tier][index]), page: 1, materials: ["研究课题/论文摘要", "本人研究或项目贡献说明", ...(!city ? ["合同签署地"] : [])] });
    }
  } else {
    const categoryValue = special?.category || category;
    const standardReference = !categoryValue && Boolean(edu.major) && !special;
    const lookupCategory = categoryValue || (standardReference ? "standard" : null);
    result.facts.category = categoryValue;
    if (categoryValue) {
      const override = !Object.hasOwn(confirmed, "majorCategory") && !special && MAJOR_OVERRIDES[edu.major];
      result.rules.push(rule("major-category", override ? null : 1, `采用最高学历${edu.degree}对应专业“${edu.major}”，${override ? override.basis : Object.hasOwn(confirmed, "majorCategory") ? "按人工确认" : "按明确专业名称及政策范围"}归入${CATEGORY_LABELS[categoryValue]}`));
    }
    if (!categoryValue) need("majorCategory", "需确认最高学历专业是否属于政策特殊专业；当前仅按院校标准提供基础建议，特殊档须确认后适用", ["最高学历专业及学科归属证明", "HR确认的特殊专业类别与岗位适用依据"]);
    if (ready && city && lookupCategory && MONTHLY[city][edu.degree]?.[tier]) {
      result.salary = special?.negotiated ? salaryRange(null) : salaryRange(MONTHLY[city][edu.degree][tier][CATEGORIES.indexOf(lookupCategory)]);
      if (standardReference) result.salaryBasis = "school_standard_reference";
      result.rules.push(rule(`monthly-${city}-${edu.degree}-${tier}-${lookupCategory}`, city === "first" ? 5 : 1, `${city === "first" ? "一线" : "非一线"}、${edu.degree}、${TIER_LABELS[tier]}、${CATEGORY_LABELS[lookupCategory]}${standardReference ? "基础建议；特殊专业资格未确认，不视为已满足升档条件" : ""}`));
    }
    if (ready && !special) {
      for (const c of city ? [city] : ["nonfirst", "first"]) for (const cat of category ? [category] : CATEGORIES) {
        if (city && (category || (standardReference && cat === "standard"))) continue;
        const amount = MONTHLY[c][edu.degree]?.[tier]?.[CATEGORIES.indexOf(cat)];
        if (amount != null) result.scenarios.push({ kind: "salary", majorCategory: cat, label: `若合同签署地为${c === "first" ? "一线" : "非一线"}，专业归入${CATEGORY_LABELS[cat]}`, condition: "须经HR确认该专业类别及该分支全部适用条件；并非当前已确定报价", salary: salaryRange(amount), page: c === "first" ? 5 : 1, materials: [...(!city ? ["合同签署地"] : []), ...(!category ? ["专业/学科归属证明及岗位适用说明"] : [])] });
      }
    }
  }

  if (special?.bonusMax) {
    result.bonus.reason = "特定院校奖金仅明确范围，选档口径待确认";
    result.scenarios.push({ kind: "bonus", label: "特定院校专项奖金", condition: "同时符合学校、专业、录用组织及对应执行口径", bonusRange: [0, special.bonusMax], page: special.page, materials: ["专业及学位证明", "录用组织/岗位确认", "奖金具体选档政策"] });
    need("bonusPolicy", result.bonus.reason, ["奖金具体选档执行口径"]);
  } else if (special) {
    result.bonus.reason = special.overseas ? "海外C9设计类特定表奖金栏为—，不自动生成奖金" : "该特定院校行未独立列明奖金标准，待确认";
    if (special.overseas) result.bonus.status = "ineligible";
    else need("bonusPolicy", result.bonus.reason, ["特定院校奖金执行口径"]);
  } else if (overseas) result.bonus = { ...result.bonus, status: "ineligible", reason: "P2：一般海外院校路径不享受专项奖金" };
  else if (category === "standard") result.bonus = { ...result.bonus, status: "ineligible", reason: "P2一般专项奖金仅适用于符合条件的特殊专业" };
  else if (["C9", "985", "211"].includes(school?.tier) && edu.degree !== "博士") {
    const top = ["C9", "985"].includes(school.tier);
    const common = category ? [] : ["特殊专业归属证明"];
    const add = (amount, label, condition, materials) => result.scenarios.push({ kind: "bonus", label, condition: `适用2027届政策且院校、专业资格符合；${condition}`, monthlyStandard: amount, unchangedBaseSalary: result.salary, page: 2, materials: [...common, ...materials], payoutConditions: result.bonus.conditions });
    if (top) {
      add(BONUS_VALUES.base, "若满足学习达标及相关经验条件", "特殊专业；学习达标；具有一定竞赛、科研、社团工作经验（具体门槛待明确）", ["成绩单/学习达标证明", "竞赛、科研或社团经历证明", "经验门槛执行口径"]);
      add(BONUS_VALUES.middle, "若近一年专业排名前50%并有相关经验", "至少本专业院/系范围，近一年；具有一定竞赛、科研、社团工作经验", ["近一年本专业院/系排名证明", "相关经历证明", "经验门槛执行口径"]);
    }
    add(top ? BONUS_VALUES.high : BONUS_VALUES.regular, "若近一年专业排名前30%", "特殊专业；排名至少本专业院/系范围、近一年；端点及档位冲突待确认", ["近一年本专业院/系排名证明", "奖金档位及排名端点执行口径"]);
    add(top ? BONUS_VALUES.high : BONUS_VALUES.regular, "若排名前50%且有省级及以上竞赛/突出科研成果", "排名范围及时效符合政策，且满足政策所列奖项或突出科研条件；不能把普通参赛当获奖", ["近一年专业排名证明", "省级及以上获奖证书或论文/专利及本人贡献材料", "突出成果认定及奖金档位执行口径"]);
    result.bonus.reason = "当前仅列政策条件情景；排名、证明或奖金选档口径未齐全，不计入固定月薪";
    need("bonusEvidence", result.bonus.reason, ["排名证明及对应成果材料", "奖金执行口径"]);
    if (SPECIAL_BONUS_SCHOOLS.includes(edu.school)) need("bonusPolicy", "该校是否完整适用985奖金档需明确", ["特殊院校奖金执行口径"]);
  } else {
    result.bonus.reason = "院校、特殊专业或奖金适用范围尚不能确定";
    need("bonusEligibility", result.bonus.reason, ["院校/专业资格及奖金适用口径"]);
  }
  if (city) result.benefits = { internshipMonthly: (BENEFITS.internship || {})[edu.degree]?.[city === "first" ? 1 : 0], settlingAllowance: BENEFITS.settling, condition: "实习标准与正式月薪分开；安家费入职当月兑现且发放日在岗", page: city === "first" ? 5 : 4 };
  result.compensation = salaryPackage(result.salary, factor);
  for (const scenario of result.scenarios) if (scenario.kind === "salary") scenario.compensation = salaryPackage(scenario.salary, factor);
  if (factor) result.rules.push(rule("salary-factor", null, `薪数${factor}来自HR确认的录用上下文，按政策月薪×薪数测算；专项奖金另列`));
  result.scenarios = result.scenarios.slice(0, 12);
  const ranking = /(?:前\s*)?(\d+(?:\.\d+)?)\s*[%％]/.exec(edu.rankingRaw || "");
  if (ranking && Number(ranking[1]) > 0 && Number(ranking[1]) <= 100) for (const scenario of result.scenarios) {
    if (scenario.kind === "bonus" && scenario.label.includes("排名前")) {
      const threshold = scenario.label.includes("30%") ? 30 : 50;
      scenario.resumeHint = Number(ranking[1]) < threshold ? "与简历自述排名相符；仍须核验统计范围、近一年时效及其他条件" : "简历自述排名尚未明确满足此分支，需另有材料支持";
    }
  }
  return result;
}
