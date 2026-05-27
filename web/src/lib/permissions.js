// 前端权限工具 — 跟 server/src/lib/permissionKeys.js 同步

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
  "reports",
  "users",
  "system.llm",
  "audit",
]);

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
  "user.manage",
  "system.llm.manage",
]);

// 中文标签 — 给 admin 用户管理页的勾选 UI 用
export const PAGE_LABELS = Object.freeze({
  "dashboard": "概览",
  "candidates": "候选人列表",
  "candidate.detail": "候选人详情",
  "jobs": "岗位",
  "upload": "简历收件箱",
  "staff": "现有人员",
  "newhire": "入职管理",
  "departments": "部门管理",
  "interviews": "面试安排",
  "reports": "数据报表",
  "users": "用户管理",
  "system.llm": "LLM 系统配置",
  "audit": "审计日志",
});

export const MODULE_LABELS = Object.freeze({
  "candidate.contact": "联系方式",
  "candidate.attachments": "附件 / 简历下载",
  "candidate.aiInsights": "AI 洞察 / 风险与亮点",
  "candidate.reviews": "评价对话",
  "candidate.notes": "内部备注",
  "candidate.share": "分享 / 上传链接",
  "candidate.jdMatch": "JD 匹配度",
  "candidate.edit": "编辑候选人",
  "candidate.delete": "删除候选人",
  "job.create": "新建岗位",
  "job.edit": "编辑岗位",
  "job.delete": "删除岗位",
  "department.create": "新建部门",
  "department.edit": "编辑部门",
  "department.delete": "删除部门",
  "user.manage": "用户管理(辅助)",
  "system.llm.manage": "LLM 配置变更",
});

// 模块归类 — 用户管理页面板分组
export const MODULE_GROUPS = Object.freeze([
  {
    label: "候选人详情模块",
    keys: [
      "candidate.contact",
      "candidate.attachments",
      "candidate.aiInsights",
      "candidate.reviews",
      "candidate.notes",
      "candidate.share",
      "candidate.jdMatch",
    ],
  },
  {
    label: "候选人操作",
    keys: ["candidate.edit", "candidate.delete"],
  },
  {
    label: "岗位操作",
    keys: ["job.create", "job.edit", "job.delete"],
  },
  {
    label: "部门操作",
    keys: ["department.create", "department.edit", "department.delete"],
  },
  {
    label: "高级 / 系统",
    keys: ["user.manage", "system.llm.manage"],
  },
]);

export function isAdmin(me) {
  return !!me && (me.role === "ADMIN" || me.isAdmin === true);
}

export function hasPage(me, key) {
  if (!me) return false;
  if (isAdmin(me)) return true;
  return Array.isArray(me.pageKeys) && me.pageKeys.includes(key);
}

export function hasModule(me, key) {
  if (!me) return false;
  if (isAdmin(me)) return true;
  return Array.isArray(me.moduleKeys) && me.moduleKeys.includes(key);
}
