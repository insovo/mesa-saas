// 把 candidate 字段映射成 employee data,用于 status='待入职'/'已入职' 时
// 自动 upsert employee。映射是 best-effort,HR 可以在员工档案页继续完善。

// candidate.status → employee.stage
export function mapStatusToStage(status) {
  if (status === "已入职") return "入职准备";
  if (status === "待入职") return "待入职";
  return null; // 其他 status 不触发转化
}

// 入参: candidate 对象(可包含 include: { department: true })
// 出参: 用于 prisma.employee.create / update 的 data 对象
export function candidateToEmployeeData(candidate) {
  const stage = mapStatusToStage(candidate.status);
  if (!stage) return null;
  return {
    candidateId: candidate.id,
    name: candidate.name,
    gender: candidate.gender || null,
    animal: candidate.animal || null,
    avatar: candidate.avatar || null,
    education: candidate.education || null,
    school: candidate.school || null,
    major: candidate.major || null,
    age: candidate.age ?? null,
    location: candidate.location || null,
    yearsExp: candidate.yearsExp ?? null,
    phone: candidate.phone || null,
    email: candidate.email || null,
    appliedFor: candidate.appliedFor || null,
    jobId: candidate.jobId || null,
    dept: candidate.department?.name || null,
    workLocation: candidate.location || null,
    jdMatch: candidate.jdMatch ?? null,
    stage,
    source: candidate.source || null,
    parser: candidate.parser || null,
    parserConfidence: candidate.parserConfidence ?? null,
    tags: Array.isArray(candidate.tags) ? candidate.tags : [],
    attachment: candidate.attachment || null,
  };
}
