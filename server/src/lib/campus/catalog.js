export const activeCampusJob = { recruitmentType: "campus", campusActive: true };

export async function catalogTransaction(prisma, run) {
  return prisma.$transaction(async (tx) => {
    // 新建专场和新建岗位必须串行补齐关联，避免同时创建时互相不可见。
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(68421014)`;
    return run(tx);
  }, { timeout: 30000 });
}

export async function attachCatalogToSession(tx, sessionId) {
  const jobs = await tx.job.findMany({ where: activeCampusJob, select: { id: true, campusKind: true, campusMatchEnabled: true, campusSortOrder: true } });
  if (jobs.length) await tx.campusSessionJob.createMany({ data: jobs.map((job) => ({ sessionId, jobId: job.id, kind: job.campusKind, matchEnabled: job.campusMatchEnabled, sortOrder: job.campusSortOrder })), skipDuplicates: true });
}

export async function attachJobToSessions(tx, job) {
  const sessions = await tx.campusSession.findMany({ select: { id: true } });
  if (sessions.length) await tx.campusSessionJob.createMany({ data: sessions.map(({ id }) => ({ sessionId: id, jobId: job.id, kind: job.campusKind, matchEnabled: job.campusMatchEnabled, sortOrder: job.campusSortOrder })), skipDuplicates: true });
}
