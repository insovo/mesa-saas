import crypto from "node:crypto";

export const QUEUE_STAGES = ["professional", "culture", "salary", "pending"];
export const QUEUE_LINK_KINDS = ["registration", "professional", "culture", "hr"];

export function queueError(message, statusCode = 400, code = "queue_invalid") {
  return Object.assign(new Error(message), { statusCode, code });
}

export function assertQueueLink(link, kind) {
  if (!link || !link.active || (link.expiresAt && new Date(link.expiresAt) <= new Date())) {
    throw queueError("链接已停止分享或已过期", 410, "queue_link_inactive");
  }
  if (kind && link.kind !== kind) throw queueError("此链接不能用于该操作", 403, "queue_role_forbidden");
  return link;
}

export function queueEntryView(row, role = "staff") {
  const result = { ...row, salaryBase: Number(row.salaryBase), salaryFactor: Number(row.salaryFactor) };
  if (role === "professional" || role === "culture") {
    delete result.email;
    delete result.salaryBase;
    delete result.salaryFactor;
    delete result.salaryStatus;
  }
  return result;
}

export function queueMutation(rows, body, role) {
  const { action, result } = body;
  const allowed = {
    professional: ["professional-result", "professional-timer", "direction"],
    culture: ["culture-result", "culture-timer"],
    hr: ["salary"],
    staff: ["professional-result", "professional-timer", "direction", "culture-result", "culture-timer", "salary"],
  };
  if (!allowed[role]?.includes(action)) throw queueError("无权执行该操作", 403, "queue_role_forbidden");
  if (new Set(body.items.map((item) => item.id)).size !== body.items.length) throw queueError("不能重复选择同一人员");
  const stage = action.startsWith("professional") || action === "direction" ? "professional" : action.startsWith("culture") ? "culture" : "salary";
  if (rows.length !== body.items.length || rows.some((row) => row.stage !== stage || !body.items.some((item) => item.id === row.id && new Date(item.updatedAt).getTime() === new Date(row.updatedAt).getTime()))) {
    throw queueError("记录已被其他面试官更新，请刷新后重试", 409, "queue_conflict");
  }
  if ((action.startsWith("professional") || action === "direction") && rows.length !== 1) throw queueError("专业面试一次操作一位人员");
  if (!action.endsWith("timer") && body.confirmed !== true) throw queueError("请二次确认后提交", 400, "queue_confirmation_required");
  const now = new Date();
  if (action.endsWith("timer")) {
    const key = action === "professional-timer" ? "professionalStartedAt" : "cultureStartedAt";
    if (rows.some((row) => row[key])) throw queueError("计时已开始，请刷新查看", 409, "queue_conflict");
    return { [key]: now, ...(stage === "culture" ? { cultureGroupId: crypto.randomUUID() } : {}) };
  }
  if (action === "direction") {
    if (!body.jobDirection?.trim()) throw queueError("请选择或填写岗位方向");
    return { jobDirection: body.jobDirection.trim() };
  }
  if (action === "professional-result" || action === "culture-result") {
    if (!["passed", "pending"].includes(result)) throw queueError("请选择通过或待定");
    return {
      [stage === "professional" ? "professionalResult" : "cultureResult"]: result,
      stage: result === "pending" ? "pending" : stage === "professional" ? "culture" : "salary",
      phaseEnteredAt: now,
    };
  }
  const data = {};
  if (body.salaryBase !== undefined) data.salaryBase = body.salaryBase;
  if (body.salaryFactor !== undefined) data.salaryFactor = body.salaryFactor;
  if (body.salaryStatus !== undefined) {
    if (!["accepted", "abandoned"].includes(body.salaryStatus)) throw queueError("请选择接受或放弃");
    data.salaryStatus = body.salaryStatus;
    if (body.salaryStatus === "abandoned") Object.assign(data, { stage: "pending", phaseEnteredAt: now });
  }
  if (!Object.keys(data).length) throw queueError("请选择需要修改的定薪字段");
  return data;
}

export async function mutateQueue(prisma, queueId, body, role, validateActor = async () => {}) {
  return prisma.$transaction(async (tx) => {
    // 同一专场串行提交；停止分享和登记也使用此锁，防止失效链接继续落盘。
    await tx.interviewQueue.update({ where: { id: queueId }, data: { revision: { increment: 1 } } });
    await validateActor(tx);
    const rows = await tx.interviewQueueEntry.findMany({ where: { queueId, id: { in: body.items.map((item) => item.id) } } });
    const data = queueMutation(rows, body, role);
    const updatedAt = new Date(Math.max(Date.now(), ...rows.map((row) => new Date(row.updatedAt).getTime() + 1)));
    await tx.interviewQueueEntry.updateMany({ where: { queueId, id: { in: rows.map((row) => row.id) } }, data: { ...data, updatedAt } });
    return { ok: true };
  });
}
