// 统一权限工具集 — 所有业务 API 必须接入。
// 设计要点:
//   1. ADMIN 拥有全部页面/模块/数据,直接 short-circuit。
//   2. 普通用户的可见数据 = 自己 ownerId + 授权部门子树 + 授权 JD(并集)。
//   3. JWT 不塞具体权限,每次请求按需 load,避免权限变更后旧 token 仍生效。
//   4. 同一请求多次调用同一 user 的 load* 用 req.permsCache 兜底,避免 N+1。

import {
  CANDIDATE_FIELD_MODULE_MAP,
  ALL_PAGE_KEYS_SET,
  ALL_MODULE_KEYS_SET,
} from "./permissionKeys.js";

export function isAdmin(userOrRole) {
  if (!userOrRole) return false;
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  return role === "ADMIN";
}

// 从 DB load 当前用户的角色 + AccessPolicy + DepartmentScopes + JobScopes
// 同一请求内多次调用走缓存。
export async function loadUserAccess(req) {
  if (req.permsCache?.access) return req.permsCache.access;
  if (!req.permsCache) req.permsCache = {};

  const userId = req.user?.sub;
  if (!userId) {
    const empty = {
      userId: null,
      role: null,
      isActive: false,
      isAdmin: false,
      pageKeys: [],
      moduleKeys: [],
      departmentScopes: [],
      jobScopes: [],
    };
    req.permsCache.access = empty;
    return empty;
  }

  const user = await req.server.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      accessPolicy: { select: { pageKeys: true, moduleKeys: true } },
      departmentScopes: { select: { departmentId: true, includeChildren: true } },
      jobScopes: { select: { jobId: true } },
    },
  });

  const admin = isAdmin(user?.role);
  const access = {
    userId: user?.id || userId,
    role: user?.role || null,
    isActive: user?.isActive !== false,
    isAdmin: admin,
    pageKeys: admin ? Array.from(ALL_PAGE_KEYS_SET) : (user?.accessPolicy?.pageKeys || []),
    moduleKeys: admin ? Array.from(ALL_MODULE_KEYS_SET) : (user?.accessPolicy?.moduleKeys || []),
    departmentScopes: user?.departmentScopes || [],
    jobScopes: user?.jobScopes || [],
  };
  req.permsCache.access = access;
  return access;
}

export function hasPage(access, key) {
  if (!access) return false;
  if (access.isAdmin) return true;
  return access.pageKeys.includes(key);
}

export function hasModule(access, key) {
  if (!access) return false;
  if (access.isAdmin) return true;
  return access.moduleKeys.includes(key);
}

// 强校验:返回 boolean false 时调用方自己 reply,或抛 forbidden 让 errorHandler 接
export async function assertPage(req, reply, key) {
  const access = await loadUserAccess(req);
  if (!access.isActive) {
    reply.code(403).send({ error: "user_inactive", message: "账号已停用" });
    return null;
  }
  if (!hasPage(access, key)) {
    reply.code(403).send({ error: "forbidden", message: "无访问权限" });
    return null;
  }
  return access;
}

export async function assertModule(req, reply, key) {
  const access = await loadUserAccess(req);
  if (!access.isActive) {
    reply.code(403).send({ error: "user_inactive", message: "账号已停用" });
    return null;
  }
  if (!hasModule(access, key)) {
    reply.code(403).send({ error: "forbidden", message: "无该模块权限" });
    return null;
  }
  return access;
}

// 计算用户可见的部门 ID 集合 — includeChildren=true 时递归把子部门也加进去
// 同一请求缓存;ADMIN 返回 null 表示"不限制"
async function expandDepartmentScope(req, access) {
  if (access.isAdmin) return null;
  if (req.permsCache?.deptIds !== undefined) return req.permsCache.deptIds;

  const directIds = new Set();
  const expandIds = new Set();
  for (const s of access.departmentScopes) {
    directIds.add(s.departmentId);
    if (s.includeChildren) expandIds.add(s.departmentId);
  }

  if (expandIds.size === 0) {
    const result = Array.from(directIds);
    req.permsCache.deptIds = result;
    return result;
  }

  // 递归一层一层拿子部门
  const all = new Set(directIds);
  let frontier = Array.from(expandIds);
  while (frontier.length > 0) {
    const children = await req.server.prisma.department.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    const next = [];
    for (const c of children) {
      if (!all.has(c.id)) {
        all.add(c.id);
        next.push(c.id);
      }
    }
    frontier = next;
  }
  const result = Array.from(all);
  req.permsCache.deptIds = result;
  return result;
}

// 返回授权部门的 name 集合(用于 Job.dept / Employee.dept 这种 string 类型的列过滤)
async function loadDepartmentNames(req, deptIds) {
  if (!deptIds || deptIds.length === 0) return [];
  if (req.permsCache?.deptNames) return req.permsCache.deptNames;
  const depts = await req.server.prisma.department.findMany({
    where: { id: { in: deptIds } },
    select: { name: true },
  });
  const names = depts.map((d) => d.name).filter(Boolean);
  req.permsCache.deptNames = names;
  return names;
}

// === Candidate 范围 ===
// where 形如 { OR: [{ ownerId }, { departmentId in [...]} , { jobId in [...] }] }
// ADMIN → null (不加条件)
export async function buildCandidateScopeWhere(req) {
  const access = await loadUserAccess(req);
  if (access.isAdmin) return null;

  const deptIds = await expandDepartmentScope(req, access);
  const jobIds = access.jobScopes.map((s) => s.jobId);

  const ors = [{ ownerId: access.userId }];
  if (deptIds && deptIds.length > 0) ors.push({ departmentId: { in: deptIds } });
  if (jobIds.length > 0) ors.push({ jobId: { in: jobIds } });
  return { OR: ors };
}

// === Job 范围 ===
// jobs 的部门列是 string(Job.dept,不是 FK),所以按授权部门 name 过滤
// 普通用户至少能看到自己 jobScopes 里的 JD
export async function buildJobScopeWhere(req) {
  const access = await loadUserAccess(req);
  if (access.isAdmin) return null;

  const deptIds = await expandDepartmentScope(req, access);
  const deptNames = await loadDepartmentNames(req, deptIds);
  const jobIds = access.jobScopes.map((s) => s.jobId);

  const ors = [];
  if (jobIds.length > 0) ors.push({ id: { in: jobIds } });
  if (deptNames.length > 0) ors.push({ dept: { in: deptNames } });
  if (ors.length === 0) return { id: { in: [] } }; // 空集 → 查不到任何 row
  return { OR: ors };
}

// === Department 范围 ===
export async function buildDepartmentScopeWhere(req) {
  const access = await loadUserAccess(req);
  if (access.isAdmin) return null;
  const deptIds = await expandDepartmentScope(req, access);
  if (!deptIds || deptIds.length === 0) return { id: { in: [] } };
  return { id: { in: deptIds } };
}

// === Employee 范围 ===
// Employee.dept 也是 string;按授权部门 name + 授权 JD jobId + 关联的 candidate.ownerId 三并集
export async function buildEmployeeScopeWhere(req) {
  const access = await loadUserAccess(req);
  if (access.isAdmin) return null;

  const deptIds = await expandDepartmentScope(req, access);
  const deptNames = await loadDepartmentNames(req, deptIds);
  const jobIds = access.jobScopes.map((s) => s.jobId);

  const ors = [{ candidate: { ownerId: access.userId } }];
  if (deptNames.length > 0) ors.push({ dept: { in: deptNames } });
  if (jobIds.length > 0) ors.push({ jobId: { in: jobIds } });
  return { OR: ors };
}

// === 单候选人访问校验 ===
// 不在 scope 内返回 404(不泄露存在性)。reply.code 后返回 null,调用方应直接 return reply。
export async function assertCandidateAccess(req, reply, candidateId) {
  const access = await loadUserAccess(req);
  if (access.isAdmin) return access;

  const scopeWhere = await buildCandidateScopeWhere(req);
  const found = await req.server.prisma.candidate.findFirst({
    where: { id: candidateId, ...(scopeWhere || {}) },
    select: { id: true },
  });
  if (!found) {
    reply.code(404).send({ error: "not_found" });
    return null;
  }
  return access;
}

// 按模块权限剥候选人 payload — 用在 detail / list / share 返回前
// access 没该模块,对应字段从 obj 删掉(原 obj 不变,返回新对象)
export function filterCandidateByModules(candidate, access) {
  if (!candidate) return candidate;
  if (access?.isAdmin) return candidate;
  const out = { ...candidate };
  for (const meta of Object.values(CANDIDATE_FIELD_MODULE_MAP)) {
    if (!hasModule(access, meta.module)) {
      for (const f of meta.fields) delete out[f];
    }
  }
  return out;
}

// 算出 share link 创建时可下发的 allowedModules 候选集
// = 创建者自身拥有的"对外可见"模块 ∩ 用户传入(默认全开)
export function computeAllowedModules(access, requested = null) {
  const candidateModules = [
    "candidate.contact",
    "candidate.attachments",
    "candidate.aiInsights",
    "candidate.reviews",
    "candidate.jdMatch",
  ];
  const allowed = candidateModules.filter((k) => hasModule(access, k));
  if (!requested) return allowed;
  return requested.filter((k) => allowed.includes(k));
}
