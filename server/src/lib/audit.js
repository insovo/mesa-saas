// 审计日志 writer — 所有关键变更都应该调 writeLog
// 设计要点:
//   1. 写入是 best-effort — 业务事务里发生失败不应阻塞主流程,所以加 try/catch 兜底
//   2. diff 字段限大小(< 8KB),防止把整个 candidate 序列化进去
//   3. action 命名约定: <entity>.<verb>,例:user.create / share.delete / auth.login_failed

const DIFF_MAX_BYTES = 8 * 1024;

function safeDiff(diff) {
  if (!diff) return {};
  try {
    const json = JSON.stringify(diff);
    if (json.length <= DIFF_MAX_BYTES) return diff;
    return { _truncated: true, preview: json.slice(0, DIFF_MAX_BYTES) };
  } catch {
    return { _serialize_failed: true };
  }
}

// 主写入接口
// req 可选 — 传了会自动抽 actor / ip / userAgent
export async function writeLog(prisma, {
  req = null,
  actorId = null,
  actorEmail = null,
  action,
  entityType = null,
  entityId = null,
  diff = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? req?.user?.sub ?? null,
        actorEmail: actorEmail ?? req?.user?.email ?? null,
        action,
        entityType,
        entityId: entityId != null ? String(entityId) : null,
        diff: safeDiff(diff),
        ip: req?.ip || null,
        userAgent: req?.headers?.["user-agent"]?.slice(0, 400) || null,
      },
    });
  } catch (err) {
    // 仅日志,不抛
    if (req?.log) {
      req.log.warn({ err, action }, "audit log write failed");
    } else {
      console.warn("[audit] write failed", action, err.message);
    }
  }
}

// 限制 list 大小 / 时间窗 / actor filter / action prefix
// 用于 routes/audit.js
export async function listLogs(prisma, { skip = 0, take = 50, action, actorId, entityType, entityId, from, to }) {
  const where = {};
  if (action) where.action = action.endsWith(".") ? { startsWith: action } : action;
  if (actorId) where.actorId = actorId;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = String(entityId);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: Math.min(take, 200) }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, skip, take };
}
