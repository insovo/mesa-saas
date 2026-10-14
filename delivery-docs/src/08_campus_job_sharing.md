# 校招岗位分享给 HR

## 使用方式

校招「岗位」Tab 勾选多个或全选岗位，点击「分享给 HR」生成链接与二维码。默认有效三天，可自定义分钟、小时、天（最短一分钟、最长一年）。HR 无需登录。一个链接只展示选中的有效校招岗位；HR 在此链接中新建的岗位也加入此分享范围。

HR 可查看完整 JD，多选／全选后统一标记「现场面试」或「内推」。页面内确认后，Job 与全部 CampusSessionJob 同步更新，后续新建专场自动带入统一目录。排队登记只允许当前有效现场面试岗位；内推仍可查看要求。HR 页每十五秒刷新，也可手动刷新。

HR 新建 JD 只填岗位名称、岗位职责、任职要求（后两项每行一条）。后台固定写入芜湖、全职、全日制本科及以上、名额不限，部门／薪资／语言／截止日期为空；完整 37 条福利含分类标题保存在 `server/src/lib/campus/jobShareDefaults.js`。新岗位默认内推，HR 可再标为现场面试。创建自动关联全部专场、加入当前分享；普通分享人获得新岗位范围。新岗位未生成评价模型时尚不实际参与智能匹配。

岗位页「管理岗位分享」可重新查看本人有效链接并停止分享。停止或到期后，HR 不能继续查看、新建或修改。持有链接即获得上述岗位操作权限，应仅发送给需要协作的 HR。

## 权限与事务

创建需工作台 campus 页面、campus.manage 模块，校招面试官还需 campus.jobs Tab，VIEWER 不可创建。生成时校验全部岗位范围；公开访问每次重新检查分享人的账号、管理权限与当前岗位范围，不下发评价模型或权限数据。停用账号、收回管理权限会使分享失效。

`CampusJobShare` 与 `CampusJobShareJob` 保存期限与选中范围；24 字节随机 token 通过 `X-Campus-Job-Share` 请求头传 API。公开页面 `/campus-job-review/:token` 在 AuthGuard 外。Nginx 对该路径及含该路径的 Referer 不记访问日志。API 数据 no-store。写入与停止分享使用统一目录事务锁和分享行锁，失效链接无法在停止完成后写入；整批范围不符返回 409，不部分更新。

## API

登录前缀 `/api/campus`：

| 方法 | 路径 | 请求／响应 |
| --- | --- | --- |
| POST | `/jobs/share-links` | `{ids:[UUID],expirySeconds?:259200}`，1–500 唯一 ID；201 `{link:{id,path,expiresAt,active,createdAt,jobsCount}}` |
| GET | `/jobs/share-links` | 本人最新 50 个有效链接 `{items}` |
| DELETE | `/jobs/share-links/:id` | 分享人或管理员停止，204 |

匿名前缀 `/api/public/campus-job-shares`，每项都需 `X-Campus-Job-Share`：

| 方法 | 路径 | 请求／响应 |
| --- | --- | --- |
| GET | `/` | `{expiresAt,jobs,defaults}`，JD 公开展示字段与自动默认值 |
| PATCH | `/kind` | `{ids:[UUID],kind:"onsite"|"referral"}`；全部 ID 须在当前分享及授权范围；`{updated}` |
| POST | `/jobs` | `{title,responsibilities:[string],requirements:[string]}`；职责和要求各 1–100 条、每条最多 1000 字；201 `{job}` |

不存在 404；过期／停止／账号停用／管理权限收回 410；岗位范围变化 409；空白必填 422。请求不接受其他可编辑字段。

## 部署与验证

新增迁移 `20261015020000_campus_job_shares`，上线前备份数据库和 Nginx 配置。回退前后端镜像可关闭入口，保留新表和已同步岗位数据，不删除业务数据回滚。

验证命令：`cd server && node --test src/routes/campus-job-shares.test.js`，`cd web && npm run build`。实际隔离 PostgreSQL 验证迁移、原子范围校验、全专场同步、福利默认值、排队资格、停止／写入并发；浏览器验证桌面及 390px 手机端的分享、批量标记、新建 JD、查看要求和停止分享。
