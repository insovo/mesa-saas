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
