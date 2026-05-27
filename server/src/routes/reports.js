// /api/reports — 数据报表聚合
// M2: range 参数化(today/week/month/quarter/year/custom)+ 5 套环比基准 + sparkline 粒度自适应
//     + JD/部门维度 + 下钻列表

// 系统现有候选人状态枚举,对齐 web/src/lib/constants.js STATUS_ORDER
const FUNNEL_MAIN = ["待筛选", "已沟通", "面试中", "待定中", "待入职", "已入职"];
const FUNNEL_BYPASS = ["已淘汰"];
const STATUS_ORDER = [...FUNNEL_MAIN, ...FUNNEL_BYPASS];

// ╔══════════════════════════════════════════════════════════════╗
// ║  时间窗口与对比期计算
// ╚══════════════════════════════════════════════════════════════╝

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d) {
  // 周一为一周的开始
  const x = startOfDay(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - (day - 1));
  return x;
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function resolveRange(query) {
  const now = new Date();
  const range = query.range || "month";
  let start, end, prevStart, prevEnd, label, sparkUnit, sparkBuckets;

  if (range === "today") {
    start = startOfDay(now);
    end = now;
    prevStart = addDays(start, -1);
    prevEnd = addDays(end, -1);
    label = "今日";
    sparkUnit = "hour";
    sparkBuckets = [];
    for (let h = 0; h < 24; h++) {
      const s = new Date(start);
      s.setHours(h, 0, 0, 0);
      const e = new Date(start);
      e.setHours(h + 1, 0, 0, 0);
      sparkBuckets.push({ key: `${h}`.padStart(2, "0"), start: s, end: e, label: `${h}:00` });
    }
  } else if (range === "week") {
    start = startOfWeek(now);
    end = now;
    prevStart = addDays(start, -7);
    prevEnd = addDays(end, -7);
    label = "本周";
    sparkUnit = "day";
    sparkBuckets = [];
    for (let i = 0; i < 7; i++) {
      const s = addDays(start, i);
      const e = addDays(s, 1);
      sparkBuckets.push({
        key: s.toISOString().slice(0, 10),
        start: s,
        end: e,
        label: `${s.getMonth() + 1}/${s.getDate()}`,
      });
    }
  } else if (range === "quarter") {
    start = startOfQuarter(now);
    end = now;
    const daysInPeriod = Math.floor((now - start) / 86400000);
    prevStart = startOfQuarter(addMonths(start, -3));
    prevEnd = addDays(prevStart, daysInPeriod);
    label = "本季度";
    sparkUnit = "week";
    sparkBuckets = [];
    let cursor = start;
    while (cursor < end) {
      const next = addDays(cursor, 7);
      sparkBuckets.push({
        key: cursor.toISOString().slice(0, 10),
        start: cursor,
        end: next > end ? end : next,
        label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      });
      cursor = next;
    }
  } else if (range === "year") {
    start = startOfYear(now);
    end = now;
    prevStart = startOfYear(addMonths(start, -12));
    prevEnd = addMonths(end, -12);
    label = "本年";
    sparkUnit = "month";
    sparkBuckets = [];
    for (let m = 0; m <= now.getMonth(); m++) {
      const s = new Date(now.getFullYear(), m, 1);
      const e = new Date(now.getFullYear(), m + 1, 1);
      sparkBuckets.push({
        key: `${m + 1}`,
        start: s,
        end: e > end ? end : e,
        label: `${m + 1}月`,
      });
    }
  } else if (range === "custom" && query.from && query.to) {
    start = new Date(query.from);
    end = new Date(query.to);
    const ms = end - start;
    prevStart = new Date(start - ms);
    prevEnd = new Date(start);
    label = "自定义";
    const days = ms / 86400000;
    if (days <= 2) sparkUnit = "hour";
    else if (days <= 31) sparkUnit = "day";
    else if (days <= 95) sparkUnit = "week";
    else sparkUnit = "month";
    sparkBuckets = buildBuckets(start, end, sparkUnit);
  } else {
    start = startOfMonth(now);
    end = now;
    const dayOfMonth = now.getDate();
    prevStart = startOfMonth(addMonths(start, -1));
    prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth);
    label = "本月";
    sparkUnit = "day";
    sparkBuckets = [];
    let cursor = start;
    while (cursor <= end) {
      const next = addDays(cursor, 1);
      sparkBuckets.push({
        key: cursor.toISOString().slice(0, 10),
        start: cursor,
        end: next > end ? end : next,
        label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      });
      cursor = next;
    }
  }

  return { label, start, end, prevStart, prevEnd, sparkUnit, sparkBuckets };
}

function buildBuckets(start, end, unit) {
  const out = [];
  let cursor = new Date(start);
  while (cursor < end) {
    let next;
    let label;
    if (unit === "hour") {
      next = new Date(cursor);
      next.setHours(cursor.getHours() + 1, 0, 0, 0);
      label = `${cursor.getHours()}:00`;
    } else if (unit === "day") {
      next = addDays(cursor, 1);
      label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
    } else if (unit === "week") {
      next = addDays(cursor, 7);
      label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
    } else {
      next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      label = `${cursor.getMonth() + 1}月`;
    }
    out.push({
      key: cursor.toISOString().slice(0, unit === "hour" ? 13 : 10),
      start: new Date(cursor),
      end: next > end ? new Date(end) : next,
      label,
    });
    cursor = next;
  }
  return out;
}

function bucketize(records, buckets, dateField = "at") {
  const out = buckets.map((b) => ({ key: b.key, label: b.label, value: 0 }));
  for (const r of records) {
    const t = r[dateField];
    if (!t) continue;
    const ts = new Date(t).getTime();
    for (let i = 0; i < buckets.length; i++) {
      if (ts >= buckets[i].start.getTime() && ts < buckets[i].end.getTime()) {
        out[i].value++;
        break;
      }
    }
  }
  return out;
}

function bucketizeDistinct(records, buckets, dateField, distinctField) {
  const seen = buckets.map(() => new Set());
  for (const r of records) {
    const t = r[dateField];
    if (!t) continue;
    const ts = new Date(t).getTime();
    for (let i = 0; i < buckets.length; i++) {
      if (ts >= buckets[i].start.getTime() && ts < buckets[i].end.getTime()) {
        seen[i].add(r[distinctField]);
        break;
      }
    }
  }
  return buckets.map((b, i) => ({ key: b.key, label: b.label, value: seen[i].size }));
}

function deltaPct(value, prev) {
  if (prev == null || prev === 0) return null;
  return (value - prev) / prev;
}

const QUERY_SCHEMA = {
  type: "object",
  properties: {
    range: { type: "string", enum: ["today", "week", "month", "quarter", "year", "custom"] },
    from: { type: "string", format: "date-time" },
    to: { type: "string", format: "date-time" },
    jobIds: { type: "string" },
    deptIds: { type: "string" },
  },
};

function parseIdList(s) {
  if (!s) return null;
  const arr = s.split(",").map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

function candidateFilter(jobIds, deptIds) {
  const w = {};
  if (jobIds) w.jobId = { in: jobIds };
  if (deptIds) w.departmentId = { in: deptIds };
  return w;
}

function maskPhone(p) {
  if (!p) return null;
  if (p.length < 7) return p;
  return p.slice(0, 3) + "****" + p.slice(-4);
}
function maskEmail(e) {
  if (!e) return null;
  const [u, d] = e.split("@");
  if (!d) return e;
  return u.slice(0, 2) + "***@" + d;
}

export default async function reportsRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  // ────────────────────────────────────────────────────────────
  // GET /api/reports/overview — 5 KPI + 招聘漏斗 + 趋势数据
  // ────────────────────────────────────────────────────────────
  app.get("/overview", { schema: { querystring: QUERY_SCHEMA } }, async (req) => {
    const { start, end, prevStart, prevEnd, label, sparkUnit, sparkBuckets } = resolveRange(req.query);
    const jobIds = parseIdList(req.query.jobIds);
    const deptIds = parseIdList(req.query.deptIds);
    const candFilter = candidateFilter(jobIds, deptIds);

    const [
      currCandidates,
      prevCandidates,
      sparkCandidates,
      activeJobsCount,
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
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: start, lte: end }, ...candFilter },
        select: { id: true, createdAt: true, attachment: true },
      }),
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: prevStart, lte: prevEnd }, ...candFilter },
        select: { id: true, createdAt: true, attachment: true },
      }),
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: sparkBuckets[0]?.start || start, lte: end }, ...candFilter },
        select: { createdAt: true, attachment: true },
      }),
      app.prisma.job.count({
        where: { status: "招聘中", ...(jobIds ? { id: { in: jobIds } } : {}) },
      }),
      app.prisma.interview.findMany({
        where: {
          scheduledAt: { gte: start, lte: end },
          candidateId: { not: null },
          ...(jobIds ? { jobId: { in: jobIds } } : {}),
        },
        select: { candidateId: true, scheduledAt: true },
      }),
      app.prisma.interview.findMany({
        where: {
          scheduledAt: { gte: prevStart, lte: prevEnd },
          candidateId: { not: null },
          ...(jobIds ? { jobId: { in: jobIds } } : {}),
        },
        select: { candidateId: true, scheduledAt: true },
      }),
      app.prisma.interview.findMany({
        where: {
          scheduledAt: { gte: sparkBuckets[0]?.start || start, lte: end },
          candidateId: { not: null },
          ...(jobIds ? { jobId: { in: jobIds } } : {}),
        },
        select: { candidateId: true, scheduledAt: true },
      }),
      app.prisma.employee.findMany({
        where: { actualHireDate: { gte: start, lte: end }, ...(jobIds ? { jobId: { in: jobIds } } : {}) },
        select: { id: true, actualHireDate: true },
      }),
      app.prisma.employee.findMany({
        where: { actualHireDate: { gte: prevStart, lte: prevEnd }, ...(jobIds ? { jobId: { in: jobIds } } : {}) },
        select: { id: true, actualHireDate: true },
      }),
      app.prisma.employee.findMany({
        where: { actualHireDate: { gte: sparkBuckets[0]?.start || start, lte: end }, ...(jobIds ? { jobId: { in: jobIds } } : {}) },
        select: { actualHireDate: true },
      }),
      app.prisma.candidate.groupBy({
        by: ["status"],
        _count: { status: true },
        where: candFilter,
      }),
      app.prisma.job.groupBy({
        by: ["urgency"],
        _count: { urgency: true },
        where: jobIds ? { id: { in: jobIds } } : {},
      }),
      app.prisma.employee.groupBy({
        by: ["stage"],
        _count: { stage: true },
        where: jobIds ? { jobId: { in: jobIds } } : {},
      }),
    ]);

    const newResumesCurr = currCandidates.filter((c) => c.attachment).length;
    const newResumesPrev = prevCandidates.filter((c) => c.attachment).length;
    const candidatesCurr = currCandidates.length;
    const candidatesPrev = prevCandidates.length;
    const interviewingCurr = new Set(currInterviews.map((i) => i.candidateId)).size;
    const interviewingPrev = new Set(prevInterviews.map((i) => i.candidateId)).size;
    const onboardedCurr = currOnboardEmployees.length;
    const onboardedPrev = prevOnboardEmployees.length;

    const kpis = [
      { key: "newResumes", label: "新增简历", value: newResumesCurr, prev: newResumesPrev, delta: deltaPct(newResumesCurr, newResumesPrev),
        sparkline: bucketize(sparkCandidates.filter((c) => c.attachment).map((c) => ({ at: c.createdAt })), sparkBuckets) },
      { key: "candidates", label: "候选人总量", value: candidatesCurr, prev: candidatesPrev, delta: deltaPct(candidatesCurr, candidatesPrev),
        sparkline: bucketize(sparkCandidates.map((c) => ({ at: c.createdAt })), sparkBuckets) },
      { key: "activeJobs", label: "在招岗位", value: activeJobsCount, prev: null, delta: null, sparkline: [] },
      { key: "interviewing", label: "进入面试", value: interviewingCurr, prev: interviewingPrev, delta: deltaPct(interviewingCurr, interviewingPrev),
        sparkline: bucketizeDistinct(sparkInterviews, sparkBuckets, "scheduledAt", "candidateId") },
      { key: "onboarded", label: "成功入职", value: onboardedCurr, prev: onboardedPrev, delta: deltaPct(onboardedCurr, onboardedPrev),
        sparkline: bucketize(sparkOnboardEmployees.map((e) => ({ at: e.actualHireDate })), sparkBuckets) },
    ];

    const statusCount = Object.fromEntries(
      statusGroups.map((r) => [r.status || "待筛选", r._count.status]),
    );
    const main = FUNNEL_MAIN.map((s, i) => {
      const count = statusCount[s] || 0;
      const prevStageCount = i > 0 ? statusCount[FUNNEL_MAIN[i - 1]] || 0 : null;
      return { status: s, count, conversion: i === 0 || !prevStageCount ? null : count / prevStageCount };
    });
    const bypass = FUNNEL_BYPASS.map((s) => ({ status: s, count: statusCount[s] || 0 }));

    return {
      range: { label, start: start.toISOString(), end: end.toISOString(),
        prevStart: prevStart.toISOString(), prevEnd: prevEnd.toISOString(), sparkUnit },
      kpis,
      funnel: { main, bypass },
      candidatesByStatus: STATUS_ORDER.map((s) => ({ status: s, count: statusCount[s] || 0 })),
      jobsByUrgency: jobsByUrgency.map((r) => ({ urgency: r.urgency, count: r._count.urgency })),
      employeesByStage: employeesByStage.map((r) => ({ stage: r.stage, count: r._count.stage })),
    };
  });

  // ────────────────────────────────────────────────────────────
  // GET /api/reports/by-job — JD 维度表格
  // ────────────────────────────────────────────────────────────
  app.get("/by-job", { schema: { querystring: QUERY_SCHEMA } }, async (req) => {
    const { start, end, prevStart, prevEnd } = resolveRange(req.query);
    const deptIds = parseIdList(req.query.deptIds);

    const deptNames = deptIds
      ? (await app.prisma.department.findMany({ where: { id: { in: deptIds } }, select: { name: true } })).map((d) => d.name)
      : null;

    const [jobs, currCands, prevCands] = await Promise.all([
      app.prisma.job.findMany({
        where: { ...(deptNames ? { dept: { in: deptNames } } : {}) },
        select: { id: true, title: true, dept: true, urgency: true, status: true },
      }),
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { id: true, jobId: true, status: true, createdAt: true, updatedAt: true },
      }),
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: prevStart, lte: prevEnd } },
        select: { id: true, jobId: true },
      }),
    ]);

    const items = jobs.map((j) => {
      const cands = currCands.filter((c) => c.jobId === j.id);
      const prevCount = prevCands.filter((c) => c.jobId === j.id).length;
      const byStatus = Object.fromEntries(
        STATUS_ORDER.map((s) => [s, cands.filter((c) => (c.status || "待筛选") === s).length]),
      );
      const advanced = cands.filter((c) => c.status && c.status !== "待筛选");
      const avgDays = advanced.length
        ? advanced.reduce((a, c) => a + (new Date(c.updatedAt) - new Date(c.createdAt)) / 86400000, 0) / advanced.length
        : null;
      return {
        id: j.id, title: j.title, dept: j.dept || "未分配", urgency: j.urgency, status: j.status,
        total: cands.length, prev: prevCount, delta: deltaPct(cands.length, prevCount), byStatus,
        avgDays: avgDays != null ? Math.round(avgDays * 10) / 10 : null,
      };
    });

    return { items: items.sort((a, b) => b.total - a.total) };
  });

  // ────────────────────────────────────────────────────────────
  // GET /api/reports/by-department — 部门维度
  // ────────────────────────────────────────────────────────────
  app.get("/by-department", { schema: { querystring: QUERY_SCHEMA } }, async (req) => {
    const { start, end, prevStart, prevEnd } = resolveRange(req.query);

    const [depts, currCands, prevCands, depJobs, depEmployees] = await Promise.all([
      app.prisma.department.findMany({ select: { id: true, name: true, code: true, head: true, openHc: true, headcount: true } }),
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { id: true, departmentId: true, status: true },
      }),
      app.prisma.candidate.findMany({
        where: { createdAt: { gte: prevStart, lte: prevEnd } },
        select: { id: true, departmentId: true },
      }),
      app.prisma.job.findMany({ where: { status: "招聘中" }, select: { id: true, dept: true } }),
      app.prisma.employee.findMany({
        where: { actualHireDate: { gte: start, lte: end } },
        select: { id: true, jobId: true },
      }),
    ]);

    const items = depts.map((d) => {
      const cands = currCands.filter((c) => c.departmentId === d.id);
      const prevCount = prevCands.filter((c) => c.departmentId === d.id).length;
      const activeJobs = depJobs.filter((j) => j.dept === d.name).length;
      const onboardedThisPeriod = depEmployees.filter((e) => {
        const job = depJobs.find((j) => j.id === e.jobId);
        return job && job.dept === d.name;
      }).length;
      return {
        id: d.id, name: d.name, code: d.code, head: d.head, openHc: d.openHc, headcount: d.headcount,
        total: cands.length, prev: prevCount, delta: deltaPct(cands.length, prevCount), activeJobs, onboarded: onboardedThisPeriod,
      };
    });

    return { items: items.sort((a, b) => b.total - a.total) };
  });

  // ────────────────────────────────────────────────────────────
  // GET /api/reports/drilldown — 维度下钻候选人列表
  // ────────────────────────────────────────────────────────────
  app.get("/drilldown", {
    schema: {
      querystring: {
        ...QUERY_SCHEMA,
        properties: { ...QUERY_SCHEMA.properties, dimension: { type: "string" }, key: { type: "string" } },
      },
    },
  }, async (req) => {
    const { dimension, key } = req.query;
    const { start, end } = resolveRange(req.query);
    let where = {};
    let label = "";

    if (dimension === "kpi") {
      if (key === "newResumes") {
        where = { createdAt: { gte: start, lte: end }, attachment: { not: null } };
        label = `KPI · 新增简历`;
      } else if (key === "candidates") {
        where = { createdAt: { gte: start, lte: end } };
        label = `KPI · 候选人总量`;
      } else if (key === "interviewing") {
        const interviews = await app.prisma.interview.findMany({
          where: { scheduledAt: { gte: start, lte: end }, candidateId: { not: null } },
          select: { candidateId: true },
        });
        const ids = [...new Set(interviews.map((i) => i.candidateId))];
        where = ids.length ? { id: { in: ids } } : { id: "00000000-0000-0000-0000-000000000000" };
        label = `KPI · 进入面试`;
      } else if (key === "onboarded") {
        const emps = await app.prisma.employee.findMany({
          where: { actualHireDate: { gte: start, lte: end } },
          select: { candidateId: true },
        });
        const ids = emps.map((e) => e.candidateId).filter(Boolean);
        where = ids.length ? { id: { in: ids } } : { id: "00000000-0000-0000-0000-000000000000" };
        label = `KPI · 成功入职`;
      } else if (key === "activeJobs") {
        const jobs = await app.prisma.job.findMany({ where: { status: "招聘中" }, select: { id: true } });
        where = { jobId: { in: jobs.map((j) => j.id) } };
        label = `KPI · 在招岗位下的候选人`;
      } else {
        where = { id: "00000000-0000-0000-0000-000000000000" };
      }
    } else if (dimension === "funnel") {
      where = { status: key };
      label = `漏斗 · ${key}`;
    } else if (dimension === "job") {
      where = { jobId: key };
      const j = await app.prisma.job.findUnique({ where: { id: key }, select: { title: true } });
      label = `JD · ${j?.title || key.slice(0, 8)}`;
    } else if (dimension === "dept") {
      where = { departmentId: key };
      const d = await app.prisma.department.findUnique({ where: { id: key }, select: { name: true } });
      label = `部门 · ${d?.name || key.slice(0, 8)}`;
    }

    const items = await app.prisma.candidate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 500,
      include: {
        job: { select: { id: true, title: true, dept: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    });

    return {
      label,
      items: items.map((c) => ({
        id: c.id, name: c.name, avatar: c.avatar,
        phone: maskPhone(c.phone), email: maskEmail(c.email), status: c.status,
        jobTitle: c.job?.title || c.appliedFor || "—",
        deptName: c.department?.name || c.job?.dept || "—",
        enteredAt: c.updatedAt, createdAt: c.createdAt,
      })),
    };
  });
}
