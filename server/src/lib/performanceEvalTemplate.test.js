// 轻量单测: 等级 / 加权总分与 Excel 公式镜像 (v2 · 7 维)
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
  SCORE_DIMENSIONS,
  REQUIRED_SCORE_COUNT,
} from "./performanceEvalTemplate.js";

test("weightedItem mirrors ROUND(w*score/100,1)", () => {
  assert.equal(weightedItem(20, 80), 16);
  assert.equal(weightedItem(5, 55), 2.8);
});

test("seven dimensions total weight 100", () => {
  assert.equal(REQUIRED_SCORE_COUNT, 7);
  assert.equal(SCORE_DIMENSIONS.length, 7);
  const sum = SCORE_DIMENSIONS.reduce((a, d) => a + d.weight, 0);
  assert.equal(sum, 100);
});

test("manager total requires all 7 scores", () => {
  const scores = defaultScoresPayload();
  assert.equal(computeManagerTotal(scores), null);
  // 20*90 + 20*80 + 20*70 + 20*60 + 10*50 + 5*40 + 5*40
  // = 18+16+14+12+5+2+2 = 69
  const vals = [90, 80, 70, 60, 50, 40, 40];
  scores.forEach((s, i) => {
    s.managerScore = vals[i];
  });
  assert.equal(computeManagerTotal(scores), 69);
  assert.equal(ratingFor(69), "C 胜任/Competent");
  assert.equal(pipTriggeredFor(69), false);
});

test("PIP when manager total < 60", () => {
  const scores = defaultScoresPayload().map((s) => ({ ...s, managerScore: 40 }));
  const t = computeManagerTotal(scores);
  assert.equal(t, 40);
  assert.equal(ratingFor(t), "D 待改进/Needs improvement");
  assert.equal(pipTriggeredFor(t), true);
});

test("self total SUMPRODUCT", () => {
  const scores = defaultScoresPayload().map((s) => ({
    ...s,
    selfScore: 100,
  }));
  assert.equal(computeSelfTotal(scores), 100);
});

test("templates hash verify on boot", () => {
  const hashes = verifyPerformanceTemplatesOnBoot();
  assert.ok(hashes["zh-en"]);
  assert.equal(Object.keys(hashes).length, 1);
});
