// 权限预设模板 — admin 创建用户时一键套用,UserCreateModal / UserPolicyCard 共用
// 与前端 web/src/lib/policyTemplates.js 保持完全一致

export const POLICY_TEMPLATES = Object.freeze({
  // 招聘官:候选人 + 岗位 + 上传 / 面试 / 报表;能编辑候选人和分享
  RECRUITER: {
    id: "RECRUITER",
    name: "招聘官",
    desc: "候选人 CRUD + 分享 + 上传 + 面试。看不到部门管理 / 用户管理 / 系统配置。",
    pageKeys: [
      "dashboard",
      "candidates",
      "candidate.detail",
      "jobs",
      "upload",
      "staff",
      "newhire",
      "interviews",
      "reports",
    ],
    moduleKeys: [
      "candidate.contact",
      "candidate.attachments",
      "candidate.aiInsights",
      "candidate.reviews",
      "candidate.notes",
      "candidate.share",
      "candidate.jdMatch",
      "candidate.edit",
      "job.edit",
    ],
  },

  // 面试官:看候选人详情 + 评价 + 面试,不能编辑候选人不能分享
  INTERVIEWER: {
    id: "INTERVIEWER",
    name: "面试官",
    desc: "候选人详情只读(含联系方式、AI 洞察)+ 评价对话 + 面试。无编辑/分享/删除。",
    pageKeys: [
      "dashboard",
      "candidates",
      "candidate.detail",
      "jobs",
      "interviews",
    ],
    moduleKeys: [
      "candidate.contact",
      "candidate.aiInsights",
      "candidate.reviews",
      "candidate.notes",
      "candidate.jdMatch",
    ],
  },

  // 只读查看者:只能看,什么都不能改
  VIEWER: {
    id: "VIEWER",
    name: "只读查看者",
    desc: "概览 + 候选人列表只读,无联系方式/附件/AI 洞察。适合管理层 / 第三方观察。",
    pageKeys: [
      "dashboard",
      "candidates",
      "candidate.detail",
      "jobs",
      "reports",
    ],
    moduleKeys: [
      "candidate.aiInsights",
      "candidate.jdMatch",
    ],
  },
});

export const TEMPLATE_IDS = Object.keys(POLICY_TEMPLATES);

export function getTemplate(id) {
  return POLICY_TEMPLATES[id] || null;
}
