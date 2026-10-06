---
name: worktree
description: 本项目新建 / 删除 git worktree 的 8 步流程与端口登记表(.worktree-ports.json)规则。需要隔离工作区并行做多个任务、或要清理已合并的 worktree 时读取。
---

# Worktree 隔离工作区与端口分配

> 由根 CLAUDE.md §7.0 / §7.0.1 迁出(2026-10-07),内容原样。

### 7.0 Worktree 隔离工作区(多任务并行硬约定)

需要同时修多个问题、又不想互相污染 working tree 时,**统一**用 git worktree:

```bash
# 命名规则: .worktrees/<分类>/<任务名>,分类只允许 feature / fix / hotfix / chore / docs
git worktree add .worktrees/feature/upload   -b feature/upload   origin/main
git worktree add .worktrees/fix/jwt-renew    -b fix/jwt-renew    origin/main
git worktree add .worktrees/hotfix/cf-502    -b hotfix/cf-502    origin/main

# 任务完成 → 在该 worktree 内 commit → push → PR/merge 到 main → 触发自动部署
# 清理:
git worktree remove .worktrees/feature/upload
git branch -d       feature/upload
```

**硬约束**:
1. **位置**:只允许 `.worktrees/<分类>/<任务>`,**禁止**放 `.claude/worktrees/`(那是 Claude Code 工具默认路径,在本项目里被 AI 自动迁移过来)
2. **gitignore**:`.worktrees/` 和 `.claude/` 都已排除,理论上零误推风险;但仍要在 commit 前 `git status` 检查
3. **基于 `origin/main`**:新建 worktree 一律 `-b <name> origin/main`(不要基于本地 main,可能滞后)
4. **AI 协作**:Claude Code / Codex / Cursor 进来时若需要隔离环境,使用项目本地路径而不是各自工具默认目录(`.claude/worktrees/` 等)
5. **生命周期**:任务合并后立即 `git worktree remove`,避免堆积;同名残留分支用 `git branch -d`(小 d 自带保护)
6. **多 worktree 并行**:每个 worktree 内的 `.env` / `node_modules` / `web/certs/` 需各自准备,git 不会同步
7. **端口分配**:每个 worktree 必须独立端口段,详见 §7.0.1

### 7.0.1 多 worktree 端口分配硬约定

多 worktree 并行时,后端默认 `3001` + 前端默认 `5173` 会冲突。统一通过**端口登记表 `.worktree-ports.json`**(项目根,入库)管理。

**分配规则**:
- 主 repo (main) 固定占 **slot 0** = `3001 / 5173`
- 其它 worktree 从 **slot 1** 起,公式:`backend = 3001 + N*10`,`frontend = 5173 + N*10`
- 步进 10 = 单台机器最多 100 个并行 worktree(实际远用不到)

**AI 新建 worktree 必走流程**(8 步):
1. 读项目根 `.worktree-ports.json`,看 `slots[].slot` 已用值
2. 算下一个空闲 slot N(一般 = max + 1,删除后留空也可复用)
3. 算端口:`backend = 3001 + N*10`,`frontend = 5173 + N*10`
4. `git worktree add .worktrees/<分类>/<名> -b <分类>/<名> origin/main`
5. 复制 env:`cp .env <worktree>/.env && cp server/.env <worktree>/server/.env`
6. 改后端 env:`<worktree>/server/.env` 里 `PORT="<backend>"` + `WEB_ORIGIN="http://localhost:<frontend>"`
7. 写前端 env:`<worktree>/web/.env`(新建)内容:
   ```
   VITE_DEV_PORT=<frontend>
   VITE_API_PORT=<backend>
   ```
8. 把新条目追加到 `.worktree-ports.json` 的 `slots[]`(含 `slot/name/path/branch/backend/frontend/since`)

**AI 删除 worktree 必走流程**:
1. `git worktree remove <path>`
2. `git branch -d <branch>`(已合并)或 `-D`(强制,仅在用户确认后)
3. 从 `.worktree-ports.json` 删除对应 slot 条目(slot 序号可空,后续新 worktree 可复用)

**禁止**:
- 跳过 `.worktree-ports.json` 直接 `git worktree add`(会导致登记漂移,其他 AI 算不出空闲 slot)
- 多个 worktree 共用同一 slot(端口冲突,服务起不来)
- 手改 `web/vite.config.js` 硬编码端口(它已改造成读 `VITE_DEV_PORT` / `VITE_API_PORT`)

**vite.config.js 端口机制**(已实现,向后兼容):
- 读 `web/.env` 里的 `VITE_DEV_PORT` 与 `VITE_API_PORT`
- 不设这两个变量时,默认 `5173` 和 `3001`(等同改造前行为)
- 主 repo 不需要 `web/.env`(走默认值即可)

