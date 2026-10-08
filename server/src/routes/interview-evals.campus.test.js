import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import interviewEvalRoutes from "./interview-evals.js";
import { campusInterviewerApiAllowed } from "../lib/campusInterviewerApi.js";

test("校招面试官只能访问校招候选人的面试评价", async (t) => {
  const app = Fastify();
  const evaluations = [
    { id: "campus-eval", candidateId: "campus", createdBy: "admin", deletedAt: null, status: "submitted", scores: [] },
    { id: "own-eval", candidateId: "campus", createdBy: "interviewer", deletedAt: null, status: "link_sent", scores: [] },
    { id: "ordinary-eval", candidateId: "ordinary", createdBy: "admin", deletedAt: null, status: "submitted", scores: [] },
  ];
  app.decorate("prisma", {
    user: { findUnique: async () => ({ id: "interviewer", role: "CAMPUS_INTERVIEWER", isActive: true, accessPolicy: {} }) },
    candidate: {
      findFirst: async ({ where }) => where.id === "campus" && where.campusApplicant?.isNot === null ? { id: "campus" } : null,
      findUnique: async ({ where }) => where.id === "campus" ? { id: "campus", name: "校招学生", jobId: null, job: null } : null,
    },
    interviewEvaluation: {
      findMany: async ({ where }) => evaluations.filter((ev) => ev.candidateId === where.candidateId && !ev.deletedAt),
      findUnique: async ({ where }) => evaluations.find((ev) => ev.id === where.id) || null,
      create: async ({ data }) => ({ id: "new-eval", deletedAt: null, ...data }),
      update: async ({ where, data }) => ({ ...evaluations.find((ev) => ev.id === where.id), ...data }),
    },
  });
  app.decorate("authenticate", async (req, reply) => {
    req.user = { sub: "interviewer", role: "CAMPUS_INTERVIEWER" };
    if (!campusInterviewerApiAllowed(req.method, req.url)) return reply.code(403).send({ error: "forbidden" });
  });
  await app.register(interviewEvalRoutes, { prefix: "/api" });
  t.after(() => app.close());

  const list = await app.inject({ method: "GET", url: "/api/candidates/campus/interview-evals" });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.json().items.map((item) => item.id), ["campus-eval", "own-eval"]);

  const ordinaryList = await app.inject({ method: "GET", url: "/api/candidates/ordinary/interview-evals" });
  assert.equal(ordinaryList.statusCode, 404);
  const ordinaryDetail = await app.inject({ method: "GET", url: "/api/interview-evals/ordinary-eval" });
  assert.equal(ordinaryDetail.statusCode, 404);
  const campusDetail = await app.inject({ method: "GET", url: "/api/interview-evals/campus-eval" });
  assert.equal(campusDetail.statusCode, 200);

  const created = await app.inject({ method: "POST", url: "/api/candidates/campus/interview-evals", payload: { interviewer: "面试官" } });
  assert.equal(created.statusCode, 201);
  const ordinaryCreate = await app.inject({ method: "POST", url: "/api/candidates/ordinary/interview-evals", payload: { interviewer: "面试官" } });
  assert.equal(ordinaryCreate.statusCode, 404);

  const othersUpdate = await app.inject({ method: "PATCH", url: "/api/interview-evals/campus-eval", payload: { status: "revoked" } });
  assert.equal(othersUpdate.statusCode, 403);
  const ownUpdate = await app.inject({ method: "PATCH", url: "/api/interview-evals/own-eval", payload: { status: "revoked" } });
  assert.equal(ownUpdate.statusCode, 200);
  const reopen = await app.inject({ method: "PATCH", url: "/api/interview-evals/own-eval", payload: { status: "draft" } });
  assert.equal(reopen.statusCode, 403);
  const ordinaryUpdate = await app.inject({ method: "PATCH", url: "/api/interview-evals/ordinary-eval", payload: { status: "revoked" } });
  assert.equal(ordinaryUpdate.statusCode, 404);
  assert.equal(campusInterviewerApiAllowed("DELETE", "/api/interview-evals/campus-eval"), false);
});
