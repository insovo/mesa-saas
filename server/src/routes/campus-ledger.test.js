import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import campusRoutes from "./campus.js";

const sessionId = "10000000-0000-4000-8000-000000000001";
const versionId = "10000000-0000-4000-8000-000000000002";

test("campus ledger shows the highest JD score from the current completed match, including unsubmitted jobs", async (t) => {
  const app = Fastify();
  const session = { id: sessionId, maxResumeUploads: 3 };
  const applicants = [
    {
      id: "student-1", currentResumeVersionId: versionId, resumeVersions: [], applications: [{ id: "application-1", scoreShown: 71, status: "applied" }],
      matchRuns: [
        { status: "done", stale: false, resumeVersionId: versionId, startedAt: new Date("2026-10-08T12:00:00Z"), results: [{ jobId: "submitted", scoreShown: 72 }, { jobId: "not-submitted", scoreShown: 89 }] },
        { status: "done", stale: false, resumeVersionId: versionId, startedAt: new Date("2026-10-07T12:00:00Z"), results: [{ scoreShown: 99 }] },
      ],
    },
    {
      id: "student-2", currentResumeVersionId: versionId, resumeVersions: [], applications: [{ id: "application-2", scoreShown: 95, status: "applied" }],
      matchRuns: [{ status: "done", stale: true, resumeVersionId: versionId, startedAt: new Date("2026-10-08T12:00:00Z"), results: [{ scoreShown: 98 }] }],
    },
    {
      id: "student-3", currentResumeVersionId: versionId, resumeVersions: [], applications: [],
      matchRuns: [{ status: "done", stale: false, resumeVersionId: "old-version", startedAt: new Date("2026-10-08T12:00:00Z"), results: [{ scoreShown: 99 }] }],
    },
  ];
  app.decorate("prisma", {
    campusSession: { findFirst: async () => session, findUnique: async () => session },
    campusApplicant: {
      findMany: async ({ include }) => {
        assert.deepEqual(include.matchRuns.where, { status: "done", stale: false });
        assert.deepEqual(include.matchRuns.orderBy, { startedAt: "desc" });
        return applicants.map((a) => ({ ...a, matchRuns: a.matchRuns.filter((r) => r.status === "done" && !r.stale).sort((left, right) => right.startedAt - left.startedAt).slice(0, include.matchRuns.take) }));
      },
      count: async () => applicants.length,
      findUnique: async () => ({ ...applicants[0], session }),
    },
    campusApplication: { groupBy: async () => [] },
    campusMatchRun: {
      findMany: async () => applicants[0].matchRuns,
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { applicantId: "student-1", resumeVersionId: versionId, status: "done", stale: false });
        return applicants[0].matchRuns[0];
      },
    },
  });
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "test-manager" };
    req.permsCache = { access: { isActive: true, isAdmin: true, pageKeys: ["campus"], moduleKeys: [], departmentScopes: [], jobScopes: [] } };
  });
  await app.register(campusRoutes, { prefix: "/api/campus" });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: `/api/campus/sessions/${sessionId}/ledger` });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().items.map((item) => item.bestMatchScore), [89, null, null]);

  const detail = await app.inject({ method: "GET", url: "/api/campus/applicants/student-1" });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().applicant.bestMatchScore, 89);
});
