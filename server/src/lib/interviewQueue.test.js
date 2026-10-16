import test from "node:test";
import assert from "node:assert/strict";
import { queueMutation, queueSuggestion, queueEntryView, assertQueueLink, mutateQueue, queueAssignment } from "./interviewQueue.js";

const stamp = "2026-10-15T01:00:00.000Z";
const row = (id, stage = "professional") => ({ id, stage, updatedAt: stamp, salaryBase: "8700.00", salaryFactor: "13.50", email: "student@example.com" });
const body = (rows, action, extra = {}) => ({ items: rows.map(({ id, updatedAt }) => ({ id, updatedAt })), action, confirmed: true, ...extra });

test("专业和文化面试流转保持真实结果，放弃薪资才进入待定", () => {
  const pro = row("a");
  assert.equal(queueMutation([pro], body([pro], "professional-result", { result: "passed" }), "professional").stage, "culture");
  const proPending = queueMutation([pro], body([pro], "professional-result", { result: "pending" }), "professional");
  assert.equal(proPending.stage, "pending"); assert.equal(proPending.cultureResult, undefined);
  const culture = row("a", "culture");
  assert.equal(queueMutation([culture], body([culture], "culture-result", { result: "passed" }), "culture").stage, "salary");
  assert.equal(queueMutation([culture], body([culture], "culture-result", { result: "pending" }), "culture").stage, "pending");
  const salary = row("a", "salary");
  assert.deepEqual(queueMutation([salary], body([salary], "salary", { salaryStatus: "accepted", salaryBase: 9000, salaryFactor: 14 }), "hr"), { salaryStatus: "accepted", salaryBase: 9000, salaryFactor: 14 });
  assert.equal(queueMutation([salary], body([salary], "salary", { salaryStatus: "abandoned" }), "hr").stage, "pending");
});

test("角色权限、二次确认和专业面试单人限制在后端强制执行", () => {
  const rows = [row("a"), row("b")];
  assert.throws(() => queueMutation(rows, body(rows, "professional-result", { result: "passed" }), "professional"), /一次操作一位/);
  assert.throws(() => queueMutation([rows[0]], body([rows[0]], "professional-result", { result: "passed", confirmed: false }), "professional"), /二次确认/);
  assert.throws(() => queueMutation([row("a", "salary")], body([row("a", "salary")], "salary", { salaryStatus: "accepted" }), "culture"), (err) => err.statusCode === 403);
  assert.throws(() => queueMutation([rows[0]], body([rows[0]], "direction", { jobDirection: "  " }), "professional"), /岗位方向/);
  assert.deepEqual(queueMutation([rows[0]], body([rows[0]], "direction", { jobDirection: "  技术研发  " }), "professional"), { jobDirection: "技术研发" });
});

test("群面共用计时与批量结果；已计时人员不能被重置", () => {
  const rows = [row("a", "culture"), row("b", "culture")];
  const data = queueMutation(rows, body(rows, "culture-timer"), "culture");
  assert.ok(data.cultureStartedAt instanceof Date); assert.match(data.cultureGroupId, /^[a-f0-9-]{36}$/);
  assert.equal(queueMutation(rows, body(rows, "culture-result", { result: "passed" }), "culture").stage, "salary");
  assert.throws(() => queueMutation([{ ...rows[0], cultureStartedAt: stamp }], body([rows[0]], "culture-timer"), "culture"), (err) => err.statusCode === 409);
});

test("跨专场、旧版本、已流转和重复选择都拒绝写入", () => {
  const rows = [row("a", "salary"), row("b", "salary")];
  const request = body(rows, "salary", { salaryBase: 9000 });
  for (const actual of [[rows[0]], [{ ...rows[0], updatedAt: "2026-10-15T02:00:00.000Z" }, rows[1]], [{ ...rows[0], stage: "pending" }, rows[1]]]) {
    assert.throws(() => queueMutation(actual, request, "hr"), (err) => err.code === "queue_conflict");
  }
  assert.throws(() => queueMutation([rows[0]], body([rows[0], rows[0]], "salary", { salaryBase: 9000 }), "hr"), /重复选择/);
});

test("专业和文化角色不返回邮箱、薪资；HR 和后台数值可编辑", () => {
  for (const role of ["professional", "culture"]) {
    const result = queueEntryView(row("a"), role);
    assert.equal(result.email, undefined); assert.equal(result.salaryBase, undefined); assert.equal(result.salaryFactor, undefined);
  }
  assert.equal(queueEntryView(row("a"), "hr").salaryBase, 8700);
  assert.equal(queueEntryView(row("a")).salaryFactor, 13.5);
});

test("停止分享、过期和错误链接角色立即拒绝", () => {
  const valid = { active: true, kind: "culture", expiresAt: null };
  assert.equal(assertQueueLink(valid), valid);
  for (const invalid of [null, { ...valid, active: false }, { ...valid, expiresAt: new Date(Date.now() - 1000) }]) assert.throws(() => assertQueueLink(invalid), (err) => err.statusCode === 410);
  assert.throws(() => assertQueueLink(valid, "registration"), (err) => err.statusCode === 403);
});

test("写入前在同一事务重新验证分享状态，失效不执行人员更新", async () => {
  let updated = false; let locked = false;
  const tx = {
    interviewQueue: { update: async () => { locked = true; } },
    interviewQueueEntry: { findMany: async () => [row("a")], updateMany: async () => { updated = true; } },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  await assert.rejects(mutateQueue(prisma, "queue", body([row("a")], "professional-result", { result: "passed" }), "professional", async () => {
    assert.equal(locked, true); assertQueueLink({ active: false });
  }), (err) => err.statusCode === 410);
  assert.equal(updated, false);
});

test("连续修改即使落在同一毫秒也产生新人员版本", async () => {
  const entry = { ...row("a", "salary"), updatedAt: new Date(Date.now() + 10000) };
  let saved;
  const tx = {
    interviewQueue: { update: async () => {} },
    interviewQueueEntry: { findMany: async () => [entry], updateMany: async ({ data }) => { saved = data; } },
  };
  await mutateQueue({ $transaction: async (fn) => fn(tx) }, "queue", body([entry], "salary", { salaryBase: 9000 }), "hr");
  assert.equal(saved.updatedAt.getTime(), entry.updatedAt.getTime() + 1);
});

test("建议按当前角色与阶段逐人追加，不能跨角色、批量或使用旧版本", () => {
  for (const [role, stage] of [["professional", "professional"], ["culture", "culture"], ["hr", "salary"], ["staff", "pending"]]) {
    const entry = row("a", stage);
    assert.deepEqual(queueSuggestion([entry], body([entry], "suggestion", { content: "  补充项目案例  " }), role), { entryId: "a", authorRole: role, content: "补充项目案例" });
  }
  const entry = row("a");
  const request = body([entry], "suggestion", { content: "建议" });
  assert.throws(() => queueSuggestion([entry], request, "culture"), (err) => err.statusCode === 403);
  assert.throws(() => queueSuggestion([entry], request, "student"), (err) => err.statusCode === 403);
  assert.throws(() => queueSuggestion([], request, "professional"), (err) => err.statusCode === 409);
  assert.throws(() => queueSuggestion([{ ...entry, updatedAt: new Date() }], request, "professional"), (err) => err.statusCode === 409);
  assert.throws(() => queueSuggestion([entry, row("b")], body([entry, row("b")], "suggestion", { content: "建议" }), "professional"), /逐人/);
  for (const content of [undefined, "  ", "字".repeat(5001)]) assert.throws(() => queueSuggestion([entry], { ...request, content }, "professional"), /1–5000/);
});

test("建议追加不覆盖人员或历史记录，学生序列化不返回内部建议", async () => {
  const entry = { ...row("a"), suggestions: [{ id: "old", content: "原建议" }] };
  const saved = [];
  let validated = false;
  const tx = {
    interviewQueue: { update: async () => {} },
    interviewQueueEntry: { findMany: async () => [entry], updateMany: async () => assert.fail("追加建议不应覆盖人员") },
    interviewQueueSuggestion: { create: async ({ data }) => { assert.equal(validated, true); saved.push(data); } },
  };
  await mutateQueue({ $transaction: async (fn) => fn(tx) }, "queue", body([entry], "suggestion", { content: "补充建议" }), "professional", async () => { validated = true; });
  assert.equal(saved.length, 1); assert.equal(saved[0].authorRole, "professional");
  assert.equal(entry.suggestions[0].content, "原建议"); assert.equal(entry.stage, "professional");
  assert.equal(queueEntryView(entry, "student").suggestions, undefined);
  assert.equal(queueEntryView(entry, "culture").suggestions.length, 1);
  await assert.rejects(mutateQueue({ $transaction: async (fn) => fn(tx) }, "queue", body([entry], "suggestion", { content: "失效链接建议" }), "professional", async () => assertQueueLink({ active: false })), (err) => err.statusCode === 410);
  assert.equal(saved.length, 1);
});

test("待定来源依据实际结果标明专业、文化或定薪，不伪造未发生的结果", () => {
  const professional = { ...row("p", "pending"), professionalResult: "pending" };
  const culture = { ...row("c", "pending"), professionalResult: "passed", cultureResult: "pending" };
  const salary = { ...row("s", "pending"), professionalResult: "passed", cultureResult: "passed", salaryStatus: "abandoned" };
  assert.equal(queueEntryView(professional).pendingFrom, "professional");
  assert.equal(queueEntryView(culture).pendingFrom, "culture");
  assert.equal(queueEntryView(salary, "professional").pendingFrom, "salary");
  assert.equal(queueEntryView(professional).cultureResult, undefined);
  assert.equal(queueEntryView(row("a")).pendingFrom, null);
});

test("HR 可改定薪和待定方向，专业仍限本阶段且文化不能改方向", () => {
  for (const stage of ["salary", "pending"]) {
    const entry = row("a", stage);
    assert.deepEqual(queueMutation([entry], body([entry], "direction", { jobDirection: "  新岗位  " }), "hr"), { jobDirection: "新岗位" });
    assert.throws(() => queueMutation([entry], body([entry], "direction", { jobDirection: "新岗位" }), "professional"), (err) => err.statusCode === 409);
  }
  const entry = row("a", "culture");
  assert.throws(() => queueMutation([entry], body([entry], "direction", { jobDirection: "新岗位" }), "hr"), (err) => err.statusCode === 409);
  assert.throws(() => queueMutation([entry], body([entry], "direction", { jobDirection: "新岗位" }), "culture"), (err) => err.statusCode === 403);
});

test("待定重新排队清理重做阶段及薪资状态，保留资料、金额与建议，不伪造专业通过", () => {
  const entry = { ...row("a", "pending"), professionalResult: "passed", cultureResult: "passed", salaryStatus: "abandoned", professionalStartedAt: stamp, cultureStartedAt: stamp, cultureGroupId: "old-group", name: "学生", suggestions: [{ content: "历史建议" }] };
  for (const targetStage of ["professional", "culture"]) {
    const data = queueMutation([entry], body([entry], "requeue", { targetStage }), "hr");
    const updated = { ...entry, ...data };
    assert.equal(updated.stage, targetStage); assert.equal(updated.cultureResult, null);
    assert.equal(updated.cultureStartedAt, null); assert.equal(updated.cultureGroupId, null); assert.equal(updated.salaryStatus, null);
    assert.equal(updated.professionalResult, targetStage === "culture" ? "passed" : null);
    assert.equal(updated.professionalStartedAt, targetStage === "culture" ? stamp : null);
    assert.equal(updated.salaryBase, entry.salaryBase); assert.equal(updated.salaryFactor, entry.salaryFactor);
    assert.equal(updated.name, entry.name); assert.deepEqual(updated.suggestions, entry.suggestions);
  }
  const professionalPending = { ...entry, professionalResult: "pending" };
  const culture = queueMutation([professionalPending], body([professionalPending], "requeue", { targetStage: "culture" }), "hr");
  assert.equal(culture.professionalResult, null); assert.equal(culture.professionalStartedAt, null);
  const request = body([entry], "requeue", { targetStage: "professional" });
  for (const role of ["professional", "culture", "student"]) assert.throws(() => queueMutation([entry], request, role), (err) => err.statusCode === 403);
  assert.throws(() => queueMutation([entry], { ...request, confirmed: false }, "hr"), (err) => err.code === "queue_confirmation_required");
  assert.throws(() => queueMutation([{ ...entry, stage: "salary" }], request, "hr"), (err) => err.code === "queue_conflict");
  assert.throws(() => queueMutation([{ ...entry, updatedAt: new Date() }], request, "hr"), (err) => err.code === "queue_conflict");
  assert.throws(() => queueMutation([entry], { ...request, targetStage: "salary" }, "hr"), /请选择/);
});

test("重新排队在事务验证分享后加入目标队尾，连续同毫秒操作仍保持队尾顺序", async () => {
  const entry = { ...row("a", "pending"), professionalResult: "pending" };
  let tail = new Date(Date.now() + 10000);
  const saved = [];
  let validated = false;
  const tx = {
    interviewQueue: { update: async () => {} },
    interviewQueueEntry: {
      findMany: async () => [entry],
      findFirst: async ({ where }) => { assert.equal(validated, true); assert.deepEqual(where, { queueId: "queue", stage: "culture" }); return { phaseEnteredAt: tail }; },
      updateMany: async ({ data }) => { assert.ok(data.phaseEnteredAt > tail); tail = data.phaseEnteredAt; saved.push(data); },
    },
  };
  for (let i = 0; i < 2; i++) await mutateQueue({ $transaction: async (fn) => fn(tx) }, "queue", body([entry], "requeue", { targetStage: "culture" }), "hr", async () => { validated = true; });
  assert.equal(saved.length, 2); assert.equal(saved[1].phaseEnteredAt.getTime(), saved[0].phaseEnteredAt.getTime() + 1);
  await assert.rejects(mutateQueue({ $transaction: async (fn) => fn(tx) }, "queue", body([entry], "requeue", { targetStage: "culture" }), "hr", async () => assertQueueLink({ active: false })), (err) => err.statusCode === 410);
  assert.equal(saved.length, 2);
});

test("HR 手动分配限当前专业／文化阶段、正确席位及最新人员版本", async () => {
  const { queueAssignment, queueStation } = await import("./interviewQueue.js");
  const row = { id: "a", stage: "professional", updatedAt: new Date(), stationId: null };
  const queue = { setup: { cultureOnsite: false, stations: [{ id: "p1", role: "professional", name: "专业一" }, { id: "c1", role: "culture", name: "文化一" }] } };
  const body = { items: [{ id: row.id, updatedAt: row.updatedAt }], confirmed: true, targetStationId: "p1" };
  assert.deepEqual(queueAssignment([row], body, "hr", queue), { stationId: "p1" });
  assert.deepEqual(queueAssignment([row], { ...body, targetStationId: null }, "hr", queue), { stationId: null });
  for (const role of ["professional", "culture"]) assert.throws(() => queueAssignment([row], body, role, queue), { statusCode: 403 });
  for (const targetStationId of ["c1", "other"]) assert.throws(() => queueAssignment([row], { ...body, targetStationId }, "hr", queue));
  assert.throws(() => queueAssignment([row], { ...body, confirmed: false }, "hr", queue));
  assert.throws(() => queueAssignment([row], { ...body, items: [{ id: row.id, updatedAt: new Date(0) }] }, "hr", queue), { statusCode: 409 });
  assert.throws(() => queueStation(queue, "professional", "c1"), { statusCode: 401 });
  assert.throws(() => queueStation(queue, "professional"), { statusCode: 401 });
  assert.equal(queueStation({}, "professional"), null);
});


test("内推登记不能被现场面试计时、结果、定薪或分配操作意外推进", () => {
  const entry = row("referral", "referral");
  assert.throws(() => queueAssignment([entry], body([entry], "assign", { targetStationId: null }), "hr", { setup: { stations: [] } }), (err) => err.statusCode === 409);
  for (const [role, action] of [["professional", "professional-timer"], ["professional", "professional-result"], ["culture", "culture-timer"], ["culture", "culture-result"], ["hr", "salary"], ["hr", "requeue"]]) {
    assert.throws(() => queueMutation([entry], body([entry], action, { result: "passed", salaryStatus: "accepted", targetStage: "professional" }), role), (err) => err.statusCode === 409);
  }
});
