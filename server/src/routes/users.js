// admin 用户管理 API
// 所有路由都先 authenticate + assertPage("users") + 仅 ADMIN 可操作的额外校验
// 保护规则: 系统必须至少保留 1 个 active ADMIN — 不能删除/停用/降级最后一个。

import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  loadUserAccess,
  assertPage,
  isAdmin,
} from "../lib/permissions.js";
import {
  DEFAULT_NEW_USER_PAGE_KEYS,
  DEFAULT_NEW_USER_MODULE_KEYS,
  isValidPageKey,
  isValidModuleKey,
  CAMPUS_TABS,
  CAMPUS_INTERVIEWER_MODULE_KEYS,
  campusInterviewerPageKeys,
} from "../lib/permissionKeys.js";
import { writeLog } from "../lib/audit.js";
import { validatePassword } from "../lib/passwordPolicy.js";
import { recordPassword } from "../lib/passwordHistory.js";

const ROLES = ["ADMIN", "RECRUITER", "VIEWER", "CAMPUS_INTERVIEWER"];
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]{3,32}$/u;
const CAMPUS_TABS_SCHEMA = { type: "array", uniqueItems: true, items: { type: "string", enum: CAMPUS_TABS } };

const PAGE_KEY_SCHEMA = { type: "array", items: { type: "string", maxLength: 64 } };
const MODULE_KEY_SCHEMA = { type: "array", items: { type: "string", maxLength: 64 } };

function sanitizePageKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return Array.from(new Set(keys.filter((k) => typeof k === "string" && isValidPageKey(k))));
}
function sanitizeModuleKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return Array.from(new Set(keys.filter((k) => typeof k === "string" && isValidModuleKey(k))));
}

function shapeUser(u) {
  if (!u) return null;
  const access = u.accessPolicy
    ? {
        pageKeys: u.accessPolicy.pageKeys || [],
        moduleKeys: u.accessPolicy.moduleKeys || [],
        mustChangePassword: !!u.accessPolicy.mustChangePassword,
        campusTabs: u.role === "CAMPUS_INTERVIEWER" ? CAMPUS_TABS.filter((tab) => u.accessPolicy.pageKeys?.includes(`campus.${tab}`)) : [],
      }
    : { pageKeys: [], moduleKeys: [], mustChangePassword: false, campusTabs: [] };

  return {
    id: u.id,
    email: u.email,
    username: u.username,
    name: u.name,
    role: u.role,
    avatar: u.avatar,
    jobTitle: u.jobTitle,
    isActive: u.isActive,
    deactivatedReason: u.deactivatedReason || null,
    deactivatedAt: u.deactivatedAt || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    access,
    departmentScopes: (u.departmentScopes || []).map((s) => ({
      departmentId: s.departmentId,
      departmentName: s.department?.name,
      includeChildren: s.includeChildren,
    })),
    jobScopes: (u.jobScopes || []).map((s) => ({
      jobId: s.jobId,
      jobTitle: s.job?.title,
    })),
  };
}

const USER_INCLUDE = {
  accessPolicy: true,
  departmentScopes: {
    include: { department: { select: { id: true, name: true } } },
  },
  jobScopes: {
    include: { job: { select: { id: true, title: true } } },
  },
};

// 防最后一个 ADMIN 被删除/停用/降级
async function assertNotLastActiveAdmin(prisma, userId, { intent }) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) return;
  if (target.role !== "ADMIN") return;
  if (!target.isActive) return; // 已停用的 ADMIN 不算"活跃"
  const activeAdmins = await prisma.user.count({
    where: { role: "ADMIN", isActive: true },
  });
  if (activeAdmins <= 1) {
    const err = new Error(`不能${intent}最后一个活跃 ADMIN`);
    err.statusCode = 422;
    err.code = "last_admin_protected";
    throw err;
  }
}

function randomPassword(len = 12) {
  // URL 安全字符,排除易混的 0OIl
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

export default async function usersRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", async (req, reply) => {
    // 所有 /api/users 端点都要求 users 页面权限,且必须是 ADMIN
    const access = await assertPage(req, reply, "users");
    if (!access) return; // assertPage 已 send
    if (!access.isAdmin) {
      reply.code(403).send({ error: "forbidden", message: "仅 ADMIN 可操作" });
      return;
    }
  });

  // 列表
  app.get("/", async (req) => {
    const users = await app.prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: USER_INCLUDE,
    });
    return { items: users.map(shapeUser) };
  });

  // 详情
  app.get("/:id", async (req, reply) => {
    const u = await app.prisma.user.findUnique({
      where: { id: req.params.id },
      include: USER_INCLUDE,
    });
    if (!u) return reply.code(404).send({ error: "not_found" });
    return { user: shapeUser(u) };
  });

  // 创建用户
  app.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email", maxLength: 200 },
            username: { type: "string", minLength: 3, maxLength: 32 },
            name: { type: "string", maxLength: 80 },
            role: { type: "string", enum: ROLES },
            jobTitle: { type: "string", maxLength: 80 },
            avatar: { type: "string", maxLength: 600 },
            password: { type: "string", minLength: 8, maxLength: 200 },
            pageKeys: PAGE_KEY_SCHEMA,
            moduleKeys: MODULE_KEY_SCHEMA,
            campusTabs: CAMPUS_TABS_SCHEMA,
            departmentScopes: {
              type: "array",
              items: {
                type: "object",
                required: ["departmentId"],
                properties: {
                  departmentId: { type: "string", format: "uuid" },
                  includeChildren: { type: "boolean" },
                },
              },
            },
            jobScopes: {
              type: "array",
              items: {
                type: "object",
                required: ["jobId"],
                properties: { jobId: { type: "string", format: "uuid" } },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body;
      const role = body.role || "RECRUITER";
      const campusInterviewer = role === "CAMPUS_INTERVIEWER";
      const username = campusInterviewer ? body.username?.trim().toLowerCase() : null;
      if (campusInterviewer && (!USERNAME_PATTERN.test(username || "") || !body.password)) {
        return reply.code(422).send({ error: "invalid_campus_account", message: "校招面试官需填写 3–32 位账户名和初始密码" });
      }
      if (!campusInterviewer && !body.email) {
        return reply.code(422).send({ error: "email_required", message: "请输入邮箱" });
      }
      if (campusInterviewer && await app.prisma.user.findUnique({ where: { username } })) {
        return reply.code(409).send({ error: "username_taken", message: "账户名已被使用" });
      }
      const email = campusInterviewer ? `campus-${crypto.randomUUID()}@accounts.insovo.invalid` : body.email.trim().toLowerCase();

      const exist = await app.prisma.user.findUnique({ where: { email } });
      if (exist) return reply.code(409).send({ error: "email_taken" });

      const rawPassword = body.password || randomPassword(12);
      // admin 显式传 password 时才校验策略
      if (body.password) {
        const policy = validatePassword(rawPassword, { email: campusInterviewer ? username : email, name: body.name });
        if (!policy.ok) {
          return reply.code(422).send({
            error: "password_policy_failed",
            message: policy.errors.join(" / "),
            errors: policy.errors,
          });
        }
      }
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      const pageKeys = role === "ADMIN" ? [] : campusInterviewer ? campusInterviewerPageKeys(body.campusTabs || []) : sanitizePageKeys(body.pageKeys || DEFAULT_NEW_USER_PAGE_KEYS);
      const moduleKeys = role === "ADMIN" ? [] : campusInterviewer
        ? [...CAMPUS_INTERVIEWER_MODULE_KEYS, ...((body.campusTabs || []).some((tab) => tab === "sessions" || tab === "jobs") ? ["campus.manage"] : [])]
        : sanitizeModuleKeys(body.moduleKeys || DEFAULT_NEW_USER_MODULE_KEYS);

      let created;
      try {
        created = await app.prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email,
              username,
              name: body.name || null,
              role,
              jobTitle: body.jobTitle || null,
              avatar: body.avatar || null,
              isActive: true,
              passwordHash,
              accessPolicy: {
                create: {
                  pageKeys,
                  moduleKeys,
                  mustChangePassword: !body.password, // admin 没给密码 → 强制下次登录改
                },
              },
              departmentScopes: !campusInterviewer && body.departmentScopes?.length
                ? {
                    create: body.departmentScopes.map((s) => ({
                      departmentId: s.departmentId,
                      includeChildren: s.includeChildren !== false,
                    })),
                  }
                : undefined,
              jobScopes: !campusInterviewer && body.jobScopes?.length
                ? { create: body.jobScopes.map((s) => ({ jobId: s.jobId })) }
                : undefined,
            },
            include: USER_INCLUDE,
          });
          return u;
        });
      } catch (err) {
        if (err.code === "P2002") return reply.code(409).send({ error: campusInterviewer ? "username_taken" : "email_taken" });
        throw err;
      }

      await recordPassword(app.prisma, created.id, passwordHash);
      writeLog(app.prisma, {
        req, action: "user.create",
        entityType: "user", entityId: created.id,
        diff: { email: created.email, role: created.role, pageKeys: pageKeys.length, moduleKeys: moduleKeys.length },
      });
      reply.code(201);
      return {
        user: shapeUser(created),
        // 仅在这一次响应里返回明文密码(admin 创建时未提供 password 用于发给用户)
        // 之后任何接口都不会再返回
        generatedPassword: body.password ? null : rawPassword,
      };
    }
  );

  // 编辑基础信息(头像/昵称/邮箱/角色/状态/jobTitle)
  app.patch(
    "/:id",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email", maxLength: 200 },
            username: { type: "string", minLength: 3, maxLength: 32 },
            name: { type: "string", maxLength: 80 },
            role: { type: "string", enum: ROLES },
            jobTitle: { type: ["string", "null"], maxLength: 80 },
            avatar: { type: ["string", "null"], maxLength: 600 },
            isActive: { type: "boolean" },
            deactivatedReason: { type: ["string", "null"], maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const id = req.params.id;
      const body = req.body;

      const target = await app.prisma.user.findUnique({ where: { id } });
      if (!target) return reply.code(404).send({ error: "not_found" });
      if (body.role && body.role !== target.role && (body.role === "CAMPUS_INTERVIEWER" || target.role === "CAMPUS_INTERVIEWER")) {
        return reply.code(422).send({ error: "campus_role_change", message: "校招面试官是独立账号类型，请新建对应账号" });
      }
      const username = body.username?.trim().toLowerCase();
      if (body.username !== undefined && target.role !== "CAMPUS_INTERVIEWER") {
        return reply.code(422).send({ error: "username_forbidden" });
      }
      if (username && !USERNAME_PATTERN.test(username)) {
        return reply.code(422).send({ error: "invalid_username", message: "账户名需为 3–32 位文字、数字、点、下划线或短横线" });
      }
      if (username && username !== target.username && await app.prisma.user.findUnique({ where: { username } })) {
        return reply.code(409).send({ error: "username_taken", message: "账户名已被使用" });
      }
      if (target.role === "CAMPUS_INTERVIEWER" && body.email && body.email !== target.email) {
        return reply.code(422).send({ error: "email_forbidden" });
      }

      // 降级 / 停用 最后 ADMIN 拦截
      const willDemote = body.role && body.role !== "ADMIN" && target.role === "ADMIN";
      const willDeactivate = body.isActive === false && target.isActive;
      if (willDemote) await assertNotLastActiveAdmin(app.prisma, id, { intent: "降级" });
      if (willDeactivate) await assertNotLastActiveAdmin(app.prisma, id, { intent: "停用" });

      // 邮箱唯一性
      if (body.email && body.email !== target.email) {
        const exist = await app.prisma.user.findUnique({ where: { email: body.email } });
        if (exist) return reply.code(409).send({ error: "email_taken" });
      }

      const updated = await app.prisma.user.update({
        where: { id },
        data: {
          email: body.email ?? undefined,
          username: username ?? undefined,
          name: body.name ?? undefined,
          role: body.role ?? undefined,
          jobTitle: body.jobTitle === null ? null : body.jobTitle ?? undefined,
          avatar: body.avatar === null ? null : body.avatar ?? undefined,
          isActive: body.isActive ?? undefined,
          // 停用时记录时间 + tokenVersion++ 让其当前 session 失效
          ...(body.isActive === false || (body.role && body.role !== target.role) ? { tokenVersion: { increment: 1 } } : {}),
          deactivatedAt: body.isActive === false ? new Date() : (body.isActive === true ? null : undefined),
          // isActive 改成 true 时清空 reason;停用时若 body 传了 reason 用它
          deactivatedReason: body.isActive === true
            ? null
            : body.isActive === false
              ? (body.deactivatedReason ?? null)
              : (body.deactivatedReason !== undefined ? body.deactivatedReason : undefined),
        },
        include: USER_INCLUDE,
      });
      // audit
      const changes = {};
      if (body.email && body.email !== target.email) changes.email = { from: target.email, to: body.email };
      if (body.role && body.role !== target.role) changes.role = { from: target.role, to: body.role };
      if (body.isActive !== undefined && body.isActive !== target.isActive) {
        changes.isActive = { from: target.isActive, to: body.isActive };
      }
      if (Object.keys(changes).length > 0) {
        const action = willDeactivate ? "user.deactivate" : (body.isActive === true && !target.isActive ? "user.activate" : "user.update");
        writeLog(app.prisma, { req, action, entityType: "user", entityId: id, diff: changes });
      }
      return { user: shapeUser(updated) };
    }
  );

  // 更新权限策略 + 数据范围(整体覆盖式)
  app.patch(
    "/:id/policy",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            pageKeys: PAGE_KEY_SCHEMA,
            moduleKeys: MODULE_KEY_SCHEMA,
            campusTabs: CAMPUS_TABS_SCHEMA,
            mustChangePassword: { type: "boolean" },
            departmentScopes: {
              type: "array",
              items: {
                type: "object",
                required: ["departmentId"],
                properties: {
                  departmentId: { type: "string", format: "uuid" },
                  includeChildren: { type: "boolean" },
                },
              },
            },
            jobScopes: {
              type: "array",
              items: {
                type: "object",
                required: ["jobId"],
                properties: { jobId: { type: "string", format: "uuid" } },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const id = req.params.id;
      const target = await app.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
      if (!target) return reply.code(404).send({ error: "not_found" });

      const isTargetAdmin = target.role === "ADMIN";
      const campusInterviewer = target.role === "CAMPUS_INTERVIEWER";
      if (campusInterviewer && (req.body.pageKeys || req.body.moduleKeys || req.body.departmentScopes || req.body.jobScopes)) {
        return reply.code(422).send({ error: "campus_policy_fixed", message: "校招面试官仅可配置校招 tab" });
      }
      const pageKeys = isTargetAdmin ? [] : campusInterviewer ? campusInterviewerPageKeys(req.body.campusTabs || []) : sanitizePageKeys(req.body.pageKeys || []);
      const moduleKeys = isTargetAdmin ? [] : campusInterviewer
        ? [...CAMPUS_INTERVIEWER_MODULE_KEYS, ...((req.body.campusTabs || []).some((tab) => tab === "sessions" || tab === "jobs") ? ["campus.manage"] : [])]
        : sanitizeModuleKeys(req.body.moduleKeys || []);

      const result = await app.prisma.$transaction(async (tx) => {
        await tx.userAccessPolicy.upsert({
          where: { userId: id },
          create: {
            userId: id,
            pageKeys,
            moduleKeys,
            mustChangePassword: !!req.body.mustChangePassword,
          },
          update: {
            pageKeys,
            moduleKeys,
            mustChangePassword: req.body.mustChangePassword ?? undefined,
          },
        });

        if (req.body.departmentScopes) {
          await tx.userDepartmentScope.deleteMany({ where: { userId: id } });
          if (req.body.departmentScopes.length > 0) {
            await tx.userDepartmentScope.createMany({
              data: req.body.departmentScopes.map((s) => ({
                userId: id,
                departmentId: s.departmentId,
                includeChildren: s.includeChildren !== false,
              })),
              skipDuplicates: true,
            });
          }
        }
        if (req.body.jobScopes) {
          await tx.userJobScope.deleteMany({ where: { userId: id } });
          if (req.body.jobScopes.length > 0) {
            await tx.userJobScope.createMany({
              data: req.body.jobScopes.map((s) => ({ userId: id, jobId: s.jobId })),
              skipDuplicates: true,
            });
          }
        }

        return tx.user.findUnique({ where: { id }, include: USER_INCLUDE });
      });

      writeLog(app.prisma, {
        req, action: "user.policy.update",
        entityType: "user", entityId: id,
        diff: {
          pageKeys: pageKeys.length, moduleKeys: moduleKeys.length,
          deptScopes: req.body.departmentScopes?.length ?? 0,
          jobScopes: req.body.jobScopes?.length ?? 0,
        },
      });
      return { user: shapeUser(result) };
    }
  );

  // 重置密码 — admin 不能查看密码,生成新密码一次性返回
  app.post(
    "/:id/reset-password",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            password: { type: "string", minLength: 8, maxLength: 200 },
            mustChange: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const id = req.params.id;
      const target = await app.prisma.user.findUnique({ where: { id } });
      if (!target) return reply.code(404).send({ error: "not_found" });

      const rawPassword = req.body?.password || randomPassword(12);
      // 若 admin 显式传 password,需校验策略;自动生成的 password 由 randomPassword 保证强度
      if (req.body?.password) {
        const policy = validatePassword(rawPassword, { email: target.username || target.email, name: target.name });
        if (!policy.ok) {
          return reply.code(422).send({
            error: "password_policy_failed",
            message: policy.errors.join(" / "),
            errors: policy.errors,
          });
        }
      }
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      await app.prisma.$transaction([
        app.prisma.user.update({
          where: { id },
          data: { passwordHash, tokenVersion: { increment: 1 } },
        }),
        app.prisma.userAccessPolicy.upsert({
          where: { userId: id },
          create: {
            userId: id,
            pageKeys: [],
            moduleKeys: [],
            mustChangePassword: req.body?.mustChange !== false,
          },
          update: { mustChangePassword: req.body?.mustChange !== false },
        }),
      ]);
      await recordPassword(app.prisma, id, passwordHash);

      writeLog(app.prisma, {
        req, action: "user.reset_password",
        entityType: "user", entityId: id,
        diff: { generatedByAdmin: !req.body?.password, mustChange: req.body?.mustChange !== false, targetEmail: target.email },
      });
      return {
        ok: true,
        password: req.body?.password ? null : rawPassword,
      };
    }
  );

  // 强制下线单个用户 — tokenVersion ++ 让该用户所有 session 立刻失效
  app.post("/:id/force-logout", async (req, reply) => {
    const id = req.params.id;
    const target = await app.prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!target) return reply.code(404).send({ error: "not_found" });
    await app.prisma.user.update({
      where: { id },
      data: { tokenVersion: { increment: 1 } },
    });
    writeLog(app.prisma, { req, action: "user.force_logout", entityType: "user", entityId: id, diff: { email: target.email } });
    return { ok: true };
  });

  app.post(
    "/batch/force-logout",
    {
      schema: {
        body: {
          type: "object",
          required: ["userIds"],
          properties: {
            userIds: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 50 },
          },
        },
      },
    },
    async (req) => {
      const { userIds } = req.body;
      const result = await app.prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { tokenVersion: { increment: 1 } },
      });
      writeLog(app.prisma, { req, action: "user.batch_force_logout", diff: { count: result.count, userIds } });
      return { ok: true, affected: result.count };
    }
  );

  // 批量停用 — 比单个 PATCH /:id 更省请求
  app.post(
    "/batch/deactivate",
    {
      schema: {
        body: {
          type: "object",
          required: ["userIds"],
          properties: {
            userIds: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 50 },
            reason: { type: "string", maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const { userIds, reason } = req.body;
      // 排除自己 + 最后一个 ADMIN
      if (userIds.includes(req.user?.sub)) {
        return reply.code(422).send({ error: "cannot_deactivate_self" });
      }
      const targets = await app.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, role: true, isActive: true, email: true },
      });
      // 检查 admin 计数:如果勾中的 ADMIN 数 >= 当前活跃 ADMIN 数,要拒
      const activeAdmins = await app.prisma.user.count({ where: { role: "ADMIN", isActive: true } });
      const adminInBatch = targets.filter((t) => t.role === "ADMIN" && t.isActive).length;
      if (adminInBatch >= activeAdmins) {
        return reply.code(422).send({ error: "last_admin_protected", message: "不能把所有活跃 ADMIN 全部停用" });
      }
      await app.prisma.user.updateMany({
        where: { id: { in: userIds }, role: { not: "ADMIN" }, isActive: true },
        data: {
          isActive: false,
          deactivatedReason: reason || null,
          deactivatedAt: new Date(),
          tokenVersion: { increment: 1 }, // 让其当前 session 立刻失效
        },
      });
      // ADMIN 用户仍单独 + assertNotLastActiveAdmin 一致逻辑(此处简化,排除 ADMIN 不批量停用)
      const affected = targets.filter((t) => t.role !== "ADMIN" && t.isActive).map((t) => t.id);
      writeLog(app.prisma, {
        req, action: "user.batch_deactivate",
        diff: { count: affected.length, reason, userIds: affected },
      });
      return { ok: true, affected: affected.length };
    }
  );

  // 删除用户(物理删除,候选人 ownerId 自动 SET NULL,share link createdBy SET NULL)
  app.delete("/:id", async (req, reply) => {
    const id = req.params.id;
    await assertNotLastActiveAdmin(app.prisma, id, { intent: "删除" });

    // 不允许删除自己,避免误操作锁出
    if (req.user?.sub === id) {
      return reply.code(422).send({ error: "cannot_delete_self", message: "不能删除当前登录账号" });
    }
    const exists = await app.prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!exists) return reply.code(404).send({ error: "not_found" });

    await app.prisma.user.delete({ where: { id } });
    writeLog(app.prisma, {
      req, action: "user.delete",
      entityType: "user", entityId: id,
      diff: { email: exists.email },
    });
    return { ok: true };
  });
}
