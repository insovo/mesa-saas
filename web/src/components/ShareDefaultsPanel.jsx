// 分享设置共用组件:有效期/次数 picker + 旧机器人流程停用提示。
// 复用于:候选人详情「分享弹窗」的 Bot tab + 侧边栏「分享设置」独立页。
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

// 旧机器人分享流程已停用；保留组件导出以兼容候选人分享弹窗的入口。
export function BotShareSettings() {
  return <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-navy-700">旧飞书简历入库、JD评分及自动公开分享已停用。请在「校招定薪」配置指定群；群内发简历后自动回显定薪建议、条件情景和待补材料。</div>;
}
