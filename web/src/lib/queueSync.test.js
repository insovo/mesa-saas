import test from "node:test";
import assert from "node:assert/strict";
import { watchQueueChanges } from "./queueSync.js";

function fixture(check, onError = () => {}) {
  const visibility = new EventTarget(); visibility.hidden = false;
  const timers = new Map(); let nextId = 0;
  const stop = watchQueueChanges({ check, onError, visibility, random: () => 0.5,
    schedule: (run, delay) => { const id = ++nextId; timers.set(id, { run, delay }); return id; },
    cancel: (id) => timers.delete(id),
  });
  const visibilityChange = (hidden) => { visibility.hidden = hidden; visibility.dispatchEvent(new Event("visibilitychange")); };
  const next = async () => { const [id, job] = timers.entries().next().value; timers.delete(id); await job.run(); };
  return { stop, timers, next, visibilityChange };
}

test("定时检查串行执行，隐藏暂停，返回立即检查，卸载后停止", async () => {
  let calls = 0; let release;
  const f = fixture(async () => { calls++; if (calls === 1) await new Promise((resolve) => { release = resolve; }); });
  assert.equal([...f.timers.values()][0].delay, 3000);
  const pending = f.next();
  f.visibilityChange(true); f.visibilityChange(false);
  assert.equal(calls, 1); assert.equal(f.timers.size, 0);
  release(); await pending;
  assert.equal(f.timers.size, 1);
  f.visibilityChange(true); assert.equal(f.timers.size, 0);
  f.visibilityChange(false); await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 2); assert.equal(f.timers.size, 1);
  f.stop(); f.visibilityChange(true); f.visibilityChange(false);
  assert.equal(f.timers.size, 0); assert.equal(calls, 2);
});

test("网络或限流失败逐步退避，成功恢复正常间隔，权限失效终止", async () => {
  let failure = { response: { status: 429 } }; const errors = [];
  const f = fixture(async () => { if (failure) throw failure; }, (err) => errors.push(err));
  for (const delay of [5000, 10000, 20000, 30000, 30000]) { await f.next(); assert.equal([...f.timers.values()][0].delay, delay); }
  failure = null; await f.next(); assert.equal([...f.timers.values()][0].delay, 3000);
  failure = { response: { status: 410 } }; await f.next();
  assert.equal(f.timers.size, 0); assert.equal(errors.length, 6);
  f.stop();
});

test("离开页面后迟到的失败不触发错误回调或重新安排请求", async () => {
  let reject; let errors = 0;
  const f = fixture(() => new Promise((_resolve, fail) => { reject = fail; }), () => errors++);
  const pending = f.next(); f.stop(); reject(new Error("late")); await pending;
  assert.equal(errors, 0); assert.equal(f.timers.size, 0);
});
