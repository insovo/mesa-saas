// 把 candidate 字段映射成 employee data,用于 status='待入职'/'已入职' 时
// 自动 upsert employee。映射是 best-effort,HR 可以在员工档案页继续完善。

// candidate.status → employee.stage
export function mapStatusToStage(status) {
  if (status === "已入职") return "入职准备";
  if (status === "待入职") return "待入职";
  return null; // 其他 status 不触发转化
}

// 切 JD 后:若对应 employee 还停留在「待入职」(HR 未推进入职流程)就清掉,
// 已经手工推进过(入职准备/入职当天/试用期/已转正/延期试用)的保留,不破坏 HR 数据。
// 与 resumes.js reparse 切 JD 时的清理策略保持完全一致。
export async function cleanupEmployeeOnJobChange(prisma, candidateId, log) {
  try {
    const emp = await prisma.employee.findUnique({ where: { candidateId } });
    if (emp && emp.stage === "待入职") {
      await prisma.employee.delete({ where: { id: emp.id } });
      log?.info?.({ candidateId, empId: emp.id }, "job-change: removed unactivated employee");
    }
  } catch (err) {
    log?.warn?.({ err: err?.message, candidateId }, "job-change: employee cleanup failed");
  }
}

// 候选人状态机:安排面试后是否应该自动推进到「面试中」?
// 仅在 status 还在「面试前」阶段(待筛选/已沟通/null) 才推进;
// 已经在「面试中/待定中/待入职/已入职/已淘汰」的不动(尊重用户/HR 手工选定的状态)。
export function shouldAutoAdvanceToInterviewing(currentStatus) {
  return currentStatus == null || currentStatus === "" || currentStatus === "待筛选" || currentStatus === "已沟通";
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
