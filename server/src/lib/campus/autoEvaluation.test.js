import test from "node:test";
import assert from "node:assert/strict";
import { bestAppliedOnsiteMatch, reconcileCampusAutoEvaluation } from "./autoEvaluation.js";

const versionId = "resume-v2";
const run = {
  status: "done", stale: false, resumeVersionId: versionId,
  results: [
    { jobId: "onsite-low", scoreRaw: 62, scoreShown: 70, evaluationId: "ev-low" },
    { jobId: "onsite-high", scoreRaw: 88, scoreShown: 88, evaluationId: "ev-high" },
    { jobId: "referral", scoreRaw: 99, scoreShown: 99, evaluationId: "ev-referral" },
    { jobId: "excluded", scoreRaw: 96, evaluationId: "ev-excluded", excluded: true },
  ],
};
const application = (jobId, kind = "onsite", status = "applied") => ({ id: jobId, jobId, status, sessionJob: { kind }, createdAt: new Date("2026-10-08") });

test("校招自动评估选已投递且匹配成功的现场面试岗位中原始分最高的一份", () => {
  const apps = [application("onsite-low"), application("onsite-high"), application("referral", "referral"), application("excluded")];
  assert.equal(bestAppliedOnsiteMatch(apps, run, versionId)?.application.jobId, "onsite-high");
});

test("只有投递、只有内推、匹配失败或过期时不触发自动评估", () => {
  assert.equal(bestAppliedOnsiteMatch([application("unmatched")], run, versionId), null);
  assert.equal(bestAppliedOnsiteMatch([application("referral", "referral")], run, versionId), null);
  assert.equal(bestAppliedOnsiteMatch([application("onsite-high", "onsite", "withdrawn")], run, versionId), null);
  assert.equal(bestAppliedOnsiteMatch([application("onsite-high")], { ...run, stale: true }, versionId), null);
  assert.equal(bestAppliedOnsiteMatch([application("onsite-high")], run, "resume-v3"), null);
  assert.equal(bestAppliedOnsiteMatch([application("onsite-high")], { ...run, status: "running" }, versionId), null);
  assert.equal(bestAppliedOnsiteMatch([{ ...application("onsite-high"), sessionJob: { kind: "onsite", matchEnabled: false } }], run, versionId), null);
});

test("有效匹配完成后复用最高分现场面试评估并写入候选人当前岗位", async () => {
  const writes = [];
  const apps = [application("onsite-low"), application("onsite-high"), application("referral", "referral")].map((a) => ({ ...a, sessionJob: { ...a.sessionJob, job: { title: a.jobId } } }));
  const prisma = {
    campusApplicant: {
      findUnique: async () => ({ id: "student-promote", candidateId: "candidate-1", currentResumeVersionId: versionId, applications: apps, autoEvaluationStatus: "not_applicable" }),
      update: async ({ data }) => writes.push(["applicant", data]),
    },
    campusMatchRun: { findFirst: async () => ({ ...run, id: "run-1" }) },
    campusApplication: { update: async ({ where, data }) => writes.push(["application", where.id, data]) },
    candidateEvaluation: {
      findFirst: async ({ where }) => ({ id: where.id, jobId: "onsite-high", overallScore: 88, classification: "B", reviewPriority: "REVIEW", reportStatus: "done", report: { highlights: [], risks: [] } }),
      updateMany: async () => writes.push(["clear-current"]),
      update: async ({ where, data }) => writes.push(["current", where.id, data.isCurrent]),
    },
    candidate: { update: async ({ data }) => writes.push(["candidate", data]) },
    $transaction: async (fn) => fn(prisma),
  };
  await reconcileCampusAutoEvaluation({ prisma }, "student-promote");
  assert.ok(writes.some((x) => x[0] === "current" && x[1] === "ev-high" && x[2] === true));
  assert.equal(writes.find((x) => x[0] === "candidate")[1].jobId, "onsite-high");
  assert.equal(writes.find((x) => x[0] === "applicant")[1].autoEvaluationStatus, "done");
});

test("只投递未匹配的现场面试岗位标记待匹配，不启动 AI 评估", async () => {
  let status;
  const prisma = {
    campusApplicant: {
      findUnique: async () => ({ id: "student-unmatched", candidateId: "candidate-2", currentResumeVersionId: versionId, applications: [application("unmatched")], autoEvaluationStatus: "not_applicable", autoEvaluationJobId: null }),
      update: async ({ data }) => { status = data.autoEvaluationStatus; },
    },
    campusMatchRun: { findFirst: async () => null },
    $transaction: async (fn) => fn(prisma),
  };
  await reconcileCampusAutoEvaluation({ prisma }, "student-unmatched");
  assert.equal(status, "awaiting_match");
});
