import { loadUserAccess, hasModule } from "../lib/permissions.js";
import { writeLog } from "../lib/audit.js";
import { explicitLanguageCertificates } from "../lib/profile/derive.js";

const RESULT_OPTIONS = ["淘汰", "通过", "待定"];
export const SUMMARY_COLUMNS = [
  { key: "sequence", label: "序号" },
  { key: "beisenId", label: "北森号" },
  { key: "source", label: "简历来源", filter: true },
  { key: "name", label: "姓名" },
  { key: "gender", label: "性别", options: ["男", "女"], filter: true },
  { key: "jobDirection", label: "岗位方向" },
  { key: "school", label: "毕业学校(全称)" },
  { key: "schoolType", label: "学校类型", options: ["985", "一本", "双一流", "211", "C9", "QS100", "QS300"], filter: true },
  { key: "major", label: "专业名称" },
  { key: "degree", label: "学历", options: ["本科", "硕士", "博士"], filter: true },
  { key: "gradYear", label: "毕业时间", options: ["2026", "2027"], filter: true },
  { key: "englishLevel", label: "英语等级", options: ["CET-4", "CET-6", "雅思", "托福"], filter: true },
  { key: "hrInterviewer", label: "HR面试官", filter: true },
  { key: "hrResult", label: "HR面评价", options: RESULT_OPTIONS, filter: true },
  { key: "professionalInterviewer", label: "专业面试官", filter: true },
  { key: "professionalResult", label: "专面评价", options: RESULT_OPTIONS, filter: true },
  { key: "cultureInterviewer", label: "文化面试官", filter: true },
  { key: "cultureResult", label: "文化面评价", options: RESULT_OPTIONS, filter: true },
  { key: "status", label: "状态", options: ["HR面", "专业面", "文化面", "谈薪中"], filter: true },
  { key: "trackingNumber", label: "邮政单号" },
  { key: "cancellationReason", label: "解约原因" },
  { key: "department", label: "部门", filter: true },
  { key: "base", label: "Base地", options: ["芜湖"], filter: true },
];
const FIELDS = SUMMARY_COLUMNS.filter((column) => column.key !== "sequence");
const FILTERS = FIELDS.filter((column) => column.filter);
const fieldSchema = Object.fromEntries(FIELDS.map(({ key, options }) => [key, {
  type: ["string", "null"], maxLength: key === "cancellationReason" ? 1000 : 500,
  ...(options ? { enum: [...options, "", null] } : {}),
}]));
const querySchema = {
  type: "object", additionalProperties: false,
  properties: {
    q: { type: "string", maxLength: 100 },
    sessionId: { type: "string", format: "uuid" },
    skip: { type: "integer", minimum: 0, default: 0 },
    take: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    ...Object.fromEntries(FILTERS.map(({ key }) => [key, { type: "string", maxLength: 500 }])),
  },
};

export const summaryInclude = {
  session: { select: { name: true } },
  applications: { where: { status: { not: "withdrawn" } }, orderBy: { createdAt: "desc" }, select: { sessionJob: { select: { job: { select: { title: true, dept: true, location: true } } } } } },
  candidate: { select: {
    name: true, gender: true, source: true, appliedFor: true, school: true, major: true, education: true, status: true,
    profile: true, derived: true, languages: true,
    job: { select: { title: true, dept: true, location: true } },
    department: { select: { name: true } },
    employee: { select: { dept: true, workLocation: true, dropReason: true, dropReasonDetail: true } },
    jobRecommendations: { orderBy: { id: "desc" }, take: 1, select: { jobTitle: true } },
    interviews: { orderBy: { createdAt: "desc" }, select: { id: true, category: true, round: true, interviewer: true, interviewers: true, recommendation: true, status: true, createdAt: true } },
    interviewEvaluations: { where: { status: "submitted", deletedAt: null, revokedAt: null }, orderBy: { submittedAt: "desc" }, select: { interviewer: true, recommendation: true, submittedAt: true, interview: { select: { category: true, round: true, status: true } } } },
  } },
};

function stageOf(interview) {
  if (!interview || /取消|cancel/i.test(interview.status || "")) return null;
  const stage = `${interview.category || ""} ${interview.round || ""}`;
  if (/文化/.test(stage)) return "culture";
  if (/\bhr\b|人力/i.test(stage)) return "hr";
  if (/专业|技术|业务/.test(stage)) return "professional";
  return null;
}
function resultOf(value) {
  if (["淘汰", "不建议录用", "不通过", "未通过"].includes(value)) return "淘汰";
  if (["通过", "建议录用", "建议复试"].includes(value)) return "通过";
  if (["待定", "谨慎考虑"].includes(value)) return "待定";
  return "";
}
function names(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((person) => typeof person === "string" ? person : person?.name).filter(Boolean))].join(" / ");
}
function englishLevel(candidate) {
  const languages = [...(Array.isArray(candidate.profile?.languages) ? candidate.profile.languages : []), ...(Array.isArray(candidate.languages) ? candidate.languages : [])];
  const tags = new Set([...(candidate.derived?.certificateTags || []), ...explicitLanguageCertificates(languages.map((language) => ({ ...language, levelRaw: language.levelRaw || language.level }))) ]);
  const exams = languages.flatMap((language) => [language.levelRaw, language.level, ...(language.exams || []).map((exam) => exam.name)]).filter((value) => value && !/未通过|未取得|未考|未获|未提及/.test(value)).join(" ");
  return [tags.has("cert.cet6") ? "CET-6" : tags.has("cert.cet4") ? "CET-4" : "", tags.has("cert.ielts") || /雅思|ielts/i.test(exams) ? "雅思" : "", tags.has("cert.toefl") || /托福|toefl/i.test(exams) ? "托福" : ""].filter(Boolean).join(" / ");
}

export function summaryRow(applicant) {
  const candidate = applicant.candidate || {};
  const jobs = (applicant.applications || []).map((application) => application.sessionJob?.job).filter(Boolean);
  const interviews = (candidate.interviews || []).filter((interview) => stageOf(interview));
  const stage = stageOf(interviews[0]);
  const education = applicant.degree || candidate.education || "";
  const values = {
    beisenId: "", source: candidate.source || applicant.session?.name || "", name: applicant.name || candidate.name || "",
    gender: /^(男|male|m)$/i.test(candidate.gender || "") ? "男" : /^(女|female|f)$/i.test(candidate.gender || "") ? "女" : "",
    jobDirection: candidate.jobRecommendations?.[0]?.jobTitle || candidate.job?.title || candidate.appliedFor || [...new Set(jobs.map((job) => job.title))].join(" / "),
    school: applicant.school || candidate.school || "", schoolType: "", major: applicant.major || candidate.major || "",
    degree: /博士/.test(education) ? "博士" : /硕士|研究生/.test(education) ? "硕士" : /本科|学士/.test(education) ? "本科" : education,
    gradYear: applicant.gradYear == null ? "" : String(applicant.gradYear), englishLevel: englishLevel(candidate),
    hrInterviewer: "", hrResult: "", professionalInterviewer: "", professionalResult: "", cultureInterviewer: "", cultureResult: "",
    status: /谈薪|offer沟通/i.test(candidate.status || "") ? "谈薪中" : ({ hr: "HR面", professional: "专业面", culture: "文化面" }[stage] || ""),
    trackingNumber: "", cancellationReason: candidate.employee?.dropReasonDetail || candidate.employee?.dropReason || "",
    department: candidate.department?.name || candidate.employee?.dept || candidate.job?.dept || jobs[0]?.dept || "",
    base: candidate.employee?.workLocation || candidate.job?.location || jobs[0]?.location || "",
  };
  for (const stage of ["hr", "professional", "culture"]) {
    const interview = interviews.find((item) => stageOf(item) === stage);
    const evaluation = candidate.interviewEvaluations?.find((item) => stageOf(item.interview) === stage);
    values[`${stage}Interviewer`] = evaluation?.interviewer || names(interview?.interviewers) || interview?.interviewer || "";
    values[`${stage}Result`] = evaluation ? resultOf(evaluation.recommendation) : resultOf(interview?.recommendation);
  }
  const manual = applicant.summaryData || {};
  const automaticValues = { ...values };
  for (const { key } of FIELDS) if (typeof manual[key] === "string") values[key] = manual[key];
  return { id: applicant.id, candidateId: applicant.candidateId, sessionId: applicant.sessionId, sessionName: applicant.session?.name || "", updatedAt: applicant.updatedAt, automaticValues, manualFields: FIELDS.filter(({ key }) => typeof manual[key] === "string").map(({ key }) => key), ...values };
}

function filterOptions(rows) {
  return Object.fromEntries(FILTERS.map(({ key, options }) => [key, options || [...new Set(rows.flatMap((row) => key.endsWith("Interviewer") ? row[key].split(" / ") : [row[key]]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"))]));
}
function matches(row, query) {
  if (query.q && !FIELDS.some(({ key }) => row[key].toLowerCase().includes(query.q.trim().toLowerCase()))) return false;
  return FILTERS.every(({ key }) => !query[key] || (key === "englishLevel" || key.endsWith("Interviewer") ? row[key].split(" / ").includes(query[key]) : row[key] === query[key]));
}

export default async function campusSummaryRoutes(app) {
  app.get("/summary", { schema: { querystring: querySchema } }, async (req) => {
    const applicants = await app.prisma.campusApplicant.findMany({
      where: req.query.sessionId ? { sessionId: req.query.sessionId } : {},
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], include: summaryInclude,
    });
    const rows = applicants.map(summaryRow);
    const filtered = rows.filter((row) => matches(row, req.query));
    const skip = req.query.skip;
    const access = await loadUserAccess(req);
    return {
      items: filtered.slice(skip, skip + req.query.take).map((row, index) => ({ ...row, sequence: skip + index + 1 })),
      total: filtered.length, columns: SUMMARY_COLUMNS, options: filterOptions(rows),
      canEdit: access.role !== "CAMPUS_INTERVIEWER" && (access.isAdmin || hasModule(access, "campus.manage") || hasModule(access, "candidate.edit")),
    };
  });

  app.patch("/summary/:id", { schema: { params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } }, body: {
    type: "object", required: ["values", "updatedAt"], additionalProperties: false,
    properties: {
      values: { type: "object", minProperties: 1, additionalProperties: false, properties: fieldSchema },
      updatedAt: { type: "string", format: "date-time" },
    },
  } } }, async (req, reply) => {
    if (!Object.keys(req.body.values).length) return reply.code(400).send({ error: "invalid_summary_fields", message: "请选择要更新的汇总字段" });
    const access = await loadUserAccess(req);
    if (access.role === "CAMPUS_INTERVIEWER" || !(access.isAdmin || hasModule(access, "campus.manage") || hasModule(access, "candidate.edit"))) {
      return reply.code(403).send({ error: "forbidden", message: "无汇总编辑权限" });
    }
    const applicant = await app.prisma.campusApplicant.findUnique({ where: { id: req.params.id } });
    if (!applicant) return reply.code(404).send({ error: "not_found" });
    const summaryData = { ...applicant.summaryData };
    for (const [key, value] of Object.entries(req.body.values)) {
      if (value == null) delete summaryData[key];
      else summaryData[key] = value.trim();
    }
    const saved = await app.prisma.campusApplicant.updateMany({ where: { id: applicant.id, updatedAt: new Date(req.body.updatedAt) }, data: { summaryData } });
    if (!saved.count) return reply.code(409).send({ error: "campus_summary_changed", message: "资料已被更新，请刷新后再编辑" });
    await writeLog(app.prisma, { req, action: "campus.summary.update", entityType: "CampusApplicant", entityId: applicant.id, diff: { fields: Object.keys(req.body.values) } });
    const updated = await app.prisma.campusApplicant.findUnique({ where: { id: applicant.id }, include: summaryInclude });
    return { item: summaryRow(updated) };
  });
}
