// 权限 key 常量 — 前后端共用同一字符串。
// 不要在 DB / JWT 里塞此外的 key,以免做权限校验时漏白名单。

// 页面 key — 控制路由可达性 + 侧边栏菜单可见性
export const PAGE_KEYS = Object.freeze([
  "dashboard",
  "candidates",
  "candidate.detail",
  "jobs",
  "upload",
  "staff",
  "newhire",
  "departments",
  "interviews",
  "performance",
  "reports",
  "users",
  "system.llm",
  "share.settings",
  "audit",
]);

// 模块 key — 控制候选人详情 / share / 操作按钮等粒度
export const MODULE_KEYS = Object.freeze([
  "candidate.contact",
  "candidate.attachments",
  "candidate.aiInsights",
  "candidate.reviews",
  "candidate.notes",
  "candidate.share",
  "candidate.jdMatch",
  "candidate.edit",
  "candidate.delete",
  "job.create",
  "job.edit",
  "job.delete",
  "department.create",
  "department.edit",
  "department.delete",
  "employee.delete",
  "interview.delete",
  "user.manage",
  "system.llm.manage",
]);

// 新建普通用户默认页面权限 — 不含 departments/system.llm/users(规划 §三末段)
export const DEFAULT_NEW_USER_PAGE_KEYS = Object.freeze([
  "dashboard",
  "candidates",
  "candidate.detail",
  "jobs",
  "upload",
  "staff",
  "newhire",
  "interviews",
  "performance",
  "reports",
]);

// 新建普通用户默认模块权限 — 不含 attachments/share/delete/admin 类
export const DEFAULT_NEW_USER_MODULE_KEYS = Object.freeze([
  "candidate.contact",
  "candidate.aiInsights",
  "candidate.reviews",
  "candidate.notes",
  "candidate.jdMatch",
  "candidate.edit",
  "job.edit",
]);

// 候选人详情 API 返回字段 → 所需模块 key
// 没该模块时,这些字段会从 API 响应里被剥掉(同时 UI 也不展示)
export const CANDIDATE_FIELD_MODULE_MAP = Object.freeze({
  contact: { module: "candidate.contact", fields: ["phone", "email"] },
  attachments: { module: "candidate.attachments", fields: ["documents", "attachment"] },
  aiInsights: {
    module: "candidate.aiInsights",
    fields: [
      "insights",
      "matchedFor",
      "againstFor",
      "risks",
      "highlights",
      "aiSummary",
      "aiSuggestedTags",
    ],
  },
  jdMatch: { module: "candidate.jdMatch", fields: ["jdMatch"] },
});

export const ALL_PAGE_KEYS_SET = new Set(PAGE_KEYS);
export const ALL_MODULE_KEYS_SET = new Set(MODULE_KEYS);

export function isValidPageKey(k) {
  return ALL_PAGE_KEYS_SET.has(k);
}
export function isValidModuleKey(k) {
  return ALL_MODULE_KEYS_SET.has(k);
}
