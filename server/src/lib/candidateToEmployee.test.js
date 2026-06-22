import assert from "node:assert/strict";
import test from "node:test";

import {
  mapStatusToStage,
  candidateToEmployeeData,
  shouldAutoAdvanceToInterviewing,
} from "./candidateToEmployee.js";

test("mapStatusToStage 映射候选人状态到入职阶段", () => {
  assert.equal(mapStatusToStage("已入职"), "入职准备");
  assert.equal(mapStatusToStage("待入职"), "待入职");
  assert.equal(mapStatusToStage("待筛选"), null);
  assert.equal(mapStatusToStage(""), null);
  assert.equal(mapStatusToStage(null), null);
  assert.equal(mapStatusToStage(undefined), null);
});

test("candidateToEmployeeData 在状态不触发转化时返回 null", () => {
  assert.equal(candidateToEmployeeData({ id: "c1", status: "待筛选", name: "张三" }), null);
});

test("candidateToEmployeeData 映射核心字段并带正确 stage", () => {
  const data = candidateToEmployeeData({
    id: "c1",
    status: "待入职",
    name: "李四",
    jobId: "j1",
    department: { name: "海外研究院" },
    location: "上海",
    tags: ["前端"],
    jdMatch: 82,
  });
  assert.equal(data.stage, "待入职");
  assert.equal(data.candidateId, "c1");
  assert.equal(data.name, "李四");
  assert.equal(data.jobId, "j1");
  assert.equal(data.dept, "海外研究院");
  assert.equal(data.workLocation, "上海");
  assert.equal(data.jdMatch, 82);
  assert.deepEqual(data.tags, ["前端"]);
});

test("candidateToEmployeeData 缺失可选字段时退回 null / 空数组", () => {
  const data = candidateToEmployeeData({ id: "c2", status: "已入职", name: "王五" });
  assert.equal(data.stage, "入职准备");
  assert.equal(data.jobId, null);
  assert.equal(data.dept, null);
  assert.deepEqual(data.tags, []);
});

test("shouldAutoAdvanceToInterviewing 仅在面试前阶段推进", () => {
  for (const s of [null, "", "待筛选", "已沟通"]) {
    assert.equal(shouldAutoAdvanceToInterviewing(s), true, `应推进: ${JSON.stringify(s)}`);
  }
  for (const s of ["面试中", "待定中", "待入职", "已入职", "已淘汰"]) {
    assert.equal(shouldAutoAdvanceToInterviewing(s), false, `不应推进: ${s}`);
  }
});
