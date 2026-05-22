// /api/dashboard — 聚合概览统计,首页用

export default async function dashboardRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/overview", async () => {
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
      app.prisma.candidate.count(),
      app.prisma.job.count(),
      app.prisma.employee.count(),
      app.prisma.interview.count({ where: { status: "已安排" } }),
      app.prisma.candidate.groupBy({ by: ["status"], _count: { status: true } }),
      app.prisma.job.groupBy({ by: ["urgency"], _count: { urgency: true } }),
      app.prisma.employee.groupBy({ by: ["stage"], _count: { stage: true } }),
      app.prisma.candidate.findMany({
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true, externalId: true, name: true, avatar: true, school: true,
          appliedFor: true, jdMatch: true, status: true, parser: true, parserConfidence: true,
          tags: true, pushedAt: true, updatedAt: true,
        },
      }),
      app.prisma.interview.findMany({
        where: { status: "已安排", scheduledAt: { gte: new Date() } },
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
      recentCandidates,
      upcomingInterviews,
    };
  });
}
