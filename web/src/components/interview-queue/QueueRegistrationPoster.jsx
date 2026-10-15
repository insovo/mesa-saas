import { forwardRef, useId } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QUEUE_POSTER_SIZES, QUEUE_POSTER_LABELS } from "../../lib/queuePosterExport.js";

const QUEUE_RECRUITMENT_FLOW = ["交纸质简历", "登记排队面试", "专业面试", "文化面试", "定薪", "心理综合测评", "发 Offer", "签三方协议"];
const STEPS = [
  ["先将纸质简历交给 HR", "请将纸质简历统一投递到现场 HR 手中。"],
  ["扫码登记，选择意向岗位并排队", "填写面试信息、查看岗位 JD，选择意向岗位后提交；可用登记邮箱找回记录。"],
  ["轮到你时，找 HR 领回简历", "由 HR 指派专业面试官，再携带自己的简历前往面试。"],
  ["专业面通过，自动排文化面", "登记后的排队页面可查看：文化面试排队，或待定。"],
  ["文化面通过，等待 HR 联系定薪", "通过后会进入定薪阶段，请保持联系方式畅通。"],
];
const POSTER_CONTENT = {
  registration: { title: "校园招聘 · 面试排队", subtitle: "先交纸质简历，再扫码登记", qrTitle: "扫码登记 · 选择意向岗位", guideTitle: "现场面试怎么走", steps: STEPS },
  professional: {
    title: "专业面试 · 操作指南", subtitle: "扫码进入专业面试工作台", qrTitle: "专业面试官扫码进入", guideTitle: "专业面试官可以做什么", focus: 2,
    steps: [
      ["查看当前人员，开始计时", "每人建议 10 分钟；点击「开始计时」，刷新后继续，满 10 分钟波浪球变红。"],
      ["二次确认专业面试结果", "选择「通过」或「待定」并确认；通过自动进入文化面排队。"],
      ["添加对候选人的建议", "逐人填写并保存建议，后续文化面试官及 HR 可查看已保存的记录。"],
      ["修改候选人的岗位方向", "在人员资料中点击「修改」，填写或选择岗位方向，二次确认后保存。"],
      ["同步查看全部待定及来源", "待定页同步专业、文化和定薪环节的待定人员，可按「待定环节」筛选。"],
    ],
  },
  culture: {
    title: "文化面试 · 操作指南", subtitle: "默认单人面试，勾选后支持群面", qrTitle: "文化面试官扫码进入", guideTitle: "文化面试官可以做什么", focus: 3,
    steps: [
      ["默认单人面试，开始计时", "当前人员可直接计时，每人建议 10 分钟；刷新后继续查看计时。"],
      ["多选或全选，切换群面", "勾选本组人员后共用计时，群面建议 5–10 分钟；可逐人或批量确认结果。"],
      ["二次确认文化面试结果", "通过自动进入定薪；待定自动进入专业、文化、HR 共用的待定页。"],
      ["逐人添加面试建议", "群面时在人员表格中逐人添加建议；保存后保留勾选，后续 HR 可查看。"],
      ["查看待定来源和历史建议", "待定页可按环节筛选，查看真实面试结果和此前保存的建议。"],
    ],
  },
  hr: {
    title: "HR 定薪 · 操作指南", subtitle: "扫码进入定薪工作台，统一沟通安排", qrTitle: "HR 扫码进入定薪", guideTitle: "HR 可以做什么", focus: 4,
    steps: [
      ["查看全部待定薪人员", "定薪页展示本阶段全部人员，核对学校、岗位、毕业时间与邮箱。"],
      ["调整基础薪资与基数", "默认基础薪资 8700、基数 13.5；点击「修改定薪」，勾选字段后填写数值。"],
      ["多选或全选，统一修改", "勾选人员并点击「批量修改定薪」；只应用勾选字段，二次确认后保存。"],
      ["确认接受或放弃，添加建议", "接受后保留并标记；放弃进入共用待定页。通过「添加建议」记录沟通建议。"],
      ["查看待定来源，安排后续流程", "待定页标明专业、文化或定薪来源；测评、Offer 与三方协议由 HR 通知。"],
    ],
  },
};

function wrapText(text, width, fontSize) {
  const lines = []; let line = ""; let used = 0;
  for (const character of Array.from(text)) {
    const size = /[\u0000-\u00ff]/.test(character) ? fontSize * 0.62 : fontSize;
    if (line && used + size > width) { lines.push(line); line = ""; used = 0; }
    line += character; used += size;
  }
  if (line) lines.push(line);
  return lines;
}

function queuePosterExpiry(expiresAt, kind) {
  if (!expiresAt) return kind === "registration" ? "请以现场 HR 提供的最新二维码为准" : "仅密钥限制 · 无固定到期时间";
  return `${kind === "registration" ? "登记" : "分享"}有效至 ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(expiresAt))}（北京时间）`;
}

function TextLines({ text, x, y, width, fontSize, lineHeight, ...props }) {
  return <text x={x} y={y} fontSize={fontSize} {...props}>{wrapText(text, width, fontSize).map((line, index) => <tspan key={index} x={x} dy={index ? lineHeight : 0}>{line}</tspan>)}</text>;
}

const QueueRegistrationPoster = forwardRef(function QueueRegistrationPoster({ sessionName, url, expiresAt, kind = "registration", requireKey = false, format = "portrait", className }, ref) {
  const id = useId().replace(/:/g, "");
  const wide = format === "landscape";
  const content = POSTER_CONTENT[kind];
  const { width, height } = QUEUE_POSTER_SIZES[format];
  const margin = wide ? 84 : 72;
  let schoolSize = wide ? 40 : 34;
  while (schoolSize > 20 && wrapText(sessionName, width - margin * 2, schoolSize).length > 2) schoolSize -= 2;
  if (!wide && wrapText(sessionName, width - margin * 2, schoolSize).length > 1) schoolSize = Math.min(schoolSize, 28);
  const qr = wide ? { x: 169, y: 440, size: 480 } : { x: 500, y: 370, size: 440 };
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className={className} role="img" aria-label={`${sessionName}${QUEUE_POSTER_LABELS[kind]}海报，${wide ? "iPad 横屏版" : "群聊竖版"}`} fontFamily="PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif" fill="#1B254B">
    <title>{sessionName} · {content.title}</title>
    <desc>{content.steps.map(([title, text]) => `${title}：${text}`).join("；")}</desc>
    <defs><linearGradient id={`poster-bg-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#F4F1FF" /><stop offset="1" stopColor="#F6FAFF" /></linearGradient><linearGradient id={`poster-brand-${id}`}><stop stopColor="#7666FF" /><stop offset="1" stopColor="#422AFB" /></linearGradient></defs>
    <rect width={width} height={height} fill={`url(#poster-bg-${id})`} />
    <circle cx={width - 40} cy="-100" r="400" fill="#E7E2FF" opacity="0.7" />
    <rect x={margin} y="48" width="8" height="30" rx="4" fill="#422AFB" />
    <text x={margin + 24} y="71" fontSize="23" fontWeight="700" fill="#6251D8" letterSpacing="3">CAMPUS RECRUITMENT · 校园招聘</text>
    <TextLines text={sessionName} x={margin} y={wide ? 130 : 120} width={width - margin * 2} fontSize={schoolSize} lineHeight={schoolSize + 10} fontWeight="600" fill="#6251D8" />
    <text x={margin} y={wide ? 280 : 255} fontSize={wide ? 86 : 76} fontWeight="800" letterSpacing="1">{content.title}</text>
    <text x={margin} y={wide ? 350 : 318} fontSize="36" fill="#6251D8">{content.subtitle}</text>
    <rect x={margin} y={wide ? 398 : 340} width={wide ? 650 : width - margin * 2} height={wide ? 750 : 620} rx="36" fill="#FFFFFF" />
    <g transform={`translate(${qr.x} ${qr.y})`}><QRCodeSVG value={url} size={qr.size} level="M" marginSize={4} bgColor="#FFFFFF" fgColor="#121827" /></g>
    <text x={wide ? 409 : 720} y={wide ? 982 : 862} textAnchor="middle" fontSize="35" fontWeight="700">{content.qrTitle}</text>
    <text x={wide ? 409 : 720} y={wide ? 1032 : 909} textAnchor="middle" fontSize="26" fill="#707EAE">{kind === "registration" ? "无需登录 · 登记后可随时查看排队进度" : requireKey ? "需访问密钥 · 请向分享人获取" : "无需工作台登录 · 请按当前专场操作"}</text>
    <text x={wide ? 409 : 720} y={wide ? 1083 : 944} textAnchor="middle" fontSize={wide ? 21 : 23} fill="#707EAE">{queuePosterExpiry(expiresAt, kind)}</text>
    <text x={wide ? 800 : margin} y={wide ? 430 : 1033} fontSize={wide ? 34 : 40} fontWeight="700">{content.guideTitle}</text>
    {content.steps.map(([title, text], index) => {
      const x = wide ? 800 : margin; const y = (wide ? 485 : 1090) + index * (wide ? 133 : 116);
      return <g key={title}><circle cx={x + 24} cy={y - 10} r="24" fill={`url(#poster-brand-${id})`} /><text x={x + 24} y={y - 1} textAnchor="middle" fill="#FFFFFF" fontSize="27" fontWeight="700">{index + 1}</text><text x={x + 66} y={y} fontSize={wide ? 36 : 34} fontWeight="700">{title}</text><TextLines text={text} x={x + 66} y={y + 44} width={wide ? 1210 : 1220} fontSize={wide ? 29 : 27} lineHeight="38" fill="#536187" /></g>;
    })}
    <text x={margin} y={wide ? 1220 : 1712} fontSize="29" fontWeight="700">完整招聘流程</text>
    {QUEUE_RECRUITMENT_FLOW.map((label, index) => {
      const columns = wide ? 8 : 4; const gap = wide ? 26 : 28;
      const boxWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
      const column = index % columns; const row = Math.floor(index / columns);
      const x = margin + column * (boxWidth + gap); const y = (wide ? 1250 : 1726) + row * 78;
      const highlighted = kind === "registration" ? index === 2 || index === 3 : index === content.focus;
      return <g key={label}><rect x={x} y={y} width={boxWidth} height={wide ? 60 : 54} rx="16" fill={highlighted ? "#422AFB" : "#FFFFFF"} /><text x={x + boxWidth / 2} y={y + (wide ? 39 : 36)} textAnchor="middle" fontSize="26" fontWeight="600" fill={highlighted ? "#FFFFFF" : "#536187"}>{index + 1} {label}</text>{column < columns - 1 && <text x={x + boxWidth + gap / 2} y={y + (wide ? 39 : 36)} textAnchor="middle" fontSize="25" fill="#8D82D9">›</text>}</g>;
    })}
    <text x={margin} y={wide ? 1382 : 1896} fontSize={wide ? 25 : 23} fill="#707EAE">心理综合测评、Offer 与三方协议，由 HR 通知后续安排。</text>
  </svg>;
});

export default QueueRegistrationPoster;
