---
title: "MESA Recruit · 后端标准 API 接口参考手册"
author: "MESA Recruit 交付组"
date: "2026-05-22"
---

# 1. 通用约定

- **Base URL**: `https://<生产域名>/api`
- **协议**: HTTPS(生产) / HTTP(本地 dev)
- **认证**: 除 `/api/auth/login` 与 `/api/health` 外,所有接口都需要 `Authorization: Bearer <JWT>`
- **请求体**: `Content-Type: application/json`
- **时间格式**: ISO 8601,UTC(`2026-05-22T07:30:00.000Z`)
- **ID 格式**: `id` 为 UUID v4(数据库主键);`externalId` 为短码(如 `c-001` `j-001` `E-0008`),前端可双向兼容
- **分页**: `?skip=0&take=50`(默认 take=50,最大 200)
- **过滤**: 各资源支持的 query 参数见下文

## 1.1 通用响应

成功(200/201):
```json
{
  "items": [...],
  "total": 123,
  "skip": 0,
  "take": 50
}
```

错误:
| HTTP | error code | 含义 |
|------|------------|------|
| 400 | `request_error` | 入参校验失败(详见 `message`) |
| 401 | `unauthorized` | Token 缺失/过期/无效,前端拦截器会清登录跳 /login |
| 401 | `invalid_credentials` | 登录用户名密码错误 |
| 404 | `not_found` | 资源不存在 |
| 500 | `internal_server_error` | 服务端异常,详情见 server 日志 |

# 2. Auth · 鉴权

## 2.1 POST /api/auth/login

请求体:
```json
{ "email": "admin@mesa.local", "password": "mesa-dev-2026" }
```

响应 200:
```json
{
  "token": "eyJhbGciOiJIUzI1...",
  "user": { "id": "uuid", "email": "...", "name": "...", "role": "ADMIN" }
}
```

## 2.2 GET /api/auth/me

请求头需 `Authorization: Bearer <token>`。响应 200:
```json
{ "user": { "id": "uuid", "email": "...", "role": "ADMIN", "createdAt": "..." } }
```

# 3. Candidates · 候选人

## 3.1 GET /api/candidates

Query:

| key | type | 默认 | 说明 |
|-----|------|------|------|
| `q` | string | — | 模糊匹配 name / school / major / appliedFor |
| `status` | string | — | 精确过滤当前状态 |
| `appliedFor` | string | — | 按应聘岗位过滤 |
| `skip` | int | 0 | 分页偏移 |
| `take` | int | 50 | 单页大小,1-200 |

## 3.2 GET /api/candidates/:id

`:id` 可以是 UUID 或 externalId(如 `c-001`)。

## 3.3 POST /api/candidates

请求体(关键字段):

```json
{
  "externalId": "c-013",
  "name": "新候选人",
  "appliedFor": "智能驾驶感知工程师",
  "jdMatch": 78,
  "status": "待筛选",
  "school": "...",
  "tags": ["BEV 感知", "C++"],
  "skills": ["..."],
  "risks": [],
  "highlights": [],
  "experience": [{ "period": "2023.1 – 至今", "company": "...", "title": "..." }],
  "educationHistory": [{ "period": "...", "school": "...", "degree": "硕士" }],
  "parser": "Kimi",
  "parserConfidence": 92
}
```

`name` 必填。

## 3.4 PATCH /api/candidates/:id

任意字段部分更新。

## 3.5 DELETE /api/candidates/:id

返回 204。

# 4. Jobs · 岗位

## 4.1 GET /api/jobs

Query: `q` / `dept` / `urgency` (`high|mid|low`) / `skip` / `take`。

## 4.2 GET /api/jobs/:id

`:id` 支持 UUID 或 externalId(如 `j-002`)。

## 4.3 POST /api/jobs

```json
{
  "title": "智能驾驶感知工程师",
  "dept": "智驾·感知",
  "owner": "王浩",
  "openings": 3,
  "candidates": 41,
  "level": "P6–P7",
  "location": "上海",
  "urgency": "high"
}
```

## 4.4 PATCH /api/jobs/:id  ·  4.5 DELETE /api/jobs/:id

# 5. Departments · 部门

## 5.1 GET /api/departments

返回所有部门(含直接 children 关联)。

## 5.2 GET /api/departments/:id

含 `parent` 与 `children` 关联。

## 5.3 POST /api/departments

```json
{
  "name": "智驾·感知",
  "code": "ADS-P",
  "head": "王浩",
  "headcount": 24,
  "openHc": 3,
  "parentId": null
}
```

## 5.4 PATCH /api/departments/:id  ·  5.5 DELETE /api/departments/:id

# 6. Employees · 现有人员

## 6.1 GET /api/employees

Query: `q` / `stage` / `dept` / `skip` / `take`。

`stage` 可选值:`待入职 / 入职准备 / 入职当天 / 试用期 / 已转正 / 延期试用 / 已离职`。

## 6.2 GET /api/employees/:id

`:id` 支持 UUID 或 externalId(如 `E-0008`)。Response 含 `candidate` 与 `job` 关联。

## 6.3 POST /api/employees

```json
{
  "name": "陈思琪",
  "appliedFor": "智能驾驶感知工程师",
  "jobId": "uuid-of-job",
  "dept": "智驾·感知",
  "stage": "入职准备",
  "plannedHireDate": "2026-06-01T00:00:00.000Z",
  "probationEndDate": "2026-08-30T00:00:00.000Z",
  "hrbp": "陈璐",
  "directManager": "王浩",
  "checklist": {
    "offer": { "status": "已完成", "date": "2026-05-14", "owner": "李薇" },
    "bgCheck": { "status": "已完成" },
    "medical": { "status": "进行中" },
    "materials": { "status": "进行中" },
    "account": { "status": "待开始" },
    "equipment": { "status": "待开始" },
    "training": { "status": "待开始" }
  },
  "probation": {
    "day30": { "date": "2026-07-01", "status": "待开始" },
    "day60": { "date": "2026-07-31", "status": "待开始" },
    "day90": { "date": "2026-08-30", "status": "待开始" }
  },
  "events": [{ "date": "...", "type": "Offer", "title": "...", "owner": "..." }],
  "riskItems": [{ "item": "...", "level": "中", "owner": "...", "status": "进行中" }],
  "tags": ["BEV 感知"]
}
```

## 6.4 PATCH /api/employees/:id  ·  6.5 DELETE /api/employees/:id

# 7. Interviews · 面试

## 7.1 GET /api/interviews

Query: `status` / `candidateId` / `jobId` / `from`(date-time) / `to`(date-time) / `skip` / `take`。

## 7.2 POST /api/interviews

```json
{
  "candidateId": "uuid",
  "candidateName": "陈思琪",
  "jobId": "uuid",
  "jobTitle": "智能驾驶感知工程师",
  "round": "终面",
  "mode": "线下",
  "status": "已安排",
  "scheduledAt": "2026-05-22T15:30:00+08:00",
  "interviewer": "王浩"
}
```

## 7.3 PATCH /api/interviews/:id  ·  7.4 DELETE /api/interviews/:id

# 8. Dashboard · 概览

## 8.1 GET /api/dashboard/overview

聚合接口,返回:

```json
{
  "counts": {
    "candidates": 12,
    "jobs": 8,
    "employees": 6,
    "interviewsScheduled": 3
  },
  "candidatesByStatus": [{ "status": "面试中", "count": 3 }, ...],
  "jobsByUrgency": [{ "urgency": "high", "count": 4 }, ...],
  "employeesByStage": [{ "stage": "试用期", "count": 2 }, ...],
  "recentCandidates": [{ "id": "...", "name": "...", ... }],
  "upcomingInterviews": [{ "id": "...", "candidateName": "...", "scheduledAt": "..." }]
}
```

# 9. Storage · Cloudflare R2 文件存储(已上线)

## 9.1 POST /api/storage/presigned-url

> 状态:**已上线**。Backend 启动时若 `R2_*` 环境变量齐全则自动激活 r2 plugin,否则该路由返回 503 `r2_not_configured`。

请求体:
```json
{ "filename": "陈思琪-感知-202604.pdf", "contentType": "application/pdf" }
```

响应:
```json
{
  "uploadUrl": "https://...r2.cloudflarestorage.com/...?X-Amz-Signature=...",
  "key": "resumes/2026-05/uuid.pdf",
  "expiresIn": 900
}
```

前端拿到 `uploadUrl` 后直接 `PUT` 文件流到 R2,完成后把 `key` 提交回后端写入 Candidate / Employee 记录。

## 9.2 POST /api/storage/confirm

确认 R2 已收到文件,可选返回公网 URL。

请求体:`{ "key": "resumes/2026-05/uuid.pdf" }`
响应:`{ "key": "...", "publicUrl": null }`(若 `R2_PUBLIC_BASE_URL` 未配则 null)

## 9.3 POST /api/storage/signed-get-url

为已上传的 key 签发 10 分钟下载 URL。

请求体:`{ "key": "resumes/2026-05/uuid.pdf" }`
响应:`{ "url": "https://...r2.cloudflarestorage.com/...?X-Amz-Signature=...", "expiresIn": 600 }`

# 10. Health & Readiness

## 10.1 GET /api/health

无鉴权,返回:
```json
{ "status": "ok", "service": "mesa-server", "uptime": 123.45 }
```

用途:Docker healthcheck、Cloudflare 健康监测、Uptime Kuma 探针。

---

# 11. Candidate Notes · 候选人内部备注

候选人详情页右下"备注时间线",仅登录用户可见。

## 11.1 GET /api/candidates/:id/notes

响应 200:
```json
{ "notes": [{ "id": "...", "content": "...", "authorName": "..", "createdAt": "..." }] }
```

## 11.2 POST /api/candidates/:id/notes

请求体 `{ "content": "..." }`,≤5000 字符,响应 201 含 `note`。

## 11.3 DELETE /api/candidates/:id/notes/:noteId

204 无响应体。

---

# 12. Resumes · LLM 简历解析 + JD 二次评估(Kimi)

## 12.1 GET /api/resumes/llm-status

返回 LLM 配置状态与可用模型列表(从 Kimi `/v1/models` 动态拉,10 分钟缓存)。
```json
{ "provider": "kimi", "model": "moonshot-v1-32k", "configured": true,
  "availableModels": [{"id":"moonshot-v1-32k","label":"...","desc":""}, ...] }
```

## 12.2 POST /api/resumes/parse

请求体:
```json
{
  "key": "uploads/abc.pdf",      // R2 object key
  "contentType": "application/pdf",
  "model": "moonshot-v1-32k",     // 可选, 不传用 SystemSetting 配置
  "jobId": "uuid"                  // 可选, 传了会自动跑 JD 二次评估
}
```

流程:
1. 从 R2 拉文件
2. Kimi Files API 上传 + 文件解析(`/v1/files`)
3. `/v1/chat/completions` JSON 模式输出
4. 若有 `jobId`,自动调 `matchAgainstJob` 二次评估

响应 200:
```json
{
  "candidate": { /* 完整候选人字段, 含 aiSummary 纯文本简报 */ },
  "meta": { "model": "...", "usage": {...} },
  "match": null  // 或 { jdMatch, risks, highlights, matchReason }
}
```

**注意**:这是长任务,通常 10-30s,前端使用 `LONG_TIMEOUT=120s`。

## 12.3 POST /api/resumes/match

事后给已有候选人关联 JD 二次评估:
```json
{ "candidateId": "uuid", "jobId": "uuid", "model": "moonshot-v1-128k" }
```

响应:
```json
{
  "candidate": { /* 更新后的 candidate, jobId/jdMatch/risks/highlights/appliedFor 已写入 */ },
  "match": { "jdMatch": 75, "risks": [...], "highlights": [...], "matchReason": "..." }
}
```

---

# 13. System · 管理员系统设置(ADMIN only)

所有端点需 `role=ADMIN`,否则 403。

## 13.1 GET /api/system/settings

列出所有系统设置(`api_key` 字段已 mask 成 `sk-...xxxx`)。

## 13.2 GET /api/system/settings/:key/full

返回明文 value(用于 admin 编辑时回填)。但 `api_key` 类**不返回完整明文**,只返回 mask。

## 13.3 PUT /api/system/settings/:key

```json
{ "value": "...", "encrypted": true }
```

`encrypted=true` 时用 `AES-256-GCM(HKDF(JWT_SECRET))` 加密写 DB。当前已存配置 key:
- `kimi.api_key` (encrypted)
- `kimi.model`
- `kimi.prompt`

## 13.4 DELETE /api/system/settings/:key

回退到 .env fallback(若有)。

## 13.5 GET /api/system/models

代理 Kimi `/v1/models`,返回 `{ items: ["moonshot-v1-32k", ...] }`,10 分钟缓存。

## 13.6 POST /api/system/settings/kimi.api_key/test

请求体 `{ value: "sk-..." }` 测试 key 是否可用(调用 Kimi `/v1/models`)。响应 `{ ok: true }` 或 4xx 错误信息。

---

# 14. ShareLink · 分享给招聘官

候选人可生成无登录公开链接(`/share/<token>`),由 admin 在 UI 创建/编辑/删除。

## 14.1 GET /api/candidates/:id/share

```json
{ "link": null }   // 没有 link 时
{ "link": { "token": "...", "expiresAt": "...", "maxViews": 10, "viewCount": 3, ... } }
```

## 14.2 POST /api/candidates/:id/share

创建或**重置**(会先删旧 link):
```json
{
  "duration": "3d",         // 1d/3d/7d/30d/forever/自定义 (60s-30d, 形如 "10m" "12h" "5d")
  "maxViews": 10            // 1-9999 或 null (不限)
}
```

响应 201 含 `link`。

## 14.3 PATCH /api/candidates/:id/share

仅改有效期 / 上限(不重置 token):
```json
{ "duration": "7d", "maxViews": 100 }
```
duration 或 maxViews 至少给一个。

## 14.4 DELETE /api/candidates/:id/share

204,立刻失效。

## 14.5 GET /api/public/share/:token  (公开,无鉴权)

返回候选人简报 + 分享元数据。**只返回此候选人**,phone/email 自动 mask。

错误:
- 404 `share_not_found` — token 无效
- 410 `share_expired` — 过期
- 410 `share_quota_exceeded` — 访问次数达上限

---

# 15. Reviews · 评价对话系统

## 15.1 内部端点(登录用户)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/candidates/:id/reviews` | 列出评价(普通用户看 public+internal · admin 看全部含 hidden) |
| POST | `/api/candidates/:id/reviews` | 写评价 / 回复(body 含 content/attachments/parentId/referencedIds/visibility/stance) |
| POST | `/api/candidates/:id/reviews/:rid/request-delete` | 作者请求删除 |
| POST | `/api/candidates/:id/reviews/:rid/approve-delete` | admin 批准 = soft-delete |
| POST | `/api/candidates/:id/reviews/:rid/reject-delete` | admin 拒绝 |
| DELETE | `/api/candidates/:id/reviews/:rid` | admin 直接 soft-delete |
| POST | `/api/candidates/:id/reviews/:rid/hide` | admin 隐藏 |
| POST | `/api/candidates/:id/reviews/:rid/unhide` | admin 取消隐藏 |
| POST | `/api/candidates/:id/reviews/:rid/vote` | 投票 `{ value: 1\|-1\|0 }`(0=取消) |
| GET | `/api/candidates/:id/reviews-votes` | 当前用户在此候选人下的投票 map `{ reviewId: value }` |
| GET | `/api/candidates/:id/reviews/:rid/voters` | 列投票者(登录用户明细 + 匿名汇总) |

### 15.1.1 POST body 详细

```json
{
  "content": "评价内容,≤500 字",
  "attachments": [
    { "type": "image|file|link", "name": "...", "url": "<R2 key 或外部 URL>", "size": 1024, "contentType": "image/png" }
  ],
  "parentId": "uuid",           // 可选, 回复某条
  "referencedIds": ["uuid", ..],// 可选, 批量回复多条(parentId 取第一个)
  "visibility": "public",       // public | internal | admin(非 ADMIN 传 admin 自动降级 internal)
  "stance": "approve"           // approve | reject | null, 仅回复时有意义
}
```

附件总大小后端校验 ≤ 30MB,超出返回 400 `attachments_too_large`。

## 15.2 公开端点(经 ShareLink token,无鉴权)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/public/share/:token/reviews` | 列出 public 评价(internal/admin 不可见) |
| POST | `/api/public/share/:token/reviews` | 写评价(必填 authorName,visibility 强制 public)|
| POST | `/api/public/share/:token/reviews/:rid/request-delete` | 必填 authorName, 校验匹配后请求删除 |
| POST | `/api/public/share/:token/reviews/:rid/vote` | 公开投票 `{ value, prevValue }`(用 prevValue 算 delta, 前端 localStorage 限制) |
| GET | `/api/public/share/:token/reviews/:rid/voters` | 投票者名单(仅返回 name+role) |
| POST | `/api/public/share/:token/presigned-url` | 给评价附件上传用(key 限定 `reviews/public/` 前缀) |
| POST | `/api/public/share/:token/signed-get-url` | 下载附件(key 必须以 `reviews/` 开头) |

错误码同 14.5。

---

# 附录 A · 状态字段约定

| 字段 | 值 | 用途 |
|------|------|------|
| `Candidate.status` | `待筛选` `已沟通` `初筛中` `面试中` `Offer` `已入职` `已淘汰` | 进度阶段 |
| `Job.urgency` | `high` `mid` `low` | 紧急度 |
| `Employee.stage` | `待入职` `背调中` `已签 Offer` `已报到` `试用期` `已转正` `已离职` | 入职阶段 |
| `Interview.status` | `已安排` `已完成` `已取消` `已改期` | 面试状态 |
| `Review.visibility` | `public` `internal` `admin` | 评价可见范围 |
| `Review.stance` | `approve` `reject` `null` | 回复表态 |
| `User.role` | `ADMIN` `RECRUITER` `VIEWER` | 系统角色 |

# 附录 B · 错误码总览

| HTTP | error code | 出现场景 |
|------|------------|---------|
| 400 | `request_error` | 入参校验失败 |
| 400 | `bad_parent` | 回复指向的 parent 不存在 / 不在同 candidate |
| 400 | `nested_reply_not_allowed` | 试图回复回复(只允许 1 级) |
| 400 | `bad_reference_ids` | 批量引用 id 部分无效 |
| 400 | `attachments_too_large` | 评价附件总和 > 30MB |
| 400 | `unsupported_type` | 上传的 contentType 不在白名单 |
| 400 | `duration_out_of_range` | ShareLink 自定义有效期不在 60s-30d |
| 400 | `bad_key` | R2 signed-url 的 key 越权前缀 |
| 401 | `unauthorized` | 缺少/过期 JWT |
| 403 | `forbidden` / `admin_only` / `name_mismatch` | 越权 |
| 404 | `not_found` / `share_not_found` / `candidate_not_found` | 资源不存在 |
| 410 | `share_expired` / `share_quota_exceeded` | ShareLink 过期或耗尽 |
| 422 | `kimi_error` | Kimi 上游返回错误 |
| 503 | `kimi_not_configured` / `r2_not_configured` | 后端依赖未配置 |
