import { BUILTIN_SCHOOLS, CATEGORY_LABELS, FIELD_LABELS, ROLE_LABELS, TIER_LABELS } from "./policy.js";

const text = (v) => String(v ?? "待补充").replace(/[\\`*_\[\]<>]/g, "\\$&");
const md = (content) => ({ tag: "markdown", content });
export function formatSalary(value) {
  if (!value || value.status === "pending") return "待补充，暂不确定金额";
  if (value.status === "negotiated") return "一人一议";
  return value.min === value.max ? `${value.min}元/月` : `${value.min}—${value.max}元/月（政策区间）`;
}
export function formatCompensation(salary, compensation) {
  if (!salary || ["pending", "negotiated"].includes(salary.status)) return formatSalary(salary);
  const amount = salary.min === salary.max ? salary.min : `${salary.min}—${salary.max}`;
  return compensation?.salaryFactor ? `${amount} × ${compensation.salaryFactor}薪${salary.status === "range" ? "（政策区间）" : ""}` : `${formatSalary(salary)}；薪数待确认`;
}
export function buildSalaryCard(evaluation) {
  const row = evaluation.submission;
  const r = evaluation.result;
  if (!r) return { schema: "2.0", body: { elements: [md("**校招定薪｜待补充**\n简历处理未完成或识别失败，请在定薪记录页重试或补充资料。")] } };
  const education = r.facts.education || [];
  const edu = r.facts.qualifyingEducation;
  const isQualifying = (e) => edu && e.degree === edu.degree && e.school === edu.school && e.major === edu.major && e.graduationYear === edu.graduationYear;
  const name = text(r.facts.name || "候选人");
  const schools = new Map([...BUILTIN_SCHOOLS, ...(evaluation.input.schools || [])].map((s) => [s.name, s]));
  const degree = edu?.degree;
  const tier = TIER_LABELS[r.facts.salaryTier] || "层次待核对";
  const school = r.facts.school || schools.get(edu?.school);
  const schoolLevel = TIER_LABELS[school?.tier] || (school?.qsRank && school?.qsVersion ? `QS${school.qsRank}（${school.qsVersion}）` : "层次待核对");
  const mappedTier = school?.tier !== r.facts.salaryTier;
  const overseasCombination = r.rules.some((rule) => rule.id === "overseas-master");
  const category = r.facts.category;
  const categoryText = degree === "博士" ? "按专业及研究课题领域定薪" : category === "standard" ? "普通专业（院校标准）" : category ? `特殊专业（${CATEGORY_LABELS[category]}）` : "是否特殊专业待确认";
  const grade = edu?.gradeRaw?.replace(/^(?:成绩|GPA|绩点)\s*[:：]?\s*/i, "") || "未提供";
  const ranking = edu?.rankingRaw;
  const city = r.facts.cityType === "first" ? "一线" : r.facts.cityType === "nonfirst" ? "非一线" : "合同地待确认";
  const summary = degree === "博士" ? r.rules.find((rule) => rule.id.startsWith("doctor-"))?.basis || `${city}、博士、${tier}、研究领域待确认` : [city, degree || "学历待确认", `${tier}${mappedTier ? "薪档（政策映射）" : ""}`, category ? categoryText : "院校标准基础建议，特殊专业待确认"].join("、");
  const conditional = r.scenarios.filter((s) => s.kind === "salary").map((s) => s.majorCategory && s.majorCategory !== "standard" && r.facts.cityType && !category ? `需确认是否为特殊专业（**${text(CATEGORY_LABELS[s.majorCategory])}类**）；若确认适用：**${formatCompensation(s.salary, s.compensation)}**，需专业归属和岗位适用证明。` : `${text(s.label)}：**${formatCompensation(s.salary, s.compensation)}**（待确认条件）`);
  const origin = (process.env.WEB_ORIGIN || "https://insovo.top").replace(/\/$/, "");
  const content = [
    `**${name}定薪建议**`,
    `定薪结果：**${formatCompensation(r.salary, r.compensation)}**${r.salaryBasis === "school_standard_reference" ? "（院校标准基础建议）" : ""}`,
    "", "**定薪依据**",
    `学历：**${text(degree)}**`,
    `学校：**${text(edu?.school)}** · **${text(schoolLevel)}**${mappedTier && r.facts.salaryTier ? `；政策适用**${text(tier)}薪档**` : ""}`,
    `专业：**${text(edu?.major)}**${r.facts.majorClassification?.academicGroup ? ` · **${text(r.facts.majorClassification.academicGroup)}**` : ""} · **${text(categoryText)}**`,
    ...conditional,
    ...(!category && r.facts.majorClassification?.materials?.length ? [`专业待确认：${text(r.facts.majorClassification.basis)}；需${r.facts.majorClassification.materials.map(text).join("、")}。`] : []),
    "", "**其它**",
    `成绩/排名备注：${text(grade)}；${text(ranking || "排名未提及")}（简历自述，未核验，仅作备注，不作为定薪依据）。`,
    ...(r.bonus.status === "pending" ? ["专项奖金：待核验事实材料，仅列政策条件，当前不计入定薪。"] : []),
    ...education.filter((e) => edu && e.degree === "本科" && !isQualifying(e)).map((e) => `本科院校：**${text(e.school)}**${schools.get(e.school)?.tier ? ` · **${text(TIER_LABELS[schools.get(e.school).tier])}**` : ""}（${overseasCombination ? "仅用于政策要求的本硕组合映射，不参与专业及成绩判断" : "不参与定薪"}）`),
    `Base地：**${text(r.facts.context.contractCity)}**`,
    `**${text(summary)}**`,
    ...r.missingFields.filter((m) => !["bonusEvidence", "bonusEligibility", "majorCategory"].includes(m.field)).map((m) => `待补充：${text(m.reason)}；需${m.materials.map(text).join("、")}`),
    ...r.restrictions.map((v) => `适用限制：${text(v)}`),
    r.resumeVersion?.supersedes ? "已采用最新简历，历史消息结果以当前详情为准。" : "",
    "", `[点击打开定薪汇总页面](${origin}/campus-salary)`,
    `[查看本人的完整定薪详情](${origin}/campus-salary?id=${encodeURIComponent(row.id)})`,
  ];
  return { schema: "2.0", body: { elements: [md(content.join("\n").replace(/\n{3,}/g, "\n\n"))] } };

}

export function buildSalaryEditCard(row) {
  const input = (name, label, hint) => ({ tag: "input", name, label: { tag: "plain_text", content: label }, placeholder: { tag: "plain_text", content: hint } });
  return { type: "raw", data: { schema: "2.0", body: { elements: [md("**补充/纠正信息**\n仅填写需更正的项，空白保留原值；需要证明的条件仍会单列，不凭填表承诺奖金。"), { tag: "form", name: "salary_facts", elements: [
    input("contractCity", "合同签署城市", "填写实际拟签署城市，如芜湖、上海"),
    input("cityType", "城市类别", "填写：一线 或 非一线"),
    input("salaryFactor", "薪数", "填写HR已确认的薪数；未确认时保留空白"),
    input("majorCategory", "经确认的专业类别", Object.values(CATEGORY_LABELS).join(" / ")),
    input("doctorField", "博士研究方向类别", Object.values(FIELD_LABELS).join(" / ")),
    input("roleType", "录用岗位/组织类别", Object.values(ROLE_LABELS).join(" / ")),
    input("reason", "补充依据（必填）", "说明信息来源或证明材料，不能填写未经确认的推测"),
    { tag: "button", name: "save_salary", form_action_type: "submit", text: { tag: "plain_text", content: "保存并重新测算" }, type: "primary", behaviors: [{ type: "callback", value: { a: "salary_save", sid: row.id, revision: row.revision } }] },
  ] }] } } };
}
