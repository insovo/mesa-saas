const OPTIONS = {
  location: ["芜湖", "合肥", "上海"],
  educationRequirement: ["全日制本科及以上", "全日制硕士及以上", "全日制博士及以上"],
  languageRequirement: ["英语 CET-4", "英语 CET-6", "英语可作为工作语言"],
  nice: ["竞赛获奖", "开源项目经历"],
  benefits: ["六险一金", "海外轮岗机会"],
};

export function appendQuickLine(current, value) {
  const existing = current.split("\n").map((line) => line.replace(/^\s*(?:[-•*]|\d+[.、)])\s*/, "").trim());
  return existing.includes(value) ? current : [current.trimEnd(), value].filter(Boolean).join("\n");
}

export default function JobQuickOptions({ field, value = "", onPick, disabled = false }) {
  const options = OPTIONS[field] || [];
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2" aria-label={`${field}快捷选项`}>
      <span className="text-[11px] text-gray-500">快捷填写</span>
      {options.map((item) => {
        const active = field === "nice" || field === "benefits" ? value.split("\n").some((line) => line.trim() === item) : value === item;
        return <button key={item} type="button" disabled={disabled} onClick={() => onPick(item)} className={`px-2 py-1 rounded-lg text-[11px] border transition disabled:opacity-40 ${active ? "border-brand text-brand bg-lightPrimary" : "border-gray-200 text-gray-600 hover:border-brand/40 hover:text-brand"}`}>{item}</button>;
      })}
    </div>
  );
}
