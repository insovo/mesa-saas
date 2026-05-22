// MESA Recruit · 设计 / 业务常量
// 迁自 ui_kits/mesa-recruit/data.js 的 window.MESA_STATUS_TONE / HIRE_STAGE_TONE / TASK_STATUS_TONE / INTERVIEW_*
// 这是「设计常量」(不是业务数据,后者来自 /api/*),保留为前端常量。

export const STATUS_ORDER = [
  "待筛选",
  "已沟通",
  "面试中",
  "待定中",
  "待入职",
  "已入职",
  "已淘汰",
];

export const STATUS_TONE = {
  待筛选: { bg: "#F4F7FE", fg: "#707EAE", dot: "#A3AED0" },
  已沟通: { bg: "#DBEAFE", fg: "#1D4ED8", dot: "#3B82F6" },
  面试中: { bg: "#E9E3FF", fg: "#2111A5", dot: "#422AFB" },
  待定中: { bg: "#FEF3C7", fg: "#854D0E", dot: "#EAB308" },
  待入职: { bg: "#FFEDD5", fg: "#9A3412", dot: "#F97316" },
  已入职: { bg: "#DCFCE7", fg: "#15803D", dot: "#22C55E" },
  已淘汰: { bg: "#FEE2E2", fg: "#B91C1C", dot: "#F53939" },
};

export const HIRE_STAGES = ["待入职", "入职准备", "入职当天", "试用期", "已转正", "延期试用", "已离职"];

export const HIRE_STAGE_TONE = {
  待入职: { bg: "#FFEDD5", fg: "#9A3412", dot: "#F97316" },
  入职准备: { bg: "#FEF3C7", fg: "#854D0E", dot: "#EAB308" },
  入职当天: { bg: "#E9E3FF", fg: "#2111A5", dot: "#422AFB" },
  试用期: { bg: "#DBEAFE", fg: "#1D4ED8", dot: "#3B82F6" },
  已转正: { bg: "#DCFCE7", fg: "#15803D", dot: "#22C55E" },
  延期试用: { bg: "#FEF3C7", fg: "#92400E", dot: "#F59E0B" },
  已离职: { bg: "#FEE2E2", fg: "#B91C1C", dot: "#F53939" },
};

export const TASK_STATUS_TONE = {
  已完成: { bg: "#DCFCE7", fg: "#15803D", dot: "#22C55E", icon: "check" },
  进行中: { bg: "#DBEAFE", fg: "#1D4ED8", dot: "#3B82F6", icon: "loader" },
  待开始: { bg: "#F4F7FE", fg: "#707EAE", dot: "#A3AED0", icon: "clock" },
  已逾期: { bg: "#FEE2E2", fg: "#B91C1C", dot: "#F53939", icon: "alert-triangle" },
  不适用: { bg: "#F8F9FA", fg: "#A3AED0", dot: "#CBD5E0", icon: "minus" },
};

export const HIRE_CHECKLIST_KEYS = [
  { key: "offer", label: "Offer 签署", icon: "file-signature" },
  { key: "bgCheck", label: "背景调查", icon: "search-check" },
  { key: "medical", label: "入职体检", icon: "stethoscope" },
  { key: "materials", label: "入职材料", icon: "files" },
  { key: "account", label: "账号开通", icon: "user-check" },
  { key: "equipment", label: "设备发放", icon: "laptop" },
  { key: "training", label: "新员工培训", icon: "graduation-cap" },
];

export const INTERVIEW_ROUNDS = ["初筛", "一面", "二面", "终面", "HR 面", "加面"];

export const INTERVIEW_STATUS_TONE = {
  已安排: { bg: "#DBEAFE", fg: "#1D4ED8", dot: "#3B82F6" },
  已完成: { bg: "#DCFCE7", fg: "#15803D", dot: "#22C55E" },
  已改期: { bg: "#FEF3C7", fg: "#854D0E", dot: "#EAB308" },
  已取消: { bg: "#FEE2E2", fg: "#B91C1C", dot: "#F53939" },
};

export const URGENCY_TONE = {
  high: { bg: "#FEE2E2", fg: "#B91C1C", label: "紧急" },
  mid: { bg: "#FEF3C7", fg: "#854D0E", label: "正常" },
  low: { bg: "#F4F7FE", fg: "#707EAE", label: "可缓" },
};

export const SOURCE_TONE = {
  自动上传: { bg: "#E9E3FF", fg: "#422AFB" },
  内推: { bg: "#DCFCE7", fg: "#15803D" },
  猎头: { bg: "#FEF3C7", fg: "#854D0E" },
  官网: { bg: "#DBEAFE", fg: "#1D4ED8" },
  "BOSS 直聘": { bg: "#FFEDD5", fg: "#9A3412" },
  手动录入: { bg: "#F4F7FE", fg: "#707EAE" },
};
