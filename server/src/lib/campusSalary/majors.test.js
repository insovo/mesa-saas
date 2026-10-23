import "./testPolicy.js";
import test from "node:test";
import assert from "node:assert/strict";
import { MAJOR_CATALOG, resolveMajor } from "./majors.js";
import { evaluateSalary } from "./engine.js";
import { buildSalaryCard } from "./cards.js";

const context = { contractCity: "芜湖", cityType: "nonfirst", roleType: "general", salaryFactor: 12.5 };
const facts = (major, degree = "本科") => ({ name: "目录测试同学", education: [{ degree, school: "北京交通大学", major, graduationYear: 2027 }] });
const resolve = (major, options = {}) => resolveMajor(major, { degree: "本科", roleType: "general", ...options });

test("目录导入与原表有效记录核对，保留代码、具体专业类和单元格来源", () => {
  assert.equal(MAJOR_CATALOG.count, 771); assert.equal(MAJOR_CATALOG.groupCount, 93);
  assert.equal(MAJOR_CATALOG.source.range, "C2:G772"); assert.equal(MAJOR_CATALOG.source.edition, null);
  const r = resolve("信息安全");
  assert.equal(r.code, "080904K"); assert.equal(r.academicGroup, "计算机类");
  assert.equal(r.discipline, "工学"); assert.match(r.source.range, /^C\d+:G\d+$/);
  assert.equal(r.catalogHash, MAJOR_CATALOG.hash); assert.equal(MAJOR_CATALOG.hash.length, 64);
});

test("按目录专业类覆盖具体专业，不按名称里的控制、设计、智能等词升档", () => {
  const expected = [
    ["轨道交通信号与控制", "自动化类", "hot"], ["核电技术与控制工程", "自动化类", "hot"],
    ["通信工程", "电子信息类", "hot"], ["人工智能", "电子信息类", "computer"],
    ["网络工程", "计算机类", "computer"], ["数据科学与大数据技术", "计算机类", "computer"],
    ["环境设计", "设计学类", "design"], ["数学与应用数学", "数学类", "hot"],
    ["材料成型及控制工程", "机械类", "standard"], ["过程装备与控制工程", "机械类", "standard"],
    ["工业设计", "机械类", "standard"], ["机械电子工程", "机械类", "standard"],
    ["智能建造", "土木类", "standard"], ["眼视光学", "医学技术类", "standard"],
  ];
  for (const [name, group, category] of expected) {
    const r = resolve(name);
    assert.equal(r.academicGroup, group, name); assert.equal(r.category, category, name);
  }
  assert.equal(resolve("声学").category, "hot"); assert.equal(resolve("智能交互设计").category, "design");
  assert.equal(resolve("计算机科学与技术（管理方向）").category, null);
  assert.equal(resolve("计算机工程").category, null);
  assert.equal(resolve(" 轨道交通信号与控制 ").category, "hot");
});

test("本科目录不充当研究生目录；控制工程保留已确认归属，不虚构本科代码", () => {
  const control = resolve("控制工程", { degree: "硕士" });
  assert.equal(control.category, "hot"); assert.equal(control.academicGroup, "控制科学与工程类");
  assert.equal(control.code, null); assert.equal(control.source, null); assert.match(control.basis, /研究生/);
  assert.equal(resolve("网络工程", { degree: "硕士" }).category, null);
  assert.equal(resolve("工业设计", { degree: "硕士" }).category, null);
  assert.equal(resolve("自动化", { degree: "本科" }).code, "080801");
  assert.equal(resolve("自动化", { degree: "硕士" }).code, null);
  for (const name of ["机械制造及其自动化", "车辆工程", "机械工程", "机械电子工程", "机械设计及理论"]) {
    const r = resolve(name, { degree: "硕士" });
    assert.equal(r.category, "standard", name); assert.equal(r.academicGroup, "机械工程");
    assert.equal(r.code, null); assert.ok(r.academicSource.urls.every((u) => u.startsWith("https://gs.njust.edu.cn/")));
  }
  assert.equal(resolve("车辆工程").code, "080207");
  assert.equal(resolve("机械制造及其自动化", { degree: "硕士" }).code, null);
  const f = facts("控制工程", "硕士"); f.education.push(facts("计算机科学与技术").education[0]);
  const r = evaluateSalary(f, context);
  assert.equal(r.facts.category, "hot"); assert.equal(r.facts.majorClassification.academicGroup, "控制科学与工程类");
  assert.equal(r.facts.majorClassification.code, null); assert.equal(r.salary.min, 126);
});

test("电池岗严格限列举专业；外语特殊定薪还需高度对口确认", () => {
  assert.equal(resolve("材料科学与工程").category, "standard");
  assert.equal(resolve("材料科学与工程", { roleType: "battery" }).category, "hot");
  assert.equal(resolve("高分子材料与工程", { roleType: "battery" }).category, "standard");
  assert.equal(resolve("化学生物学", { roleType: "battery" }).category, "standard");
  assert.equal(resolve("化学", { roleType: "" }).category, null);
  assert.equal(resolve("化学工程与技术", { degree: "硕士", roleType: "battery" }).category, "hot");
  assert.equal(resolve("德语").category, "standard");
  assert.equal(resolve("德语", { roleType: "language" }).category, null);
  assert.equal(resolve("德语", { roleType: "language", jobRelevance: true }).category, "hot");
  assert.equal(resolve("英语", { roleType: "language", jobRelevance: true }).category, null);
  assert.equal(resolve("英语").category, "standard");
});

test("政策与目录名称差异保留待确认，只列适用的特殊类别及所需材料", () => {
  const r = evaluateSalary(facts("新能源材料与器件"), context);
  assert.equal(r.facts.majorClassification.code, "080414T"); assert.equal(r.facts.category, null);
  assert.equal(r.salaryBasis, "school_standard_reference"); assert.equal(r.salary.min, 117);
  assert.match(r.missingFields.find((m) => m.field === "majorCategory").reason, /器械\/器件/);
  const scenarios = r.scenarios.filter((s) => s.kind === "salary");
  assert.deepEqual(scenarios.map((s) => s.majorCategory), ["hot"]);
  assert.ok(scenarios[0].materials.some((v) => v.includes("名称差异")));
  const card = buildSalaryCard({ submission: { id: "catalog-test" }, input: {}, result: r });
  assert.match(card.body.elements[0].content, /专业待确认：.*器械\/器件/);
});

test("目录普通专业明确按院校标准定薪，明确信息和人工补充仍沿用既有优先级", () => {
  const r = evaluateSalary(facts("机械工程"), context);
  assert.equal(r.facts.category, "standard"); assert.equal(r.salary.min, 117);
  assert.equal(r.salaryBasis, undefined); assert.equal(r.bonus.status, "ineligible");
  assert.ok(!r.missingFields.some((m) => m.field === "majorCategory"));
  const forced = evaluateSalary({ ...facts("机械工程"), confirmed: { majorCategory: "hot" } }, context);
  assert.equal(forced.facts.category, "hot"); assert.equal(forced.facts.majorClassification.category, "standard");
  const card = buildSalaryCard({ submission: { id: "catalog-test" }, input: {}, result: evaluateSalary(facts("轨道交通信号与控制"), context) });
  assert.match(card.body.elements[0].content, /专业：\*\*轨道交通信号与控制\*\* · \*\*自动化类\*\* · \*\*特殊专业/);
});
