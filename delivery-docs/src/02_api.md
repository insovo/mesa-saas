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
  "parserConfidence": 92,
  // V2 字段(2026-05-24 add_v2_fields migration)
  "languages": [{ "name": "中文", "level": "母语" }, { "name": "英语", "level": "CEFR C1" }],
  "aiSuggestedTags": ["Tech Lead 潜质"],  // 由 /resumes/match LLM 写入,admin 也可手工改
  "matchedFor": ["技能栈", "工作经验"],
  "againstFor": ["薪资期望"],
  "insights": [{ "kind": "up", "text": "..." }, { "kind": "down", "text": "..." }],
  "documents": {
    "resume":    [{ "id": "...", "kind": "file", "name": "...", "size": "...", "url": "..." }],
    "materials": [{ "id": "...", "kind": "link", "label": "GitHub", "url": "..." }],
    "portfolio": []
  }
}
```

`name` 必填。`profileCompletion` (0-100) 是 derived 字段,read 时后端按字段填充率算(`lib/derived.js`),不接受外部写入。

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
  "urgency": "high",
  "description": "...",
  // V2 字段 — JdDescModal + 岗位概览 OverviewTile 用,目前 admin 手动维护(LLM 暂未产)
  "employment": "全职",
  "salary": "30K-40K · 16薪",
  "levelRange": "P6-P7",                  // 跟 level 区分(level=单值, range=范围)
  "yearsExpRange": "5-7 年",
  "educationRequirement": "本科及以上",
  "languageRequirement": "英语 CEFR B2+",
  "publishedAt": "2026-04-20T00:00:00Z",
  "deadline":    "2026-06-30T23:59:59Z",
  "responsibilities": ["主导 C 端业务前端架构", "推动性能体系建设"],
  "requirements":     ["5 年以上前端经验", "精通 React 18 + TS"],
  "nice":             ["微前端实战", "懂 Node.js"],
  "benefits":         ["五险一金", "16 薪 + 期权"]
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
  "category": "技术",                     // V2 新: "技术" / "HR" / "业务" / 自定义
  "mode": "线下",
  "status": "已安排",
  "scheduledAt": "2026-05-22T15:30:00+08:00",
  "interviewer": "王浩",                  // 老字段单 string,保留向后兼容
  "link": "https://meet.example.com/abc",  // V2 新: 会议链接 / 线下地址
  "managers":     [{ "name": "MESA Admin", "role": "HR 经理", "animal": "fox", "avatar": null }],
  "interviewers": [{ "name": "陈架构师",    "role": "技术总监", "animal": "tiger", "avatar": null },
                   { "name": "王浩",        "role": "高级工程师", "animal": "panda", "avatar": null }]
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

两种调用模式(请求体 `key` 与 `candidateId` 互斥,schema oneOf 强制二选一):

### (a) 新建候选人(同步)— 传 `key`

```json
{
  "key": "uploads/abc.pdf",       // R2 object key
  "contentType": "application/pdf",
  "model": "moonshot-v1-32k",      // 可选, 不传用 SystemSetting 配置
  "jobId": "uuid"                   // 可选, 传了会自动跑 JD 二次评估
}
```

流程:R2 拉文件 → Kimi /files 上传 + 抽文本 → /chat/completions JSON 输出 → 若有 jobId 跑 matchAgainstJob。

响应 200:
```json
{
  "candidate": { /* 未存 DB 的 candidate object, 前端再 POST /candidates 创建 */ },
  "meta": { "model": "...", "usage": {...} },
  "match": null  // 或 { jdMatch, risks, highlights, matchReason, matchedFor, againstFor, aiSuggestedTags, insights }
}
```

### (b) 重新解析已有候选人(异步)— 传 `candidateId`

```json
{
  "candidateId": "uuid",
  "model": "moonshot-v1-32k",    // 可选
  "jobId": "uuid" | null         // 可选,前端 ReparseConfirmModal 用户确认/切换的投递岗位
}
```

`jobId` 语义(`hasOwnProperty` 区分 undefined / null):
- **不传字段**:沿用候选人当前 `candidate.jobId`,不改 DB
- **传 `null`**:取消 JD 关联,清空 `candidate.jobId` + jdMatch/risks/highlights/insights/skills/experience/educationHistory
- **传 uuid**:切到该 JD,跑 matchAgainstJob,并同步把 `candidate.jobId` 也更新

后端立即 202 返回 taskId,fire-and-forget 跑 Kimi(后端用 `candidate.attachment` 作 R2 key,UPDATE 现有 DB 行,不破坏 status/appliedFor/source/owner/documents)。绕过 Cloudflare 100s origin response 硬上限。

**两阶段解析**(2026-05 改造):
- parseResume 只产 `summary` + 基础字段(name/phone/email/school/major/yearsExp/...) + `tags`
- matchAgainstJob(如有 jobId)二阶段产出 jdMatch + risks/highlights/insights/aiSuggestedTags/matchedFor/againstFor + skills/experience/educationHistory(markdown bullet 字符串)
- 阶段一字段在 LLM 偶尔输出空数组时**保留旧值**(防 .doc 抖动清空旧数据)

响应 202:
```json
{
  "task": {
    "id": "uuid",
    "candidateId": "uuid",
    "status": "pending",
    "startedAt": "2026-05-25T..."
  }
}
```

错误响应(4xx,Cloudflare 透传 JSON body):
- 424 `kimi_not_configured` / `r2_not_configured`
- 404 `candidate_not_found`
- 400 `no_attachment`(候选人无简历附件)

## 12.3 GET /api/resumes/parse-tasks/:taskId

轮询异步 reparse 任务状态。前端建议每 2s 调一次,最长 5 分钟。

响应 200:
```json
{
  "task": {
    "id": "uuid",
    "candidateId": "uuid",
    "status": "pending" | "running" | "done" | "failed",
    "startedAt": "2026-05-25T...",
    "finishedAt": "2026-05-25T...",     // status=done/failed 时填
    "candidate": { /* 更新后的 candidate 快照 */ },  // status=done 时填
    "match": {...},                       // status=done 且有 jobId 联评时填
    "reparsed": true,                     // 标识是 reparse 路径
    "error": {                            // status=failed 时填
      "code": "kimi_upstream_error" | "kimi_timeout" | "r2_object_not_found" | ...,
      "message": "...",
      "statusCode": 422
    }
  }
}
```

任务 Redis TTL 1 小时(降级到 in-process Map)。404 表示任务不存在或已过期。

## 12.4 POST /api/resumes/match

事后给已有候选人关联 JD 二次评估(同步):
```json
{ "candidateId": "uuid", "jobId": "uuid", "model": "moonshot-v1-128k" }
```

响应:
```json
{
  "candidate": { /* 更新后的 candidate, jobId/jdMatch/risks/highlights/appliedFor/aiSuggestedTags/matchedFor/againstFor/insights 已写入 */ },
  "match": { "jdMatch": 75, "risks": [...], "highlights": [...], "matchReason": "...",
             "matchedFor": [...], "againstFor": [...], "aiSuggestedTags": [...], "insights": [{kind:"up", text:"..."}, ...] }
}
```

### Kimi 鲁棒性设计(v3)

- 上游错误码: 后端统一改 5xx → 4xx(`422 kimi_upstream_error` / `408 kimi_timeout` / `424 kimi_not_configured`),避免 Cloudflare 替换 origin 5xx 为 HTML 错误页
- LLM JSON 4 层 fallback: 直接 parse → 手写 sanitize(中文全角符号 / markdown fence / trailing comma) → `jsonrepair` 库 → 抛 422 含 raw snippet
- `parseResume` 失败自动 retry 1 次(LLM 输出抖动)
- 429 / 5xx 自动指数 backoff retry(1.5s → 3.6s → 8.6s,最多 3 次)缓解 `engine_overloaded`
- `AbortController` 控制 fetch:chat 90s / files 60s,backend 抢先 nginx upstream(180s)abort,返回结构化 error
- 简历解析自动选 non-reasoning model(`pickParseModel`):admin 配 kimi-k*/thinking → 强制 fallback `moonshot-v1-32k`(reasoning model 长输入易超 timeout)

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
  "duration": "3d",            // 1d/3d/7d/30d/forever/自定义 (60s-30d, 形如 "10m" "12h" "5d")
  "maxViews": 10,              // 1-9999 或 null (不限)
  "showContact": true,         // 可选, 默认 true — 公开页是否露 mask 后的 phone/email
  "showAttachments": false     // 可选, 默认 false — 公开评价表单是否允许上传附件
}
```

响应 201 含 `link`(含 showContact / showAttachments 字段)。

## 14.3 PATCH /api/candidates/:id/share

部分修改(不重置 token):
```json
{
  "duration": "7d",
  "maxViews": 100,
  "showContact": false,
  "showAttachments": true
}
```
duration / maxViews / showContact / showAttachments 至少给一个。

## 14.4 DELETE /api/candidates/:id/share

204,立刻失效。

## 14.5 GET /api/public/share/:token  (公开,无鉴权)

返回候选人简报 + 分享元数据 + 可见性 flag。**只返回此候选人**。

可见性策略:
- `showContact=true`  → phone/email 自动 mask(`138****5678` / `ab***@x.com`)
- `showContact=false` → phone/email 字段返回 `null`,前端按 null 渲染「分享方已隐藏联系方式」
- `showAttachments`   → 透传到响应的 `share.showAttachments`,前端控制附件 input 显隐

响应结构:
```json
{
  "candidate": { /* 已 mask 的候选人字段 */ },
  "share": {
    "expiresAt": "...",
    "viewCount": 3,
    "createdAt": "...",
    "showContact": true,
    "showAttachments": false
  }
}
```

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
| POST | `/api/public/share/:token/presigned-url` | 给评价附件上传用(key 限定 `reviews/public/` 前缀)。**ShareLink.showAttachments=false 时直接 403 `attachments_disabled`**(防绕过前端 UI) |
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
