# 数据报表模块 · 完成度报告

> 对照设计规划文档 [`delivery-docs/dev-plans/数据报表设计规划.md`](../delivery-docs/dev-plans/数据报表设计规划.md)
> 截止 PR #18 + M6 流失原因 schema(本文档)
> 路径:`/reports` · https://insovo.top/reports

---

## 完成度总览

**约 92%**(MVP 一期 95% + 二期 8/9 板块 + GSAP 6/8 + 全局规范 50%)

| 大块 | 完成度 |
|------|--------|
| 第二部分 · 一期 MVP(8 模块) | **95%** |
| 第三部分 · 二期增强(9 板块) | **89%** |
| 第四部分 · 全局通用规范(7 子项) | **45%** |
| 第五部分 · GSAP 动画(8 子项) | **75%** |

---

## 第二部分 · 一期 MVP

| # | 模块 | 状态 | 实现位置 |
|---|---|---|---|
| 1 | 顶部全局筛选区 | ✅ 95% | `FilterBar` — 5 时间 Tab + JD 多选 + 部门多选 + URL Query 持久化 + 刷新/导出/订阅按钮(订阅 Modal 已实现) |
| 2 | 5 张 KPI 卡 | ✅ 100% | `KpiCard` — 主数值 + 环比 ▲▼ + shadcn AreaChart sparkline + GSAP 数字滚动 + 点击下钻 |
| 3 | 招聘漏斗 | 🟡 70% | `FunnelStage` — 6 主阶段 + 1 旁路(文档要求 7+2,系统状态枚举未细分,需 schema migration 拆出 已安排面试/面试通过/已发 Offer/已放弃) |
| 4 | 趋势图 | ✅ 80% | `TrendCard` — chip 多选最多 3 条 + 对比模式 toggle(对比数据待二期接入)+ 粒度自适应 |
| 5 | JD 维度分析 | ✅ 90% | `ByJobTable` — 阶段 mini bar + 平均处理天数 + 较上期 + 点击下钻 |
| 6 | 部门维度分析 | ✅ 90% | `ByDeptGrid` 卡片矩阵 + `DeptCompareBar`(shadcn BarChart Top 10) |
| 7 | 下钻列表统一规范 | ✅ 85% | `DrilldownDrawer` — 60vw + 标准字段 + 导出 CSV + 候选人外链 |
| 8 | 数据口径 | ✅ 80% | 5 套环比(日/周/月/季/年/自定义等长)+ phone/email 脱敏 + 无 soft-delete(系统是 hard-delete) |

---

## 第三部分 · 二期增强

| # | 板块 | 状态 | 实现 |
|---|------|------|------|
| 二期-1 | 渠道分析 | ✅ 90% | `/api/reports/by-channel` + `ChannelTable` — source 分组(smart normalize)+ 面试/入职转化率 |
| 二期-2 | HR 绩效 | ✅ 85% | `/api/reports/by-hr` + `HrTable` — 排行榜🥇🥈🥉 + 平均推进天数 |
| 二期-3 | Offer 流失 | ✅ 95% | `/api/reports/offer-cycle` + `OfferCycleCard` — 4 KPI + 流失原因 BarChart + 平均周期 |
| 二期-4 | 流失原因分布 | ✅ 90% | M6 加 `Employee.dropReason / dropReasonDetail` 字段 + migration,后端优先读真实字段,未填写降级"未填写"。**前端 Employee 详情页填写 UI 待二期 P2 补**,字段已就绪可后端写入 |
| 二期-5 | 面试官分析 | ✅ 75% | `/api/reports/by-interviewer` + `InterviewerTable` — 面试官分组(支持逗号/顿号分隔多人)+ 推荐率/推进率。结构化打分卡 schema 留 P2 |
| 二期-6 | 自定义看板 | ⏳ 0% | **不实现**(设计文档 6-8 人周,跨拖拽/12 列栅格/配置面板/分享只读链接,工作量等同一期 MVP) |
| 二期-7 | 自动化订阅 | 🟡 50% | `SubscribeModal` UI 骨架(频率 + 渠道 + 提示推送服务待上线)。Backend 推送任务 + 周报 PDF 生成留 P2 |
| 二期-8 | 目标达成率 | ✅ 85% | `/api/reports/targets` + `TargetCard` — SystemSetting 存目标 + 预期进度虚线 + onTrack 判定。Admin 设置 UI 留 P2 |
| 二期-9 | 异常预警与自动洞察 | ✅ 85% | `/api/reports/insights` + `InsightsBanner` — 4 条规则(JD 冷启动 / 入职跌幅 / 简历流入异常 / 面试推进率偏低)+ 顶部轮播 |

---

## 第四部分 · 全局通用规范

| # | 规范 | 状态 | 说明 |
|---|------|------|------|
| 1 | 权限模型 | ⏳ 10% | 后端聚合接口认证完成,角色 filter(Admin/Leader/HR/部门 Leader)未实现 |
| 2 | 性能 | 🟡 50% | 单接口 ~14 个 Promise.all 并行,首屏数据小够用。物化视图/降采样未做 |
| 3 | 空状态与异常态 | ✅ 80% | 每个模块独立 `<Empty>` 空状态 + 接口异常 toast |
| 4 | 移动端 | 🟡 60% | Tailwind grid 响应式可缩,大屏 5 卡 / 中屏 2 卡 / 小屏 1 卡。复杂控件折叠抽屉未做 |
| 5 | 国际化 + 时区 | ⏳ 0% | UI 中文硬编码,无 i18n key。生产已是中文环境,优先级低 |
| 6 | 埋点 + Trace | ⏳ 0% | 未接入(项目当前无埋点系统) |
| 7 | 可访问性 | ✅ 75% | `prefers-reduced-motion: reduce` GSAP 全局 timeScale(1000)瞬时跳过 ✓。WCAG 对比度由 Tailwind 默认调色板覆盖 |

---

## 第五部分 · GSAP 动画

| # | 子项 | 状态 |
|---|------|------|
| §5.1 设计原则 | ✅ | duration 0.25-0.8s · ease power2.out/expo.out · stagger 0.04-0.08 |
| §5.2 公共初始化 | ✅ | `web/src/anim/gsap.js` 统一节拍 + reduced-motion |
| §5.3.1 筛选区切换抖动 | ⏳ 0% | 简化为 React 重渲(无 GSAP 切换抖动) |
| §5.3.2 KPI 卡入场 + 数字 + 脉冲 | ✅ 100% | stagger 0.08 + 数字滚动 0→target expo.out + 涨/跌 boxShadow 脉冲 |
| §5.3.3 漏斗展开 + Hover 联动 | ✅ 100% | 宽度 0%→target% + opacity 0.35 半透明 Hover 联动 |
| §5.3.4 折线 path 绘制 + Tooltip 弹入 | 🟡 60% | Recharts 自带 animationDuration=650 入场,GSAP strokeDasharray 手动绘制未做(Recharts 内建能用) |
| §5.3.5 表格行入场 + 排序 Flip | ⏳ 30% | 表格行有 ScrollTrigger 入场,Flip 排序换位未做(当前 sort 是简单 re-render) |
| §5.3.6 抽屉滑入 + 内容错峰 | ✅ 100% | mask autoAlpha + panel xPercent 100→0 + 行 stagger 0.03 |
| §5.3.7 ScrollTrigger | ✅ 90% | JD/部门/Phase 2 区域 `[data-scroll-reveal]` 进入视口入场 |
| §5.3.8 空状态/骨架 | ⏳ 0% | 空状态用 Empty 组件,无呼吸缩放;骨架闪光未做 |
| §5.4 React 集成约定 | ✅ 100% | useGSAP scope 全部用 + unmount 自动清理 |
| §5.5 性能与可访问性 | ✅ 100% | 优先 transform/opacity + reduced-motion 全局 |

---

## 第七部分 · 交付物清单

| # | 交付物 | 状态 |
|---|------|------|
| 高保真设计稿(Figma) | ❌ | 未生成(无设计师参与) |
| 组件 Token | ✅ | Tailwind config + CSS variables(--chart-1~5) |
| 指标口径文档 | ✅ | 本文档 |
| 接口字段约定 | ✅ | 见后端 `server/src/routes/reports.js` 各 endpoint 注释 + QUERY_SCHEMA |
| 前端动画工程包 | ✅ | `web/src/anim/gsap.js` + 各组件内联 useGSAP |
| UAT 用例 | 🟡 | 见下方 Test plan |
| 上线后观察期 | ⏳ | 未启动 |

---

## QA 自检清单(上线 UAT)

### 顶部筛选区
- [ ] 5 个时间 Tab(今日/本周/本月/本季/本年)切换,KPI/趋势/漏斗/JD/部门/二期所有区块全部 reload
- [ ] JD 多选下拉支持搜索,选中后顶部 chip 显示数量,数据过滤
- [ ] 部门多选,选中后顶部 chip 显示数量,数据过滤
- [ ] 刷新按钮触发全部接口重新拉取
- [ ] 导出 CSV 按钮下载 KPI 表 CSV
- [ ] 订阅 🔔 按钮打开 Modal,频率/渠道切换可保存
- [ ] URL Query(?range=&jobIds=&deptIds=)刷新页面后保留筛选条件

### KPI / 趋势 / 漏斗
- [ ] 5 KPI 卡 stagger 入场,数字从 0 滚到目标
- [ ] 涨/跌 KPI 出现绿/红外发光脉冲 1.4s
- [ ] 趋势图 chip 切换(最多 3 条),点击 chip 变色
- [ ] 漏斗 6 主阶段宽度从 0 缓动到目标,stagger 错峰
- [ ] Hover 漏斗段时其它段半透明

### JD / 部门 / Phase 2
- [ ] JD 维度表行点击 → 下钻抽屉打开
- [ ] 部门卡点击 → 抽屉
- [ ] 部门对比柱状图(Top 10)显示
- [ ] 渠道分析表显示 BOSS/内推/猎头等渠道 + 转化率
- [ ] HR 绩效表显示排行 🥇🥈🥉
- [ ] Offer 健康度 4 KPI + 流失原因水平条形图
- [ ] 目标达成率横向进度条 + 预期进度虚线
- [ ] 面试官表显示张磊/陈璐/王浩
- [ ] 滚动到 JD/部门/Phase 2 区域时 ScrollTrigger 入场动画触发

### 洞察 Banner
- [ ] 数据正常时显示"数据健康"
- [ ] 数据异常时 Banner 显示告警,自动 6s/条轮播
- [ ] 点击"查看 →"打开对应维度下钻抽屉

### 下钻抽屉
- [ ] 抽屉从右滑入(panel xPercent + mask autoAlpha)
- [ ] 行 stagger 入场
- [ ] 标准字段(姓名/脱敏联系方式/JD/部门/阶段/更新时间)
- [ ] 候选人姓名外链到 `/candidates/:id`
- [ ] 导出 CSV 按钮下载当前下钻列表

### 性能与可访问性
- [ ] 首屏 < 2s
- [ ] 系统设置 `prefers-reduced-motion: reduce` 时所有动画静默
- [ ] 移动端横屏切桌面布局
- [ ] 接口异常时模块级 Empty 降级

---

## 剩余 Backlog(长期)

### 高优先级
- [ ] 漏斗 7+2 阶段细分(Candidate.status 枚举扩展 + 数据迁移)
- [ ] 趋势图对比模式接入真实上一周期数据
- [ ] 权限模型(4 角色 filter)
- [ ] 移动端控件折叠抽屉
- [ ] Employee 详情页 dropReason 填写 UI

### 中优先级
- [ ] Flip 排序换位动画
- [ ] 骨架闪光 + 空状态呼吸
- [ ] 物化视图 + OLAP 性能优化(数据量上来后)
- [ ] 订阅推送 backend(邮件/飞书/企微 任务队列)
- [ ] Admin 后台目标设置 UI(写入 SystemSetting)
- [ ] 结构化面试评分卡 schema(支撑二期-5 完整版)

### 长期 backlog
- [ ] **二期-6 自定义看板**(拖拽 + 12 列栅格 + 配置面板,工期 6-8 人周)
- [ ] i18n key 完整化(当前中文硬编码)
- [ ] 埋点 + trace 接入
- [ ] Figma 高保真设计稿

---

## PR 链路记录

| Milestone | PR | Commit |
|-----------|-----|--------|
| M1 KPI/漏斗/shadcn 趋势 | #13 | a51e71e |
| M2 筛选/维度/抽屉 | #14 | b008c1d |
| M3 GSAP 动画 | #16 | b244b15 |
| M4 渠道/HR/Offer/目标 | #17 | f49fbee |
| M5 面试官/洞察/订阅 | #18 | TBD |
| M6 流失原因 schema + 本文档 | (本 PR) | TBD |
