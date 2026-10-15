import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import rateLimitPlugin from "./rateLimit.js";

test("同一 IP 的登录账号与公开访客分别计数", async (t) => {
  const app = Fastify();
  await app.register(fp(async () => {}, { name: "redis" }));
  await app.register(rateLimitPlugin);
  await app.register(jwt, { secret: "rate-limit-test-only-secret" });
  app.get("/api/check", async () => ({ ok: true }));
  app.get("/api/public/check", async () => ({ ok: true }));
  t.after(() => app.close());

  const users = ["user-a", "user-b"].map((sub) => app.jwt.sign({ sub }));
  for (let i = 0; i < 150; i++) {
    for (const token of users) {
      const result = await app.inject({ url: "/api/check", headers: { authorization: `Bearer ${token}`, "x-real-ip": "198.51.100.31" } });
      assert.equal(result.statusCode, 200);
    }
  }

  const visitors = ["25bb73c8-9825-43bf-a149-ea782d832d3e", "b48630de-6835-49a2-a0b6-6a0d75448e39"];
  for (let i = 0; i < 30; i++) {
    for (const id of visitors) {
      const result = await app.inject({ url: "/api/public/check", headers: { "x-mesa-visitor": id, "x-real-ip": "198.51.100.32" } });
      assert.equal(result.statusCode, 200);
    }
  }
  for (let i = 0; i < 11; i++) {
    const result = await app.inject({ url: "/api/public/check", headers: { "x-mesa-visitor": visitors[0], "x-real-ip": "198.51.100.32" } });
    assert.equal(result.statusCode, i === 10 ? 429 : 200);
  }

  let earlyRejected = 0;
  let lastStatus;
  for (let i = 0; i <= 3000; i++) {
    const id = `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
    const result = await app.inject({ url: "/api/public/check", headers: { "x-mesa-visitor": id, "x-real-ip": "198.51.100.33" } });
    if (i < 3000 && result.statusCode !== 200) earlyRejected++;
    lastStatus = result.statusCode;
  }
  assert.equal(earlyRejected, 0);
  assert.equal(lastStatus, 429);
});
