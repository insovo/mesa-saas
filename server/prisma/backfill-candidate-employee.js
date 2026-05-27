// 一次性 backfill: 把 candidate.status='待入职'/'已入职' 但还没关联 employee 的人
// 一次性补建 employee 记录,让 NewHire 列表立即可见。
//
// 跑法 (本地):
//   node prisma/backfill-candidate-employee.js
//
// 跑法 (生产 VPS):
//   docker exec mesa-backend node prisma/backfill-candidate-employee.js
//
// 幂等:已存在 employee 的 candidate 不重复创建(若 stage 不一致仅更新 stage)。

import { PrismaClient } from "@prisma/client";
import {
  candidateToEmployeeData,
  mapStatusToStage,
} from "../src/lib/candidateToEmployee.js";

const prisma = new PrismaClient();

async function main() {
  console.log("[backfill] scanning candidates with status in ('待入职','已入职')...");
  const cands = await prisma.candidate.findMany({
    where: { status: { in: ["待入职", "已入职"] } },
    include: { department: true, employee: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`[backfill] found ${cands.length} candidate(s).`);
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of cands) {
    const target = mapStatusToStage(c.status);
    if (!target) continue;
    try {
      if (c.employee) {
        // 保守策略:已有 employee 一律跳过, 不回退也不修改 stage
        console.log(`  · ${c.name} (${c.id}): employee exists at stage ${c.employee.stage}, skip`);
        skipped++;
      } else {
        const data = candidateToEmployeeData(c);
        if (!data) {
          console.log(`  · ${c.name} (${c.id}): no mapping, skip`);
          skipped++;
          continue;
        }
        await prisma.employee.create({ data });
        console.log(`  + ${c.name} (${c.id}): employee created with stage ${target}`);
        created++;
      }
    } catch (e) {
      console.error(`  ! ${c.name} (${c.id}): ${e.message}`);
      failed++;
    }
  }

  console.log("\n[backfill] done:", { created, skipped, failed, total: cands.length });
}

main()
  .catch((e) => {
    console.error("[backfill] fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
