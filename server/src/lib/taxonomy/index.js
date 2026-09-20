// 词表(Taxonomy)加载与归一 — 简历 / JD 抽取的 tag 只允许取这里的 id
// LLM prompt 只看到 id + 中文名;同义词(aliases)归一在代码里做,保证确定性。
// 层级:id 用点号("auto.nev" 的父级是 "auto"),ancestors() 让「行业年限」可按祖先聚合。

import { readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
export const KINDS = ["industries", "functions", "domains", "tools", "soft", "languages", "certificates", "majors", "cities", "countries"];

const tables = {};
const aliasIndex = {}; // kind -> Map(normalizedAlias -> id)
const byId = {};       // kind -> Map(id -> entry)

function norm(s) {
  return String(s ?? "").toLowerCase().replace(/[\s\-_/·•.,()（）【】\[\]]+/g, "").trim();
}

for (const kind of KINDS) {
  const rows = JSON.parse(readFileSync(path.join(DIR, `${kind}.json`), "utf8"));
  tables[kind] = rows;
  const idx = new Map();
  const map = new Map();
  for (const r of rows) {
    map.set(r.id, r);
    idx.set(norm(r.id), r.id);
    idx.set(norm(r.name), r.id);
    for (const a of r.aliases || []) if (norm(a)) idx.set(norm(a), r.id);
  }
  aliasIndex[kind] = idx;
  byId[kind] = map;
}

export function list(kind) {
  return tables[kind] || [];
}
export function get(kind, id) {
  return byId[kind]?.get(id) || null;
}
export function isValidId(kind, id) {
  return !!byId[kind]?.has(id);
}

// 任意写法 → 词表 id;映射不上返回 null(调用方决定写 "other:<raw>" 还是丢弃)
export function normalizeTag(kind, raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (byId[kind]?.has(s)) return s;                       // 已是 id
  if (s.startsWith("other:")) return null;
  const idx = aliasIndex[kind];
  const n = norm(s);
  if (idx.has(n)) return idx.get(n);
  // 包含匹配:原文含某别名(别名长度 ≥2,避免 "c" 误命中);取最长别名
  let best = null, bestLen = 0;
  for (const [alias, id] of idx) {
    if (alias.length >= 2 && alias.length > bestLen && n.includes(alias)) { best = id; bestLen = alias.length; }
  }
  return best;
}

// 归一一组 tag:合法 id 保留,别名归一,失败 → "other:<raw>"(保留原文供人工),去重
export function normalizeTags(kind, raws) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(raws) ? raws : []) {
    if (raw == null || raw === "") continue;
    const id = normalizeTag(kind, raw) || `other:${String(raw).trim().slice(0, 40)}`;
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

export function ancestors(id) {
  const out = [];
  const parts = String(id || "").split(".");
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("."));
  return out;
}
// id 是否属于 family(自身或任一祖先在 family 内)
export function inFamily(id, familyIds) {
  if (!id) return false;
  const fam = new Set(Array.isArray(familyIds) ? familyIds : [familyIds]);
  if (fam.has(id)) return true;
  return ancestors(id).some((a) => fam.has(a));
}
export function displayName(kind, id) {
  if (!id) return "";
  if (String(id).startsWith("other:")) return String(id).slice(6);
  return get(kind, id)?.name || id;
}

// 城市归一:返回 { city, country } 或 null
export function normalizeCity(raw) {
  const id = normalizeTag("cities", raw);
  if (!id) return null;
  const c = get("cities", id);
  return { city: c.id, country: c.country };
}
export function normalizeCountry(raw) {
  const id = normalizeTag("countries", raw);
  return id ? get("countries", id) : null;
}
// 判断某地点(城市或国家写法)是否海外(非中国大陆/港澳台)
export function isOverseasLocation(raw) {
  if (!raw) return null;
  const c = normalizeCountry(raw);
  if (c) return c.region !== "china";
  const city = normalizeCity(raw);
  if (city) return !["CN", "HK", "TW", "MO"].includes(city.country);
  if (/海外|国外|overseas|abroad|international/i.test(String(raw))) return true;
  return null;
}
export function regionOfLocation(raw) {
  const c = normalizeCountry(raw);
  if (c) return c.region;
  const city = normalizeCity(raw);
  if (city) return normalizeCountry(city.country)?.region || null;
  return null;
}

// 给 prompt 用的 id 列表(id 中文名,一行一个)
export function promptList(kind, { max = 200 } = {}) {
  return list(kind).slice(0, max).map((r) => `${r.id} ${r.name}`).join("\n");
}
