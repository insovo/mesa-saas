// 用户显示名规范化:优先昵称/姓名;没有则取邮箱 @ 前缀(绝不暴露完整邮箱);再没有则「未具名」。
export function toDisplayName(name, emailOrFallback) {
  const n = (name || "").trim();
  if (n) return n;
  const e = (emailOrFallback || "").trim();
  if (e.includes("@")) return e.split("@")[0];
  return e || "未具名";
}

// 批量把 notes 的 authorName 替换成真实姓名(按 authorId 查 User.name)。
// 兼容存量数据:历史备注 authorName 存了邮箱,这里按 authorId 回溯当前用户姓名覆盖。
export async function resolveNoteAuthorNames(prisma, notes) {
  const ids = [...new Set(notes.map((n) => n.authorId).filter(Boolean))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return notes.map((n) => {
    const u = n.authorId ? byId.get(n.authorId) : null;
    return { ...n, authorName: toDisplayName(u?.name, u?.email || n.authorName) };
  });
}
