import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import jobsRoutes from "./jobs.js";

test("JD text extraction validates input and honors job or campus permissions", async (t) => {
  const app = Fastify();
  let access = { isActive: true, isAdmin: false, pageKeys: [], moduleKeys: [], departmentScopes: [], jobScopes: [] };
  app.decorate("authenticate", async (req) => { req.user = { sub: "test-user" }; req.permsCache = { access }; });
  await app.register(jobsRoutes, { prefix: "/api/jobs" });
  t.after(() => app.close());
  const request = (payload) => app.inject({ method: "POST", url: "/api/jobs/parse-text", payload });

  assert.equal((await request({ title: "前端工程师", text: "短" })).statusCode, 400);
  assert.equal((await request({ title: "前端工程师", text: "负责 React 页面开发与接口联调" })).statusCode, 403);
  access = { ...access, moduleKeys: ["campus.manage"] };
  assert.equal((await request({ title: "前端工程师", text: "负责 React 页面开发与接口联调" })).statusCode, 403);
  access = { ...access, pageKeys: ["campus"], isActive: false };
  assert.equal((await request({ title: "前端工程师", text: "负责 React 页面开发与接口联调" })).statusCode, 403);
});

test("job list can separate social and campus jobs without changing unfiltered callers", async (t) => {
  const app = Fastify();
  const queries = [];
  let created;
  app.decorate("prisma", { job: {
    findMany: async ({ where }) => { queries.push(where); return []; },
    count: async ({ where }) => { queries.push(where); return 0; },
    create: async ({ data }) => { created = data; return { id: "new-job", ...data }; },
  } });
  app.decorate("authenticate", async (req) => {
    req.user = { sub: "test-admin" };
    req.permsCache = { access: { isActive: true, isAdmin: true, pageKeys: [], moduleKeys: [], departmentScopes: [], jobScopes: [] } };
  });
  await app.register(jobsRoutes, { prefix: "/api/jobs" });
  t.after(() => app.close());

  for (const [query, expected] of [["?recruitmentType=social", "social"], ["?recruitmentType=campus", "campus"], ["", undefined]]) {
    const response = await app.inject({ method: "GET", url: `/api/jobs${query}` });
    assert.equal(response.statusCode, 200);
    assert.equal(queries.at(-2).recruitmentType, expected);
    assert.equal(queries.at(-1).recruitmentType, expected);
  }
  assert.equal((await app.inject({ method: "GET", url: "/api/jobs?recruitmentType=other" })).statusCode, 400);

  const response = await app.inject({ method: "POST", url: "/api/jobs", payload: { title: "产品经理" } });
  assert.equal(response.statusCode, 201);
  assert.equal(created.recruitmentType, "social");
});
