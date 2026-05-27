// /api/dashboard — 聚合概览统计,首页用。所有计数都接入当前用户的数据范围。

import {
  buildCandidateScopeWhere,
  buildJobScopeWhere,
  buildEmployeeScopeWhere,
  loadUserAccess,
  filterCandidateByModules,
} from "../lib/permissions.js";

export default async function dashboardRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/overview", async (req) => {
    const access = await loadUserAccess(req);
    const candScope = await buildCandidateScopeWhere(req);
    const jobScope = await buildJobScopeWhere(req);
    const empScope = await buildEmployeeScopeWhere(req);

    const interviewScope = !access.isAdmin
      ? (() => {
          const ors = [];
          if (candScope) ors.push({ candidate: candScope });
          if (jobScope) ors.push({ job: jobScope });
          return ors.length > 0 ? { OR: ors } : { id: { in: [] } };
        })()
      : undefined;

    const [
      candidatesTotal,
      jobsTotal,
      employeesTotal,
      interviewsScheduled,
      candidatesByStatus,
      jobsByUrgency,
      employeesByStage,
      recentCandidates,
      upcomingInterviews,
    ] = await Promise.all([
      app.prisma.candidate.count({ where: candScope || undefined }),
      app.prisma.job.count({ where: jobScope || undefined }),
      app.prisma.employee.count({ where: empScope || undefined }),
      app.prisma.interview.count({
        where: interviewScope ? { AND: [{ status: "已安排" }, interviewScope] } : { status: "已安排" },
      }),
      app.prisma.candidate.groupBy({
        by: ["status"],
        _count: { status: true },
        where: candScope || undefined,
      }),
      app.prisma.job.groupBy({
        by: ["urgency"],
        _count: { urgency: true },
        where: jobScope || undefined,
      }),
      app.prisma.employee.groupBy({
        by: ["stage"],
        _count: { stage: true },
        where: empScope || undefined,
      }),
      app.prisma.candidate.findMany({
        where: candScope || undefined,
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true, externalId: true, name: true, avatar: true, school: true,
          appliedFor: true, jdMatch: true, status: true, parser: true, parserConfidence: true,
          tags: true, pushedAt: true, updatedAt: true,
          attachment: true, source: true, createdAt: true,
          jobId: true, departmentId: true,
          phone: true, email: true,
          job: { select: { id: true, title: true, dept: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      }),
      app.prisma.interview.findMany({
        where: interviewScope
          ? { AND: [{ status: "已安排", scheduledAt: { gte: new Date() } }, interviewScope] }
          : { status: "已安排", scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: "asc" },
        take: 6,
      }),
    ]);

    return {
      counts: {
        candidates: candidatesTotal,
        jobs: jobsTotal,
        employees: employeesTotal,
        interviewsScheduled,
      },
      candidatesByStatus: candidatesByStatus.map((r) => ({ status: r.status, count: r._count.status })),
      jobsByUrgency: jobsByUrgency.map((r) => ({ urgency: r.urgency, count: r._count.urgency })),
      employeesByStage: employeesByStage.map((r) => ({ stage: r.stage, count: r._count.stage })),
      recentCandidates: recentCandidates.map((c) => filterCandidateByModules(c, access)),
      upcomingInterviews,
    };
  });
}
