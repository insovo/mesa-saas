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
  const schoolBasis = education.map((e) => `**${text(e.degree)}**：${text(e.school)}（**${text(TIER_LABELS[schools.get(e.school)?.tier] || "层次待核对")}**）`).join("；");
  const bonus = r.scenarios.filter((s) => s.kind === "bonus").map((s) => `${text(s.label).replace(/前\d+(?:\.\d+)?%/g, "**$&**")}：${s.monthlyStandard != null ? `可另按**${s.monthlyStandard}元/月**标准核验专项奖金` : `奖金**${s.bonusRange[0]}—${s.bonusRange[1]}元**，选档待确认`}（P${s.page}，需对应证明，按年度条件兑现）`);
  const conditionalSalary = r.scenarios.filter((s) => s.kind === "salary").map((s) => s.majorCategory && s.majorCategory !== "standard" && r.facts.cityType && !r.facts.category ? `需确认专业是否为特殊专业（**${text(CATEGORY_LABELS[s.majorCategory])}类**）；若经HR确认适用：**${formatCompensation(s.salary, s.compensation)}**（P${s.page}，需专业归属及岗位适用依据）` : `${text(s.label)}：**${formatCompensation(s.salary, s.compensation)}**（须确认对应条件）`);
  const basis = [
    `学校：${schoolBasis || "最高学历信息待补充"}。${edu ? `本次采用**${text(edu.degree)}**院校薪资档**${text(TIER_LABELS[r.facts.salaryTier])}**。` : "用于定薪的最高学历待确认。"}`,
    ...r.rules.map((rule) => `${rule.page ? `P${rule.page}` : "执行口径"}：${r.facts.category ? text(rule.basis).replaceAll(text(CATEGORY_LABELS[r.facts.category]), `**${text(CATEGORY_LABELS[r.facts.category])}**`) : text(rule.basis)}`),
    edu ? `最高学历成绩：**${text(edu.gradeRaw?.replace(/^(?:成绩|GPA|绩点)\s*[:：]?\s*/i, "") || "未提供")}**；排名：**${text(edu.rankingRaw || "未提及")}**。不使用历史学历排名替代，成绩分数不换算为排名。` : "",
    ...conditionalSalary,
    ...bonus,
    ...(bonus.length ? ["奖金材料：最高学历近一年本专业院/系排名证明；成果分支另需对应获奖、论文/专利等证明。完整条件见详情页。"] : [`专项奖金：${text(r.bonus.reason || "待确认")}`]),
    ...r.missingFields.filter((m) => m.field !== "bonusEvidence").map((m) => `待补充：${text(m.reason)}；需要${m.materials.map(text).join("、")}`),
    ...r.restrictions.map((v) => `适用限制：${text(v)}`),
  ].filter(Boolean);
  const current = [
    `**一、${name}定薪建议**`,
    r.benefits.settlingAllowance != null ? `安家费**${r.benefits.settlingAllowance}元/人**（入职当月兑现、发放日须在岗）。` : "",
    `定薪结果：**${formatCompensation(r.salary, r.compensation)}**${r.salaryBasis === "school_standard_reference" ? "（院校标准基础建议，特殊专业待确认）" : ""}`,
    "", "**定薪依据**", ...basis,
    r.resumeVersion?.supersedes ? "已采用最新上传简历，历史消息中的结果以本条为准。" : "",
  ].filter((v) => v !== "");
  const info = [
    `**二、定薪相关信息｜${name}**`,
    ...education.map((e) => `${text(e.degree)} · ${text(e.school)} · ${text(e.major)} · ${text(e.graduationYear)}年毕业${e.rankingRaw ? `；排名原文：${text(e.rankingRaw)}` : ""}${isQualifying(e) ? "（本次定薪采用）" : edu ? "（历史教育经历，不参与本次专业及成绩判断）" : "（用于定薪的最高学历待确认）"}`),
    `院校薪资档：**${text(TIER_LABELS[r.facts.salaryTier])}**；专业类别：**${text(CATEGORY_LABELS[r.facts.category])}**`,
    `Base地：**${text(r.facts.context.contractCity)}**（合同签署地）`,
  ];
  const origin = (process.env.WEB_ORIGIN || "https://insovo.top").replace(/\/$/, "");
  return { schema: "2.0", body: { elements: [md(current.join("\n")), md(info.join("\n")), md(`[点击打开定薪汇总页面](${origin}/campus-salary)\n[查看本人的完整定薪详情](${origin}/campus-salary?id=${encodeURIComponent(row.id)})\n政策${text(r.policyVersion)} · R${evaluation.revision}`)] } };
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
