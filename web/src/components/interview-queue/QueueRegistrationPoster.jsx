import { forwardRef, useId } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QUEUE_POSTER_SIZES, QUEUE_POSTER_LABELS } from "../../lib/queuePosterExport.js";

const QUEUE_RECRUITMENT_FLOW = ["交纸质简历", "登记排队面试", "专业面试", "文化面试", "定薪", "心理综合测评", "发 Offer", "签三方协议"];
const CAMPUS_APPLICATION_FLOW = ["扫码进入专场", "选择投递方式", "查看岗位要求", "上传电子简历", "确认联系信息", "选择意向岗位", "提交岗位投递", "查看投递进度"];
const CONTACT_STEP = ["确认手机号、邮箱与毕业年份", "毕业年份默认 2026，可修改；确认后后台继续处理简历，可稍后返回查看。"];
const UPLOAD_STEP = ["上传电子简历", "选择 PDF 或 Word（DOC／DOCX），文件不超过 20MB；按页面提示确认后上传。"];
const STEPS = [
  ["先将纸质简历交给 HR", "请将纸质简历统一投递到现场 HR 手中。"],
  ["浏览 JD，选择意向岗位登记", "选择现场面试或内推岗位后提交；现场岗位登记排队，内推岗位由相关部门后续联系。"],
  ["现场岗位轮到时，找 HR 领回简历", "由 HR 指派专业面试官，再携带自己的简历前往面试。"],
  ["专业面通过，自动排文化面", "登记后的排队页面可查看：文化面试排队，或待定。"],
  ["文化面通过，等待 HR 联系定薪", "通过后进入定薪阶段；点击「刷新状态」查看进展，请保持联系方式畅通。"],
];
const POSTER_CONTENT = {
  registration: { title: "校园招聘 · 面试排队", subtitle: "先交纸质简历，再扫码登记", qrTitle: "扫码登记 · 选择意向岗位", guideTitle: "登记后怎么走", steps: STEPS },
  professional: {
    title: "专业面试 · 操作指南", subtitle: "扫码进入专业面试工作台", qrTitle: "专业面试官扫码进入", guideTitle: "专业面试官可以做什么", focus: 2,
    steps: [
      ["查看当前人员，开始计时", "每人建议 10 分钟；点击「开始计时」，刷新后继续，满 10 分钟波浪球变红。"],
      ["二次确认专业面试结果", "选择「通过」或「待定」并确认；通过自动进入文化面排队。"],
      ["添加对候选人的建议", "逐人填写并保存建议，后续文化面试官及 HR 可查看已保存的记录。"],
      ["搜索岗位、查看 JD 后修改方向", "点击「修改」可搜索、展开岗位菜单或浏览 JD；选择岗位方向后需二次确认。"],
      ["名单自动同步，查看待定来源", "分配与结果变更后自动更新；待定页可筛选来源，网络异常可点「刷新」重试。"],
    ],
  },
  culture: {
    title: "文化面试 · 操作指南", subtitle: "默认单人面试，勾选后支持群面", qrTitle: "文化面试官扫码进入", guideTitle: "文化面试官可以做什么", focus: 3,
    steps: [
      ["默认单人面试，开始计时", "当前人员可直接计时，每人建议 10 分钟；刷新后继续查看计时。"],
      ["多选或全选，切换群面", "勾选本组人员后共用计时，群面建议 5–10 分钟；可逐人或批量确认结果。"],
      ["二次确认文化面试结果", "通过自动进入定薪；待定自动进入专业、文化、HR 共用的待定页。"],
      ["逐人添加面试建议", "群面时在人员表格中逐人添加建议；保存后保留勾选，后续 HR 可查看。"],
      ["名单自动同步，查看历史建议", "名单与结果自动更新；待定页可筛选来源、查看历史建议，异常时可点击刷新。"],
    ],
  },
  hr: {
    title: "HR 定薪 · 操作指南", subtitle: "处理面试、定薪与内推登记，统一沟通安排", qrTitle: "HR 扫码进入工作台", guideTitle: "HR 可以做什么", focus: 4,
    steps: [
      ["查看汇总，核对阶段与分配状态", "汇总查看全部人员、当前阶段及分配状态；名单与结果自动更新，异常可手动刷新。"],
      ["查看全部定薪人员，单人或批量修改", "基础薪资默认 8700、基数 13.5；可点击「修改定薪」或多选后「批量修改定薪」。"],
      ["确认接受／放弃，逐人添加建议", "只应用勾选字段，二次确认后保存；接受保留定薪页，放弃进入待定，可添加建议。"],
      ["修改岗位方向，待定重新排队", "定薪／待定可搜索岗位并查看 JD；待定重排专业／文化队尾，清除重做结果及计时。"],
      ["按需删除人员，保留校招档案", "须分享人先设置独立删除密钥；每次输入并确认，永久删除本专场排队记录、结果及建议。"],
    ],
  },
  "job-review": {
    title: "校招岗位 · HR 协作", subtitle: "查看 JD、确认面试类型、补充新岗位", qrTitle: "HR 扫码管理校招岗位", guideTitle: "HR 岗位页面操作指南",
    steps: [
      ["查看分享范围内的岗位 JD", "点击岗位名称或「查看 JD 详细要求」，阅读职责、要求与完整福利。"],
      ["搜索岗位，多选或全选", "可逐项勾选岗位，也可全选当前搜索结果；确认已选范围后再操作。"],
      ["确认现场／内推或停止招聘", "核对所选岗位名称后确认类型；停止招聘后不对学生展示，重新标记现场或内推即可恢复。"],
      ["新建 JD，并选择岗位类型", "填写岗位名称、职责、任职要求，选择岗位类型（含停止招聘）；其他信息自动填入。"],
      ["保存后同步全部大学专场", "新岗位加入当前分享范围；链接到期或停止分享后，页面将不能继续操作。"],
    ],
  },
  "campus-home": {
    title: "校园招聘 · 学生入口", subtitle: "扫码进入专场，选择投递或智能匹配", qrTitle: "扫码进入校招专场", guideTitle: "学生页面操作指南", flow: CAMPUS_APPLICATION_FLOW,
    steps: [["选择直接投递或智能匹配", "首页提供两种入口，可先浏览岗位，也可上传简历查看匹配分析。"], UPLOAD_STEP, CONTACT_STEP, ["查看岗位 JD，选择意向岗位", "岗位区分现场面试和内推；查看职责与要求后，按意向点击投递。"], ["返回查看投递与匹配记录", "在本专场查看资料、投递状态与匹配进度；换设备可用手机号和邮箱找回。"]],
    footer: "保存联系方式后可离开，之后返回本专场查看资料与投递进度。",
  },
  "campus-jobs": {
    title: "校园招聘 · 直接投递", subtitle: "查看完整 JD，选择你的意向岗位", qrTitle: "扫码查看岗位并投递", guideTitle: "直接投递操作指南", flow: CAMPUS_APPLICATION_FLOW,
    steps: [["浏览岗位，查看 JD 详细要求", "进入岗位列表，选择岗位阅读职责、任职要求及福利；留意现场面试／内推标记。"], UPLOAD_STEP, CONTACT_STEP, ["回到意向岗位，提交投递", "资料确认后继续选择岗位投递；可投数量以专场页面显示为准。"], ["查看投递状态，保持联系方式畅通", "返回专场查看已投岗位和当前状态；换设备时可用手机号和邮箱找回记录。"]],
    footer: "现场面试与内推岗位均可按意向投递，请留意后续 HR 联系。",
  },
  "campus-match": {
    title: "校园招聘 · 智能匹配", subtitle: "上传简历，查看岗位匹配亮点", qrTitle: "扫码上传简历并匹配", guideTitle: "智能匹配操作指南", flow: CAMPUS_APPLICATION_FLOW,
    steps: [UPLOAD_STEP, CONTACT_STEP, ["查看后台匹配进度", "匹配在后台进行，可先退出；之后回到本专场查看进度和结果。"], ["阅读匹配亮点与岗位 JD", "结合岗位职责、要求与匹配亮点选择意向岗位，也可浏览全部岗位。"], ["按意向提交投递并查看记录", "选择岗位后点击投递，返回本专场查看状态；换设备可用手机号和邮箱找回。"]],
    footer: "智能匹配是否开放以专场页面为准；可返回岗位列表选择意向岗位。",
  },
  "campus-pc": {
    title: "校园招聘 · 电脑上传", subtitle: "电脑浏览器打开链接，上传电子简历", qrTitle: "扫码获取电脑上传入口", guideTitle: "电脑上传操作指南",
    flow: ["打开电脑入口", "填写基本信息", "备注手机号", "选择电子简历", "确认上传成功", "联系现场 HR", "合并学生档案", "继续投递岗位"],
    steps: [["在电脑浏览器打开此链接", "可复制二维码下方链接发送给自己，再在电脑上打开上传页面。"], ["填写姓名与联系方式", "按页面填写本人信息，便于 HR 找到并合并对应的校招档案。"], ["在备注中写明本人手机号", "使用现场登记时的手机号，方便 HR 将电脑上传简历关联到本人记录。"], UPLOAD_STEP, ["上传成功后联系现场 HR", "由 HR 在台账合并电脑端上传，之后继续岗位投递或查看本人的校招记录。"]],
    footer: "请与现场 HR 确认简历已合并到本人校招档案。",
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
  if (kind.startsWith("campus-")) return "请以当前专场开放状态与页面提示为准";
  if (!expiresAt) return kind === "registration" ? "请以现场 HR 提供的最新二维码为准" : "仅密钥限制 · 无固定到期时间";
  return `${kind === "registration" ? "登记" : "分享"}有效至 ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(expiresAt))}（北京时间）`;
}

function TextLines({ text, x, y, width, fontSize, lineHeight, ...props }) {
  return <text x={x} y={y} fontSize={fontSize} {...props}>{wrapText(text, width, fontSize).map((line, index) => <tspan key={index} x={x} dy={index ? lineHeight : 0}>{line}</tspan>)}</text>;
}

const QueueRegistrationPoster = forwardRef(function QueueRegistrationPoster({ sessionName, url, expiresAt, kind = "registration", requireKey = false, format = "portrait", location = "", groupQr = "", cultureOnsite = true, routingEnabled = false, stationName = "", className }, ref) {
  const id = useId().replace(/:/g, "");
  const wide = format === "landscape";
  const content = { ...POSTER_CONTENT[kind], steps: POSTER_CONTENT[kind].steps.map((step) => [...step]) };
  if (kind === "registration") {
    if (routingEnabled) content.steps[2] = ["现场岗位：等 HR 分配并叫号", "按 HR 指定的面试官席位排队；轮到你时领回纸质简历，前往对应席位面试。"];
    content.steps[3] = cultureOnsite ? ["专业面通过，进入文化阶段", routingEnabled ? "由 HR 分配文化席位；点击「刷新状态」查看席位、排队与结果。" : "点击「刷新状态」查看文化面试排队，或待定及其来源。"] : ["专业面通过，等待线上文化面", "本专场无现场文化面试官；等待 HR 联系线上文化面，点击「刷新状态」查看结果。"];
    if (!cultureOnsite) content.steps[4] = ["保持联系方式畅通，留意 HR 通知", "文化面试、定薪及后续流程由 HR 线上联系；换设备可用登记邮箱找回记录。"];
  }
  if (routingEnabled && ["professional", "culture"].includes(kind)) content.steps[0][1] = "仅面试 HR 分配给本席位的人员，按顺序叫号、开始计时；十分钟波浪球满红。";
  if (kind === "professional" && routingEnabled && cultureOnsite) content.steps[1][1] = "选择通过或待定并二次确认；通过后进入文化阶段，由 HR 分配文化面试官。";
  if (kind === "professional" && !cultureOnsite) content.steps[1][1] = "通过后等待 HR 联系线上文化面试；待定转入待定页，结果需二次确认。";
  if (kind === "hr") {
    if (routingEnabled) content.steps[0] = ["待分配页分配，汇总查看或转派", cultureOnsite ? "待分配页多选分配；汇总查看已分配、转派或撤回；流转后重新分配，名单自动更新。" : "待分配页分配专业席位；汇总查看或转派，专业通过后 HR 线上联系后续。"];
    else if (!cultureOnsite) content.steps[0] = ["汇总核对名单，安排线上后续", "汇总查看全部阶段；名单自动更新，无现场文化面时由 HR 线上联系后续。"];
  }
  if (kind === "hr") content.steps[0][1] += " 内推 Tab 查看内推登记。";
  const flow = content.flow || QUEUE_RECRUITMENT_FLOW.map((label, index) => !cultureOnsite && index === 3 ? "线上文化面" : label);
  const { width, height } = QUEUE_POSTER_SIZES[format];
  const margin = wide ? 84 : 72;
  const registration = kind === "registration";
  const dual = registration && Boolean(groupQr);
  let schoolSize = wide ? 40 : 34;
  while (schoolSize > 20 && wrapText(sessionName, width - margin * 2, schoolSize).length > 2) schoolSize -= 2;
  if (!wide && wrapText(sessionName, width - margin * 2, schoolSize).length > 1) schoolSize = Math.min(schoolSize, 28);
  const qr = registration ? wide ? { x: dual ? 122 : 389, y: 430, size: 440 } : { x: dual ? 180 : 500, y: 370, size: dual ? 420 : 440 } : wide ? { x: 169, y: 440, size: 480 } : { x: 500, y: 370, size: 440 };
  const qrCenter = qr.x + qr.size / 2;
  const groupX = wide ? 644 : 840;
  const panelWidth = wide ? registration ? 1050 : 650 : width - margin * 2;
  const panelCenter = margin + panelWidth / 2;
  const guideX = wide ? registration ? 1210 : 800 : margin;
  const address = `现场面试地址：${location || "请向现场 HR 确认"}`;
  let addressSize = wide ? 26 : 28;
  while (addressSize > 16 && wrapText(address, panelWidth - 64, addressSize).length > (wide ? 4 : 3)) addressSize -= 1;
  const followUp = "只要交了纸质简历，如果本次线下没有面试到，后续 HR 会进行线上联系。";
  const referralFollowUp = "内推岗位将安排内推，预计一周左右由相关部门人员联系。";
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className={className} role="img" aria-label={`${sessionName}${QUEUE_POSTER_LABELS[kind]}海报，${wide ? "iPad 横屏版" : "群聊竖版"}`} fontFamily="PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif" fill="#1B254B">
    <title>{sessionName} · {content.title}</title>
    <desc>{content.steps.map(([title, text]) => `${title}：${text}`).join("；")}{registration ? `；${address}；${followUp}；${referralFollowUp}${dual ? "；附加校招群二维码，与登记二维码等大" : ""}` : ""}</desc>
    <defs><linearGradient id={`poster-bg-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#F4F1FF" /><stop offset="1" stopColor="#F6FAFF" /></linearGradient><linearGradient id={`poster-brand-${id}`}><stop stopColor="#7666FF" /><stop offset="1" stopColor="#422AFB" /></linearGradient></defs>
    <rect width={width} height={height} fill={`url(#poster-bg-${id})`} />
    <circle cx={width - 40} cy="-100" r="400" fill="#E7E2FF" opacity="0.7" />
    <rect x={margin} y="48" width="8" height="30" rx="4" fill="#422AFB" />
    <text x={margin + 24} y="71" fontSize="23" fontWeight="700" fill="#6251D8" letterSpacing="3">CAMPUS RECRUITMENT · 校园招聘</text>
    <TextLines text={stationName ? `${sessionName} · ${stationName}` : sessionName} x={margin} y={wide ? 130 : 120} width={width - margin * 2} fontSize={schoolSize} lineHeight={schoolSize + 10} fontWeight="600" fill="#6251D8" />
    <text x={margin} y={wide ? 280 : 255} fontSize={wide ? 86 : 76} fontWeight="800" letterSpacing="1">{content.title}</text>
    <text x={margin} y={wide ? 350 : 318} fontSize="36" fill="#6251D8">{registration ? <>先交<tspan fontSize="48" fontWeight="900" fill="#422AFB" textDecoration="underline">纸质简历</tspan>，再扫码登记</> : content.subtitle}</text>
    <rect x={margin} y={wide ? 398 : 340} width={panelWidth} height={wide ? 750 : registration ? 710 : 620} rx="36" fill="#FFFFFF" />
    <g transform={`translate(${qr.x} ${qr.y})`}><QRCodeSVG value={url} size={qr.size} level="M" marginSize={4} bgColor="#FFFFFF" fgColor="#121827" /></g>
    {dual && <image href={groupQr} x={groupX} y={qr.y} width={qr.size} height={qr.size} preserveAspectRatio="xMidYMid meet" />}
    <text x={qrCenter} y={registration ? wide ? 930 : 848 : wide ? 982 : 862} textAnchor="middle" fontSize={dual ? 30 : 35} fontWeight="700">{dual ? "扫码登记 · 选择意向岗位" : content.qrTitle}</text>
    {dual && <text x={groupX + qr.size / 2} y={wide ? 930 : 848} textAnchor="middle" fontSize="30" fontWeight="700">扫码加入校招群</text>}
    <text x={panelCenter} y={registration ? wide ? 977 : 892 : wide ? 1032 : 909} textAnchor="middle" fontSize="26" fill="#707EAE">{registration ? "无需登录 · 登记后查看面试进度或内推状态" : kind.startsWith("campus-") ? "学生扫码直达 · 无需工作台登录" : requireKey ? "需访问密钥 · 请向分享人获取" : "无需工作台登录 · 请按当前专场操作"}</text>
    <text x={panelCenter} y={registration ? wide ? 1016 : 931 : wide ? 1083 : 944} textAnchor="middle" fontSize={wide ? 21 : 23} fill="#707EAE">{queuePosterExpiry(expiresAt, kind)}</text>
    {registration && <TextLines text={address} x={margin + 32} y={wide ? 1058 : 973} width={panelWidth - 64} fontSize={addressSize} lineHeight={wide ? 26 : 30} fontWeight="600" fill="#422AFB" />}
    <text x={guideX} y={wide ? 430 : registration ? 1095 : 1033} fontSize={wide ? 34 : 40} fontWeight="700">{content.guideTitle}</text>
    {content.steps.map(([title, text], index) => {
      const x = guideX; const y = (wide ? 485 : registration ? 1144 : 1090) + index * (wide ? 133 : registration ? 96 : 116);
      return <g key={title}><circle cx={x + 24} cy={y - 10} r="24" fill={`url(#poster-brand-${id})`} /><text x={x + 24} y={y - 1} textAnchor="middle" fill="#FFFFFF" fontSize="27" fontWeight="700">{index + 1}</text><text x={x + 66} y={y} fontSize={registration ? 30 : wide ? 36 : 34} fontWeight="700">{title}</text><TextLines text={text} x={x + 66} y={y + (registration ? 40 : 44)} width={wide && registration ? 800 : wide ? 1210 : 1220} fontSize={registration ? wide ? 27 : 24 : wide ? 29 : 27} lineHeight={registration ? 32 : 38} fill="#536187" /></g>;
    })}
    {registration && <g><rect x={margin} y={wide ? 1162 : 1618} width={width - margin * 2} height={wide ? 80 : 78} rx="14" fill="#E7E2FF" /><TextLines text={followUp} x={margin + 20} y={wide ? 1192 : 1647} width={width - margin * 2 - 40} fontSize={wide ? 26 : 24} lineHeight="32" fontWeight="600" fill="#493B8B" /><TextLines text={referralFollowUp} x={margin + 20} y={wide ? 1224 : 1679} width={width - margin * 2 - 40} fontSize={wide ? 26 : 24} lineHeight="32" fontWeight="600" fill="#493B8B" /></g>}
    <text x={margin} y={wide ? registration ? 1280 : 1220 : registration ? 1726 : 1712} fontSize="29" fontWeight="700">{content.flow ? "页面操作流程" : registration ? "现场面试完整招聘流程" : "完整招聘流程"}</text>
    {flow.map((label, index) => {
      const columns = wide ? 8 : 4; const gap = wide ? 26 : 28;
      const boxWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
      const column = index % columns; const row = Math.floor(index / columns);
      const x = margin + column * (boxWidth + gap); const y = (wide ? registration ? 1310 : 1250 : registration ? 1744 : 1726) + row * (registration ? 70 : 78);
      const highlighted = kind === "registration" ? index === 2 || index === 3 : index === content.focus;
      return <g key={label}><rect x={x} y={y} width={boxWidth} height={wide ? 60 : 54} rx="16" fill={highlighted ? "#422AFB" : "#FFFFFF"} /><text x={x + boxWidth / 2} y={y + (wide ? 39 : 36)} textAnchor="middle" fontSize="26" fontWeight="600" fill={highlighted ? "#FFFFFF" : "#536187"}>{index + 1} {label}</text>{column < columns - 1 && <text x={x + boxWidth + gap / 2} y={y + (wide ? 39 : 36)} textAnchor="middle" fontSize="25" fill="#8D82D9">›</text>}</g>;
    })}
    <text x={margin} y={wide ? registration ? 1407 : 1382 : 1896} fontSize={wide ? 25 : 23} fill="#707EAE">{content.footer || "心理综合测评、Offer 与三方协议，由 HR 通知后续安排。"}</text>
  </svg>;
});

export default QueueRegistrationPoster;
