---
title: "Overseas R&D · 员工绩效评价模块说明书"
author: "Overseas R&D 交付组"
date: "2026-07-17"
---

# 1. 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 员工绩效评价模块说明书(as-built) |
| 版本 | v1.0 |
| 状态 | **已上线** · 对应 `pageKey=performance` · 公开页 `/performance-eval/:token` |
| 配套文档 | 01 架构 · 02 API §18 · 03 部署 · 04 运维 |
| 易混淆 | **≠** 数据报表规划中的「HR 个人绩效看板」(招聘官工作量指标)· **≠** 面试评价(InterviewEvaluation) |

# 2. 产品概述

员工绩效评价面向**已入职/试用期等现有人员**,由 HR/招聘官在 `/performance` 发起周期评价,通过**自评链接 + 主管链接**分发,双方无登录填表 → 签字 → 提交 → 导出中英双语 Excel。

核心能力:

| 能力 | 说明 |
|------|------|
| 人员池 | `GET /performance/people` 列出可评人员;可惰性补齐「已入职」缺 Employee;支持页面内新建人员 |
| 双角色公开链 | `selfToken` / `managerToken` 各一,路径 `/performance-eval/:token` |
| 访问密钥第二因子 | 6–10 位 · bcrypt 校验 + AES 密文回显 · 失败锁定 |
| 评分 | 7 维、1–100 分 · 加权 `ROUND(weight*score/100,1)` · 等级 A–E · D/E 触发 PIP 标记 |
| 纪要 | `areasForImprovement` / `developmentPlan`(v2);旧字段 `achievements`/`nextGoals` 保留可空 |
| 签字 | 自评/主管 PNG 手写签字必填方可提交;HR 电子章挂在当前 User,导出可选嵌入 |
| 编辑配额 | `selfMaxEdits` / `managerMaxEdits`;`autosave` 不计次;达上限草稿只读仍可提交 |
| 批量 | 批量发起(≤100)· 批量刷新/统一密钥 · 导出前预览 · 密钥 Excel |
| 筛选 | 岗位/部门/人员阶段 · 评价周期多选 · 状态(已完成/未完成/草稿/已发起/未发起) |

# 3. 状态机

```
draft ──(自评提交)──▶ self_done ──(主管提交)──▶ submitted
  │                      │                         │
  └────(主管可跳过自评直接提交)─────────────────────┘
                                                    │
                                              revoke ▶ revoked
```

| 状态 | 含义 |
|------|------|
| `draft` | 已发起,至少一方未完成 |
| `self_done` | 自评已提交,待主管 |
| `submitted` | 评价完成(主管提交即可到达,可不经 `self_done`) |
| `revoked` | HR 撤销;公开链失效 |

Admin 可将 `submitted` 退回 `draft` 以允许再编辑。软删字段 `deletedAt` 预留,产品未暴露 DELETE API。

# 4. 数据模型

## 4.1 `PerformanceEvaluation`

关键字段(完整见 `server/prisma/schema.prisma`):

| 分组 | 字段 |
|------|------|
| 关联 | `employeeId`(必填 Cascade)· `candidateId?` |
| 公开凭证 | `selfToken` / `managerToken`(unique,32 字符 URL-safe) |
| 访问密钥 | `self/managerAccessKeyHash`(bcrypt)· `self/managerAccessKeyEnc`(AES)· failCount / lockedUntil |
| 快照 | `employeeName` / `employeeNo` / `position` / `department` / `level` / `lineManager` / `reviewPeriod` / `evalDate` |
| 内容 | `scores` JSON(7 维)· `areasForImprovement` / `developmentPlan` · 派生 `selfTotal`/`managerTotal`/`rating`/`pipTriggered` |
| 签字 | `self/managerSignatureKey` + signedAt · HR 章来自 `User.hrSignatureKey` |
| 配额 | `self/managerMaxEdits` · `self/managerEditCount` |
| 模板 | `templateVersion` 默认 `v2` · `templateFileHash` |
| 生命周期 | `expiresAt` · `revokedAt` · `submittedAt` · `exportedAt`/`exportedCount` · `viewCount` |

## 4.2 用户 HR 电子章

`User.hrSignatureKey` / `hrSignatureUpdatedAt` — **归属当前登录用户**,非评价记录;R2 前缀 `performance-signatures/hr/`。

# 5. 访问密钥安全模型

实现:`server/src/lib/perfAccessKey.js`

| 项 | 约定 |
|----|------|
| 格式 | 6–10 位,须同时含大写、小写、数字(易混淆字符 I/O/l/o/0/1 已排除) |
| 校验存储 | bcrypt rounds=10 → `*AccessKeyHash` |
| 回显存储 | AES-256-GCM,密钥与 SystemSetting 相同:`HKDF(JWT_SECRET, salt="mesa.settings.v1")` → `*AccessKeyEnc` |
| 请求携带 | Header `X-Perf-Access-Key`(公开 GET **只能**走 Header;部分写接口 body 亦可带 `accessKey`) |
| 锁定 | 角色分别计数;连续失败 **5** 次 → 锁 **10** 分钟;成功验证清零 |
| 明文返回时机 | 仅 create / bulk / ensure / preview / export.xlsx;**列表不返回明文** |
| 重生成链接 | 只轮换 URL token + 重置 editCount,**不**轮换访问密钥 |
| JWT 轮换 | enc 明文不可解(需重新 generate/set);**bcrypt 校验仍可用**,公开填表不受影响 |
| 旧数据 | 仅有 hash、无 enc 时无法回显 → ensure/preview 会**生成并持久化新密钥**(非严格只读预览) |

错误码:`access_key_required` · `access_key_invalid` · `access_key_locked` · `access_key_not_configured`。

# 6. 评分与等级

金样:`server/assets/templates/performance-evaluation-zh-en-v2.xlsx`  
模板版本:`v2` · 导出语言仅 `zh-en` · 启动 SHA-256 校验(`TEMPLATE_EXPECTED_HASHES`)

| # | 维度 | 权重 |
|---|------|------|
| 1–4 | 业绩与目标达成 · 4P(产品 / 适应性验证 / 法规认证 / 地产化) | 各 20% |
| 5 | 文化认同与沟通协作 / 属地团队建设 | 10% |
| 6 | 海外属地能力体系建设 | 5% |
| 7 | 合规·安全·数据保护 | 5% |

- 单项加权:`ROUND(weight * score / 100, 1)`,镜像 Excel G 列
- 证据 `evidence` 服务端截断 **200** 字
- 等级:A 90–100 · B 80–89 · C 60–79 · D 40–59(PIP) · E &lt;40(PIP+密切跟进)

# 7. 公开填表流程

1. 打开 `/performance-eval/:token` → 校验过期/撤销 → 访问密钥门禁
2. 读表 / 草稿 PATCH(`autosave:true` 不占配额) · 30s 自动保存
3. 上传手写签字 PNG(≤1MB,前缀 `performance-signatures/`)
4. 提交:无签字 → `422 signature_required`;配额用尽且非 autosave → `429 edit_quota_exceeded`
5. `status=submitted` 后可导出 Excel(公开端口)

# 8. 管理端能力(`/performance`)

- 发起 / 批量发起新周期评价
- Share Modal:双链接二维码 · 密钥眼睛显隐 · 「复制链接密钥」双语模板 · 重新生成链接 · 有效期/编辑次数
- HR 电子章管理弹窗(PNG · 替换清理旧 R2 对象)
- 批量:刷新随机密钥 / 设置统一密钥 / 导出前预览勾选 / 密钥 Excel(含邮箱电话)
- 评价 Excel 导出可选 `embedHrSignature`

# 9. 权限与敏感面

| 项 | 说明 |
|----|------|
| 页面权限 | `pageKey=performance`(默认授予新普通用户策略模板,可在 `/users` 调整) |
| 列表返回 token | `GET /people` 的 `latestEvaluation` 含 self/manager Token → **等同分享凭证**,持页权限即可复制完整链 |
| 密钥 Excel | 含明文密钥 + 链接 + 联系方式 → 高敏;限制导出范围、本地勿长期留存 |
| 签字对象 | R2 key 不可猜但仍属隐私;分享链接时注意 |

# 10. 运维要点

1. **改模板**:更新 xlsx 后同步改 `TEMPLATE_EXPECTED_HASHES`,否则 boot fatal(对标面试评价坑 #38 · Dockerfile 须 `COPY assets`)
2. **轮换 JWT_SECRET**:先导出/备份仍需回显的密钥 → 改 secret → 对缺失 enc 的记录 bulk generate
3. **撤销评价**:`POST .../revoke` 后公开 410;密钥 Excel 旧行作废
4. **人员池惰性补齐**:`GET /people` 单次最多补约 50 条「已入职」缺 employee,勿当完整 backfill

# 11. 关键源码索引

| 路径 | 职责 |
|------|------|
| `server/src/routes/performance.js` | 登录态 + 公开 API |
| `server/src/lib/perfAccessKey.js` | 密钥生成/校验/加解密 |
| `server/src/lib/performanceEvalTemplate.js` | 维度/等级/模板 hash |
| `server/src/lib/performanceEvalExport.js` | ExcelJS 填充 |
| `web/src/pages/Performance.jsx` | 管理列表与批量 |
| `web/src/components/PerformanceShareModal.jsx` | 分享与密钥 UI |
| `web/src/pages/PublicPerformanceEval.jsx` | 公开填表 |
| `web/src/components/HrSignatureManager.jsx` | HR 电子章 |
