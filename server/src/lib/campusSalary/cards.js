import { CATEGORY_LABELS, FIELD_LABELS, ROLE_LABELS, TIER_LABELS } from "./policy.js";

const text = (v) => String(v ?? "待补充").replace(/[\\`*_\[\]<>]/g, "\\$&");
const md = (content) => ({ tag: "markdown", content });
export function formatSalary(value) {
  if (!value || value.status === "pending") return "待补充，暂不确定金额";
  if (value.status === "negotiated") return "一人一议";
  return value.min === value.max ? `${value.min}元/月` : `${value.min}—${value.max}元/月（政策区间）`;
}
const button = (label, value) => ({ tag: "button", type: "primary", text: { tag: "plain_text", content: label }, behaviors: [{ type: "callback", value }] });

export function buildSalaryCard(evaluation) {
  const row = evaluation.submission;
  const r = evaluation.result;
  if (!r) return { schema: "2.0", body: { elements: [md("**校招定薪｜待补充**\n简历处理未完成或识别失败，请在定薪记录页重试或补充资料。")] } };
  const education = r.facts.education || [];
  const facts = evaluation.input.facts || {};
  const info = [
    `**一、定薪相关信息｜${text(r.facts.name || "候选人")}**`,
    ...education.map((e) => `${text(e.degree)} · ${text(e.school)} · ${text(e.major)} · ${text(e.graduationYear)}年毕业${e.rankingRaw ? `；排名原文：${text(e.rankingRaw)}` : ""}`),
    `院校薪资档：${text(TIER_LABELS[r.facts.salaryTier])}；专业类别：${text(CATEGORY_LABELS[r.facts.category])}`,
    `合同签署地：${text(r.facts.context.contractCity)}；录用岗位/组织：${text(ROLE_LABELS[r.facts.context.roleType])}（来源：${text(r.contextSource || "任务上下文")}）`,
    evaluation.reason ? `本次信息来源/更正：${text(evaluation.reason)}` : "",
    r.resumeVersion?.supersedes ? `已采用最新简历，替代${r.resumeVersion.supersedes}份历史上传；旧消息中的结果以本条为准。` : "",
  ].filter(Boolean);
  const current = ["**二、按当前信息的定薪建议**", `政策月薪：**${formatSalary(r.salary)}**`,
    `专项奖金：${r.bonus.status === "ineligible" ? "一般路径不适用" : "当前待确认，按下列条件情景补材料"}。${text(r.bonus.reason || "")}`,
    ...r.rules.map((rule) => `依据P${rule.page}：${text(rule.basis)}`),
    ...r.restrictions.map((v) => `适用限制：${text(v)}`),
    r.benefits.internshipMonthly ? `实习参考${r.benefits.internshipMonthly}元/月；安家费${r.benefits.settlingAllowance}元/人（入职当月兑现、发放日须在岗）。` : "",
  ].filter(Boolean);
  const scenarios = r.scenarios.map((s, i) => [
    `**情景${i + 1}：${text(s.label)}**`,
    s.kind === "salary" ? `对应月薪：${formatSalary(s.salary)}` : `专项奖金月度标准：${s.monthlyStandard != null ? `${s.monthlyStandard}元` : `${s.bonusRange[0]}—${s.bonusRange[1]}元（档位待确认）`}；固定月薪不因此改变。`,
    `条件：${text(s.condition)}（P${s.page}）`, ...(s.resumeHint ? [`简历对照：${text(s.resumeHint)}`] : []), `需要：${s.materials.map(text).join("；")}`,
  ].join("\n"));
  const refs = new Set(education.flatMap((e) => e.evidenceRefs || []));
  const evidence = (facts.evidence || []).filter((p) => refs.has(p.id)).slice(0, 6).map((p) => `${p.id}：${text(p.text.slice(0, 160))}`);
  const elements = [md(info.join("\n")), md(current.join("\n")), md("**三、满足条件后的测算情景**\n情景是附条件参考，未核实材料不视为已经满足；奖金不并入固定月薪。")];
  elements.push(...scenarios.map(md));
  elements.push(md(`**四、待确认与补充资料**\n${r.missingFields.map((m) => `• ${text(m.reason)}\n  所需：${m.materials.map(text).join("；")}`).join("\n") || "当前基础月薪所需信息已齐全；区间内选点须另有明确政策。"}\n\n奖金兑现条件：${text(r.bonus.conditions)}`));
  if (evidence.length) elements.push(md(`**简历原文依据（节选）**\n${evidence.join("\n")}`));
  elements.push(md(`政策${text(r.policyVersion)} · R${evaluation.revision} · 记录${text(row.id)}\n完整证据和历史请在MESA「校招定薪」查看。`));
  elements.push(button("补充或纠正定薪信息", { a: "salary_edit", sid: row.id, revision: evaluation.revision }));
  return { schema: "2.0", body: { elements } };
}

export function buildSalaryEditCard(row) {
  const input = (name, label, hint) => ({ tag: "input", name, label: { tag: "plain_text", content: label }, placeholder: { tag: "plain_text", content: hint } });
  return { type: "raw", data: { schema: "2.0", body: { elements: [md("**补充/纠正信息**\n仅填写需更正的项，空白保留原值；需要证明的条件仍会单列，不凭填表承诺奖金。"), { tag: "form", name: "salary_facts", elements: [
    input("contractCity", "合同签署城市", "填写实际拟签署城市，如芜湖、上海"),
    input("cityType", "城市类别", "填写：一线 或 非一线"),
    input("majorCategory", "经确认的专业类别", Object.values(CATEGORY_LABELS).join(" / ")),
    input("doctorField", "博士研究方向类别", Object.values(FIELD_LABELS).join(" / ")),
    input("roleType", "录用岗位/组织类别", Object.values(ROLE_LABELS).join(" / ")),
    input("reason", "补充依据（必填）", "说明信息来源或证明材料，不能填写未经确认的推测"),
    { tag: "button", name: "save_salary", form_action_type: "submit", text: { tag: "plain_text", content: "保存并重新测算" }, type: "primary", behaviors: [{ type: "callback", value: { a: "salary_save", sid: row.id, revision: row.revision } }] },
  ] }] } } };
}
