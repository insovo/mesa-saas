import "./testPolicy.js";
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSalary } from "./engine.js";
import { extractSalaryFacts, semanticState } from "./facts.js";
import { suggestSalaryClassification } from "./semantic.js";
import { buildSalaryCard, formatCompensation } from "./cards.js";
import { POLICY_HASH, POLICY_VERSION } from "./policy.js";

const context = { contractCity: "芜湖", cityType: "nonfirst", roleType: "general" };
const facts = (changes = {}, confirmed = {}) => ({ name: "测试同学", education: [{ degree: "硕士", school: "武汉大学", major: "计算机科学与技术", graduationYear: 2027, ...changes }], confirmed });

test("特殊专业只认明确名称，含糊学科对应和AI研究方向不能自动升档", () => {
  for (const major of ["控制科学与工程", "自动化", "电子信息", "光学工程"]) {
    const r = evaluateSalary(facts({ school: "北京交通大学", major, researchDirection: "人工智能" }), context);
    assert.deepEqual(r.salary, { status: "fixed", min: 126, max: 126 });
    assert.equal(r.facts.category, "hot");
    assert.ok(!r.missingFields.some((m) => m.field === "majorCategory"));
    assert.match(r.rules.find((v) => v.id === "major-category").basis, /最高学历硕士/);
  }
  for (const major of ["控制工程", "控制理论与控制工程", "系统工程", "软件工程", "网络空间安全", "工业设计", "电子科学与技术"]) {
    const r = evaluateSalary(facts({ school: "北京交通大学", major, researchDirection: "人工智能" }), context);
    assert.equal(r.salary.min, 124); assert.equal(r.facts.category, null);
    assert.equal(r.salaryBasis, "school_standard_reference");
    assert.ok(r.missingFields.some((m) => m.field === "majorCategory"));
  }
  const override = evaluateSalary(facts({ school: "北京交通大学", major: "合成确认专业" }), context);
  assert.equal(override.salary.min, 124); assert.equal(override.bonus.status, "ineligible");
  assert.equal(override.rules.find((v) => v.id === "major-category").page, null);
  assert.match(override.rules.find((v) => v.id === "major-category").basis, /合成HR明确执行口径/);
});

test("定薪包按已确认薪数计算；缺薪数只缺完整包，不隐藏政策月薪", () => {
  const r = evaluateSalary(facts(), { ...context, salaryFactor: 12.5 });
  assert.deepEqual(r.compensation, { status: "fixed", salaryFactor: 12.5, annualMin: 1662.5, annualMax: 1662.5 });
  assert.equal(formatCompensation(r.salary, r.compensation), "133 × 12.5薪");
  for (const salaryFactor of [undefined, null, 0, -1, "12.5", Infinity]) {
    const pending = evaluateSalary(facts(), { ...context, salaryFactor });
    assert.equal(pending.salary.min, 133); assert.equal(pending.compensation.annualMin, null);
    assert.match(formatCompensation(pending.salary, pending.compensation), /薪数待确认/);
    assert.ok(pending.missingFields.some((m) => m.field === "salaryFactor"));
  }
  const range = evaluateSalary(facts({ school: "南京大学" }), { ...context, salaryFactor: 12.5 });
  assert.equal(range.compensation.status, "range");
  assert.deepEqual([range.compensation.annualMin, range.compensation.annualMax], [1737.5, 1812.5]);
  const unknown = evaluateSalary(facts({ major: "交叉领域" }), { ...context, salaryFactor: 12.5 });
  assert.equal(unknown.compensation.annualMin, 1587.5);
  assert.ok(unknown.scenarios.filter((s) => s.kind === "salary").every((s) => s.compensation.salaryFactor === 12.5));
});

test("学校、专业、成绩和排名取同一最高学历，历史排名不用于最高学历奖金", () => {
  const text = "北京交通大学 硕士 控制工程\n2024.09—2027.06\n成绩：83.5/100\n研究方向：人工智能\n武汉大学 本科 计算机科学与技术\n2020.09—2024.06\nGPA：3.7/4.0 TOP 10%";
  const input = extractSalaryFacts({ education: [
    { school: "武汉大学", degree: "本科", major: "计算机科学与技术", endDate: "2024", ranking: "TOP 10%" },
    { school: "北京交通大学", degree: "硕士", major: "控制工程", endDate: "2027", ranking: "TOP 10%", researchDirection: "人工智能" },
  ] }, text);
  const r = evaluateSalary({ ...input, confirmed: { majorCategory: "standard" } }, { ...context, salaryFactor: 12.5 });
  assert.equal(r.facts.salaryTier, "211"); assert.equal(r.facts.category, "standard");
  assert.equal(r.facts.qualifyingEducation.school, "北京交通大学");
  assert.equal(r.facts.qualifyingEducation.gradeRaw, "成绩：83.5/100");
  assert.equal(r.facts.qualifyingEducation.rankingRaw, null);
  assert.equal(input.education[0].rankingRaw, "TOP 10%");
  assert.ok(r.scenarios.every((s) => !s.resumeHint));
  assert.deepEqual(semanticState(input).education.map((e) => e.school), ["北京交通大学"]);
  const card = buildSalaryCard({ submission: { id: "test" }, input: { facts: input }, revision: 1, result: JSON.parse(JSON.stringify(r)) });
  assert.ok(card.body.elements[0].content.includes("83.5/100") && card.body.elements[0].content.includes("124 × 12.5薪"));
  assert.ok(!card.body.elements[0].content.includes("TOP 10%"));
  assert.match(card.body.elements[1].content, /控制工程.*本次定薪采用/);
  assert.match(card.body.elements[1].content, /TOP 10%.*历史教育经历/);
});

test("同校本硕分段取成绩，原有事实也可从保存的原文证据补齐", () => {
  const r = extractSalaryFacts({ education: [
    { school: "武汉大学", degree: "硕士", major: "控制工程", endDate: "2027", ranking: "TOP 10%" },
    { school: "武汉大学", degree: "本科", major: "计算机科学与技术", endDate: "2024", ranking: "TOP 10%" },
  ] }, "武汉大学 硕士 控制工程\n2024.09—2027.06\n成绩：83.5/100\n武汉大学 本科 计算机科学与技术\n2020.09—2024.06\nGPA：3.7/4.0 TOP 10%");
  assert.equal(r.education[0].rankingRaw, null); assert.equal(r.education[0].gradeRaw, "成绩：83.5/100");
  assert.equal(r.education[1].gradeRaw, "GPA：3.7/4.0");
  delete r.education[0].gradeRaw;
  assert.equal(evaluateSalary(r, context).facts.qualifyingEducation.gradeRaw, "成绩：83.5/100");
});

test("当前月薪与附条件奖金情景分开，每个情景带条件和材料", () => {
  const r = evaluateSalary(facts({ rankingRaw: "专业排名前25%" }), context);
  assert.deepEqual(r.salary, { status: "fixed", min: 133, max: 133 });
  assert.equal(r.bonus.status, "pending");
  assert.equal(r.bonus.monthlyStandard, null);
  assert.deepEqual(r.scenarios.map((s) => s.monthlyStandard), [101, 102, 103, 103]);
  assert.ok(r.scenarios.every((s) => s.materials.length && s.condition && s.page === 2));
  assert.match(r.scenarios[2].resumeHint, /与简历自述排名相符/);
  assert.ok(r.scenarios.every((s) => s.unchangedBaseSalary.min === 133));
  const card = JSON.stringify(buildSalaryCard({ submission: { id: "test" }, input: { facts: {} }, revision: 1, result: r }));
  for (const value of ["一、", "二、", "133", "102", "103", "奖金材料", "年度条件兑现", "点击打开定薪汇总页面"]) assert.ok(card.includes(value));
  assert.ok(card.indexOf("定薪建议") < card.indexOf("定薪相关信息"));
  assert.ok(!card.includes("简历原文依据") && !card.includes("情景1"));
  assert.ok(card.includes("**985**") && card.includes("**计算机及AI相关**"));
  assert.ok(!card.includes("关联 JD") && !card.includes("jdMatch"));
});

test("本硕80个政策单元格，包括合并列与一线不加价的一本/二本", () => {
  const nonfirst = [[139, 143, 139, 145], [127, 133, 130, 130], [124, 129, 126, 126], [120, 123, 122, 123], [114, 118, 116, 116], [130, 135, 135, 143], [120, 125, 122, 122], [117, 121, 119, 119], [111, 115, 112, 113], [106, 111, 107, 108]];
  const first = [[139, 143, 139, 145], [140, 144, 142, 142], [137, 141, 138, 138], [120, 123, 122, 123], [114, 118, 116, 116], [130, 135, 135, 143], [132, 136, 134, 134], [128, 132, 131, 131], [111, 115, 112, 113], [106, 111, 107, 108]];
  for (const [kind, matrix] of [["nonfirst", nonfirst], ["first", first]]) for (let i = 0; i < 10; i++) {
    const tier = ["C9", "985", "211", "first", "second"][i % 5];
    const degree = i < 5 ? "硕士" : "本科";
    const school = { name: "独立政策核对院校", tier, overseas: false, source: "人工核对政策测试" };
    const ctx = kind === "first" ? { ...context, contractCity: "上海", cityType: "first" } : context;
    for (const [j, category] of ["standard", "computer", "hot", "design"].entries()) {
      const r = evaluateSalary(facts({ degree, school: school.name }, { majorCategory: category }), ctx, { schools: [school] });
      const expected = tier === "C9" ? j === 0 ? matrix[i].slice(0, 2) : matrix[i].slice(2, 4) : [matrix[i][j], matrix[i][j]];
      assert.deepEqual([r.salary.min, r.salary.max], expected, `${kind}/${degree}/${tier}/${category}`);
    }
  }
});

test("缺合同地保留城市分支，专业未确认先列院校基础建议与附条件升档", () => {
  const r = evaluateSalary(facts(), {});
  assert.equal(r.salary.min, null);
  assert.deepEqual(r.scenarios.filter((s) => s.kind === "salary").map((s) => s.salary.min), [133, 144]);
  const unknown = evaluateSalary(facts({ major: "交叉领域" }), context);
  assert.equal(unknown.salary.min, 127);
  assert.equal(unknown.salaryBasis, "school_standard_reference");
  assert.equal(unknown.scenarios.filter((s) => s.kind === "salary").length, 3);
  assert.equal(evaluateSalary(facts({}, { majorCategory: null }), context).salary.min, 127);
  assert.equal(evaluateSalary(facts({ school: "未核对学校" }), context).scenarios.length, 0);
  const card = JSON.stringify(buildSalaryCard({ submission: { id: "test" }, input: { facts: {} }, revision: 1, result: unknown }));
  assert.ok(card.includes("院校标准基础建议") && card.includes("需确认专业是否为特殊专业") && card.includes("若经HR确认适用"));
});

test("未知、重复最高学历、届别和空毕业年份阻断自动金额", () => {
  for (const graduationYear of [null, 2026, 2028]) assert.equal(evaluateSalary(facts({ graduationYear }), context).salary.min, null);
  const input = facts(); input.education.push({ ...input.education[0], school: "另一学校" });
  assert.equal(evaluateSalary(input, context).salary.min, null);
  input.education = [{ ...facts().education[0], degree: "本科" }, { school: "未知学历院校", major: "未知专业", degree: null }];
  assert.equal(evaluateSalary(input, context).salary.min, null);
});

test("博士只报政策区间或一人一议，不从分数插值", () => {
  const r = evaluateSalary(facts({ degree: "博士", school: "北京交通大学" }, { doctorField: "scarce" }), context);
  assert.deepEqual(r.salary, { status: "range", min: 146, max: 150 });
  assert.equal(evaluateSalary(facts({ degree: "博士", school: "南京大学" }, { doctorField: "scarce" }), context).salary.status, "negotiated");
  const unknown = evaluateSalary(facts({ degree: "博士", school: "北京交通大学" }), context);
  assert.equal(unknown.salary.min, null);
  assert.equal(unknown.scenarios.filter((s) => s.kind === "salary").length, 3);
});

test("海外按本科组合映射；上限、2026当年政策、QS500博士端点不外推", () => {
  const schools = [{ name: "海外学校", overseas: true, qsRank: 80, qsVersion: "QS2027", source: "榜单" }, { name: "本科一本", tier: "first", overseas: false, source: "确认" }];
  const input = facts({ school: "海外学校" }, { jobRelevance: true }); input.education.push({ degree: "本科", school: "本科一本", major: "计算机", graduationYear: 2024 });
  const r = evaluateSalary(input, context, { schools });
  assert.equal(r.salary.min, 129); assert.equal(r.facts.salaryTier, "211"); assert.equal(r.bonus.status, "ineligible");
  input.education[1].school = "北京交通大学";
  assert.equal(evaluateSalary(input, context, { schools }).salary.min, null);
  input.education[1].school = "本科一本"; input.education[0].graduationYear = 2026;
  assert.equal(evaluateSalary(input, context, { schools }).salary.min, null);
  schools[0].qsRank = 500;
  assert.equal(evaluateSalary(facts({ degree: "博士", school: "海外学校" }, { doctorField: "scarce" }), context, { schools }).salary.min, null);
});

test("特定设计路径必须核组织；海外认证、特定一线和法学模糊口径不猜", () => {
  const input = facts({ school: "合成设计院校", major: "工业设计" });
  assert.equal(evaluateSalary(input, {}).salary.min, null);
  assert.equal(evaluateSalary(input, { ...context, roleType: "design" }).salary.min, 130);
  assert.equal(evaluateSalary(facts({ school: "合成议薪院校", major: "工业设计" }), { ...context, roleType: "design" }).salary.status, "negotiated");
  assert.equal(evaluateSalary(input, { ...context, contractCity: "上海", roleType: "design" }).salary.min, null);
  assert.equal(evaluateSalary(facts({ school: "合成法学院校", major: "法学" }), { ...context, roleType: "law" }).salary.min, null);
  assert.equal(evaluateSalary(facts({ school: "合成海外设计院校", major: "产品设计" }), { ...context, roleType: "design" }).salary.min, null);
});

test("原文不支持的模型字段清空，证据保留，不凭文件名补姓名", () => {
  const r = extractSalaryFacts({ identity: { name: "不存在的人" }, education: [{ school: "武汉大学", degree: "硕士", major: "人工智能", endDate: "2027-06", ranking: "前10%" }] }, "武汉大学 硕士 2027年毕业\n计算机科学与技术");
  assert.equal(r.name, null); assert.equal(r.education[0].major, null); assert.equal(r.education[0].rankingRaw, null);
  assert.equal(r.education[0].graduationYear, 2027); assert.ok(r.education[0].evidenceRefs.length);
  const multiple = extractSalaryFacts({}, "姓名：张测试\n姓名：李测试");
  assert.match(multiple.conflicts[0], /多个候选人/);
  const identity = extractSalaryFacts({ identity: { name: "测试同学", phones: ["138****1234"], emails: ["exact@example.invalid", "invented@example.invalid"] } }, "测试同学 exact@example.invalid");
  assert.deepEqual(identity.identity, { phones: [], emails: ["exact@example.invalid"] });
  const current = extractSalaryFacts({ education: [{ school: "武汉大学", degree: "硕士", major: "计算机科学与技术", endDate: null, current: true }] }, "武汉大学 硕士\n计算机科学与技术\n预计毕业：2027年6月");
  assert.equal(current.education[0].graduationYear, 2027);
  assert.equal(evaluateSalary(current, context).salary.min, 133);
  const period = extractSalaryFacts({ education: [{ school: "武汉大学", degree: "硕士", major: "计算机科学与技术", endDate: null, current: true }] }, "武汉大学 硕士 计算机科学与技术\n2024.09—2027.06");
  assert.equal(period.education[0].graduationYear, 2027);
});

test("Jev建议固定版本、脱敏、校验选项与概率；失败不能返回JD总分", async () => {
  const f = { ...facts(), evidence: [{ id: "p1", text: "测试同学 武汉大学 硕士 计算机 13800000000 x@example.invalid" }] }; f.education[0].evidenceRefs = ["p1"];
  const base = { enabled: async () => true, model: async () => "jev-1.13.0" };
  const r = await suggestSalaryClassification({}, f, { ...base, judge: async ({ state, questions }) => {
    assert.ok(!JSON.stringify(state).includes("13800000000") && !JSON.stringify(state).includes("x@example.invalid") && !JSON.stringify(state).includes("测试同学"));
    const answers = Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, { type: "choice", choice: "unknown", confidence: 1, probabilities: Object.fromEntries(Object.keys(q.criteria).map((k) => [k, k === "unknown" ? 1 : 0])) }]));
    return { model: "jev-1.13.0", answers, usage: { input_tokens: 100 } };
  } });
  assert.equal(r.status, "suggestion");
  assert.equal((await suggestSalaryClassification({}, f, { ...base, model: async () => "jev-latest" })).status, "pending");
  assert.equal((await suggestSalaryClassification({}, f, { ...base, judge: async () => ({ answers: { major_category: { choice: "invented" } } }) })).status, "unavailable");
  assert.equal((await suggestSalaryClassification({}, f, { enabled: async () => { throw new Error("settings unavailable"); } })).status, "unavailable");
  assert.ok(POLICY_HASH.length === 64 && POLICY_VERSION.includes("2027"));
});
