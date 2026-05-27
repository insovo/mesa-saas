// /api/reports — 数据报表聚合
// 一期 MVP:5 KPI(含环比 + sparkline)+ 招聘漏斗(系统现有 6 主阶段 + 1 旁路)
// 时间维度默认本月,后续阶段加 querystring range=today/week/month/quarter/year/custom

// 系统现有候选人状态枚举(对齐 web/src/lib/constants.js STATUS_ORDER)
// 文档要求 7+2 阶段(待筛选→已沟通→已安排面试→面试通过→已发 Offer→待入职→已入职 + 已淘汰/已放弃)
// 系统目前没有"已安排面试/面试通过/已发 Offer/已放弃"细分,用现有 6 主阶段 + 1 旁路
const FUNNEL_MAIN = ["待筛选", "已沟通", "面试中", "待定中", "待入职", "已入职"];
const FUNNEL_BYPASS = ["已淘汰"];
const STATUS_ORDER = [...FUNNEL_MAIN, ...FUNNEL_BYPASS];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// 期内 daily count 聚合(JS 内存,避免 Postgres-specific raw)
// records: [{ at: Date }, ...]
// 返回 [{ day: "YYYY-MM-DD", value: N }, ...] 长度 = days
function dailyBuckets(records, anchorEnd, days) {
  const buckets = new Map();
  const end = startOfDay(anchorEnd);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    buckets.set(k, 0);
  }
  for (const r of records) {
    if (!r.at) continue;
    const k = startOfDay(r.at).toISOString().slice(0, 10);
    if (buckets.has(k)) buckets.set(k, buckets.get(k) + 1);
  }
  return Array.from(buckets, ([day, value]) => ({ day, value }));
}

function deltaPct(value, prev) {
  if (prev == null || prev === 0) return null;
  return (value - prev) / prev;
}

export default async function reportsRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/overview", async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayOfMonth = now.getDate(); // 上月对齐到"上月初 ~ 上月同一日"等长区间
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth);
    const sparkDays = 14;
    const sparkStart = startOfDay(now);
    sparkStart.setDate(sparkStart.getDate() - (sparkDays - 1));

    // === 当期 + 上期所有需要的 raw 集合(JS 聚合,避免多发 SQL)===
    const [
      currCandidates,
      prevCandidates,
      sparkCandidates,
      activeJobs,
      prevActiveJobs,
      currInterviews,
      prevInterviews,
      sparkInterviews,
      currOnboardEmployees,
      prevOnboardEmployees,
      sparkOnboardEmployees,
      statusGroups,
      jobsByUrgency,
      employeesByStage,
    ] = await Promise.all([
      // 当期新增 candidate(含/不含 attachment 各算一份)
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: start, lte: now } },
        select: { id: true, createdAt: true, attachment: true },
      }),
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: prevStart, lte: prevEnd } },
        select: { id: true, createdAt: true, attachment: true },
      }),
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: sparkStart, lte: now } },
        select: { createdAt: true, attachment: true },
      }),
      // 在招岗位快照(不限期)
      app.prisma.job.count({ where: { status: "招聘中" } }),
      // 上期同口径:无法严格回放历史,用"当前快照减去上期之后创建的"近似
      // 简化策略:在招岗位的"环比"取 null(招聘状态没存历史快照,不强算)
      Promise.resolve(null),
      // 当期 / 上期至少有一次面试的 candidateId(distinct)
      app.prisma.interview.findMany({
        where: {
          scheduledAt: { gte: start, lte: now },
          candidateId: { not: null },
        },
        select: { candidateId: true, scheduledAt: true },
      }),
      app.prisma.interview.findMany({
        where: {
          scheduledAt: { gte: prevStart, lte: prevEnd },
          candidateId: { not: null },
        },
        select: { candidateId: true, scheduledAt: true },
      }),
      app.prisma.interview.findMany({
        where: {
          scheduledAt: { gte: sparkStart, lte: now },
          candidateId: { not: null },
        },
        select: { candidateId: true, scheduledAt: true },
      }),
      // 当期 / 上期 / 近 14 天 入职 = employee.actualHireDate(更准确,避免依赖 candidate.status 的 updatedAt)
      app.prisma.employee.findMany({
        where: { actualHireDate: { gte: start, lte: now } },
        select: { id: true, actualHireDate: true },
      }),
      app.prisma.employee.findMany({
        where: { actualHireDate: { gte: prevStart, lte: prevEnd } },
        select: { id: true, actualHireDate: true },
      }),
      app.prisma.employee.findMany({
        where: { actualHireDate: { gte: sparkStart, lte: now } },
        select: { actualHireDate: true },
      }),
      // 漏斗 6 主阶段 + 1 旁路 = 全量快照 GROUP BY status
      app.prisma.candidate.groupBy({ by: ["status"], _count: { status: true } }),
      app.prisma.job.groupBy({ by: ["urgency"], _count: { urgency: true } }),
      app.prisma.employee.groupBy({ by: ["stage"], _count: { stage: true } }),
    ]);

    // === KPI 计算 ===
    const newResumesCurr = currCandidates.filter((c) => c.attachment).length;
    const newResumesPrev = prevCandidates.filter((c) => c.attachment).length;
    const candidatesCurr = currCandidates.length;
    const candidatesPrev = prevCandidates.length;
    const interviewingCurr = new Set(currInterviews.map((i) => i.candidateId)).size;
    const interviewingPrev = new Set(prevInterviews.map((i) => i.candidateId)).size;
    const onboardedCurr = currOnboardEmployees.length;
    const onboardedPrev = prevOnboardEmployees.length;

    // sparkline daily(distinct 处理面试 candidate)
    const interviewSparkRecords = (() => {
      const seenByDay = new Map();
      for (const iv of sparkInterviews) {
        const k = startOfDay(iv.scheduledAt).toISOString().slice(0, 10);
        if (!seenByDay.has(k)) seenByDay.set(k, new Set());
        seenByDay.get(k).add(iv.candidateId);
      }
      return Array.from(seenByDay, ([day, set]) => ({ at: new Date(day), _count: set.size }));
    })();
    const interviewSparkline = (() => {
      const buckets = new Map();
      const end = startOfDay(now);
      for (let i = sparkDays - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      for (const r of interviewSparkRecords) {
        const k = r.at.toISOString().slice(0, 10);
        if (buckets.has(k)) buckets.set(k, r._count);
      }
      return Array.from(buckets, ([day, value]) => ({ day, value }));
    })();

    const kpis = [
      {
        key: "newResumes",
        label: "新增简历",
        value: newResumesCurr,
        prev: newResumesPrev,
        delta: deltaPct(newResumesCurr, newResumesPrev),
        sparkline: dailyBuckets(
          sparkCandidates.filter((c) => c.attachment).map((c) => ({ at: c.createdAt })),
          now,
          sparkDays,
        ),
      },
      {
        key: "candidates",
        label: "候选人总量",
        value: candidatesCurr,
        prev: candidatesPrev,
        delta: deltaPct(candidatesCurr, candidatesPrev),
        sparkline: dailyBuckets(
          sparkCandidates.map((c) => ({ at: c.createdAt })),
          now,
          sparkDays,
        ),
      },
      {
        key: "activeJobs",
        label: "在招岗位",
        value: activeJobs,
        prev: prevActiveJobs,
        delta: null, // 招聘中状态无历史快照,环比留空
        sparkline: [],
      },
      {
        key: "interviewing",
        label: "进入面试",
        value: interviewingCurr,
        prev: interviewingPrev,
        delta: deltaPct(interviewingCurr, interviewingPrev),
        sparkline: interviewSparkline,
      },
      {
        key: "onboarded",
        label: "成功入职",
        value: onboardedCurr,
        prev: onboardedPrev,
        delta: deltaPct(onboardedCurr, onboardedPrev),
        sparkline: dailyBuckets(
          sparkOnboardEmployees.map((e) => ({ at: e.actualHireDate })),
          now,
          sparkDays,
        ),
      },
    ];

    // === 漏斗(全量快照)===
    const statusCount = Object.fromEntries(
      statusGroups.map((r) => [r.status || "待筛选", r._count.status]),
    );
    const main = FUNNEL_MAIN.map((s, i) => {
      const count = statusCount[s] || 0;
      const prevStageCount = i > 0 ? (statusCount[FUNNEL_MAIN[i - 1]] || 0) : null;
      return {
        status: s,
        count,
        conversion: i === 0 || !prevStageCount ? null : count / prevStageCount,
      };
    });
    const bypass = FUNNEL_BYPASS.map((s) => ({ status: s, count: statusCount[s] || 0 }));

    return {
      range: {
        label: "本月",
        start: start.toISOString(),
        end: now.toISOString(),
        prevStart: prevStart.toISOString(),
        prevEnd: prevEnd.toISOString(),
      },
      kpis,
      funnel: { main, bypass },
      // 保留原有分布块以兼容前端
      candidatesByStatus: STATUS_ORDER.map((s) => ({ status: s, count: statusCount[s] || 0 })),
      jobsByUrgency: jobsByUrgency.map((r) => ({ urgency: r.urgency, count: r._count.urgency })),
      employeesByStage: employeesByStage.map((r) => ({ stage: r.stage, count: r._count.stage })),
    };
  });
}
