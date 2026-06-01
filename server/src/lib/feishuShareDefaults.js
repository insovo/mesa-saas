// 飞书 bot 自动分享(Phase 4)ShareLink 设置:admin 全局策略(默认+上限/锁) + 单人偏好。
// 生效模型「取更严」:单人偏好被 admin 上限/锁 clamp;单人没设则用 admin 值。
//
// 复用 SystemSetting KV(免迁移):
//   全局 → "feishu.share_defaults"        (仅 admin 可写)
//   单人 → "feishu.share_defaults.u.<uid>" (各招聘官写自己的)

import { getEffective, setOne } from "./settings.js";
import { MODULE_KEYS } from "./permissionKeys.js";

const GLOBAL_KEY = "feishu.share_defaults";
const userKey = (uid) => `feishu.share_defaults.u.${uid}`;

// 内置兜底(admin 未配时的全局默认)。开关语义:true=允许/默认开,false=关停/默认关。
export const BUILTIN_SHARE_DEFAULTS = {
  duration: "30d",          // 60s-30d / forever
  maxViews: null,           // null=不限
  showContact: true,
  showReviews: true,        // 公开页「评价/评论」模块(candidate.reviews)
  showAttachments: false,
  showInterviewEval: true,  // 支持填写面试评价
  showInterviewEvalList: false, // 展示已有面试评价(默认关)
};
const TOGGLES = ["showContact", "showReviews", "showAttachments", "showInterviewEval", "showInterviewEvalList"];

function parse(v) { try { return v ? JSON.parse(v) : null; } catch { return null; } }

function sanitize(o) {
  if (!o || typeof o !== "object") return {};
  const out = {};
  if (typeof o.duration === "string" && /^(\d+\s*[smhd]|forever)$/i.test(o.duration.trim())) {
    out.duration = o.duration.trim();
  }
  if (o.maxViews === null || (Number.isInteger(o.maxViews) && o.maxViews > 0 && o.maxViews <= 9999)) {
    out.maxViews = o.maxViews;
  }
  for (const k of TOGGLES) if (typeof o[k] === "boolean") out[k] = o[k];
  return out;
}

function durationToSeconds(d) {
  if (!d || d === "forever") return Infinity;
  const m = String(d).match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 30 * 86400;
  const n = parseInt(m[1], 10), u = m[2].toLowerCase();
  return u === "s" ? n : u === "m" ? n * 60 : u === "h" ? n * 3600 : n * 86400;
}

export async function getGlobalDefaults() { return parse(await getEffective(GLOBAL_KEY)); }
export async function getUserDefaults(uid) { return uid ? parse(await getEffective(userKey(uid))) : null; }

// 取更严:单人被 admin 上限/锁约束;单人未设字段用 admin 值
export async function getEffectiveShareDefaults(userId) {
  const g = { ...BUILTIN_SHARE_DEFAULTS, ...(await getGlobalDefaults() || {}) };
  const u = (await getUserDefaults(userId)) || {};

  // 有效期:取更短
  const personDur = u.duration || g.duration;
  const duration = durationToSeconds(personDur) <= durationToSeconds(g.duration) ? personDur : g.duration;

  // 访问次数:取更少(null=无限=Infinity)
  const personMax = u.maxViews !== undefined ? u.maxViews : g.maxViews;
  const cap = (x) => (x === null || x === undefined ? Infinity : x);
  const minV = Math.min(cap(personMax), cap(g.maxViews));
  const maxViews = minV === Infinity ? null : minV;

  // 开关:单人想开 AND admin 允许(admin 关停谁都开不了);单人未设用 admin 值
  const tog = (k) => {
    const adminAllow = g[k] !== false;
    const personWant = typeof u[k] === "boolean" ? u[k] : g[k] !== false;
    return adminAllow && personWant;
  };

  return {
    duration,
    maxViews,
    showContact: tog("showContact"),
    showReviews: tog("showReviews"),
    showAttachments: tog("showAttachments"),
    showInterviewEval: tog("showInterviewEval"),
    showInterviewEvalList: tog("showInterviewEvalList"),
  };
}

export async function saveShareDefaults({ scope, userId, value, updatedBy }) {
  const clean = sanitize(value);
  const key = scope === "global" ? GLOBAL_KEY : userKey(userId);
  // 全局存全量(补默认);单人只存所给字段,读时再 clamp
  const toStore = scope === "global" ? { ...BUILTIN_SHARE_DEFAULTS, ...clean } : clean;
  await setOne({ key, value: JSON.stringify(toStore), updatedBy });
  return toStore;
}

export function durationToExpiresAt(duration) {
  const secs = durationToSeconds(duration);
  return secs === Infinity ? null : new Date(Date.now() + secs * 1000);
}

// 生效配置 → ShareLink 创建参数。showReviews=false 时用 allowedModules 排除评论(∩ 创建者权限);
// true 则 allowedModules=[] 全开(等同旧行为)。
export function shareLinkParamsFromDefaults(eff) {
  const allowedModules = eff.showReviews ? [] : MODULE_KEYS.filter((k) => k !== "candidate.reviews");
  return {
    expiresAt: durationToExpiresAt(eff.duration),
    maxViews: eff.maxViews ?? null,
    showContact: eff.showContact,
    showAttachments: eff.showAttachments,
    showInterviewEval: eff.showInterviewEval,
    showInterviewEvalList: eff.showInterviewEvalList,
    allowedModules,
  };
}
