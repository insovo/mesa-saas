import test from "node:test";
import assert from "node:assert/strict";
import { campusEvaluationModel, CAMPUS_SCORE_FLOOR } from "./campusPolicy.js";
import { draftEvaluationModel, validateEvaluationModel } from "./templates.js";
import { buildQuestions, buildState } from "./questions.js";
import { composite } from "./composite.js";
import { legacyToEvaluation } from "./legacyAdapter.js";
import { shownScore } from "../campus/shared.js";

test("校招模型不以工作年限或任职稳定性扣分,并认可校园成绩与获奖", () => {
  const model = draftEvaluationModel({
    basics: { title: "研发校招生" },
    experienceYears: { total: { min: 3 }, relevant: [{ raw: "研发", min: 2 }] },
    professionalSkills: [{ name: "软件测试", required: true }],
  }, { templateId: "tpl.campus.general" });
  assert.equal(model.requirements.find((r) => r.key === "years_total").tier, "INFO");
  assert.equal(model.requirements.find((r) => r.key.startsWith("years_rel_")).method, "none");
  assert.ok(model.requirements.some((r) => r.key === "campus_academic" && r.tier === "BONUS"));
  assert.ok(model.requirements.some((r) => r.key === "campus_achievement" && r.tier === "BONUS"));
  assert.ok(!model.fixedQuestions.includes("stability"));
  assert.deepEqual(validateEvaluationModel(model).errors, []);
  const { questions } = buildQuestions(model, { items: [] });
  assert.ok(!questions.meta_stability);
  assert.match(questions.req_cap_软件测试.instructions, /课程项目/);
  assert.match(questions.meta_sufficiency.instructions, /全职工作经历/);
});

test("旧校招模型在评估时采用宽容规则且不改动已保存模型", () => {
  const saved = { requirements: [{ key: "years_total", tier: "MUST", method: "code", weight: 10 }, { key: "cap_test", label: "测试", tier: "CORE", method: "jev_score", jev: { type: "score", instructions: "只认多年工作经验", criteria: ["无", "有"] } }], fixedQuestions: ["stability", "sufficiency"] };
  const adapted = campusEvaluationModel(saved);
  assert.equal(adapted.requirements[0].tier, "INFO");
  assert.match(adapted.requirements[1].jev.instructions, /实习/);
  assert.equal(saved.requirements[0].tier, "MUST");
  assert.equal(saved.requirements[1].jev.instructions, "只认多年工作经验");
});

test("校园评估输入保留 GPA、排名和竞赛证据", () => {
  const { state } = buildState({ markdown: "简历", profile: { education: [{ gpa: { value: "3.8", scale: "4.0" }, ranking: "前 10%", scholarships: ["一等奖学金"] }], campus: { competitions: [{ name: "软件大赛", award: "一等奖" }] } }, derived: {}, job: { title: "研发校招生" } });
  assert.equal(state.profile.education[0].gpa.value, "3.8");
  assert.equal(state.profile.education[0].ranking, "前 10%");
  assert.match(state.profile.campus.competitions[0], /一等奖/);
});

test("后台和学生校招匹配均以 60 为最低分,保留原始分供排序", () => {
  const result = composite({}, [{ key: "skill", tier: "CORE", weight: 10, normalized: 0.2, verdict: "不满足", source: "jev", confidence: 0.9 }], {}, { scoreFloor: CAMPUS_SCORE_FLOOR, tierWeights: { MUST: 25, CORE: 50, PREFERRED: 25, STABILITY: 0 } });
  assert.equal(result.rawOverallScore, 20);
  assert.equal(result.overallScore, 60);
  assert.equal(result.classification, "C");
  const legacy = legacyToEvaluation({ jdMatch: 35 }, { scoreFloor: CAMPUS_SCORE_FLOOR });
  assert.equal(legacy.rawOverallScore, 35);
  assert.equal(legacy.overallScore, 60);
  assert.equal(shownScore(35, 0), 60);
  assert.equal(shownScore(35, 75), 75);
});
