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
