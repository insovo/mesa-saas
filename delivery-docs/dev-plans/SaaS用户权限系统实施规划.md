# MESA Recruit SaaS 用户权限系统实施规划

请先阅读项目根目录 `AGENTS.md`、`server/prisma/schema.prisma`、现有 `auth/system/candidates/jobs/departments/employees` 路由和前端 `AuthGuard/Sidebar/App`。本次目标是实现 SaaS 多用户权限体系，必须保持最小改动，不做无关重构，不提交或推送代码。

## 一、目标

实现三层权限模型：

1. 角色权限：
   - `ADMIN` 是最高权限，默认可访问和操作所有页面、模块、数据。
   - 普通用户继续使用现有 `RECRUITER / VIEWER` 角色，但具体可访问内容由权限配置决定。

2. 数据范围权限：
   - admin 可以把候选人分配给指定用户管理。
   - admin 可以按部门授权，例如用户 A 只看“西班牙研究院”相关候选人、员工、岗位、部门。
   - admin 可以按 JD 授权，例如用户 A 只看“产品定义 JD”相关候选人、员工、岗位。
   - 普通用户默认至少可以看到自己 ownerId 关联的数据。

3. 页面与模块权限：
   - admin 可以控制普通用户能否访问某个页面。
   - admin 可以控制候选人详情等页面内的模块是否展示，例如附件模块、联系方式、AI 洞察、评价、分享链接等。
   - 前端隐藏入口只是体验，后端 API 必须强制校验。

## 二、核心规则

1. ADMIN：
   - 拥有全部页面、模块、数据权限。
   - 可以创建、编辑、停用普通用户。
   - 可以分配用户的数据范围、页面权限、模块权限。
   - 可以修改用户头像、昵称、邮箱、角色、权限。
   - 不能查看任何用户当前密码，只能重置密码或发送密码重置链接。
   - 系统必须保护最后一个 ADMIN，不能删除、停用或降级最后一个 ADMIN。

2. 普通用户：
   - 只能访问被授权的页面。
   - 通过 URL 直接访问未授权页面时，前端展示“无访问权限”，后端返回 403。
   - 列表、详情、搜索、统计、导出、更新、删除都只能作用于自己可见的数据。
   - 没有模块权限时，前端不展示模块，后端也不能返回或允许操作相关数据。

3. 数据范围组合：
   - 推荐使用并集规则：可见数据 = 自己 ownerId 的数据 + 授权部门的数据 + 授权 JD 的数据。
   - 部门授权默认包含该部门及其子部门。
   - JD 授权不自动授予部门管理页面权限。

## 三、建议数据模型

保留现有 `User.role`，新增权限相关模型或字段：

1. `UserAccessPolicy`
   - `userId`
   - `pageKeys String[]`
   - `moduleKeys String[]`
   - `isActive Boolean`
   - `mustChangePassword Boolean`
   - `createdAt / updatedAt`

2. `UserDepartmentScope`
   - `userId`
   - `departmentId`
   - `includeChildren Boolean default true`

3. `UserJobScope`
   - `userId`
   - `jobId`

4. 如实现邮箱验证码和忘记密码，新增：
   - `EmailVerificationCode`
   - 字段包含 `email/userId/purpose/codeHash/expiresAt/consumedAt/attemptCount`
   - purpose 包含 `CHANGE_EMAIL / CHANGE_PASSWORD / RESET_PASSWORD`

新建用户默认安全策略：
- 页面默认不给 `departments / system.llm / users`。
- 数据默认只看自己 ownerId 关联的数据。
- admin 创建用户时必须显式选择部门、JD 或其它权限。

## 四、权限 Key 建议

页面权限：
- `dashboard`
- `candidates`
- `candidate.detail`
- `jobs`
- `upload`
- `staff`
- `newhire`
- `departments`
- `interviews`
- `reports`
- `users`
- `system.llm`

模块权限：
- `candidate.contact`
- `candidate.attachments`
- `candidate.aiInsights`
- `candidate.reviews`
- `candidate.notes`
- `candidate.share`
- `candidate.jdMatch`
- `candidate.edit`
- `candidate.delete`
- `job.create`
- `job.edit`
- `job.delete`
- `department.create`
- `department.edit`
- `department.delete`
- `user.manage`
- `system.llm.manage`

## 五、后端实现要求

1. 新增统一权限工具，例如 `server/src/lib/permissions.js`：
   - `loadUserAccess(userId)`
   - `isAdmin(user)`
   - `assertPageAccess(req, pageKey)`
   - `assertModuleAccess(req, moduleKey)`
   - `buildCandidateScopeWhere(req)`
   - `buildJobScopeWhere(req)`
   - `buildDepartmentScopeWhere(req)`
   - `assertCandidateAccess(req, candidateId)`

2. 所有业务 API 必须接入权限校验：
   - candidates：list/detail/create/update/delete/notes/reviews/share/parse 等。
   - jobs：list/detail/create/update/delete。
   - departments：list/detail/create/update/delete。
   - employees/staff/newhire：list/detail/create/update/delete。
   - interviews：按 candidate/job 可见范围过滤。
   - dashboard/reports：统计只能基于当前用户可见数据。
   - system settings/LLM Key：仅 ADMIN 或 `system.llm.manage`，建议仍只允许 ADMIN。

3. 字段级/模块级保护：
   - 无 `candidate.attachments` 时，候选人详情 API 不返回 `attachment/documents`，storage/presigned-url 相关接口也要拒绝。
   - 无 `candidate.contact` 时，不返回 phone/email。
   - 无 `candidate.share` 时，禁止创建或查看分享链接。
   - 无 `candidate.reviews` 时，禁止查看和操作评价。
   - 无 edit/delete 权限时，禁止 PATCH/DELETE。

4. 返回规范：
   - 未登录：401。
   - 无页面或模块权限：403 `{ error: "forbidden", message: "无访问权限" }`。
   - 数据不存在或不可见：优先返回 404，避免泄露数据存在性。

## 六、前端实现要求

1. `/api/auth/me` 返回当前用户基础信息和权限摘要。
2. `AuthGuard` 继续负责登录校验，新增页面级 `RequirePermission`。
3. `Sidebar` 根据 `pageKeys` 过滤菜单。
4. 直接访问无权限路由时展示统一“无访问权限”页面。
5. 新增 admin 用户管理页面：
   - 用户列表。
   - 创建用户。
   - 编辑头像、昵称、邮箱、角色、状态。
   - 重置密码，不能查看密码。
   - 配置部门范围、JD 范围、页面权限、模块权限。
6. 候选人详情页按模块权限隐藏：
   - 附件模块。
   - 联系方式。
   - AI 洞察/JD 匹配。
   - 评价区。
   - 分享链接。
   - 编辑/删除按钮。
7. 右上角头像菜单：
   - 修改头像、昵称。
   - 修改邮箱，需邮箱验证码。
   - 修改密码，需当前邮箱验证码。
   - 切换账号，等同退出后回登录页。
   - 退出登录。
8. 登录页新增忘记密码：
   - 输入邮箱。
   - 发送验证码。
   - 验证后重置密码。

## 七、安全要求

1. 密码永远不能明文返回、展示或记录日志。
2. admin 只能重置密码，不能查看密码。
3. 邮箱验证码要有过期时间、次数限制、频率限制。
4. `.env.example` 只写占位符，不写真实 SMTP 或密钥。
5. 所有权限判断以后端为准，不能依赖 localStorage。
6. JWT 中不要塞完整权限，权限以 `/me` 或服务端实时查询为准，避免权限变更后旧 token 继续拥有旧能力。

## 八、实施阶段

第一阶段：核心权限
- 数据模型迁移。
- 后端统一权限工具。
- candidates/jobs/departments/employees/interviews/dashboard/reports 接入数据范围过滤。
- 前端菜单、路由、候选人详情模块按权限展示。
- admin 用户管理页面可创建用户并配置权限。

第二阶段：账号自助
- 头像、昵称修改。
- 邮箱验证码修改邮箱。
- 邮箱验证码修改密码。
- 忘记密码重置。

第三阶段：增强
- 审计日志。
- 用户停用。
- 权限预设模板，例如“招聘官”“面试官”“只读查看者”。

## 九、验收标准

1. ADMIN 登录后可以看到和操作所有页面、模块、数据。
2. 用户 A 只授权“西班牙研究院”后：
   - 候选人列表只看到该部门及子部门候选人。
   - 员工/现有人员只看到该部门相关人员。
   - 岗位页只看到该部门相关岗位。
   - 部门管理页若未授权页面权限，不显示菜单，直接访问返回无权限。
3. 用户 A 只授权“产品定义 JD”后：
   - 候选人和员工只看到该 JD 相关数据。
   - 岗位页只看到该 JD。
   - 默认看不到部门管理页面。
4. 用户没有附件模块权限时：
   - 候选人详情不展示附件模块。
   - 后端详情 API 不返回附件字段。
   - 直接调用附件相关 API 返回 403 或 404。
5. 用户没有 LLM Key 权限时：
   - 不展示 LLM Key 入口。
   - 直接请求系统配置 API 返回 403。
6. 直接输入未授权 URL 不能绕过权限。
7. 所有相关测试、lint/build 至少运行与改动直接相关的验证。
8. 更新 README 或 delivery docs 中与权限相关的说明。

## 十、普通用户分享候选人详情页权限继承规则

新增 ShareLink 权限继承规则：

1. 普通用户只能分享自己有权限访问的候选人。
   - 创建分享链接时，后端必须先校验当前用户是否可访问该 candidate。
   - 如果 candidate 不在当前用户的数据范围内，返回 404 或 403。
   - 不能通过手动传 candidateId 绕过数据权限。

2. 分享出去的公开页面模块权限不能超过分享创建者本人的权限。
   - 普通用户能看到评论模块，则该用户创建的分享链接可以包含评论模块。
   - 普通用户默认没有附件模块权限，则该用户创建的分享链接默认不能展示附件模块。
   - 即使前端传了 `showAttachments: true`，后端也必须校验创建者是否拥有 `candidate.attachments` 权限；没有则强制为 false 或返回 403。
   - 联系方式、AI 洞察、JD 匹配、评价、附件、分享按钮等模块都遵循同样规则。

3. ShareLink 建议新增字段：
   - `createdById`：创建分享链接的用户。
   - `allowedModules Json`：创建链接时最终允许公开展示的模块快照。
   - 可继续保留现有 `showContact / showAttachments`，但最终展示应以 `allowedModules` 为准。

4. 公开访问 `/api/public/share/:token` 时：
   - 只能返回 `allowedModules` 允许的字段和模块。
   - 无 `candidate.attachments` 时，不返回 `attachment/documents`。
   - 无 `candidate.contact` 时，不返回 phone/email，或继续返回 mask 后数据，具体按产品规则定。
   - 无 `candidate.reviews` 时，不返回评价模块，也不允许公开访客提交评价。
   - 无 `candidate.aiInsights` 时，不返回 AI 洞察/JD 匹配相关字段。

5. 权限变更后的既有链接处理：
   - 推荐安全策略：公开链接访问时二次检查创建者是否仍然 active，且候选人仍在创建者可访问范围内。
   - 如果创建者被停用，或不再拥有该候选人访问权限，链接返回 410 `share_disabled`。
   - 模块展示可以使用“创建时快照”，但不得超过当前创建者权限；即最终模块 = 创建时 allowedModules ∩ 创建者当前权限。
   - 这样可以避免普通用户权限被收回后，历史分享链接继续泄露数据。

6. admin 分享：
   - ADMIN 默认拥有全部模块权限。
   - admin 创建分享链接时可以按现有产品逻辑选择是否展示联系方式、附件、评论等模块。
   - 但也建议统一走同一套 `allowedModules` 机制，减少特殊分支。