import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { AxiosError } from "axios";
import { campus, campusApi, getCampusToken, getLegacyCampusToken, setCampusToken } from "./campusApi.js";

const key = "mesa.campus.token.v1";
function fixture(t) {
  const data = new Map();
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage, oldAdapter = campusApi.defaults.adapter;
  globalThis.window = { location: { pathname: "/campus/school-a" } };
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  t.after(() => { globalThis.window = oldWindow; globalThis.localStorage = oldStorage; campusApi.defaults.adapter = oldAdapter; });
  campusApi.defaults.adapter = async (config) => ({ data: { authorization: config.headers.Authorization || null }, status: 200, headers: {}, config });
  const a = randomBytes(24).toString("base64url"), b = randomBytes(24).toString("base64url");
  const path = (slug) => { window.location.pathname = `/campus/${slug}/mine`; };
  return { data, a, b, path };
}
function unauthorized(config) {
  return new AxiosError("expired", "ERR_BAD_REQUEST", config, null, { status: 401, data: {} });
}

test("多学校标签页按 slug 保存和发送学生会话，退出只清理当前学校", async (t) => {
  const { a, b, path } = fixture(t);
  setCampusToken(a); path("school-b");
  assert.equal(getCampusToken(), null);
  assert.equal((await campus.me()).authorization, null);
  setCampusToken(b);
  assert.equal((await campus.me()).authorization, `Bearer ${b}`);
  path("school-a");
  assert.equal((await campus.me()).authorization, `Bearer ${a}`);
  setCampusToken(null);
  assert.equal(getCampusToken(), null);
  assert.equal(getCampusToken("school-b"), b);
});

test("旧全局会话只用于显式核对，匹配学校后迁移，不被其他学校请求携带", async (t) => {
  const { data, a, b, path } = fixture(t);
  data.set(key, a);
  assert.equal(getCampusToken(), null);
  assert.equal((await campus.me()).authorization, null);
  assert.equal((await campus.me(getLegacyCampusToken())).authorization, `Bearer ${a}`);
  setCampusToken(b, "school-b");
  assert.equal(getLegacyCampusToken(), a);
  setCampusToken(a, "school-a");
  assert.equal(getLegacyCampusToken(), null);
  path("school-b");
  assert.equal((await campus.me(a)).authorization, `Bearer ${a}`);
  assert.equal(getCampusToken(), b);
});

test("跨学校切换后迟到的 401 不删除另一学校或刷新的会话", async (t) => {
  const { a, b, path } = fixture(t);
  setCampusToken(a);
  let rejectRequest, started;
  const ready = new Promise((resolve) => { started = resolve; });
  campusApi.defaults.adapter = (config) => new Promise((resolve, reject) => { rejectRequest = () => reject(unauthorized(config)); started(); });
  const pending = campus.me();
  await ready;
  path("school-b"); setCampusToken(b);
  rejectRequest();
  await assert.rejects(pending);
  assert.equal(getCampusToken("school-a"), null);
  assert.equal(getCampusToken(), b);
  campusApi.defaults.adapter = async (config) => { setCampusToken(a); throw unauthorized(config); };
  await assert.rejects(campus.me());
  assert.equal(getCampusToken(), a);
});

test("旧全局会话失效时清理旧值，保留各学校有效会话", async (t) => {
  const { data, a, b } = fixture(t);
  data.set(key, a); setCampusToken(b);
  campusApi.defaults.adapter = async (config) => { throw unauthorized(config); };
  await assert.rejects(campus.me(a));
  assert.equal(getLegacyCampusToken(), null);
  assert.equal(getCampusToken(), b);
});
