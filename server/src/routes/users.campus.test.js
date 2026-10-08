import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import usersRoutes from "./users.js";

test("管理员可用账户名创建校招面试官，且策略接口不能提升到其他页面", async (t) => {
  const app = Fastify();
  const id = randomUUID();
  let user;
  const prisma = {
    user: {
      findUnique: async ({ where }) => where.id === id ? user : null,
      create: async ({ data }) => {
        user = { id, ...data, accessPolicy: { ...data.accessPolicy.create }, departmentScopes: [], jobScopes: [], createdAt: new Date(), updatedAt: new Date() };
        return user;
      },
    },
    userAccessPolicy: { upsert: async ({ update }) => { Object.assign(user.accessPolicy, update); } },
    passwordHistory: { create: async () => ({}), findMany: async () => [] },
    auditLog: { create: async () => ({}) },
    $transaction: async (fn) => fn(prisma),
  };
  app.decorate("prisma", prisma);
  app.decorate("authenticate", async (req) => {
    req.user = { sub: randomUUID(), role: "ADMIN" };
    req.permsCache = { access: { isActive: true, isAdmin: true, pageKeys: ["users"], moduleKeys: [] } };
  });
  await app.register(usersRoutes, { prefix: "/api/users" });
  t.after(() => app.close());
  const password = `${randomBytes(16).toString("hex")}aZ9`;
  const created = await app.inject({ method: "POST", url: "/api/users", payload: { role: "CAMPUS_INTERVIEWER", username: "Reviewer.One", password } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().user.username, "reviewer.one");
  assert.deepEqual(created.json().user.access.campusTabs, []);
  assert.deepEqual(user.accessPolicy.pageKeys, ["candidates", "candidate.detail"]);
  assert.deepEqual(user.departmentScopes, []);
  const escalation = await app.inject({ method: "PATCH", url: `/api/users/${id}/policy`, payload: { pageKeys: ["users"] } });
  assert.equal(escalation.statusCode, 422);
  const grant = await app.inject({ method: "PATCH", url: `/api/users/${id}/policy`, payload: { campusTabs: ["jobs"] } });
  assert.equal(grant.statusCode, 200);
  assert.deepEqual(grant.json().user.access.campusTabs, ["jobs"]);
  assert.equal(user.accessPolicy.pageKeys.includes("users"), false);
});
