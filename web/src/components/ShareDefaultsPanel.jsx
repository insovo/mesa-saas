// 分享设置共用组件:有效期/次数 picker + 飞书 bot 自动分享设置面板。
// 复用于:候选人详情「分享弹窗」的 Bot tab + 侧边栏「分享设置」独立页。

import { useState, useEffect } from "react";
import { I, toast } from "./Primitives.jsx";
import { resources } from "../lib/api.js";

export function DurationPicker({ duration, setDuration, custom, setCustom, showCustom, setShowCustom, PRESETS }) {
  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.v}
            onClick={() => { setDuration(p.v); setShowCustom(false); }}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition border-2
              ${!showCustom && duration === p.v ? "border-[#422AFB] bg-[#E9E3FF] text-[#422AFB]" : "border-[#E9ECEF] hover:border-[#CBD5E0] text-[#707EAE]"}`}
          >
            {p.l}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          className={`px-3 py-2 rounded-lg text-xs font-bold transition border-2
            ${showCustom ? "border-[#422AFB] bg-[#E9E3FF] text-[#422AFB]" : "border-[#E9ECEF] hover:border-[#CBD5E0] text-[#707EAE]"}`}
        >
          自定义
        </button>
      </div>
      {showCustom && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number" min="1"
            value={custom.n}
            onChange={(e) => setCustom({ ...custom, n: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className="flex-1 h-10 rounded-lg border border-[#E9ECEF] px-3 text-sm text-[#1B254B] outline-none focus:border-[#422AFB]"
          />
          <select
            value={custom.unit}
            onChange={(e) => setCustom({ ...custom, unit: e.target.value })}
            className="h-10 rounded-lg border border-[#E9ECEF] px-2 text-sm text-[#1B254B] outline-none focus:border-[#422AFB] bg-white"
          >
            <option value="s">秒</option>
            <option value="m">分钟</option>
            <option value="h">小时</option>
            <option value="d">天</option>
          </select>
          <span className="text-[11px] text-[#A3AED0]">60s ~ 30 天</span>
        </div>
      )}
    </>
  );
}

export function MaxViewsPicker({ maxViewsPreset, setMaxViewsPreset, customMaxViews, setCustomMaxViews }) {
  const PRESETS = [
    { v: "unlimited", l: "不限制 (默认)" },
    { v: "10", l: "10 次" },
    { v: "50", l: "50 次" },
    { v: "100", l: "100 次" },
    { v: "custom", l: "自定义" },
  ];
  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.v}
            onClick={() => setMaxViewsPreset(p.v)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition border-2
              ${maxViewsPreset === p.v ? "border-[#422AFB] bg-[#E9E3FF] text-[#422AFB]" : "border-[#E9ECEF] hover:border-[#CBD5E0] text-[#707EAE]"}`}
          >
            {p.l}
          </button>
        ))}
      </div>
      {maxViewsPreset === "custom" && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number" min="1" max="9999"
            value={customMaxViews}
            onChange={(e) => setCustomMaxViews(Math.max(1, Math.min(9999, parseInt(e.target.value, 10) || 1)))}
            className="flex-1 h-10 rounded-lg border border-[#E9ECEF] px-3 text-sm text-[#1B254B] outline-none focus:border-[#422AFB]"
          />
          <span className="text-[11px] text-[#A3AED0]">次 · 范围 1 ~ 9999</span>
        </div>
      )}
    </>
  );
}

// 飞书 bot 自动分享设置:admin 编「全局策略」(默认+上限/锁),招聘官编「我的偏好」(被全局 clamp,只能更严)
export function BotShareSettings({ open }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duration, setDuration] = useState("30d");
  const [custom, setCustom] = useState({ n: 7, unit: "d" });
  const [showCustom, setShowCustom] = useState(false);
  const [maxViewsPreset, setMaxViewsPreset] = useState("unlimited");
  const [customMaxViews, setCustomMaxViews] = useState(100);
  const [tg, setTg] = useState({ showContact: true, showReviews: true, showResume: true, showAttachments: false, showInterviewEval: true, showInterviewEvalList: false });

  const PRESETS = [
    { v: "1d", l: "1 天" }, { v: "3d", l: "3 天" }, { v: "7d", l: "1 周" },
    { v: "30d", l: "1 个月" }, { v: "forever", l: "无限期" },
  ];

  function applyConfig(cfg) {
    if (!cfg) return;
    const known = ["1d", "3d", "7d", "30d", "forever"];
    if (cfg.duration && known.includes(cfg.duration)) { setDuration(cfg.duration); setShowCustom(false); }
    else if (cfg.duration) { const m = String(cfg.duration).match(/^(\d+)([smhd])$/); if (m) { setCustom({ n: +m[1], unit: m[2] }); setShowCustom(true); } }
    if (cfg.maxViews == null) setMaxViewsPreset("unlimited");
    else if ([10, 50, 100].includes(cfg.maxViews)) setMaxViewsPreset(String(cfg.maxViews));
    else { setMaxViewsPreset("custom"); setCustomMaxViews(cfg.maxViews); }
    setTg({
      showContact: cfg.showContact !== false,
      showReviews: cfg.showReviews !== false,
      showResume: cfg.showResume !== false,
      showAttachments: cfg.showAttachments === true,
      showInterviewEval: cfg.showInterviewEval !== false,
      showInterviewEvalList: cfg.showInterviewEvalList === true,
    });
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    resources.feishuConfig.getShareDefaults()
      .then((d) => { setData(d); applyConfig(d.isAdmin ? (d.global || d.builtin) : (d.mine || d.effective)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const effDuration = () => (showCustom ? `${custom.n}${custom.unit}` : duration);
  const effMaxViews = () => (maxViewsPreset === "unlimited" ? null : maxViewsPreset === "custom" ? Math.max(1, Math.min(9999, customMaxViews | 0)) : parseInt(maxViewsPreset, 10));

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const scope = data.isAdmin ? "global" : "mine";
      const res = await resources.feishuConfig.saveShareDefaults({ scope, duration: effDuration(), maxViews: effMaxViews(), ...tg });
      setData((d) => ({ ...d, [scope]: res.saved, effective: res.effective }));
      toast("已保存", "success");
    } catch (e) { toast(e?.response?.data?.message || e.message || "保存失败", "error"); }
    finally { setSaving(false); }
  }

  if (loading || !data) return <div className="py-10 text-center text-sm text-[#A3AED0]"><I name="loader" size={16} className="animate-spin inline mr-2" />加载中…</div>;

  const isAdmin = data.isAdmin;
  const capCfg = data.global || data.builtin; // 非 admin 的关停来源
  const TOGGLE_META = [
    { k: "showContact", t: "展示联系方式", d: "公开页是否完整展示 phone / email" },
    { k: "showResume", t: "查看原始简历", d: "公开页可下载/查看候选人原始简历文件" },
    { k: "showReviews", t: "显示评论/评价", d: "公开页评价对话模块" },
    { k: "showAttachments", t: "允许上传评论附件", d: "评论表单的附件输入" },
    { k: "showInterviewEval", t: "支持填写面试评价", d: "公开页「填写面试评价」入口" },
    { k: "showInterviewEvalList", t: "展示已有面试评价", d: "公开页列出该候选人已提交的面试评价" },
  ];

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-[#E9E3FF]/50 border border-[#422AFB]/15 text-xs text-[#422AFB] leading-relaxed">
        {isAdmin
          ? "🛡️ 全局策略(对所有人生效):有效期 / 次数为上限,关停的模块任何招聘官都无法开启;招聘官未单独设置时用此处作默认。"
          : "👤 我的偏好:仅作用于机器人分享「我名下」候选人,受管理员全局上限 / 关停约束,只能更严不能突破。"}
      </div>

      <div>
        <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">有效期{isAdmin ? "(上限)" : ""}</p>
        <DurationPicker {...{ duration, setDuration, custom, setCustom, showCustom, setShowCustom, PRESETS }} />
      </div>
      <div>
        <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">访问次数{isAdmin ? "(上限)" : ""}</p>
        <MaxViewsPicker {...{ maxViewsPreset, setMaxViewsPreset, customMaxViews, setCustomMaxViews }} />
      </div>

      <div>
        <p className="text-xs font-bold text-[#707EAE] uppercase mb-2">模块{isAdmin ? "(关停后全员不可开)" : ""}</p>
        <div className="space-y-2">
          {TOGGLE_META.map(({ k, t, d }) => {
            const lockedOff = !isAdmin && capCfg[k] === false;
            const checked = lockedOff ? false : !!tg[k];
            return (
              <label key={k} className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition ${lockedOff ? "border-[#E9ECEF] bg-gray-50 opacity-60 cursor-not-allowed" : "border-[#E9ECEF] hover:border-[#422AFB]/40 cursor-pointer"}`}>
                <input type="checkbox" disabled={lockedOff} checked={checked}
                  onChange={(e) => setTg((s) => ({ ...s, [k]: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded border-[#A3AED0] text-[#422AFB] focus:ring-[#422AFB]" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#1B254B]">{t}{lockedOff && <span className="ml-1 text-[10px] text-red-500 font-normal">· 管理员已关停</span>}</p>
                  <p className="text-[10px] text-[#A3AED0] mt-0.5">{d}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {!isAdmin && data.effective && (
        <div className="p-2.5 rounded-lg bg-gray-50 border border-[#E9ECEF] text-[10px] text-[#707EAE] leading-relaxed">
          实际生效(受管理员约束后):有效期 <b>{data.effective.duration}</b> · 次数 <b>{data.effective.maxViews == null ? "不限" : data.effective.maxViews}</b> · 联系方式 {data.effective.showContact ? "开" : "关"} · 评论 {data.effective.showReviews ? "开" : "关"} · 面试评价 {data.effective.showInterviewEval ? "开" : "关"}
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="w-full py-2.5 rounded-xl bg-[#422AFB] hover:bg-[#3311DB] text-white text-sm font-bold disabled:opacity-60 transition">
        {saving ? "保存中…" : `保存${isAdmin ? "全局策略" : "我的偏好"}`}
      </button>
    </div>
  );
}
