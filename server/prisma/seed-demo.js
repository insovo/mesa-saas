// Prisma seed (demo 数据) · 12 候选人 + 8 岗位 + 8 部门 + 6 员工 + 5 面试
//
// ⚠️ 不要在生产环境跑这个 — 会污染真实数据!
// 仅用于:
//   1. 本地开发想快速看 UI 效果
//   2. 临时演示给客户
//   3. 端到端测试需要数据
//
// 运行: npm run prisma:seed:demo
// 前置: seed.js 必须先跑过(把 admin 用户建好),demo 数据会挂在 admin 名下

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 字段映射 ui_kits/mesa-recruit/data.js 的 window.MESA_CANDIDATES。
const CANDIDATES_SAMPLE = [
  {
    externalId: "c-001", name: "郝福强", gender: "male", animal: "dog",
    education: "硕士", school: "合肥工业大学", major: "工业工程", age: 41,
    location: "安徽·合肥", yearsExp: 19, phone: "134-8570-6423", email: "9659478@qq.com",
    appliedFor: "海外产品质量", jdMatch: 85, status: "面试中", source: "自动上传",
    pushedAt: new Date("2026-03-01"), parser: "Kimi", parserConfidence: 92,
    tags: ["海外项目", "焊接工艺", "PMP", "8D/FMEA"],
    skills: ["9 年车身焊接工艺工程经验", "6 年海外项目开发与管理经验(巴西 / 中东 / 韩国)", "熟练应用 CATIA、CAPP、SOLID3000", "PMP 项目管理课程"],
    risks: ["邮箱为 QQ 邮箱", "工作年限 19 年但仅 3 段单位"],
    highlights: ["江淮+吉利+蔚来产业链经验", "稀缺海外项目经验"],
    experience: [
      { period: "2023.2 – 至今", company: "蔚来汽车科技(安徽)", title: "PIM 主任工程师", summary: "负责 ET5/ES6/Blanc 车身零部件工业化与全生命周期质量管理" },
      { period: "2021.11 – 2023.2", company: "吉利汽车集团", title: "高级项目经理(韩国 RSM)", summary: "R745 车型韩国合资项目整体管理" },
    ],
    educationHistory: [
      { period: "2009.1 – 2011.12", school: "合肥工业大学", major: "工业工程", degree: "硕士" },
    ],
    attachment: "1-个人简历-郝福强20250628.docx",
  },
  {
    externalId: "c-002", name: "郑宝伟", gender: "male", animal: "turtle",
    education: "本科", school: "新疆大学", major: "材料科学与工程", age: 40,
    location: "陕西·宝鸡", yearsExp: 16, phone: "132-8961-8962", email: "qiantian2918@163.com",
    appliedFor: "海外产品质量", jdMatch: 78, status: "已沟通", source: "猎头",
    pushedAt: new Date("2026-03-04"), parser: "DeepSeek", parserConfidence: 88,
    tags: ["6Sigma", "8D", "IATF16949", "三坐标测量"],
    skills: ["6Sigma/8D/5WHY/SPC/MSA/FMEA", "IATF16949 体系", "PowerBI/FineBI"],
    risks: ["无量化工作成果", "存在 3 个月空档期"],
    highlights: ["入厂检验+项目质量+测量四模块全覆盖"],
    experience: [
      { period: "2017.10 – 至今", company: "宝鸡吉利汽车部件", title: "零部件检验科长", summary: "测量主管成长到检验科长" },
    ],
    educationHistory: [
      { period: "2002.9 – 2006.7", school: "新疆大学", major: "材料科学与工程", degree: "本科" },
    ],
    attachment: "郑宝伟-简历-202603.pdf",
  },
  {
    externalId: "c-003", name: "陈思琪", gender: "female", animal: "rabbit",
    education: "硕士", school: "同济大学", major: "车辆工程", age: 32,
    location: "上海·浦东", yearsExp: 9, phone: "189-2233-1124", email: "chensq.engineer@outlook.com",
    appliedFor: "智能驾驶感知工程师", jdMatch: 93, status: "待入职", source: "内推",
    pushedAt: new Date("2026-04-02"), parser: "Kimi", parserConfidence: 95,
    tags: ["BEV 感知", "PyTorch", "C++", "Apollo", "激光雷达"],
    skills: ["5 年 BEV / Occupancy 感知算法量产经验", "PyTorch / C++ / CUDA"],
    risks: ["5 年内 3 家公司", "期望薪资上浮 35%"],
    highlights: ["蔚来 ET7 / 小鹏 P7 量产感知主力贡献者", "CVPR Workshop 论文一作"],
    experience: [
      { period: "2023.6 – 至今", company: "小鹏汽车 XNGP", title: "高级感知算法工程师", summary: "XNet 2.0 Occupancy 网络优化" },
    ],
    educationHistory: [
      { period: "2015.9 – 2017.6", school: "同济大学", major: "车辆工程", degree: "硕士" },
    ],
    attachment: "陈思琪-感知-202604.pdf",
  },
  {
    externalId: "c-004", name: "王嘉伟", gender: "male", animal: "bear",
    education: "本科", school: "北京理工大学", major: "机械工程", age: 28,
    location: "北京·亦庄", yearsExp: 5, phone: "186-1100-7765", email: "wangjw@bit.edu.cn",
    appliedFor: "车身工艺工程师", jdMatch: 68, status: "待筛选", source: "BOSS 直聘",
    pushedAt: new Date("2026-05-08"), parser: "Kimi", parserConfidence: 89,
    tags: ["CATIA", "焊接", "夹具设计"],
    skills: ["3 年车身焊接夹具设计与调试", "熟练 CATIA、AutoCAD"],
    risks: ["未独立负责过整车级项目", "无海外项目经验"],
    highlights: ["北理工本硕基础扎实", "5 年仅 1 段工作经历"],
    experience: [{ period: "2021.7 – 至今", company: "北汽新能源", title: "车身工艺工程师", summary: "极狐 αT 焊装夹具开发" }],
    educationHistory: [{ period: "2017.9 – 2021.6", school: "北京理工大学", major: "机械工程", degree: "本科" }],
    attachment: "王嘉伟-车身-202605.pdf",
  },
  {
    externalId: "c-005", name: "刘晓萌", gender: "female", animal: "bird",
    education: "硕士", school: "哈尔滨工业大学", major: "控制科学与工程", age: 30,
    location: "深圳·南山", yearsExp: 7, phone: "139-2266-0011", email: "liu.xm@hit.edu.cn",
    appliedFor: "电池管理系统工程师", jdMatch: 91, status: "面试中", source: "官网",
    pushedAt: new Date("2026-04-22"), parser: "DeepSeek", parserConfidence: 93,
    tags: ["BMS", "MATLAB/Simulink", "AUTOSAR", "宁德时代"],
    skills: ["5 年 BMS 软件开发与标定", "MATLAB/Simulink、AUTOSAR、UDS、ISO 26262"],
    risks: ["当前职级偏低"],
    highlights: ["宁德时代 + 比亚迪双 BMS 量产背景"],
    experience: [{ period: "2023.3 – 至今", company: "比亚迪 弗迪电池", title: "BMS 高级软件工程师", summary: "海豹/海豚 BMS 软件量产" }],
    educationHistory: [{ period: "2017.9 – 2019.6", school: "哈尔滨工业大学", major: "控制科学与工程", degree: "硕士" }],
    attachment: "刘晓萌-BMS-202604.pdf",
  },
  {
    externalId: "c-006", name: "徐文博", gender: "male", animal: "squirrel",
    education: "硕士", school: "清华大学", major: "汽车工程", age: 35,
    location: "北京·海淀", yearsExp: 12, phone: "138-0013-4288", email: "xuwb@thsigma.com",
    appliedFor: "智能座舱总监", jdMatch: 88, status: "已沟通", source: "猎头",
    pushedAt: new Date("2026-04-15"), parser: "Kimi", parserConfidence: 91,
    tags: ["座舱", "团队管理", "HMI", "量产负责人"],
    skills: ["12 年智能座舱量产经验", "管理过 22 人跨职能团队", "高通 8155 / 8295 平台"],
    risks: ["近期跳槽频繁", "期望薪资 80W + 期权"],
    highlights: ["清华汽车硕士", "理想 L9 / 蔚来 ET7 座舱核心贡献者"],
    experience: [{ period: "2024.3 – 至今", company: "理想汽车", title: "智能座舱负责人", summary: "L 系列座舱体验与平台演进" }],
    educationHistory: [{ period: "2011.9 – 2014.6", school: "清华大学", major: "汽车工程", degree: "硕士" }],
    attachment: "徐文博-座舱总监-202604.pdf",
  },
  {
    externalId: "c-007", name: "李慧", gender: "female", animal: "cat",
    education: "本科", school: "武汉理工大学", major: "工业设计", age: 27,
    location: "杭州·余杭", yearsExp: 4, phone: "155-8899-1100", email: "lihui.design@gmail.com",
    appliedFor: "HMI 交互设计师", jdMatch: 81, status: "已沟通", source: "BOSS 直聘",
    pushedAt: new Date("2026-05-02"), parser: "Kimi", parserConfidence: 90,
    tags: ["HMI", "Figma", "车机 UX"],
    skills: ["4 年车机 HMI 设计", "Figma、Sketch、ProtoPie"],
    risks: ["工业设计本科背景"],
    highlights: ["哪吒 / 零跑 量产车机 HMI 主力", "红点设计奖入围"],
    experience: [{ period: "2024.2 – 至今", company: "零跑汽车", title: "HMI 高级设计师", summary: "C16 车机 HMI 与设计系统" }],
    educationHistory: [{ period: "2018.9 – 2022.6", school: "武汉理工大学", major: "工业设计", degree: "本科" }],
    attachment: "李慧-HMI-202605.pdf",
  },
  {
    externalId: "c-008", name: "黄启航", gender: "male", animal: "rat",
    education: "博士", school: "上海交通大学", major: "电力电子", age: 36,
    location: "上海·闵行", yearsExp: 10, phone: "136-7788-0099", email: "huang.qh@sjtu.edu.cn",
    appliedFor: "电驱系统专家", jdMatch: 96, status: "已入职", source: "内推",
    pushedAt: new Date("2026-02-18"), parser: "Kimi", parserConfidence: 97,
    tags: ["电驱", "SiC", "PhD", "专利 14 项"],
    skills: ["10 年电驱系统与功率电子量产经验", "熟悉 SiC、IGBT 模块设计与控制"],
    risks: [],
    highlights: ["交大博士", "小鹏 G9 / 智己 LS6 电驱核心贡献者", "稀缺 SiC 量产经验"],
    experience: [{ period: "2020.4 – 至今", company: "智己汽车", title: "电驱系统专家", summary: "LS6 / L7 电驱量产" }],
    educationHistory: [{ period: "2011.9 – 2015.6", school: "上海交通大学", major: "电力电子", degree: "博士" }],
    attachment: "黄启航-电驱-博士-202602.pdf",
  },
  {
    externalId: "c-009", name: "吴佳怡", gender: "female", animal: "fish",
    education: "本科", school: "同济大学", major: "会计学", age: 25,
    location: "上海·徐汇", yearsExp: 3, phone: "177-2299-3344", email: "wujiayi.acct@163.com",
    appliedFor: "财务分析师", jdMatch: 42, status: "已淘汰", source: "自动上传",
    pushedAt: new Date("2026-05-09"), parser: "DeepSeek", parserConfidence: 86,
    tags: ["会计", "审计"],
    skills: ["3 年四大审计经验", "CPA 全科通过"],
    risks: ["无主机厂行业经验", "岗位需求 5 年经验"],
    highlights: ["同济会计 + CPA 全科"],
    experience: [{ period: "2022.7 – 至今", company: "普华永道(上海)", title: "审计高级专员", summary: "A 股制造业客户审计" }],
    educationHistory: [{ period: "2018.9 – 2022.6", school: "同济大学", major: "会计学", degree: "本科" }],
    attachment: "吴佳怡-财务-202605.pdf",
  },
  {
    externalId: "c-010", name: "张子轩", gender: "unknown", animal: "snail",
    education: "硕士", school: "浙江大学", major: "计算机科学", age: 29,
    location: "杭州·西湖", yearsExp: 6, phone: "152-0099-8877", email: "zhangzx@zju.edu.cn",
    appliedFor: "云平台架构师", jdMatch: 87, status: "待筛选", source: "BOSS 直聘",
    pushedAt: new Date("2026-05-12"), parser: "Kimi", parserConfidence: 92,
    tags: ["K8s", "Go", "云原生"],
    skills: ["6 年云原生 / 微服务架构", "Go / Rust、K8s、Service Mesh"],
    risks: ["无汽车行业经验"],
    highlights: ["浙大 CS 硕士", "GitHub 开源项目 2.3k+ stars"],
    experience: [{ period: "2020.5 – 至今", company: "阿里巴巴 中间件", title: "高级开发工程师 P7", summary: "集团云原生中间件" }],
    educationHistory: [{ period: "2016.9 – 2018.6", school: "浙江大学", major: "计算机科学", degree: "硕士" }],
    attachment: "张子轩-云架构-202605.pdf",
  },
  {
    externalId: "c-011", name: "孙韵竹", gender: "female", animal: "bug",
    education: "硕士", school: "北京航空航天大学", major: "机械电子工程", age: 31,
    location: "北京·昌平", yearsExp: 8, phone: "131-4477-2200", email: "sun.yz@buaa.edu.cn",
    appliedFor: "底盘域控软件经理", jdMatch: 84, status: "面试中", source: "内推",
    pushedAt: new Date("2026-04-10"), parser: "DeepSeek", parserConfidence: 91,
    tags: ["底盘", "AUTOSAR", "团队管理"],
    skills: ["8 年底盘控制软件开发", "熟悉 ESC / EPS / 主动悬挂"],
    risks: ["管理经验偏短"],
    highlights: ["北航机电硕士", "理想 L9 主动悬挂量产负责人"],
    experience: [{ period: "2023.1 – 至今", company: "理想汽车", title: "底盘软件经理", summary: "L 系列主动悬挂软件" }],
    educationHistory: [{ period: "2016.9 – 2018.6", school: "北京航空航天大学", major: "机械电子工程", degree: "硕士" }],
    attachment: "孙韵竹-底盘-202604.pdf",
  },
  {
    externalId: "c-012", name: "马天宇", gender: "male", animal: "worm",
    education: "本科", school: "华中科技大学", major: "电气工程", age: 33,
    location: "武汉·光谷", yearsExp: 11, phone: "187-5566-1100", email: "matianyu@huawei.com",
    appliedFor: "高压系统工程师", jdMatch: 73, status: "已沟通", source: "官网",
    pushedAt: new Date("2026-04-28"), parser: "Kimi", parserConfidence: 88,
    tags: ["高压", "电气安全"],
    skills: ["11 年高压电气系统经验", "熟悉高压互锁、绝缘检测"],
    risks: ["近 5 年仅 1 段工作经历"],
    highlights: ["华为车 BU 高压资深工程师", "问界 M9 高压架构核心贡献者"],
    experience: [{ period: "2018.10 – 至今", company: "华为 智能汽车解决方案 BU", title: "高级工程师", summary: "问界 M5 / M9 高压系统" }],
    educationHistory: [{ period: "2009.9 – 2013.6", school: "华中科技大学", major: "电气工程", degree: "本科" }],
    attachment: "马天宇-高压-202604.pdf",
  },
];

const JOBS_SAMPLE = [
  { externalId: "j-001", title: "海外产品质量",       dept: "质量·海外",    owner: "李薇", openings: 2, candidates: 28, level: "P7–P8",  location: "合肥", urgency: "high" },
  { externalId: "j-002", title: "智能驾驶感知工程师", dept: "智驾·感知",    owner: "王浩", openings: 3, candidates: 41, level: "P6–P7",  location: "上海", urgency: "high" },
  { externalId: "j-003", title: "电池管理系统工程师", dept: "三电·BMS",     owner: "陈璐", openings: 2, candidates: 22, level: "P6–P7",  location: "深圳", urgency: "mid" },
  { externalId: "j-004", title: "智能座舱总监",       dept: "智舱",        owner: "张磊", openings: 1, candidates: 9,  level: "M3",     location: "北京", urgency: "high" },
  { externalId: "j-005", title: "车身工艺工程师",     dept: "车身·工艺",    owner: "吴敏", openings: 4, candidates: 51, level: "P5–P6",  location: "北京", urgency: "mid" },
  { externalId: "j-006", title: "HMI 交互设计师",     dept: "设计·HMI",     owner: "陈璐", openings: 1, candidates: 17, level: "P6",     location: "杭州", urgency: "low" },
  { externalId: "j-007", title: "电驱系统专家",       dept: "三电·电驱",    owner: "李薇", openings: 1, candidates: 6,  level: "P8",     location: "上海", urgency: "high" },
  { externalId: "j-008", title: "底盘域控软件经理",   dept: "底盘",        owner: "王浩", openings: 1, candidates: 12, level: "M2",     location: "北京", urgency: "mid" },
];

const DEPARTMENTS_SAMPLE = [
  { externalId: "d-001", name: "智驾·感知",    code: "ADS-P",  head: "王浩",  headcount: 24, openHc: 3 },
  { externalId: "d-002", name: "三电·BMS",     code: "PWR-B",  head: "陈璐",  headcount: 18, openHc: 2 },
  { externalId: "d-003", name: "三电·电驱",    code: "PWR-D",  head: "李薇",  headcount: 21, openHc: 1 },
  { externalId: "d-004", name: "智舱",        code: "CKPT",   head: "张磊",  headcount: 33, openHc: 1 },
  { externalId: "d-005", name: "车身·工艺",    code: "BIW",    head: "吴敏",  headcount: 41, openHc: 4 },
  { externalId: "d-006", name: "设计·HMI",     code: "HMI",    head: "陈璐",  headcount: 12, openHc: 1 },
  { externalId: "d-007", name: "底盘",        code: "CHS",    head: "王浩",  headcount: 27, openHc: 1 },
  { externalId: "d-008", name: "质量·海外",    code: "QA-OS",  head: "李薇",  headcount: 16, openHc: 2 },
];

const EMPLOYEES_SAMPLE = [
  {
    externalId: "E-0003", candidateExternalId: "c-003", name: "陈思琪", gender: "female", animal: "rabbit",
    education: "硕士", school: "同济大学", major: "车辆工程", age: 32, location: "上海·浦东",
    yearsExp: 9, phone: "189-2233-1124", email: "chensq.engineer@outlook.com",
    appliedFor: "智能驾驶感知工程师", jobExternalId: "j-002", dept: "智驾·感知", jdOwner: "王浩",
    level: "P6–P7", workLocation: "上海", jdMatch: 93, stage: "入职准备",
    plannedHireDate: new Date("2026-06-01"), probationEndDate: new Date("2026-08-30"),
    regularizeAdvice: "待定", hrbp: "陈璐", directManager: "王浩",
    checklist: {
      offer: { status: "已完成", date: "2026-05-14", owner: "李薇" },
      bgCheck: { status: "已完成", date: "2026-05-18", owner: "李薇" },
      medical: { status: "进行中", owner: "陈璐" },
      materials: { status: "进行中", owner: "陈思琪" },
      account: { status: "待开始", owner: "IT" },
      equipment: { status: "待开始", owner: "IT" },
      training: { status: "待开始", owner: "L&D" },
    },
    probation: {
      day30: { date: "2026-07-01", status: "待开始" },
      day60: { date: "2026-07-31", status: "待开始" },
      day90: { date: "2026-08-30", status: "待开始" },
    },
    events: [
      { date: "2026-05-14", type: "Offer", title: "Offer 已签字", desc: "年薪 78W + 期权", owner: "李薇" },
      { date: "2026-05-09", type: "招聘", title: "通过终面", desc: "JD 匹配度 93/100", owner: "王浩" },
    ],
    riskItems: [
      { item: "5 年内 3 家公司", level: "中", source: "AI风险项", owner: "陈璐", action: "入职前再访谈", dueDate: "2026-05-28", status: "进行中" },
    ],
    parser: "Kimi", parserConfidence: 95, source: "内推", attachment: "陈思琪-感知-202604.pdf",
    tags: ["BEV 感知", "PyTorch", "同济硕士"],
  },
  {
    externalId: "E-0008", candidateExternalId: "c-008", name: "黄启航", gender: "male", animal: "rat",
    education: "博士", school: "上海交通大学", major: "电力电子", age: 36, location: "上海·闵行",
    yearsExp: 10, phone: "136-7788-0099", email: "huang.qh@sjtu.edu.cn",
    appliedFor: "电驱系统专家", jobExternalId: "j-007", dept: "三电·电驱", jdOwner: "李薇",
    level: "P8", workLocation: "上海", jdMatch: 96, stage: "试用期",
    plannedHireDate: new Date("2026-03-15"), actualHireDate: new Date("2026-03-17"), probationEndDate: new Date("2026-06-15"),
    regularizeAdvice: "建议转正", hrbp: "陈璐", directManager: "李薇",
    checklist: {
      offer: { status: "已完成" }, bgCheck: { status: "已完成" }, medical: { status: "已完成" },
      materials: { status: "已完成" }, account: { status: "已完成" }, equipment: { status: "已完成" }, training: { status: "已完成" },
    },
    probation: {
      day30: { date: "2026-04-16", status: "已完成", notes: "快速融入,SiC 项目立项推进良好" },
      day60: { date: "2026-05-16", status: "已完成", notes: "OKR 进度 75%" },
      day90: { date: "2026-06-15", status: "进行中", completion: 0.82 },
    },
    events: [
      { date: "2026-05-12", type: "关键项目", title: "主导 800V 电驱平台 v2.0 立项", owner: "李薇" },
      { date: "2026-03-17", type: "入职", title: "入职 电驱系统专家", desc: "JD 匹配度 96/100", owner: "李薇" },
    ],
    riskItems: [],
    parser: "Kimi", parserConfidence: 97, source: "内推", attachment: "黄启航-电驱-博士-202602.pdf",
    tags: ["电驱", "SiC", "专利 14 项"],
  },
  {
    externalId: "E-0011", name: "赵明远", gender: "male", animal: "turtle",
    education: "硕士", school: "西安交通大学", major: "车辆工程", age: 33, location: "北京·亦庄",
    yearsExp: 8, phone: "139-1100-2244", email: "zhao.my@example.com",
    appliedFor: "底盘域控软件经理", jobExternalId: "j-008", dept: "底盘", jdOwner: "王浩",
    level: "M2", workLocation: "北京", jdMatch: 89, stage: "试用期",
    plannedHireDate: new Date("2026-04-01"), actualHireDate: new Date("2026-04-07"), probationEndDate: new Date("2026-07-07"),
    regularizeAdvice: "待定", hrbp: "陈璐", directManager: "王浩",
    checklist: {
      offer: { status: "已完成" }, bgCheck: { status: "已完成" }, medical: { status: "已完成" },
      materials: { status: "已完成" }, account: { status: "已完成" }, equipment: { status: "已完成" }, training: { status: "已完成" },
    },
    probation: {
      day30: { date: "2026-05-07", status: "已完成" },
      day60: { date: "2026-06-06", status: "进行中", completion: 0.55, notes: "上级反馈技术方案推进略迟" },
      day90: { date: "2026-07-06", status: "待开始" },
    },
    events: [
      { date: "2026-04-07", type: "入职", title: "入职 底盘域控软件经理", desc: "JD 匹配度 89/100", owner: "李薇" },
    ],
    riskItems: [
      { item: "60 天 OKR 进度仅 55%", level: "中", owner: "王浩", action: "每周 1-1", dueDate: "2026-06-15", status: "进行中" },
    ],
    parser: "DeepSeek", parserConfidence: 88, source: "内推", attachment: "赵明远-底盘-202603.pdf",
    tags: ["底盘", "AUTOSAR"],
  },
  {
    externalId: "E-0012", name: "李欣怡", gender: "female", animal: "bird",
    education: "硕士", school: "浙江大学", major: "人机交互", age: 28, location: "杭州·西湖",
    yearsExp: 5, phone: "155-2200-9988", email: "li.xy@example.com",
    appliedFor: "HMI 交互设计师", jobExternalId: "j-006", dept: "设计·HMI", jdOwner: "陈璐",
    level: "P6", workLocation: "杭州", jdMatch: 86, stage: "已转正",
    plannedHireDate: new Date("2025-11-03"), actualHireDate: new Date("2025-11-03"),
    probationEndDate: new Date("2026-02-02"), regularizeDate: new Date("2026-02-02"),
    regularizeAdvice: "已转正", hrbp: "陈璐", directManager: "陈璐",
    checklist: {
      offer: { status: "已完成" }, bgCheck: { status: "已完成" }, medical: { status: "已完成" },
      materials: { status: "已完成" }, account: { status: "已完成" }, equipment: { status: "已完成" }, training: { status: "已完成" },
    },
    probation: {
      day30: { date: "2025-12-03", status: "已完成" },
      day60: { date: "2026-01-02", status: "已完成" },
      day90: { date: "2026-02-02", status: "已完成", completion: 0.92 },
    },
    events: [{ date: "2026-02-02", type: "转正", title: "正式转正", desc: "试用期完成度 92%", owner: "陈璐" }],
    riskItems: [],
    parser: "Kimi", parserConfidence: 92, source: "官网", attachment: "李欣怡-HMI-202510.pdf",
    tags: ["HMI", "Figma"],
  },
  {
    externalId: "E-0013", name: "周浩", gender: "male", animal: "bear",
    education: "本科", school: "武汉大学", major: "电子信息工程", age: 35, location: "北京·亦庄",
    yearsExp: 12, phone: "186-9988-5511", email: "zhou.hao@example.com",
    appliedFor: "车身工艺工程师", jobExternalId: "j-005", dept: "车身·工艺", jdOwner: "吴敏",
    level: "P7", workLocation: "北京", jdMatch: 81, stage: "已转正",
    plannedHireDate: new Date("2024-05-20"), actualHireDate: new Date("2024-05-20"),
    probationEndDate: new Date("2024-08-18"), regularizeDate: new Date("2024-08-18"),
    regularizeAdvice: "已转正", hrbp: "陈璐", directManager: "吴敏",
    checklist: {
      offer: { status: "已完成" }, bgCheck: { status: "已完成" }, medical: { status: "已完成" },
      materials: { status: "已完成" }, account: { status: "已完成" }, equipment: { status: "已完成" }, training: { status: "已完成" },
    },
    probation: {
      day30: { date: "2024-06-19", status: "已完成" },
      day60: { date: "2024-07-19", status: "已完成" },
      day90: { date: "2024-08-18", status: "已完成", completion: 0.95 },
    },
    events: [
      { date: "2026-03-12", type: "晋升", title: "晋升 P7 → P8", desc: "年度评审 A+", owner: "吴敏" },
      { date: "2024-08-18", type: "转正", title: "正式转正", owner: "陈璐" },
    ],
    riskItems: [],
    parser: "Kimi", parserConfidence: 88, source: "猎头", attachment: "周浩-车身-202404.pdf",
    tags: ["焊接", "CATIA"],
  },
  {
    externalId: "E-0014", name: "王思雨", gender: "female", animal: "cat",
    education: "硕士", school: "南京大学", major: "计算机科学", age: 27, location: "深圳·南山",
    yearsExp: 3, phone: "177-3344-0099", email: "wang.sy@example.com",
    appliedFor: "电池管理系统工程师", jobExternalId: "j-003", dept: "三电·BMS", jdOwner: "陈璐",
    level: "P5", workLocation: "深圳", jdMatch: 76, stage: "入职当天",
    plannedHireDate: new Date("2026-05-15"), actualHireDate: new Date("2026-05-15"),
    probationEndDate: new Date("2026-08-13"),
    regularizeAdvice: "待定", hrbp: "陈璐", directManager: "陈璐",
    checklist: {
      offer: { status: "已完成" }, bgCheck: { status: "已完成" }, medical: { status: "已完成" },
      materials: { status: "已完成" }, account: { status: "进行中", note: "今日开通中" },
      equipment: { status: "进行中" }, training: { status: "待开始", date: "2026-05-18" },
    },
    probation: {
      day30: { date: "2026-06-14", status: "待开始" },
      day60: { date: "2026-07-14", status: "待开始" },
      day90: { date: "2026-08-13", status: "待开始" },
    },
    events: [{ date: "2026-05-15", type: "入职", title: "入职 电池管理系统工程师", desc: "今日 Day 1", owner: "李薇" }],
    riskItems: [
      { item: "工作年限 3 年低于 JD 要求(5 年)", level: "中", owner: "陈璐", action: "安排资深带教 2 个月", dueDate: "2026-07-15", status: "进行中" },
    ],
    parser: "DeepSeek", parserConfidence: 87, source: "BOSS 直聘", attachment: "王思雨-BMS-202604.pdf",
    tags: ["BMS", "Python"],
  },
];

const INTERVIEWS_SAMPLE = [
  { externalId: "iv-001", candidateExternalId: "c-001", jobExternalId: "j-001", candidateName: "郝福强", jobTitle: "海外产品质量",       round: "二面",  mode: "线下",     status: "已完成",   recommendation: "通过",   scheduledAt: new Date("2026-04-08T14:00:00+08:00"), interviewer: "李薇" },
  { externalId: "iv-002", candidateExternalId: "c-001", jobExternalId: "j-001", candidateName: "郝福强", jobTitle: "海外产品质量",       round: "终面",  mode: "视频",     status: "已安排",   recommendation: "—",       scheduledAt: new Date("2026-05-21T10:00:00+08:00"), interviewer: "张磊" },
  { externalId: "iv-003", candidateExternalId: "c-005", jobExternalId: "j-003", candidateName: "刘晓萌", jobTitle: "电池管理系统工程师", round: "一面",  mode: "电话",     status: "已完成",   recommendation: "通过",   scheduledAt: new Date("2026-04-25T10:30:00+08:00"), interviewer: "陈璐" },
  { externalId: "iv-004", candidateExternalId: "c-005", jobExternalId: "j-003", candidateName: "刘晓萌", jobTitle: "电池管理系统工程师", round: "二面",  mode: "线下",     status: "已安排",   recommendation: "—",       scheduledAt: new Date("2026-05-23T14:00:00+08:00"), interviewer: "陈璐" },
  { externalId: "iv-005", candidateExternalId: "c-011", jobExternalId: "j-008", candidateName: "孙韵竹", jobTitle: "底盘域控软件经理",   round: "终面",  mode: "线下",     status: "已安排",   recommendation: "—",       scheduledAt: new Date("2026-05-22T15:30:00+08:00"), interviewer: "王浩" },
];

async function main() {
  console.log("[seed-demo] 找一个已存在的 admin 把 demo 候选人挂上去...");
  // 优先用任意一个 ADMIN 角色用户;找不到 ADMIN 就用第一个用户;一个都没有则报错让用户先跑 seed.js
  const admin =
    (await prisma.user.findFirst({ where: { role: "ADMIN" } })) ||
    (await prisma.user.findFirst());
  if (!admin) {
    console.error("[seed-demo] 数据库里一个 user 都没有,请先跑 `npm run prisma:seed` 创建 admin");
    process.exit(2);
  }
  console.log(`[seed-demo] using owner: ${admin.email}`);

  console.log("[seed-demo] seeding departments...");
  for (const d of DEPARTMENTS_SAMPLE) {
    await prisma.department.upsert({
      where: { externalId: d.externalId },
      update: d,
      create: d,
    });
  }

  console.log("[seed] seeding jobs...");
  const jobIdByExternal = {};
  for (const j of JOBS_SAMPLE) {
    const job = await prisma.job.upsert({
      where: { externalId: j.externalId },
      update: j,
      create: j,
    });
    jobIdByExternal[j.externalId] = job.id;
  }

  console.log("[seed] seeding candidates...");
  const candidateIdByExternal = {};
  for (const c of CANDIDATES_SAMPLE) {
    const cand = await prisma.candidate.upsert({
      where: { externalId: c.externalId },
      update: c,
      create: { ...c, ownerId: admin.id },
    });
    candidateIdByExternal[c.externalId] = cand.id;
  }

  console.log("[seed] seeding employees...");
  for (const e of EMPLOYEES_SAMPLE) {
    const { candidateExternalId, jobExternalId, ...rest } = e;
    const data = {
      ...rest,
      candidateId: candidateExternalId ? candidateIdByExternal[candidateExternalId] || null : null,
      jobId: jobExternalId ? jobIdByExternal[jobExternalId] || null : null,
    };
    await prisma.employee.upsert({
      where: { externalId: e.externalId },
      update: data,
      create: data,
    });
  }

  console.log("[seed] seeding interviews...");
  for (const iv of INTERVIEWS_SAMPLE) {
    const { candidateExternalId, jobExternalId, ...rest } = iv;
    const data = {
      ...rest,
      candidateId: candidateExternalId ? candidateIdByExternal[candidateExternalId] || null : null,
      jobId: jobExternalId ? jobIdByExternal[jobExternalId] || null : null,
    };
    await prisma.interview.upsert({
      where: { externalId: iv.externalId },
      update: data,
      create: data,
    });
  }

  const counts = {
    users: await prisma.user.count(),
    candidates: await prisma.candidate.count(),
    jobs: await prisma.job.count(),
    departments: await prisma.department.count(),
    employees: await prisma.employee.count(),
    interviews: await prisma.interview.count(),
  };
  console.log("[seed-demo] done:", counts);
  console.log("[seed-demo] 想清掉这些 demo 数据: 见 ops/cleanup-demo.sh 或手动 DELETE FROM ...");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
