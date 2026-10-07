// 校招模块共用常量与小工具(后台路由 Phase 0;学生端公开路由 Phase 1 复用)

export const SESSION_STATUS = ["draft", "live", "closed"];
export const JOB_KINDS = ["onsite", "referral"];
export const APP_SOURCES = ["direct", "match", "hr"];
export const APP_STATUS = ["applied", "screening", "onsite_interview", "referred", "passed", "rejected", "withdrawn"];
// 占用投递额度的状态(撤回 / 未通过不占)
export const QUOTA_STATUS = ["applied", "screening", "onsite_interview", "referred", "passed"];

export const ALLOWED_RESUME_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export const RESUME_MAX_SIZE = 20 * 1024 * 1024;

export function maskPhone(p) {
  if (!p) return p;
  const s = String(p);
  return s.length >= 7 ? `${s.slice(0, 3)}****${s.slice(-4)}` : "*".repeat(s.length);
}
export function maskEmail(e) {
  if (!e) return e;
  const [u, d] = String(e).split("@");
  if (!d) return "***";
  return `${u.slice(0, 2)}***@${d}`;
}

// slug:只允许 a-z0-9-,空则随机
export function normalizeSlug(input) {
  const s = String(input || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return s || `s-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePhone(p) {
  return String(p || "").replace(/[\s-]/g, "").trim();
}

// 对学生展示分:下限兜底(设计 §4 规则 7)
export function shownScore(raw, floor) {
  if (raw == null) return null;
  return Math.max(Number(floor) || 0, Number(raw));
}

export function uploadsAllowed(session, applicant) {
  return (session?.maxResumeUploads ?? 3) + (applicant?.extraUploads ?? 0);
}
