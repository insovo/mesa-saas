import assert from "node:assert/strict";
import test from "node:test";

import { computeProfileCompletion, isParsing, PARSING_TTL_MS } from "./derived.js";

test("computeProfileCompletion 空候选人为 0", () => {
  assert.equal(computeProfileCompletion(null), 0);
  assert.equal(computeProfileCompletion({}), 0);
});

test("computeProfileCompletion 累加各字段权重且封顶 100", () => {
  const full = {
    phone: "1", email: "a@b.c", education: "本科", school: "x", major: "y",
    location: "上海", age: 30, yearsExp: 5,
    skills: ["a"], experience: ["b"], educationHistory: ["c"],
    aiSummary: "x".repeat(101),
    highlights: ["h"],
  };
  assert.equal(computeProfileCompletion(full), 100);
});

test("computeProfileCompletion 支持 markdown 字符串形式的事实字段", () => {
  const onlySkills = computeProfileCompletion({ skills: "- a\n- b" });
  assert.equal(onlySkills, 15);
  assert.equal(computeProfileCompletion({ skills: "   " }), 0); // 空白字符串不计
});

test("isParsing:空值 false,近期 true,超时 false", () => {
  assert.equal(isParsing(null), false);
  assert.equal(isParsing(new Date()), true);
  assert.equal(isParsing(new Date(Date.now() - 1000)), true);
  assert.equal(isParsing(new Date(Date.now() - PARSING_TTL_MS - 1000)), false);
  assert.equal(isParsing("not-a-date"), false);
});

test("isParsing 接受 ISO 字符串", () => {
  assert.equal(isParsing(new Date().toISOString()), true);
});
