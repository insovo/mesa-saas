---
title: "Overseas R&D · 后端标准 API 接口参考手册"
author: "Overseas R&D 交付组"
date: "2026-07-17"
---

# 1. 通用约定

- **Base URL**: `https://<生产域名>/api`
- **协议**: HTTPS(生产) / HTTP(本地 dev)
- **认证**: 默认需要 `Authorization: Bearer <JWT>`。**公开无鉴权例外**:`/api/health` · `/api/auth/login`(及验证码相关) · `/api/public/share/*` · `/api/public/upload/*` · `/api/public/interview-eval/*` · `/api/public/performance-eval/*` · `/api/feishu/card-callback`
- **请求体**: `Content-Type: application/json`
- **时间格式**: ISO 8601,UTC(`2026-05-22T07:30:00.000Z`)
- **ID 格式**: `id` 为 UUID v4(数据库主键);`externalId` 为短码(如 `c-001` `j-001` `E-0008`),前端可双向兼容
- **分页**: `?skip=0&take=50`(默认 take=50,最大 200)
- **过滤**: 各资源支持的 query 参数见下文
- **绩效公开第二因子**: Header `X-Perf-Access-Key`(详见 §18)

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
| `ownerId` | string | — | V3 — 传 `"me"` 自动替换为当前 user.sub;传 uuid 直接过滤;不传 = 不限。Upload 页拉"我接收到的简历"用 |
| `orderBy` | string | `updatedAt` | V3 — `createdAt` 或 `updatedAt`,desc 排序 |
| `skip` | int | 0 | 分页偏移 |
| `take` | int | 50 | 单页大小,1-200 |

响应每条 candidate 自动 include `job: {id, title, dept}` + `department: {id, name, code}`(V3 加,给前端 chip 显示用)。

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

两种调用模式(请求体 `key` 与 `candidateId` 互斥,schema oneOf 强制二选一)。**自 2026-05-26 起两种模式均异步任务化**(根治 `.doc` 等格式 Kimi >90s timeout)。

### (a) 新建候选人(异步,V3)— 传 `key`

```json
{
  "key": "uploads/abc.pdf",       // R2 object key
  "contentType": "application/pdf",
  "model": "moonshot-v1-32k",      // 可选, 不传用 SystemSetting 配置
  "jobId": "uuid",                  // 可选, 传了会自动跑 JD 二次评估
  "filename": "candidate.pdf",      // 可选, 用于降级时 candidate.name
  "source": "罗卡推荐"             // 可选, 覆盖默认 "自动上传"
}
```

后端立即 202 返回 `task`,setImmediate(runParseAndCreate) 跑:R2 拉文件 → PDF 本地 layout 抽取或 Kimi /files fallback → /chat/completions JSON → 若 jobId 跑 matchAgainstJob → **Prisma create candidate**(已写 DB,owner=req.user.sub)→ markDone。前端 2s 轮询 §12.3 直到 done/failed。

响应 202(mode="create"):
```json
{
  "task": {
    "id": "uuid",
    "candidateId": null,           // mode=create 时 task 完成后 candidate.id 在 task.candidate 字段
    "mode": "create",
    "status": "pending",
    "startedAt": "2026-05-26T..."
  }
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
- **传 `null`**:取消 JD 关联,清空 `candidate.jobId` + jdMatch/risks/highlights/insights 等 JD 评估字段;保留/重写 skills/experience/educationHistory 等简历事实字段
- **传 uuid**:切到该 JD,跑 matchAgainstJob,并同步把 `candidate.jobId` 也更新

后端立即 202 返回 taskId,fire-and-forget 跑 Kimi(后端用 `candidate.attachment` 作 R2 key,**UPDATE** 现有 DB 行,不破坏 status/appliedFor/source/owner/documents)。绕过 Cloudflare 100s origin response 硬上限。

**解析流水线**(2026-06 改造):
- 文件抽取:PDF 优先 `pdftotext -layout` 保留视觉顺序;扫描/空文本和 DOC/DOCX/DOC fallback 到 Kimi Files API;抽取后清理水印 token / Word 页脚 / 分页符
- parseResume 产 `summary` + 基础字段(name/phone/email/school/major/yearsExp/...) + `tags/languages` + `skills/experience/educationHistory` markdown bullet 字符串
- matchAgainstJob(如有 jobId)只产出 jdMatch + risks/highlights/insights/aiSuggestedTags/matchedFor/againstFor,不再改写简历主体展示字段

响应 202(mode="reparse"):
```json
{
  "task": {
    "id": "uuid",
    "candidateId": "uuid",
    "mode": "reparse",
    "status": "pending",
    "startedAt": "2026-05-26T..."
  }
}
```

错误响应(4xx,Cloudflare 透传 JSON body):
- 424 `kimi_not_configured` / `r2_not_configured`
- 404 `candidate_not_found`
- 400 `no_attachment`(候选人无简历附件)

## 12.2a POST /api/resumes/parse-jd  (V3, 2026-05-26)

JD 文件 AI 抽取 — 用户在 Upload 页"新建 JD"弹窗上传 JD 文件(PDF/DOCX/DOC,≤20MB),后端调 Kimi 抽取成 `Job` 模型对齐的结构化字段,前端弹窗展示供用户编辑确认再 POST /jobs 落库。
文件抽取使用 `kimi.jd_model`(未设置时沿用系统模型),以账号实际可用模型为准。

```json
{
  "key": "uploads/jd-xxx.pdf",     // R2 object key (presigned + confirm 同款流程)
  "contentType": "application/pdf",
  "model": "kimi-k2.6"              // 可选
}
```

响应 200:
```json
{
  "job": {
    "title": "高级前端工程师",
    "description": "整段 JD 描述, ≤10000 字符",
    "responsibilities": ["职责 1", "职责 2", ...],
    "requirements": ["要求 1", ...],
    "nice": [...],
    "benefits": [...],
    "employment": "全职",
    "salary": "30K-40K · 16薪",
    "levelRange": "P6-P7",
    "yearsExpRange": "5-7 年",
    "educationRequirement": "本科及以上",
    "languageRequirement": "英语 CEFR B2+"
  },
  "meta": { "fileId": "...", "model": "...", "usage": {...} }
}
```

错误响应:
- 424 `kimi_not_configured` / `r2_not_configured`
- 404 `r2_object_not_found`
- 400 `empty_file`,413 `file_too_large`(>20MB)
- 502 `kimi_error`(LLM 上游错)

## 12.2b POST /api/jobs/parse-text

纯文本 JD 抽取草稿,用于普通岗位、校招岗位和简历上传页的新建 JD。需要 `job.create` 权限,或 `campus` 页面加 `campus.manage` 权限,且 Kimi Key 已配置。只读取文字,不上传文件、不创建岗位,返回后由用户核对并保存。请求体:`{"title":"岗位名称","text":"JD 原文,10–20000 字"}`。响应:`{"job":{"title":"原岗位名称","description":"原文","dept":"…","location":"…","employment":"…","salary":"…","openings":1,"responsibilities":[],"requirements":[],"nice":[],"benefits":[]},"meta":{"model":"…","usage":{}}}`;未提到的字段为空或 `null`。调用使用独立设置 `kimi.jd_model`;该设置未配置时沿用系统默认模型。JD 纯文本只提取展示字段,较复杂的 `jdFacts` 仍在评价模型生成流程中抽取。

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
- `showContact=true`  → phone/email **完整返回**(不打码)
- `showContact=false` → phone/email 字段返回 `null`,前端渲染「分享方已隐藏联系方式」;简报内联系方式行抹成「[已隐藏]」
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

# 16. UploadShareLink · 公开上传简历(V3, 2026-05-26)

ShareLink (§14) 是「候选人简报对外」,UploadShareLink 是镜像反向 — 招聘官生成 token,候选人本人 / 同事 / 猎头通过公开链接上传简历。完整设计见 CLAUDE.md §11.5。

## 16.1 GET /api/upload-links  (admin)

列出当前用户创建的所有上传链接(单用户允许多个并存,each 独立 token)。

响应 200:
```json
{
  "links": [{
    "id": "uuid", "token": "32 字符 URL-safe",
    "defaultJobId": "uuid|null", "defaultJob": { "id":"uuid","title":"...","dept":"..." } | null,
    "defaultSource": "罗卡推荐|null", "note": "招聘官给上传者的提示|null",
    "expiresAt": "ISO|null", "maxUploads": 200|null, "uploadCount": 0,
    "createdBy": "uuid", "lastUploadAt": "ISO|null",
    "createdAt": "ISO", "updatedAt": "ISO"
  }, ...]
}
```

## 16.2 POST /api/upload-links  (admin)

创建新上传链接。

```json
{
  "defaultJobId": "uuid|null",       // 可选, 预填到 candidate.jobId
  "defaultSource": "罗卡推荐|null",   // 可选, ≤500 字符, 预填到 candidate.source(被外部用户覆盖)
  "note": "请上传 PDF, 24h 内联系|null",  // 可选, ≤1000 字符, 公开页头部 amber 提示卡显示
  "duration": "30d",                 // 必填, 同 14.2(60s-30d / forever)
  "maxUploads": 200                  // 可选, null=不限, 1-9999
}
```

响应 201:同 16.1 单条 `{ link }`。

## 16.3 DELETE /api/upload-links/:id  (admin)

删除自己的链接(非自己创建的返回 403,ADMIN 可强删任何人的)。响应 204。

## 16.4 GET /api/public/upload/:token  (公开,无鉴权)

公开页打开时调用,拿元数据渲染表单。

响应 200(剔除敏感字段):
```json
{
  "link": {
    "token": "...",
    "defaultJob": { "id": "uuid", "title": "高级前端工程师" } | null,
    "defaultSource": "罗卡推荐|null",
    "note": "招聘官留言|null",
    "expiresAt": "ISO|null",
    "maxUploads": 200|null, "uploadCount": 5
  }
}
```

错误响应:
- 404 `link_not_found`(token 无效或已删)
- 410 `link_expired`(`expiresAt < now`)
- 410 `link_quota_exceeded`(`uploadCount >= maxUploads`)

## 16.5 POST /api/public/upload/:token/presigned-url  (公开)

给公开页上传文件用,token-gated 签发 R2 presigned PUT URL。

```json
{ "filename": "abc.pdf", "contentType": "application/pdf", "expectedSize": 1024 }
```

仅接受 MIME:`application/pdf` / `application/msword` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document`。Key 生成规则:`resumes/public-uploads/<YYYY-MM>/<uuid>.<ext>`(跟 admin 主桶 `resumes/<YYYY-MM>/` 分离便于审计)。

响应 200:`{ uploadUrl, key, expiresIn: 900 }`。

错误同 16.4 + 503 `r2_not_configured` + 400 `unsupported_type`。

## 16.6 POST /api/public/upload/:token/submit  (公开)

完成 R2 PUT 上传后,提交创建 candidate + uploadCount++。

```json
{
  "key": "resumes/public-uploads/2026-05/abc.pdf",   // 必填, presigned 拿到的 key
  "filename": "abc.pdf",                              // 可选, 降级时用
  "name": "张三|null",                                // 可选, 上传者填的姓名(降级时用作 candidate.name)
  "contact": "138****5678|null",                      // 可选, 联系方式 → candidate.phone
  "source": "猎头-罗卡推荐|null",                    // 可选, 覆盖 link.defaultSource
  "uploaderNote": "毕业 985, 期待背景|null"          // 可选, ≤2000 字符 → 写入 CandidateNote 表
}
```

后端事务:
1. `prisma.candidate.create({ ownerId: link.createdBy, jobId: link.defaultJobId, appliedFor: link.defaultJob.title, source: 用户填 || link.defaultSource || "[公开上传]", tags: ["待解析","公开上传"] })`
2. uploaderNote 非空时 `prisma.candidateNote.create({ candidateId, content, authorName: name || "公开上传访客" })` → 候选人详情页"备注"卡显示
3. `prisma.uploadShareLink.update({ uploadCount: +1, lastUploadAt: now })`

响应 201(不返回 candidate 详细给陌生上传者):
```json
{ "ok": true, "uploadCount": 6, "maxUploads": 200 }
```

错误同 16.4 + 简化策略:**公开上传不立即跑 LLM 解析**,降级入库 tags `["待解析","公开上传"]`,admin 后续在 Upload 列表点"解析"按钮(§12.2 reparse 路径)触发 Kimi。

---

# 17. InterviewEvaluation · 面试评价(V1, 2026-05-27)

> 招聘官生成公开 token,面试官无登录扫码填表;提交后可导出与原 Excel 模板版式完全一致的 .xlsx。
> 详见 [dev-plans/面试评价模块设计规划.md](./dev-plans/面试评价模块设计规划.md)。

模板锁定:`server/assets/templates/interview-evaluation-v1.xlsx` (SHA-256 `02bf31db8256…e645c534`),启动时校验,不一致即 boot fatal。

## 17.1 GET /api/candidates/:id/interview-evals  (admin)

列出某候选人的所有评价邀请,按 createdAt desc。

请求示例:
```http
GET /api/candidates/:id/interview-evals
Authorization: Bearer <token>
```

响应 `200`:
```json
{
  "items": [
    {
      "id": "...",
      "token": "JpZszqKan…",
      "status": "submitted",
      "expiresAt": "2026-06-03T15:51:18Z",
      "interviewer": "王浩",
      "totalScore": 81.5,
      "recommendation": "建议复试",
      "submittedAt": "2026-05-27T15:51:34Z",
      "viewCount": 3,
      "createdAt": "..."
    }
  ]
}
```

## 17.2 POST /api/candidates/:id/interview-evals  (admin)

新建评价邀请,自动从 candidate 预填 9 字段(姓名/岗位/部门/城市等)。

入参:
```json
{
  "interviewer": "王浩",
  "interviewId": "uuid-or-null",
  "duration": "7d",
  "prefill": true
}
```

`interviewer` 必填,长度 1-100。`duration` 默认 "7d" (3d / 7d / 30d / forever / 自定义 60s-30d)。

响应 `201`: `{ item: <eval-record> }`,token 字段即公开访问凭证。

## 17.3 GET /api/interview-evals/:id  (admin)

单条详情。ADMIN 全可看;RECRUITER 只能看自己创建的。

## 17.4 PATCH /api/interview-evals/:id  (admin)

改有效期 / 撤销 / admin 退回编辑(`status=draft`)。

```json
{ "duration": "30d" }
// 或
{ "status": "revoked" }
// 或 (仅 ADMIN)
{ "status": "draft" }   // 退回让面试官继续编辑
```

## 17.5 DELETE /api/interview-evals/:id  (admin only)

软删除,不物理删除(`deletedAt` 标记)。仅 ADMIN。

## 17.6 GET /api/interview-evals/:id/export.xlsx  (admin)

导出与原模板版式 100% 一致的 .xlsx(13 处合并 / 9 个公式 / 数据校验 / 列宽行高 / freeze pane 全保留)。流式响应,文件名 RFC 5987 中文编码。

响应头:
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="..."; filename*=UTF-8''属地员工面试评价表_姓名_岗位_yyyy-MM-dd.xlsx
```

## 17.7 GET /api/public/interview-eval/:token  (公开,无鉴权)

面试官打开链接拉表单数据 + 评分标准。响应 `200`:

```json
{
  "evaluation": {
    "candidateName": "刘晓萌",
    "position": "高级前端开发",
    "interviewer": "王浩",
    "interviewDate": null,
    "scores": [
      { "key": "communication", "name": "沟通表达", "weight": 15, "score": null, "remark": "" }
      // …7 维度
    ],
    "strengths": null, "risks": null, "followUpQuestions": null, "finalOpinion": null,
    "totalScore": null, "recommendation": null,
    "status": "link_sent"
  },
  "meta": {
    "expiresAt": "…",
    "submittedAt": null,
    "templateVersion": "v1",
    "readonly": false,
    "canExport": false
  },
  "scoringRubric": [
    { "dimension": "沟通表达", "definition": "…", "levels": [{"range":"9-10","desc":"…"}, …] }
    // …7 维度
  ]
}
```

错误:`404 eval_not_found` / `410 eval_expired` / `410 eval_revoked`。

## 17.8 PATCH /api/public/interview-eval/:token  (公开)

保存草稿,deep-merge,仅更新传入字段。`status="link_sent"` 首次 PATCH 自动升 `draft`。`status="submitted"` 时返回 `409 eval_already_submitted`。

可接受字段:`position` / `region` / `interviewDate` / `interviewer` / `languageStrength` / `currentCity` / `department` / `timezoneCollaboration` / `scores[]` / `strengths` / `risks` / `followUpQuestions` / `finalOpinion`。

## 17.9 POST /api/public/interview-eval/:token/submit  (公开)

提交评价。后端校验必填(7 项评分必须为 1-10 整数 + 最终意见非空 + candidateName/position/interviewDate/interviewer 非空)。

校验失败 `422 eval_validation_failed`:
```json
{ "error": "eval_validation_failed", "details": [{ "field": "...", "message": "..." }] }
```

成功:状态 → `submitted`,计算并存 `totalScore` + `recommendation`。**幂等**:已提交再次提交不报错,返回当前数据。

## 17.10 GET /api/public/interview-eval/:token/export.xlsx  (公开)

提交后下载本次评价 xlsx(决策 4:面试官可自留底)。未提交时返回 `403 eval_export_disabled`。

## 17.11 候选人状态联动规则(2026-05-27)

两条业务规则,自动同步 candidate.status 与入职管理:

### 规则 1:切换关联 JD → status 重置 + Employee 清理

任意路径切 jobId(`POST /api/resumes/match` 切 JD,或 `PATCH /api/candidates/:id` 直接改 jobId)触发:

- `candidate.status` 自动回 `待筛选`(若调用方未显式设 status)
- 对应 Employee 记录 `stage=待入职`(HR 未推进)→ 删
- `stage` ∈ {`入职准备` / `入职当天` / `试用期` / `已转正` / `延期试用`} → **保留**,不破坏 HR 数据

### 规则 2:安排面试 → status 自动推进「面试中」

`POST /api/interviews` 创建成功后:

- 若 `candidate.status` ∈ {`null` / `待筛选` / `已沟通`} → 升到 `面试中`
- 若已经在 `面试中` / `待定中` / `待入职` / `已入职` / `已淘汰` → **不动**(幂等保护,不倒退)

实现见 `server/src/lib/candidateToEmployee.js` 的 `cleanupEmployeeOnJobChange` + `shouldAutoAdvanceToInterviewing`。

---

# 18. PerformanceEvaluation · 员工绩效评价(2026-07)

权限:`assertPage(..., "performance")` + JWT。公开端点无 JWT,须有效 token + **访问密钥**。产品说明见 [`06_performance_evaluation.md`](./06_performance_evaluation.md)。

## 18.1 登录态端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/performance/people` | 人员列表;可惰性补「已入职」缺 employee;`latestEvaluation` 可含 self/manager **Token**(等同分享凭证) |
| POST | `/api/performance/people` | 新建人员(`source=绩效评价新建`,默认 stage=试用期) |
| POST | `/api/performance/evaluations` | 创建评价;响应含一次性明文 `selfAccessKey` / `managerAccessKey` |
| POST | `/api/performance/evaluations/bulk` | 批量创建(≤100);每项带回明文密钥 |
| GET | `/api/performance/evaluations` | 列表(`employeeId` 可选;非 admin 走 employee scope) |
| GET | `/api/performance/evaluations/:id` | 详情 |
| PATCH | `/api/performance/evaluations/:id` | 改内容 / **轮换 URL token**(不改密钥) / 有效期 / 编辑次数;admin 可将 `submitted→draft` |
| POST | `/api/performance/evaluations/:id/revoke` | 撤销 |
| POST | `/api/performance/evaluations/:id/access-keys/ensure` | 解密回显或补生成缺失密钥 |
| POST | `/api/performance/evaluations/access-keys/bulk` | `mode=generate\|set`,目标 `self`/`manager`/`both` |
| POST | `/api/performance/evaluations/access-keys/preview` | 导出前预览明文(**缺 enc 会生成并写入**) |
| POST | `/api/performance/evaluations/access-keys/export.xlsx` | 密钥 Excel(≤200 行;含链接、密钥、邮箱、电话) |
| GET | `/api/performance/evaluations/:id/export.xlsx` | 评价表导出;`lang=zh-en`;`embedHrSignature=true` 嵌入当前用户 HR 章 |
| GET | `/api/performance/hr-signature` | 当前用户电子章元数据 |
| POST | `/api/performance/hr-signature/presigned-url` | 签发上传 |
| PUT | `/api/performance/hr-signature` | 确认 key |
| DELETE | `/api/performance/hr-signature` | 删除并清理 R2 |

### 创建评价 body 要点

```json
{
  "employeeId": "uuid",
  "reviewPeriod": "2026Q3",
  "expiresAt": "2026-09-30T00:00:00.000Z",
  "selfMaxEdits": 20,
  "managerMaxEdits": 20
}
```

响应含 `selfToken` / `managerToken` 与明文密钥。公开 URL:`https://<host>/performance-eval/<token>`。

### 密钥 Excel 列

| 勾选目标 | 列 |
|----------|----|
| 自评 | 工号、姓名、部门、岗位、职级、直属主管、评价周期、自评链接、密钥、邮箱、电话 |
| 主管 | …、主管链接、密钥、邮箱、电话 |
| 双方 | …、自评链接、密钥、主管链接、密钥、邮箱、电话 |

## 18.2 公开端点(无 JWT)

前缀:`/api/public/performance-eval/:token`  
Header 必填:`X-Perf-Access-Key: <明文密钥>`

| Method | Path | 说明 |
|--------|------|------|
| GET | `/` | 读表单;过期/撤销/密钥失败返回对应 4xx |
| PATCH | `/` | 草稿;`autosave:true` **不占**编辑配额 |
| POST | `/submit` | 提交(须已签字);主管提交可直接 `submitted` |
| POST | `/signature/presigned-url` | 签字 PNG 预签名(≤1MB) |
| PUT | `/signature` | 确认签字 key |
| GET | `/export.xlsx` | 仅 `status=submitted` |

## 18.3 错误码(绩效)

| HTTP | error | 含义 |
|------|-------|------|
| 401 | `access_key_required` / `access_key_invalid` / `access_key_locked` / `access_key_not_configured` | 密钥门禁(前端**勿**当登录失效跳 Login) |
| 410 | `eval_expired` / `eval_revoked` 等 | token 失效 |
| 422 | `signature_required` | 提交缺签字 |
| 422 | `hr_signature_missing` | 导出勾选嵌入但当前用户无章 |
| 429 | `edit_quota_exceeded` | 非 autosave 且编辑次数用尽 |

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
| `InterviewEvaluation.status` | `link_sent` `draft` `submitted` `revoked` | 面试评价状态机(详见 §17) |
| `InterviewEvaluation.recommendation` | `建议录用` `建议复试` `谨慎考虑` `不建议录用` | 提交时按 totalScore 自动推断 |
| `PerformanceEvaluation.status` | `draft` `self_done` `submitted` `revoked` | 员工绩效评价(详见 §18) |
| `PerformanceEvaluation.rating` | `A` `B` `C` `D` `E` | 按加权总分推断;D/E 触发 PIP |

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
| 401 | `access_key_required` / `access_key_invalid` / `access_key_locked` / `access_key_not_configured` | 绩效公开访问密钥(§18) |
| 403 | `forbidden` / `admin_only` / `name_mismatch` | 越权 |
| 404 | `not_found` / `share_not_found` / `candidate_not_found` | 资源不存在 |
| 410 | `share_expired` / `share_quota_exceeded` | ShareLink 过期或耗尽 |
| 409 | `eval_already_submitted` | 已提交的面试评价不允许再 PATCH 草稿(§17.8) |
| 410 | `eval_expired` / `eval_revoked` / `eval_not_found` | 面试/绩效评价 token 失效 |
| 422 | `kimi_error` | Kimi 上游返回错误 |
| 422 | `eval_validation_failed` | 面试评价提交时必填字段缺失或评分不合法(§17.9) |
| 422 | `signature_required` / `hr_signature_missing` | 绩效签字/HR 章(§18) |
| 429 | `edit_quota_exceeded` | 绩效公开编辑次数用尽(§18) |
| 403 | `eval_export_disabled` | 公开端口尝试导出未提交的评价(§17.10) |
| 503 | `kimi_not_configured` / `r2_not_configured` | 后端依赖未配置 |

# 19. 校招模块(Phase 0 后台,2026-10-08)

前缀 `/api/campus`,全部登录态 + pageKey `campus`;写专场 / 岗位 / 设置需模块 `campus.manage`;导出需 `campus.export`;联系方式字段无 `candidate.contact` 时打码。设计文档见 `校招模块/校招模块设计规划.html`,学生端公开端点 `/api/campus/public/*` 随 Phase 1 补充。

## 19.1 专场

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/sessions` | 全部专场(live 置顶),含 `jobsCount / applicantsCount / applicationsCount` |
| POST | `/sessions` | 新建;body `name`(必填)`slug school location startsAt endsAt heroTitle heroSubtitle maxApplyJobs maxResumeUploads scoreFloor matchEnabled showSalaryOnsite showSalaryReferral`;slug 为空自动生成,重复 409 `campus_slug_taken` |
| GET / PATCH / DELETE | `/sessions/:id` | 详情(含 `jobs[]`)/ 更新 / 删除(已有学生 409 `campus_session_not_empty`)|
| POST | `/sessions/:id/live` · `/close` · `/draft` | 上线(事务内把其它 live 改 closed)/ 结束 / 退回草稿 |

## 19.2 专场岗位

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET / POST | `/sessions/:id/jobs` | 列表 / 加入 `{ jobId, kind: onsite\|referral, matchEnabled, sortOrder }`;已有岗位须在当前账号的岗位数据范围内;重复 409 `campus_job_exists` |
| PATCH / DELETE | `/sessions/:id/jobs/:sjId` | 改 kind / matchEnabled / sortOrder(不允许改 jobId)/ 移除(已有投递 409 `campus_job_has_applications`)|
| PATCH | `/sessions/:id/jobs/bulk` | 批量编辑当前专场岗位;body `{ ids: [sessionJobId], changes: { kind?, dept?, location?, employment?, salary?, educationRequirement?, languageRequirement?, openings?, deadline?, niceAdd?, benefitsAdd? } }`;`niceAdd` / `benefitsAdd` 为待追加的字符串数组。1–200 个唯一 id,仅修改传入字段,事务内校验全部属于该专场,否则 409 `campus_jobs_changed`;追加后任一岗位超过 20 条则 409 `campus_job_items_limit`,整批不保存;返回 `{ updated }` |
| POST | `/sessions/:id/jobs/reorder` | `{ ids[] }` 按顺序写 sortOrder |
| POST | `/sessions/:id/jobs/new` | 新建 Job 并事务内加入专场;`title` 必填,另收 JD 字段与 `kind / matchEnabled`;返回 201 `{ item }` |
| PATCH | `/sessions/:id/jobs/:sjId/job` | 编辑共享 Job 的 JD 字段,同步所有引用它的专场与系统岗位页;返回 `{ item }` |
| POST | `/sessions/:id/jobs/:sjId/evaluation-model` | body `{}`;从当前 JD 重新抽取事实并生成校园招聘模板,一次落库;仅需 `campus.manage`,不需 `job.edit` |

返回的 `job` 含 JD 编辑字段、`hasJdFacts / hasEvaluationModel / evaluationModelUpdatedAt / updatedAt / sessionsCount`。JD 字段为 `title dept owner location employment salary educationRequirement languageRequirement openings deadline description responsibilities requirements nice benefits`。标题不可全空白;职责 / 要求 / 加分项最多 20 条、每条 500 字;福利最多 20 条、每条 200 字。前端超限时提示,不截断内容。

`openings=0` 表示「名额不限」,校招与普通岗位页均按此回显;`deadline=null` 表示不设截止日期。批量编辑中的 `kind` 仅影响本专场关联记录,其他 JD 字段修改共享 Job,会同步系统岗位页与其他专场。`niceAdd` / `benefitsAdd` 保留每个岗位原有条目并去重,每次最多追加 20 条,条目长度分别不超过 500 / 200 字。批量生成评价模型复用单岗位接口逐个执行,逐项返回成功或失败。

新建、编辑与生成均要求页面 `campus` + 模块 `campus.manage`。新建 Job 时给非管理员创建者增加该岗位的数据范围,因此移除专场绑定后仍可从已有岗位重新加入。已有岗位的加入遵循原岗位数据范围;查看与编辑已绑定专场岗位遵循校招权限。

模型生成使用 `tpl.campus.general`,递增 `evaluationModelVersion`。Kimi 调用期间若岗位被修改,返回 409 `campus_job_changed`,不覆盖新 JD;上游失败返回结构化 4xx 并保留原模型。共享岗位重新生成模型也同步影响所有引用方。编辑 JD 不自动重新调用 AI,内容有变时应点击「重新生成评价模型」。

## 19.3 台账

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/sessions/:id/ledger` | query `q jobId kind source status school degree gradYear parse(done\|running\|pending\|failed\|none) contact(confirmed\|unconfirmed) skip take`;返回 `{ items[], total, stats{ applicants withResume confirmed applications byStatus onsiteInterview passed }, showContact, gate{ running queued } }`。`items[].bestMatchScore` 为当前简历最近一次未过期、已完成匹配的全部 JD 中最高展示分,无有效分数时为 `null` |
| GET | `/sessions/:id/ledger/export.xlsx` | 同筛选,≤500 行,含联系方式与原始分;公式注入前缀 `'` |

## 19.4 学生 / 简历版本 / 投递

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/sessions/:id/applicants` | HR 登记:`phone`(必填)`name email wechat school major degree gradYear contactConfirmed jobIds[] resume{ key filename size contentType sha256 }`;事务内建 / 复用 Candidate(同手机号跨专场复用)+ 学生 + 版本 v1 + 投递(source=hr),成功后 `setImmediate` 起抽取;同专场同手机 409 `campus_applicant_exists` |
| GET / PATCH / DELETE | `/applicants/:id` | 详情(版本 / 投递 / 近 10 次匹配,`applicant.bestMatchScore` 与台账同口径)/ 更新(同步 Candidate 姓名 / 联系方式 / 学校;`extraUploads` 加次数;`contactConfirmed`)/ 删除登记(需 `campus.manage`,Candidate 保留)|
| POST | `/applicants/:id/resumes` | HR 代传新版:次数超限 410 `campus_resume_quota_exceeded`;非 PDF/Word 415 `campus_file_unsupported`;返回 `{ version, taskId }`,旧匹配结果标 stale |
| POST | `/applicants/:id/resumes/:versionId/reparse` | 重试解析(仅当前版;running 时 409 `campus_parse_in_progress`;Kimi 未配置 424;cancelled 可重试)|
| POST | `/applicants/:id/resumes/:versionId/cancel` | 取消进行中的抽取(协作式,写审计 `campus.resume.cancel_parse`)|
| POST | `/applicants/:id/match-runs` | HR 代跑智能匹配(规则同学生端);`GET /applicants/:id` 的 `matchRuns[]` 带原始分 / 分类 / 成本 |
| POST | `/applicants/:id/match-runs/:runId/cancel` | 取消匹配 |
| GET | `/by-candidate/:candidateId` | 候选人详情「校招」卡:`{ applicant, session, latestMatchRun }`,非校招候选人 `{ applicant: null }` |
| POST | `/applicants/:id/merge` | `{ candidateId }` 合并电脑端上传:源候选人须有附件、未绑定学生、未合并过(409 `campus_merge_self / campus_merge_linked / campus_merge_no_attachment / campus_merge_done`);作为新版本并触发抽取,次数不足自动 `extraUploads+1`,补空字段,源候选人 tags+`已合并到校招` 且置已淘汰,写 CandidateNote |
| POST | `/applications/:id/interview` | `{ scheduledAt, location?, interviewer?, round?, notes? }` 安排现场面试:建 `Interview`(mode 线下 / category 校招 / link=地点)+ 投递→`onsite_interview` + 候选人→面试中;内推岗位 409 `campus_not_onsite` |
| POST | `/applications/bulk-interview` | 同上 + `ids[]`,跳过内推投递,返回 `{ created, skipped }` |
| PATCH / bulk-status | `advance: true` | 与 `status=passed` 同用:候选人置「待入职」并把主投递设为该岗位,自动创建 employee(已存在不动 stage)|
| POST | `/sessions/:id/pc-upload-link` | `{ regenerate? }`(需 `campus.manage`)按需创建并绑定公开上传链接(永久 / 不限份数,`defaultSource=校招·<专场>·电脑上传`),返回 `{ token, path }`;学生端 `session/current.pcUpload.path` 下发 |
| GET | `/sessions/:id/stats` | 数据看板:`totals / funnel[] / bySource / bySchool[] / byDegree[] / byJob[] / daily[] / parse / matchRuns` |
| GET | `/applicants/:id/resumes/:versionId/download` | 需 `candidate.attachments`;302 到 R2 短时 URL |
| POST | `/applicants/:id/applications` | `{ jobId }` 补投递(source=hr);岗位不在专场 404 `campus_job_not_in_session`;重复 409 `campus_duplicate_application`;额度 409 `campus_apply_quota_exceeded` |
| PATCH | `/applications/:id` | `{ status, note }`;status ∈ applied/screening/onsite_interview/referred/passed/rejected/withdrawn,变更写 `statusChangedAt` 与审计 |
| POST | `/applications/bulk-status` | `{ ids[], status }` |
| DELETE | `/applications/:id` | 移除投递记录 |

## 19.5 设置

`GET /settings`(admin 或 `campus.manage`)/ `PUT /settings`(仅 admin):`matchConcurrency authJwtTtl codeCooldownS codePerHour contactHints[] pcUploadEnabled`,落 `SystemSetting` 键 `campus.match.concurrency / campus.auth.jwt_ttl / campus.auth.code_rate / campus.contact_hints / campus.pc_upload_enabled`。

## 19.6 流水线扩展

`runPipeline(app, taskId, { mode:"reextract", candidateId, skipEvaluate:true })`:只跑文档层 + 理解层,不碰候选人 `jobId` 与评估快照。校招「上传即抽取」与后续 Phase 2 匹配(先抽取后逐岗位评估)均依赖此开关。

**detached / skipReport**(校招匹配):`runPipeline({ mode:"reevaluate", candidateId, jobIdOverride, detached:true, skipReport:true })` 对指定岗位只评估:复用最近 `ResumeParse` 与 `candidate.profile`,写 `CandidateEvaluation(isCurrent=false, shadow=false)`,不改候选人 jobId / 状态 / 快照,不跑报告层。

**协作式取消**(2026-10-08):`parseTaskStore.requestCancel(app, taskId)` 置 `cancelRequested`;`runPipeline` 在 抽取前 / 抽取后 / 评估前 / 落库前 四个检查点调用 `assertNotCancelled`,命中则抛 `code=cancelled`,统一收尾为 `status=cancelled`(不落库、清 `parsingStartedAt`)。进行中的单次 LLM 调用不会被打断,最多多等一次调用。任务与页面无关,关闭浏览器不影响。

## 19.7 学生端公开端点 `/api/campus/public/*`(Phase 1,2026-10-08,免登录)

AuthGuard 外,学生**不注册不登录**。会话:首次上传前 `POST /auth/start`(勾选告知)匿名建档并签发学生 JWT `{ sub: applicantId, aud: "campus-public", sid, tv }`(有效期 `campus.auth.jwt_ttl`,默认 30d),前端存 localStorage 并以 `Authorization: Bearer` 携带;后台 `authenticate` 拒绝该 aud(401 `bad_audience`),这里只收该 aud。限流档 90 次 / 分钟(含 2s 轮询)。学生入口链接:首页 `/campus/:slug`、直接投递 `/campus/:slug/jobs`、智能匹配 `/campus/:slug/match`(后台专场二维码弹窗三选一)。

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/session/current?slug=` | 可选 | 当前上线专场(或 slug 指定专场);返回 `session{ …, open, preview }`、`me` 摘要(有会话时)、`contactHints[]`、`pcUploadEnabled`;`?preview=1` + 后台 JWT 可看草稿 |
| GET | `/session/current/jobs?slug=` | 可选 | `{ onsite[], referral[] }`;薪资按专场 `showSalaryOnsite / showSalaryReferral` 决定是否下发;有会话时带 `applied` |
| GET | `/jobs/:id?slug=` | 可选 | JD 白名单字段;不在专场 404 `campus_job_not_in_session` |
| POST | `/auth/start` | 可选 | `{ slug?, consent: true }` → `201 { token, me, session, reused:false }` 匿名建档(占位 Candidate + 学生,phone 空);已持本专场有效 token 时 `{ token: null, reused: true }`;422 `campus_consent_required`;专场未开放 410 |
| POST | `/auth/recover/send-code` | — | 找回记录(免登录):`{ slug?, phone, email }` 匹配本专场 `contactConfirmedAt` 非空的记录 → 邮箱验证码(purpose `CAMPUS_RECOVER`,60s 冷却 / 每小时 5 次);404 `campus_record_not_found`;429 `campus_code_rate_limited`;424 `campus_email_send_failed`;未配 Resend 时回 `devCode`(仅开发)|
| POST | `/auth/recover/verify` | — | `{ slug?, phone, email, code }` → `{ token, me, session }`,签新学生 JWT 接回原记录并写 `emailVerifiedAt`;400 `campus_code_invalid` |
| GET / PATCH | `/me` | 学生 | 档案 + 版本 + 投递;PATCH `name wechat school major degree gradYear`(同步 Candidate)|
| POST | `/me/contact-confirm` | 学生 | `{ phone, email, wechat?, name? }`(手机 / 邮箱必填,格式校验)→ 写 `contactConfirmedAt` 并同步 Candidate;422 `campus_phone_invalid / campus_email_invalid` |
| POST | `/resumes/presigned-url` | 学生 | `{ filename, contentType, size }` → `{ uploadUrl, key }`;key `campus/<sessionId>/<applicantId>/v<n>-<ts>.<ext>`;415 / 410 `campus_resume_quota_exceeded` / 503 `r2_not_configured` |
| POST | `/resumes/submit` | 学生 | `{ key, filename, size, contentType, sha256 }`;key 必须本人前缀(403 `campus_key_forbidden`);同 sha256 回 `duplicate:true` 不计次;成功 201 `{ version, remaining, parseTaskId }` 并起抽取 |
| GET | `/resumes` · `/resumes/:versionId/parse-status` | 学生 | 版本列表 / 抽取状态 `{ status: pending\|running\|done\|failed\|cancelled\|skipped, error, prefill{ name school major degree gradYear } }` |
| POST | `/resumes/:versionId/cancel-parse` | 学生 | 取消进行中的抽取:置任务 `cancelRequested`,流水线在阶段边界退出不落库;版本立即 `cancelled`;已结束的原样返回 |
| POST | `/resumes/:versionId/reparse` | 学生 | 取消 / 失败 / 未解析后重跑当前版本(不计上传次数);非当前版 409 `campus_not_current_version`;running 409 `campus_parse_in_progress`;Kimi 未配置 424 |
| POST | `/match-runs` | 学生 | 发起智能匹配(门禁同投递;专场 `matchEnabled`;同学生同时只允许 1 个 409 `campus_match_in_progress`;无可匹配岗位 409 `campus_no_match_jobs`;Kimi 未配置 424)→ `202 { run }` |
| GET | `/match-runs/latest` · `/match-runs/:id` | 学生 | `{ run: { id, status(queued\|running\|done\|failed\|cancelled), stale, progress(0–100), stage, done, total, queuePosition, results?[{ jobId, kind, title, dept, location, scoreShown, excluded, reasons[], error }] } }`;results 仅 done 时返回,只含展示分 |
| POST | `/match-runs/:id/cancel` | 学生 | 协作式取消(岗位之间检查),run 立即 `cancelled` |
| POST | `/applications` | 学生 | `{ jobId, source: direct\|match, matchRunId? }`;`source=match` 时从 run.results 取分数写入投递;门禁 428 `campus_resume_required` → 428 `campus_contact_unconfirmed`;409 额度 / 重复;专场未开放 410 |
| GET | `/applications` | 学生 | 我的投递 |
| DELETE | `/applications/:id` | 学生 | 撤回(仅 applied / screening,否则 409 `campus_cannot_withdraw`)|
| GET | `/health` | — | `{ ok, r2 }` |
