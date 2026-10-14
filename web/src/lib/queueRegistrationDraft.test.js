import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_QUEUE_REGISTRATION, readQueueRegistrationDraft, saveQueueRegistrationDraft, clearQueueRegistrationDraft } from "./queueRegistrationDraft.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
test("查看 JD 后恢复全部填写项，各登记链接草稿独立，成功提交后清除", () => {
  const storage = memoryStorage();
  const form = { ...EMPTY_QUEUE_REGISTRATION, name: "测试学生", school: "已修改学校", major: "机械工程", degree: "硕士", gradYear: 2026, languageAbility: "CET-6", phone: "13900000000", email: "student@example.com", jobDirection: "现场岗位" };
  saveQueueRegistrationDraft("first", form, storage);
  assert.deepEqual(readQueueRegistrationDraft("first", storage), form);
  assert.deepEqual(readQueueRegistrationDraft("second", storage), EMPTY_QUEUE_REGISTRATION);
  clearQueueRegistrationDraft("first", storage);
  assert.deepEqual(readQueueRegistrationDraft("first", storage), EMPTY_QUEUE_REGISTRATION);
});
test("损坏或不可用草稿不阻挡登记，额外字段不回填", () => {
  const storage = memoryStorage();
  storage.setItem("mesa.queue.registration.draft.v1.first", "invalid");
  assert.deepEqual(readQueueRegistrationDraft("first", storage), EMPTY_QUEUE_REGISTRATION);
  storage.setItem("mesa.queue.registration.draft.v1.first", JSON.stringify({ school: "已改学校", extra: "不回填" }));
  const restored = readQueueRegistrationDraft("first", storage);
  assert.equal(restored.school, "已改学校"); assert.equal(restored.extra, undefined);
  const unavailable = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(readQueueRegistrationDraft("first", unavailable), EMPTY_QUEUE_REGISTRATION);
  assert.doesNotThrow(() => saveQueueRegistrationDraft("first", restored, unavailable));
  assert.doesNotThrow(() => clearQueueRegistrationDraft("first", unavailable));
});
