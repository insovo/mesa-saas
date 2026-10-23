import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const rawPolicy = process.env.SALARY_POLICY_B64 && !process.env.SALARY_POLICY_B64.startsWith("__") ? Buffer.from(process.env.SALARY_POLICY_B64, "base64").toString("utf8") : process.env.SALARY_POLICY_FILE ? readFileSync(process.env.SALARY_POLICY_FILE, "utf8") : null;
const policy = rawPolicy ? JSON.parse(rawPolicy) : null;
export const POLICY_CONFIGURED = Boolean(policy?.version && policy.monthly && policy.doctor && policy.bonusValues && policy.benefits);
export const POLICY_VERSION = policy?.version || "unconfigured";
export const CATEGORIES = ["standard", "hot", "design", "computer"];
export const CATEGORY_LABELS = { standard: "院校标准", hot: "稀缺/热门", design: "设计", computer: "计算机及AI相关" };
export const TIER_LABELS = { C9: "C9", "985": "985", "211": "211", first: "一本", second: "二本", ordinary: "普通院校" };
export const MONTHLY = policy?.monthly || { nonfirst: {}, first: {} };
export const DOCTOR = policy?.doctor || {};
export const BONUS_VALUES = policy?.bonusValues || {};
export const BENEFITS = policy?.benefits || {};
export const FIELD_LABELS = { regular: "常规工程", key: "重点技术", scarce: "稀缺竞争" };
export const FIELD_DEFINITIONS = policy?.fieldDefinitions || { regular: "研究方向明确的常规领域", key: "政策定义的重点领域", scarce: "政策定义的稀缺领域" };
const c9 = "北京大学 清华大学 复旦大学 上海交通大学 南京大学 浙江大学 中国科学技术大学 哈尔滨工业大学 西安交通大学".split(" ");
const moeSchools = JSON.parse(readFileSync(new URL("./schools.json", import.meta.url), "utf8"));
export const BUILTIN_SCHOOLS = [...moeSchools.filter((s) => !c9.includes(s.name)), ...c9.map((name) => ({ name, tier: "C9", overseas: false, source: "https://jwc.sjtu.edu.cn/info/1026/3492.htm", version: "C9-2026-10-23" }))];
export const SPECIAL_RULES = policy?.specialRules || [];
export const ROLE_LABELS = { general: "一般岗位", battery: "电池岗", language: "高度对口外语岗", design: "造型设计中心", law: "全球法务中心", audit: "审计中心", finance: "全球财经中心", algorithm: "算法岗" };
export const SPECIAL_BONUS_SCHOOLS = policy?.specialBonusSchools || [];
export const MAJOR_OVERRIDES = policy?.majorOverrides || {};
export const POLICY_HASH = createHash("sha256").update(JSON.stringify(policy || {})).digest("hex");

export function salaryRange(value) {
  if (value == null) return { status: "negotiated", min: null, max: null };
  const [min, max] = Array.isArray(value) ? value : [value, value];
  return { status: min === max ? "fixed" : "range", min, max };
}

export function classifyMajor(major, role) {
  if (Object.hasOwn(MAJOR_OVERRIDES, major)) return CATEGORIES.includes(MAJOR_OVERRIDES[major]?.category) && MAJOR_OVERRIDES[major]?.basis ? MAJOR_OVERRIDES[major].category : null;
  if (["计算机科学与技术", "计算机技术", "软件工程", "人工智能", "网络空间安全"].includes(major)) return "computer";
  if (["设计学", "艺术设计", "工业设计", "产品设计", "交通工具设计", "交互设计", "视觉传达设计", "智能交互设计"].includes(major)) return "design";
  // 控制工程属电子信息专业学位领域；学科对应依据：教育部2025年专业领域调整表。
  if (["电子信息", "电子科学与技术", "信息与通信工程", "自动化", "控制科学与工程", "控制工程", "控制理论与控制工程", "检测技术与自动化装置", "系统工程", "模式识别与智能系统", "导航、制导与控制", "数学", "光学工程", "声学", "智能制造工程", "智能车辆工程", "智能感知工程", "新能源材料与器械", "智能材料与结构", "光电信息材料与器件", "未来机器人"].includes(major)) return "hot";
  // 未明确到薪资列的特殊学科保留待确认，不能用未命中字典推导为普通专业。
  if (role === "battery" && ["化学", "应用化学", "能源化学", "化学工程与技术", "化学工程与工艺", "能源化学工程", "材料科学与工程", "材料与化工", "材料物理", "材料化学", "冶金工程"].includes(major)) return null;
  return null;
}
