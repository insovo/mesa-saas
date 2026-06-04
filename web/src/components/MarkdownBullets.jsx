// 渲染简历事实字段使用的 markdown 无序列表字符串。
// 只支持 - / • / · / * 开头的 bullet,不解析其它 markdown 语法。
// 用 split("\n") + 去 bullet 前缀,每行渲染为带圆点的 li。
export default function MarkdownBullets({ md, bulletColor = "#422AFB", textSize = "text-sm" }) {
  if (typeof md !== "string" || !md.trim()) return null;
  const items = md
    .split("\n")
    .map((l) => l.replace(/^\s*[-•·*]\s+/, "").trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2 mt-3">
      {items.map((it, i) => (
        <li key={i} className={`${textSize} text-[#1B254B] flex items-start gap-2 leading-relaxed`}>
          <span style={{ color: bulletColor }} className="mt-1 shrink-0 font-bold">•</span>
          <span className="whitespace-pre-wrap">{it}</span>
        </li>
      ))}
    </ul>
  );
}
