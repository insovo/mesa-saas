// 一次性 backfill: 修两处存量数据问题,零 LLM 成本(只读已存的 aiSummary 文本),可反复跑、幂等:
//   ① 用确定性算法从简报「工作经历」段重算 yearsExp(此前 LLM 心算对资深候选人常填 0/null → 前端误显示「经验 < 1 年」)
//   ② 剔除已解析候选人(aiSummary 非空)残留的「待解析」临时标记(解析完简报都出来了, 这个状态标记本该消失)
//
// 跑法 (本地 dry-run, 只打印不改库):
//   node prisma/backfill-yearsexp.js
// 真正写库:
//   node prisma/backfill-yearsexp.js --apply
// 生产 VPS (容器名 mesa-server, 见 CLAUDE.md 坑 #40):
//   docker exec mesa-server node prisma/backfill-yearsexp.js --apply

import { PrismaClient } from "@prisma/client";
import { yearsFromPeriods, periodsFromSummary } from "../src/lib/kimi.js";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`[backfill-yearsexp] mode = ${APPLY ? "APPLY (写库)" : "DRY-RUN (只打印)"}`);
  const cands = await prisma.candidate.findMany({
    where: { aiSummary: { not: null } }, // aiSummary 非空 = 真被 Kimi 解析过(降级入库不写 aiSummary)
    select: { id: true, name: true, yearsExp: true, aiSummary: true, tags: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`[backfill-yearsexp] scanning ${cands.length} candidate(s) with aiSummary...`);

  let yearsFixed = 0;
  let tagsFixed = 0;
  let untouched = 0;

  for (const c of cands) {
    const data = {};
    // ① yearsExp 重算
    const computed = yearsFromPeriods(periodsFromSummary(c.aiSummary));
    if (computed != null && computed !== c.yearsExp) data.yearsExp = computed;
    // ② 剔除残留「待解析」
    const cleanedTags = Array.isArray(c.tags) ? c.tags.filter((t) => t !== "待解析") : c.tags;
    if (Array.isArray(c.tags) && cleanedTags.length !== c.tags.length) data.tags = cleanedTags;

    if (Object.keys(data).length === 0) { untouched++; continue; }
    const parts = [];
    if ("yearsExp" in data) { parts.push(`yearsExp ${c.yearsExp ?? "null"}→${data.yearsExp}`); yearsFixed++; }
    if ("tags" in data) { parts.push(`去「待解析」`); tagsFixed++; }
    console.log(`  ${c.name} (${c.id}): ${parts.join(" · ")}`);
    if (APPLY) await prisma.candidate.update({ where: { id: c.id }, data });
  }

  console.log("\n[backfill-yearsexp] done:", { yearsFixed, tagsFixed, untouched, total: cands.length });
  if (!APPLY && (yearsFixed || tagsFixed)) console.log("→ 确认无误后加 --apply 真正写库");
}

main()
  .catch((e) => {
    console.error("[backfill-yearsexp] fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
