import test from "node:test";
import assert from "node:assert/strict";
import { campusInterviewerApiAllowed } from "./campusInterviewerApi.js";
import { campusRouteAllowed } from "./campusTabAccess.js";
import { campusInterviewerPageKeys } from "./permissionKeys.js";
import { buildCandidateScopeWhere, buildJobScopeWhere } from "./permissions.js";

test("校招面试官默认仅可访问校招候选人接口", () => {
  assert.deepEqual(campusInterviewerPageKeys([]), ["candidates", "candidate.detail"]);
  assert.equal(campusInterviewerApiAllowed("GET", "/api/candidates"), true);
  assert.equal(campusInterviewerApiAllowed("GET", "/api/candidates/one/evaluations"), true);
  assert.equal(campusInterviewerApiAllowed("POST", "/api/candidates"), false);
  assert.equal(campusInterviewerApiAllowed("GET", "/api/users"), false);
  assert.equal(campusInterviewerApiAllowed("GET", "/api/reports"), false);
  const access = { role: "CAMPUS_INTERVIEWER", pageKeys: campusInterviewerPageKeys([]) };
  assert.equal(campusRouteAllowed(access, "GET", "/api/campus/sessions"), false);
  assert.equal(campusRouteAllowed(access, "GET", "/api/campus/by-candidate/one"), true);
});

test("校招候选人和岗位范围由角色固定，不受普通 owner 和授权范围影响", async () => {
  const req = {
    user: { sub: "interviewer" },
    server: { prisma: { user: { findUnique: async () => ({
      id: "interviewer", role: "CAMPUS_INTERVIEWER", isActive: true,
      accessPolicy: { pageKeys: ["dashboard", "campus.jobs"], moduleKeys: ["candidate.delete"] },
      departmentScopes: [{ departmentId: "other" }], jobScopes: [{ jobId: "other" }],
    }) } } },
  };
  assert.deepEqual(await buildCandidateScopeWhere(req), { campusApplicant: { isNot: null } });
  assert.deepEqual(await buildJobScopeWhere(req), { campusSessionJobs: { some: {} } });
  assert.deepEqual(req.permsCache.access.pageKeys, campusInterviewerPageKeys(["jobs"]));
  assert.equal(req.permsCache.access.moduleKeys.includes("candidate.delete"), false);
});

test("单个校招 tab 不会放行其他 tab 的读写接口", () => {
  const ledger = { role: "CAMPUS_INTERVIEWER", pageKeys: campusInterviewerPageKeys(["ledger"]) };
  assert.equal(campusRouteAllowed(ledger, "GET", "/api/campus/sessions"), true);
  assert.equal(campusRouteAllowed(ledger, "GET", "/api/campus/sessions/one/ledger"), true);
  assert.equal(campusRouteAllowed(ledger, "POST", "/api/campus/sessions/one/applicants"), true);
  assert.equal(campusRouteAllowed(ledger, "GET", "/api/campus/sessions/one/stats"), false);
  assert.equal(campusRouteAllowed(ledger, "PATCH", "/api/campus/sessions/one/jobs/two"), false);
  assert.equal(campusRouteAllowed(ledger, "GET", "/api/campus/settings"), false);
  assert.equal(campusRouteAllowed(ledger, "POST", "/api/campus/applicants/one/merge"), false);
  const jobs = { role: "CAMPUS_INTERVIEWER", pageKeys: campusInterviewerPageKeys(["jobs"]) };
  assert.equal(campusRouteAllowed(jobs, "PATCH", "/api/campus/sessions/one/jobs/two"), true);
  assert.equal(campusRouteAllowed(jobs, "POST", "/api/campus/sessions"), false);
  assert.equal(campusRouteAllowed(jobs, "GET", "/api/campus/applicants/one"), false);
});
