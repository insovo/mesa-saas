// 轻量单测: 等级 / 加权总分与 Excel 公式镜像
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeManagerTotal,
  computeSelfTotal,
  ratingFor,
  pipTriggeredFor,
  weightedItem,
  defaultScoresPayload,
  verifyPerformanceTemplatesOnBoot,
} from "./performanceEvalTemplate.js";

test("weightedItem mirrors ROUND(w*score/100,1)", () => {
  assert.equal(weightedItem(30, 80), 24);
  assert.equal(weightedItem(10, 55), 5.5);
});

test("manager total requires all 5 scores", () => {
  const scores = defaultScoresPayload();
  assert.equal(computeManagerTotal(scores), null);
  scores.forEach((s, i) => {
    s.managerScore = [90, 80, 70, 60, 50][i];
  });
  // 30*90/100 + 30*80/100 + 20*70/100 + 10*60/100 + 10*50/100 = 27+24+14+6+5 = 76
  assert.equal(computeManagerTotal(scores), 76);
  assert.equal(ratingFor(76), "C 胜任/Competent");
  assert.equal(pipTriggeredFor(76), false);
});

test("PIP when manager total < 60", () => {
  const scores = defaultScoresPayload().map((s) => ({ ...s, managerScore: 40 }));
  const t = computeManagerTotal(scores);
  assert.equal(t, 40);
  assert.equal(ratingFor(t), "D 待改进/Needs improvement");
  assert.equal(pipTriggeredFor(t), true);
});

test("self total SUMPRODUCT", () => {
  const scores = defaultScoresPayload().map((s, i) => ({
    ...s,
    selfScore: [100, 100, 100, 100, 100][i],
  }));
  assert.equal(computeSelfTotal(scores), 100);
});

test("templates hash verify on boot", () => {
  const hashes = verifyPerformanceTemplatesOnBoot();
  assert.ok(hashes.zh);
  assert.ok(hashes["zh-en"]);
  assert.ok(hashes["zh-es"]);
  assert.ok(hashes.en);
});
