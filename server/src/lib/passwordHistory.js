// 密码历史 — 防止重复使用最近 N 次密码
// 改密成功后调 recordPassword(),改密前调 assertNotReused()。

import bcrypt from "bcryptjs";

export const HISTORY_KEEP = 5;

// 当前 passwordHash + 最近 N 条历史 都不允许复用
export async function assertNotReused(prisma, userId, plainPassword) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (user && (await bcrypt.compare(plainPassword, user.passwordHash))) {
    const err = new Error("password_reused");
    err.statusCode = 422;
    err.code = "password_reused";
    err.message = "新密码不能与当前密码相同";
    throw err;
  }
  const recent = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_KEEP,
    select: { passwordHash: true },
  });
  for (const row of recent) {
    if (await bcrypt.compare(plainPassword, row.passwordHash)) {
      const err = new Error("password_reused");
      err.statusCode = 422;
      err.code = "password_reused";
      err.message = `新密码不能与最近 ${HISTORY_KEEP} 次使用过的密码相同`;
      throw err;
    }
  }
}

// 写入一条 + 修剪只保留 HISTORY_KEEP 条
export async function recordPassword(prisma, userId, passwordHash) {
  await prisma.passwordHistory.create({ data: { userId, passwordHash } });
  // prune
  const ids = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: HISTORY_KEEP,
    select: { id: true },
  });
  if (ids.length > 0) {
    await prisma.passwordHistory.deleteMany({ where: { id: { in: ids.map((r) => r.id) } } });
  }
}
