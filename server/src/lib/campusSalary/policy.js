import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolveMajor } from "./majors.js";

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

export function classifyMajor(major, role, degree = "硕士", jobRelevance) {
  if (Object.hasOwn(MAJOR_OVERRIDES, major)) return CATEGORIES.includes(MAJOR_OVERRIDES[major]?.category) && MAJOR_OVERRIDES[major]?.basis ? MAJOR_OVERRIDES[major].category : null;
  return resolveMajor(major, { degree, roleType: role, jobRelevance }).category;
}
