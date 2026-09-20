// 一次性脚本:把存量候选人的旧评估快照(jdMatch / risks / highlights / insights / matchedFor / againstFor)
// 包成 engine=legacy 的 CandidateEvaluation 行,并回填 Candidate.classification / reviewPriority,
// 让「查看历史评估」与列表分类筛选对老数据也可用。幂等:已有评估记录的候选人跳过。
//
// 用法(生产):docker exec mesa-server node prisma/backfill-evaluations.js
//       本地:node --env-file=.env prisma/backfill-evaluations.js

import { PrismaClient } from "@prisma/client";
import { legacyToEvaluation } from "../src/lib/evaluation/legacyAdapter.js";

const prisma = new PrismaClient();
const thresholds = { A: 85, B: 70, C: 55 };

async function main() {
  const rows = await prisma.candidate.findMany({
    where: { jobId: { not: null }, jdMatch: { not: null }, evaluations: { none: {} } },
    select: { id: true, jobId: true, jdMatch: true, risks: true, highlights: true, insights: true, matchedFor: true, againstFor: true, aiSuggestedTags: true },
  });
  console.log(`[backfill] ${rows.length} candidates with legacy jdMatch and no evaluation rows`);
  let done = 0;
  for (const c of rows) {
    const ev = legacyToEvaluation({ jdMatch: c.jdMatch, risks: c.risks, highlights: c.highlights, insights: c.insights, matchedFor: c.matchedFor, againstFor: c.againstFor, aiSuggestedTags: c.aiSuggestedTags }, { thresholds });
    await prisma.$transaction([
      prisma.candidateEvaluation.create({
        data: {
          candidateId: c.id, jobId: c.jobId, engine: "legacy", isCurrent: true, shadow: false,
          hardFilter: ev.hardFilter, dimensions: ev.dimensions, items: ev.items, overallScore: ev.overallScore,
          classification: ev.classification, reviewPriority: ev.reviewPriority, reasons: [...ev.reasons, "backfill"], flags: ev.flags,
          report: ev.report, reportStatus: "done", versions: { schema: "eval.v1", engine: "legacy", backfill: true }, costs: null,
        },
      }),
      prisma.candidate.update({ where: { id: c.id }, data: { classification: ev.classification, reviewPriority: ev.reviewPriority } }),
    ]);
    done++;
  }
  console.log(`[backfill] done: ${done}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
