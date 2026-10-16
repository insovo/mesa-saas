import crypto from "node:crypto";
import bcrypt from "bcryptjs";

export const QUEUE_STAGES = ["professional", "culture", "salary", "pending"];
export const QUEUE_LINK_KINDS = ["registration", "professional", "culture", "hr"];

export function queueSetup(queue = {}) {
  return { cultureOnsite: queue.setup?.cultureOnsite !== false, stations: (queue.setup?.stations || []).map(({ id, name, role }) => ({ id: id.toLowerCase(), name, role })) };
}

export function queueStation(queue, role, stationId) {
  if (!["professional", "culture"].includes(role)) return null;
  const stations = queueSetup(queue).stations;
  if (!stations.length && !stationId) return null;
  const station = stations.find((item) => item.id === stationId?.toLowerCase() && item.role === role);
  if (!station) throw queueError("请选择当前角色的面试官席位，或重新打开席位链接", 401, "queue_station_required");
  return station;
}

export function queueAssignment(rows, body, role, queue) {
  if (!["hr", "staff"].includes(role)) throw queueError("只有 HR 可以分配面试官", 403, "queue_role_forbidden");
  if (!rows.length || rows.length !== body.items.length || new Set(body.items.map((item) => item.id)).size !== body.items.length || rows.some((row) => !["professional", "culture"].includes(row.stage) || !body.items.some((item) => item.id === row.id && new Date(item.updatedAt).getTime() === new Date(row.updatedAt).getTime()))) throw queueError("人员已更新，请刷新后重新分配", 409, "queue_conflict");
  if (!body.confirmed) throw queueError("请二次确认分配", 400, "queue_confirmation_required");
  const station = queueSetup(queue).stations.find((item) => item.id === body.targetStationId?.toLowerCase());
  if (body.targetStationId && (!station || rows.some((row) => row.stage !== station.role))) throw queueError("请选择与面试阶段一致的席位");
  if (body.targetStationId === undefined) throw queueError("请选择面试官，或选择撤回分配");
  return { stationId: station?.id || null };
}

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
  result.pendingFrom = row.stage === "pending" ? row.salaryStatus === "abandoned" ? "salary" : row.cultureResult === "pending" ? "culture" : row.professionalResult === "pending" ? "professional" : null : null;
  if (role === "student") delete result.suggestions;
  if (role === "professional" || role === "culture") {
    delete result.email;
    delete result.salaryBase;
    delete result.salaryFactor;
    delete result.salaryStatus;
  }
  return result;
}

export function queueSuggestion(rows, body, role) {
  if (!["staff", "professional", "culture", "hr"].includes(role)) throw queueError("无权添加建议", 403, "queue_role_forbidden");
  if (body.items.length !== 1) throw queueError("请逐人添加建议");
  const row = rows[0];
  if (rows.length !== 1 || row.id !== body.items[0].id || new Date(row.updatedAt).getTime() !== new Date(body.items[0].updatedAt).getTime()) {
    throw queueError("记录已被其他面试官更新，请刷新后重试", 409, "queue_conflict");
  }
  if (role !== "staff" && row.stage !== (role === "hr" ? "salary" : role)) throw queueError("只能为当前面试阶段的人员添加建议", 403, "queue_role_forbidden");
  const content = body.content?.trim();
  if (!content || content.length > 5000) throw queueError("请填写 1–5000 字的建议");
  return { entryId: row.id, authorRole: role, content };
}

export function queueMutation(rows, body, role) {
  const { action, result } = body;
  const allowed = {
    professional: ["professional-result", "professional-timer", "direction"],
    culture: ["culture-result", "culture-timer"],
    hr: ["salary", "direction", "requeue"],
    staff: ["professional-result", "professional-timer", "direction", "culture-result", "culture-timer", "salary", "requeue"],
  };
  if (!allowed[role]?.includes(action)) throw queueError("无权执行该操作", 403, "queue_role_forbidden");
  if (new Set(body.items.map((item) => item.id)).size !== body.items.length) throw queueError("不能重复选择同一人员");
  let stages = action.startsWith("professional") ? ["professional"] : action.startsWith("culture") ? ["culture"] : ["salary"];
  if (action === "requeue") stages = ["pending"];
  if (action === "direction") stages = role === "professional" ? ["professional"] : role === "hr" ? ["salary", "pending"] : ["professional", "salary", "pending"];
  if (rows.length !== body.items.length || rows.some((row) => !stages.includes(row.stage) || !body.items.some((item) => item.id === row.id && new Date(item.updatedAt).getTime() === new Date(row.updatedAt).getTime()))) {
    throw queueError("记录已被其他面试官更新，请刷新后重试", 409, "queue_conflict");
  }
  if ((action.startsWith("professional") || action === "direction" || action === "requeue") && rows.length !== 1) throw queueError("此操作一次操作一位人员");
  if (!action.endsWith("timer") && body.confirmed !== true) throw queueError("请二次确认后提交", 400, "queue_confirmation_required");
  const now = new Date();
  const stage = rows[0].stage;
  if (action === "requeue") {
    if (!["professional", "culture"].includes(body.targetStage)) throw queueError("请选择专业面试或文化面试队列");
    return {
      stage: body.targetStage, phaseEnteredAt: now,
      professionalResult: body.targetStage === "culture" && rows[0].professionalResult === "passed" ? "passed" : null,
      professionalStartedAt: body.targetStage === "culture" && rows[0].professionalResult === "passed" ? rows[0].professionalStartedAt : null,
      cultureResult: null, cultureStartedAt: null, cultureGroupId: null, salaryStatus: null,
    };
  }
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

export async function mutateQueue(prisma, queueId, body, role, validateActor = async () => {}, stationId = null) {
  return prisma.$transaction(async (tx) => {
    // 同一专场串行提交；停止分享和登记也使用此锁，防止失效链接继续落盘。
    const queue = await tx.interviewQueue.update({ where: { id: queueId }, data: { revision: { increment: 1 } } });
    await validateActor(tx);
    const rows = await tx.interviewQueueEntry.findMany({ where: { queueId, id: { in: body.items.map((item) => item.id) } } });
    if (body.action === "assign") {
      const assignment = queueAssignment(rows, body, role, queue);
      const updatedAt = new Date(Math.max(Date.now(), ...rows.map((row) => new Date(row.updatedAt).getTime() + 1)));
      const last = await tx.interviewQueueEntry.findFirst({ where: { queueId, stationId: assignment.stationId }, orderBy: { phaseEnteredAt: "desc" }, select: { phaseEnteredAt: true } });
      let tail = Math.max(Date.now(), last ? new Date(last.phaseEnteredAt).getTime() + 1 : 0);
      rows.sort((a, b) => new Date(a.phaseEnteredAt) - new Date(b.phaseEnteredAt) || new Date(a.createdAt) - new Date(b.createdAt) || a.id.localeCompare(b.id));
      for (const row of rows) {
        if (row.stationId === assignment.stationId) continue;
        await tx.interviewQueueEntry.updateMany({ where: { queueId, id: row.id }, data: { ...assignment, phaseEnteredAt: new Date(tail++), ...(row.stage === "professional" ? { professionalStartedAt: null } : { cultureStartedAt: null, cultureGroupId: null }), updatedAt } });
      }
      return { ok: true };
    }
    const station = queueStation(queue, role, stationId);
    if (station && rows.some((row) => row.stationId !== station.id)) throw queueError("只能操作 HR 分配给本席位的人员", 403, "queue_station_forbidden");
    if (body.action === "suggestion") {
      await tx.interviewQueueSuggestion.create({ data: queueSuggestion(rows, body, role) });
      return { ok: true };
    }
    const data = queueMutation(rows, body, role);
    if (data.stage) data.stationId = null;
    if (body.action === "requeue") {
      const last = await tx.interviewQueueEntry.findFirst({ where: { queueId, stage: body.targetStage }, orderBy: { phaseEnteredAt: "desc" }, select: { phaseEnteredAt: true } });
      data.phaseEnteredAt = new Date(Math.max(Date.now(), last ? new Date(last.phaseEnteredAt).getTime() + 1 : 0));
    }
    const updatedAt = new Date(Math.max(Date.now(), ...rows.map((row) => new Date(row.updatedAt).getTime() + 1)));
    await tx.interviewQueueEntry.updateMany({ where: { queueId, id: { in: rows.map((row) => row.id) } }, data: { ...data, updatedAt } });
    return { ok: true };
  });
}

export async function deleteQueueEntry(prisma, queueId, entryId, body, role, validateActor = async () => {}) {
  if (!["staff", "hr"].includes(role)) throw queueError("只有 HR 可以删除排队人员", 403, "queue_role_forbidden");
  if (body.confirmed !== true) throw queueError("请确认删除后提交", 400, "queue_confirmation_required");
  return prisma.$transaction(async (tx) => {
    const queue = await tx.interviewQueue.update({ where: { id: queueId }, data: { revision: { increment: 1 } } });
    await validateActor(tx);
    if (!queue.deletionKeyHash) throw queueError("请先在分享给 HR 中设置删除密钥", 403, "queue_deletion_key_not_configured");
    if (!body.deletionKey || !(await bcrypt.compare(body.deletionKey, queue.deletionKeyHash))) throw queueError("删除密钥不正确", 403, "queue_deletion_key_invalid");
    const removed = await tx.interviewQueueEntry.deleteMany({ where: { id: entryId, queueId, updatedAt: new Date(body.updatedAt) } });
    if (removed.count !== 1) throw queueError("人员已更新或已删除，请刷新后重试", 409, "queue_conflict");
    return { ok: true };
  });
}
