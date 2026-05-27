// 品牌 logo「Overseas R&D」— 字符级循环动效组件
//
// 两层叠加循环:
//   1. 持续渐变流光 (蓝→紫→紫红→红, 6s linear infinite)
//      通过 .brand-logo class 上的 background-clip:text + brand-shine keyframe
//   2. 每个字符独立的「飞入 → 静止 → 飞出 → 循环」周期 (8s ease-in-out infinite)
//      按字符 index 应用不同初始 transform (rotate / x / y / scale),
//      用 CSS 变量驱动单一 keyframes 公式,避免写 11 个独立 keyframes
//
// enter 参数表与 rc-texty getEnter 函数对齐 (用户参考代码):
//   case 0:       rotate 90 + y -60   → 从左上斜入旋转
//   case 1, 10:   y -60 + x -10       → 从左上滑入
//   case 2, 9:    y -60 + x 20        → 从右上滑入
//   case 3:       y 60                → 从下方升入
//   case 4, 8:    x 30                → 从右侧滑入
//   case 5:       scale 2 (回弹)      → 从大缩回正常
//   case 6:       scale 0.8 + x 30 + y -10  → 从右上方小尺寸放大
//   case 7:       scale 0.8 + x 30 + y 10   → 从右下方小尺寸放大
//   default:      opacity 0           → 纯淡入

const ENTER_DATA = [
  { rotate: 90,  y: -60, scale: 1 },                  // 0
  { y: -60, x: -10, scale: 1 },                       // 1
  { y: -60, x: 20,  scale: 1 },                       // 2
  { y: 60, scale: 1 },                                // 3
  { x: 30, scale: 1 },                                // 4
  { scale: 2 },                                       // 5
  { scale: 0.8, x: 30, y: -10 },                      // 6
  { scale: 0.8, x: 30, y: 10 },                       // 7
  { x: 30, scale: 1 },                                // 8 (=4)
  { y: -60, x: 20, scale: 1 },                        // 9 (=2)
  { y: -60, x: -10, scale: 1 },                       // 10 (=1)
];
const DEFAULT_ENTER = { scale: 1 };

function styleForIndex(i) {
  const e = i < ENTER_DATA.length ? ENTER_DATA[i] : DEFAULT_ENTER;
  return {
    "--brand-x": `${e.x || 0}px`,
    "--brand-y": `${e.y || 0}px`,
    "--brand-rot": `${e.rotate || 0}deg`,
    "--brand-scale": e.scale ?? 1,
    animationDelay: `${i * 40}ms`,
  };
}

// text 拆字符渲染; 空格保留(用 nbsp 撑开宽度); &amp; 直接渲染 R&D 中的 & 符号
function splitChars(text) {
  return Array.from(text).map((ch, i) => (
    <span
      key={`${ch}-${i}`}
      className="brand-char"
      style={styleForIndex(i)}
      aria-hidden={ch === " " ? true : undefined}
    >
      {ch === " " ? " " : ch}
    </span>
  ));
}

/**
 * 品牌 logo 渲染。
 * @param {object} props
 * @param {string} props.text 默认 "Overseas R&D";折叠 sidebar 时传 "O"
 * @param {string} props.size tailwind class 控字号(e.g. "text-[22px] md:text-[24px]")
 * @param {string} props.className 外层 className 透传(字体粗细 / 字距等)
 * @param {object} props.style 外层 inline style 透传(字体族等)
 */
export default function BrandLogo({
  text = "Overseas R&D",
  size = "text-[22px] md:text-[24px]",
  className = "",
  style,
}) {
  return (
    <span
      className={`brand-logo ${size} ${className}`}
      style={style}
      aria-label={text}
    >
      {splitChars(text)}
    </span>
  );
}
