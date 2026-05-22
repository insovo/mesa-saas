// 统一处理 "支持 UUID 或 externalId" 的查询条件。
// Prisma 在字段是 @db.Uuid 时,把非 UUID 字符串当 id 查询会直接抛错;
// 这里先用正则判断,避免无谓的异常。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s) {
  return typeof s === "string" && UUID_RE.test(s);
}

// 构造 where 条件: 命中 UUID 走 id,否则走 externalId。
export function whereByIdOrExternal(value) {
  return isUuid(value) ? { id: value } : { externalId: value };
}
