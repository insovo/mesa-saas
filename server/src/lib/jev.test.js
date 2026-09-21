import assert from "node:assert/strict";
import test from "node:test";

import { validateAnswers, estimateTokens, cacheKey } from "./jev.js";
import { cleanMarkdown } from "./textin.js";
import { deepStripNul } from "./evaluation/pipeline.js";

test("validateAnswers 校验题目覆盖与数值范围", () => {
  const questions = {
    a: { type: "noul", instructions: "x" },
    b: { type: "score", instructions: "y", criteria: ["0", "1", "2", "3"] },
    c: { type: "choice", instructions: "z", criteria: { p: "", q: "" } },
  };
  assert.deepEqual(validateAnswers(questions, { a: { type: "noul", noul: 0.9 }, b: { type: "score", score: 2.5 }, c: { type: "choice", choice: "p" } }), { ok: true, missing: [], bad: [] });
  const v = validateAnswers(questions, { a: { type: "noul", noul: 1.7 }, b: { type: "score", score: 5 } });
  assert.equal(v.ok, false);
  assert.deepEqual(v.missing, ["c"]);
  assert.deepEqual(v.bad, ["a", "b"]);
  assert.deepEqual(validateAnswers(questions, { a: { type: "score", score: 1 }, b: { type: "score", score: 1 }, c: { type: "choice", choice: "p" } }).missing, ["a"]); // 类型不符视为缺题
});

test("estimateTokens:中文按字、英文按 3.5 字符", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("汽车行业"), 4);
  assert.equal(estimateTokens("hello world"), 4);
  assert.ok(estimateTokens({ a: "汽车", b: "hello" }) >= 6);
});

test("cacheKey 对 state / questions 敏感且稳定", () => {
  const k1 = cacheKey("jev-latest", { r: "a" }, { q: { type: "noul" } });
  const k2 = cacheKey("jev-latest", { r: "a" }, { q: { type: "noul" } });
  const k3 = cacheKey("jev-latest", { r: "b" }, { q: { type: "noul" } });
  assert.equal(k1, k2);
  assert.notEqual(k1, k3);
  assert.ok(k1.startsWith("mesa:jev:ans:"));
});

test("cleanMarkdown 去图片引用与多余空行", () => {
  const md = "# 李明\r\n\r\n![](https://x/y.png)\n\n\n\n\n工作经历   \n";
  const out = cleanMarkdown(md);
  assert.ok(!out.includes("]("));
  assert.ok(!out.includes("\r"));
  assert.ok(!out.includes("\n\n\n\n"));
  assert.ok(out.endsWith("工作经历"));
});

test("NUL 字节剥离:cleanMarkdown 与 deepStripNul(Postgres 22021 防护)", () => {
  assert.equal(cleanMarkdown("李明\u0000工程师"), "李明工程师");
  const out = deepStripNul({ a: "x\u0000y", b: ["\u0000z", 1, null], c: { d: "ok", e: "\u0000" }, f: new Date(0) });
  assert.deepEqual({ ...out, f: undefined }, { a: "xy", b: ["z", 1, null], c: { d: "ok", e: "" }, f: undefined });
  assert.ok(out.f instanceof Date);
});
