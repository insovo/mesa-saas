import { createHmac } from "node:crypto";

export async function reconcileResumeVersion(app, submissionId, facts) {
  const secret = process.env.LARK_APP_SECRET;
  const keys = secret && facts.name && !facts.conflicts?.length ? [...new Set([
    ...(facts.identity?.phones || []).map((value) => `phone:${value}`),
    ...(facts.identity?.emails || []).map((value) => `email:${value}`),
  ].map((value) => createHmac("sha256", secret).update(value).digest("hex")))] : [];
  return app.prisma.$transaction(async (tx) => {
    const initial = await tx.salarySubmission.findUniqueOrThrow({ where: { id: submissionId } });
    // 同群的并行识别在短事务中串行归并，防止较慢的旧简历覆盖较新的消息。
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.groupId}))::text`;
    const row = await tx.salarySubmission.findUniqueOrThrow({ where: { id: submissionId } });
    if (row.status === "deleted") return { isCurrent: false, latestId: row.id };
    if (row.supersededById) return { isCurrent: false, latestId: row.supersededById };
    const alternatives = (await tx.salarySubmission.findMany({ where: { groupId: row.groupId, status: { not: "deleted" }, id: { not: row.id }, OR: [
      ...(keys.length ? [{ identityKeys: { hasSome: keys } }] : []), { fileHash: row.fileHash }, ...(facts.name ? [{ facts: { path: ["name"], equals: facts.name } }] : []),
    ] } })).filter((other) => other.facts);
    const matches = alternatives.filter((other) => other.fileHash === row.fileHash || keys.some((key) => other.identityKeys.includes(key)));
    const roots = new Set(matches.map((other) => other.supersededById || other.id));
    const sharedIdentity = matches.every((other) => other.fileHash === row.fileHash) || keys.some((key) => matches.every((other) => other.identityKeys.includes(key)));
    const conflict = matches.some((other) => !facts.name || other.facts?.name !== facts.name) || (roots.size > 1 && !sharedIdentity) || !!facts.conflicts?.length;
    const safe = !conflict && facts.name;
    const duplicateState = conflict ? "conflict" : !keys.length && !matches.length ? "unverified" : alternatives.some((other) => !matches.includes(other)) ? "possible" : "verified";
    await tx.salarySubmission.update({ where: { id: row.id }, data: { identityKeys: keys, duplicateState } });
    if (!safe || !matches.length) return { isCurrent: true, latestId: row.id, identityStatus: duplicateState, supersedes: 0 };
    const linked = await tx.salarySubmission.findMany({ where: { groupId: row.groupId, status: { not: "deleted" }, OR: [{ id: { in: [...roots] } }, { supersededById: { in: [...roots] } }] } });
    const candidates = [...new Map([row, ...matches, ...linked].map((item) => [item.id, item])).values()];
    candidates.sort((a, b) => b.messageCreatedAt - a.messageCreatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    const latest = candidates[0];
    const oldIds = candidates.slice(1).map((item) => item.id);
    // 同一人的新文件重新抽取；不把旧简历事实或上版人工修正悄悄复制到新文件。
    await tx.salarySubmission.updateMany({ where: { id: { in: oldIds } }, data: { supersededById: latest.id, status: "superseded", duplicateState: "verified" } });
    await tx.salarySubmission.update({ where: { id: latest.id }, data: { duplicateState: "verified" } });
    await tx.salaryEvaluation.updateMany({ where: { submissionId: { in: oldIds }, status: { in: ["queued", "running"] } }, data: { status: "superseded" } });
    await tx.salaryEvaluation.updateMany({ where: { submissionId: { in: oldIds }, deliveryStatus: { not: "sent" } }, data: { deliveryStatus: "superseded" } });
    return { isCurrent: latest.id === row.id, latestId: latest.id, identityStatus: "verified", supersedes: oldIds.length };
  });
}
