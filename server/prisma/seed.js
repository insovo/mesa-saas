// Prisma seed · 仅 admin 用户
// 生产环境运行此脚本是幂等的(upsert),不会破坏现有 admin。
//
// 历史的 12 候选人 / 8 岗位 / 等假数据已拆到 seed-demo.js。
// 当你需要在开发环境塞回 demo 数据时:
//   npm run prisma:seed:demo
//
// ⚠️ 生产环境不要跑 seed-demo,会污染真实数据。

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_ADMIN = {
  email: "admin@mesa.local",
  password: "mesa-dev-2026",
  name: "MESA Admin",
};

async function main() {
  console.log("[seed] ensuring default admin user...");
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
  const admin = await prisma.user.upsert({
    where: { email: DEFAULT_ADMIN.email },
    update: {},  // 已存在则不动密码
    create: {
      email: DEFAULT_ADMIN.email,
      passwordHash,
      name: DEFAULT_ADMIN.name,
      role: "ADMIN",
    },
  });
  console.log(`[seed] admin ready: ${admin.email} (id=${admin.id})`);
  console.log(`[seed] login: ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password}`);
  console.log("[seed] done. (没有 seed 任何业务数据 — 真上线请用这个)");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
