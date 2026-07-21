// MESA Recruit · 全站左侧导航项(原 Sidebar ITEMS,上抽供 StaggeredMenu / Layout 共用)
export const NAV_ITEMS = [
  { to: "/dashboard",      label: "概览",       icon: "layout-dashboard", pageKey: "dashboard" },
  { to: "/candidates",     label: "候选人",     icon: "users",            pageKey: "candidates" },
  { to: "/jobs",           label: "岗位",       icon: "briefcase",        pageKey: "jobs" },
  { to: "/upload",         label: "简历收件箱", icon: "upload-cloud",     pageKey: "upload" },
  { to: "/staff",          label: "现有人员",   icon: "users-round",      pageKey: "staff" },
  { to: "/newhire",        label: "入职管理",   icon: "user-plus",        pageKey: "newhire" },
  { to: "/departments",    label: "部门管理",   icon: "building-2",       pageKey: "departments" },
  { to: "/interviews",     label: "面试安排",   icon: "calendar",         pageKey: "interviews" },
  { to: "/performance",    label: "绩效评价",   icon: "clipboard-check",  pageKey: "performance" },
  { to: "/reports",        label: "数据报表",   icon: "bar-chart-3",      pageKey: "reports" },
  { to: "/share-settings", label: "分享设置",   icon: "share-2",          pageKey: "share.settings" },
  { to: "/users",          label: "用户管理",   icon: "shield-check",     pageKey: "users", adminOnly: true },
  { to: "/audit",          label: "审计日志",   icon: "scroll-text",      pageKey: "audit", adminOnly: true },
];
