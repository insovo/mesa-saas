// 规则层 — 代码硬筛(纯函数,可单测)
// 只对「机器可判且候选人字段非空」的项判 PASS/FAIL;缺信息 → UNKNOWN(不判死,交 Jev 或人工)。
// 年龄 / 性别永不在此判定(INFO 层)。
//
// 输入:evaluationModel.requirements 里 method=code / code_then_jev 的条目 + candidate { profile, derived }
// 输出:{ result: "PASS"|"FAIL"|"UNKNOWN", items: [{ key,label,tier,field,op,value,candidate,result,reason }] }

import { inFamily } from "../taxonomy/index.js";
import { degreeRankOf, LANGUAGE_LEVEL_RANK } from "../profile/derive.js";

export const CODE_FIELDS = new Set([
  "derived.highestDegree", "derived.highestMajorTag", "derived.totalYears", "derived.industryYears", "derived.domainYears", "derived.functionYears",
  "derived.overseasYears", "derived.managementYears", "derived.maxTeamSize", "derived.languageLevels", "derived.certificateTags", "derived.toolTags",
  "derived.currentCityNorm", "derived.graduationYear", "derived.isFreshGraduate", "derived.overseasDegree", "derived.capabilityTags",
  "profile.intent.acceptTravel", "profile.intent.acceptOverseas", "profile.intent.acceptRelocation", "profile.intent.acceptOvertime",
]);
export const CODE_OPS = new Set([">=", ">", "==", "in", "in_family", "has_all", "has_any", "degree>=", "level>=", "city_in", "year_in"]);

// 从 candidate 取字段值;支持 "derived.industryYears.auto" 这类带子键路径(取词表祖先聚合值)
function getPath(cand, field) {
  const parts = String(field || "").split(".");
  // 前两段是对象路径(derived.industryYears),其后整体是一个 tag 键(可含点号,如 quality.overseas)
  const head = parts.slice(0, 2);
  const tail = parts.slice(2).join(".");
  let cur = cand;
  for (const p of head) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  if (!tail) return cur;
  return cur == null ? undefined : cur[tail];
}
function isEmpty(v) {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
}

// 对单条 code 规则求值 → { result, candidate, reason }
export function evaluateCodeRule(rule, cand) {
  const { field, op, value } = rule || {};
  if (!field || !op || !CODE_OPS.has(op)) return { result: "UNKNOWN", candidate: null, reason: "规则不完整" };
  const base = field.split(".").slice(0, 2).join(".");
  if (!CODE_FIELDS.has(base)) return { result: "UNKNOWN", candidate: null, reason: `字段 ${base} 不在机器可判白名单` };
  const v = getPath(cand, field);

  // 年限类子键缺失 = 候选人没有该行业/领域标签 → 机器视角"未提及"(UNKNOWN),交 Jev 判深度
  if (isEmpty(v) && op !== "==") return { result: "UNKNOWN", candidate: v ?? null, reason: "候选人信息未提及" };

  switch (op) {
    case ">=": return num(v) == null ? unknown(v) : verdict(num(v) >= Number(value), v, `${num(v)} ≥ ${value}`);
    case ">": return num(v) == null ? unknown(v) : verdict(num(v) > Number(value), v, `${num(v)} > ${value}`);
    case "==":
      if (v == null) return unknown(v);
      return verdict(v === value || String(v) === String(value), v, `${String(v)} == ${String(value)}`);
    case "in": return verdict((Array.isArray(value) ? value : [value]).includes(v), v, `${String(v)} ∈ [${[].concat(value).join(",")}]`);
    case "in_family": return verdict(inFamily(v, value), v, `${String(v)} ∈ 族 [${[].concat(value).join(",")}]`);
    case "has_all": {
      const arr = Array.isArray(v) ? v : [];
      const want = [].concat(value);
      const missing = want.filter((w) => !arr.some((x) => inFamily(x, [w])));
      return verdict(missing.length === 0, arr, missing.length ? `缺少 ${missing.join(",")}` : `含 ${want.join(",")}`);
    }
    case "has_any": {
      const arr = Array.isArray(v) ? v : [];
      const want = [].concat(value);
      const hit = want.filter((w) => arr.some((x) => inFamily(x, [w])));
      return verdict(hit.length > 0, arr, hit.length ? `命中 ${hit.join(",")}` : `均未命中 ${want.join(",")}`);
    }
    case "degree>=": {
      const r = degreeRankOf(v), need = degreeRankOf(value);
      if (r <= 0 || need < 0) return unknown(v, "学历为 Other/未识别");
      return verdict(r >= need, v, `${v} vs 要求 ${value}`);
    }
    case "level>=": {
      // v = derived.languageLevels 对象 或 单个等级;rule.lang 指定语言 id(缺省 en)
      const lang = rule.lang || "en";
      const lvl = typeof v === "object" && v !== null ? v[lang] : v;
      if (!lvl) return unknown(null, `未提及 ${lang} 语言等级`);
      const r = LANGUAGE_LEVEL_RANK[lvl] || 0, need = LANGUAGE_LEVEL_RANK[value] || 0;
      return verdict(r >= need, lvl, `${lvl} vs 要求 ${value}`);
    }
    case "city_in": {
      const cities = [].concat(value).filter(Boolean);
      if (!cities.length) return unknown(v, "岗位地点未配置");
      // 地点不一致不判 FAIL(可搬迁),标 MISMATCH 交 Jev「到岗可能」题
      return cities.includes(v) ? { result: "PASS", candidate: v, reason: `现居 ${v}` } : { result: "MISMATCH", candidate: v, reason: `现居 ${v},岗位在 ${cities.join("/")}` };
    }
    case "year_in": return verdict([].concat(value).map(Number).includes(Number(v)), v, `毕业年份 ${v} ∈ [${[].concat(value).join(",")}]`);
    default: return unknown(v);
  }
}
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : (typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null));
const unknown = (v, reason = "候选人信息未提及") => ({ result: "UNKNOWN", candidate: v ?? null, reason });
const verdict = (ok, v, reason) => ({ result: ok ? "PASS" : "FAIL", candidate: v, reason });

// 主入口
export function runHardFilter(evaluationModel, cand) {
  const reqs = Array.isArray(evaluationModel?.requirements) ? evaluationModel.requirements : [];
  const items = [];
  for (const r of reqs) {
    if (!r || r.tier === "INFO" || !r.code) continue;
    if (!["code", "code_then_jev"].includes(r.method)) continue;
    const ev = evaluateCodeRule(r.code, cand);
    let result = ev.result;
    // unknownPolicy=fail 时(HR 显式选择)UNKNOWN → FAIL;默认 review 保持 UNKNOWN
    // unknownPolicy=fail 时(HR 显式选择)UNKNOWN → FAIL;ignore / review / interview 都保持 UNKNOWN(交 Jev 再判,仍未知时由 composite 按策略处理)
    if (result === "UNKNOWN" && r.unknownPolicy === "fail") result = "FAIL";
    items.push({ key: r.key, label: r.label, tier: r.tier, method: r.method, field: r.code.field, op: r.code.op, value: r.code.value, candidate: ev.candidate, result, reason: ev.reason });
  }
  // 硬性结论只看 MUST 项:任一 FAIL → FAIL;有 UNKNOWN → UNKNOWN;否则 PASS
  const must = items.filter((i) => i.tier === "MUST");
  const result = must.some((i) => i.result === "FAIL") ? "FAIL" : must.some((i) => i.result === "UNKNOWN") ? "UNKNOWN" : "PASS";
  return { result, items };
}
