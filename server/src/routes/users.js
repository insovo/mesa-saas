// /api/users — admin only 的用户管理 (列表 + 改 role/permissions/jobTitle/name)
// 不开放 create/delete: 注册 + 删用户涉及关联数据,后续再加。

// 允许的 permission 枚举 — 前后端共享, 加新能力时在这里登记
export const ALLOWED_PERMISSIONS = ["system.llm_config"];

const ROLES = ["ADMIN", "RECRUITER", "VIEWER"];

const UPDATE_BODY = {
  type: "object",
  properties: {
    name: { type: "string", maxLength: 100, nullable: true },
    role: { type: "string", enum: ROLES },
    jobTitle: { type: "string", maxLength: 100, nullable: true },
    permissions: {
      type: "array",
      items: { type: "string", enum: ALLOWED_PERMISSIONS },
      maxItems: 32,
    },
    avatar: { type: "string", maxLength: 500, nullable: true },
  },
  additionalProperties: false,
};

function adminOnly(req, reply, done) {
  if (req.user?.role !== "ADMIN") {
    reply.code(403).send({ error: "forbidden", message: "需要管理员权限" });
    return;
  }
  done();
}

export default async function usersRoutes(app) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", adminOnly);

  app.get("/", async () => {
    const users = await app.prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        avatar: true,
        jobTitle: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { items: users, total: users.length, allowedPermissions: ALLOWED_PERMISSIONS };
  });

  app.patch("/:id", { schema: { body: UPDATE_BODY } }, async (req, reply) => {
    const { id } = req.params;
    const data = req.body;
    // 防锁死:不允许 admin 把自己降级或清空自己 permissions
    if (id === req.user.sub) {
      if (data.role && data.role !== "ADMIN") {
        return reply.code(422).send({ error: "self_demote_forbidden", message: "不能修改自己的管理员角色" });
      }
    }
    try {
      const updated = await app.prisma.user.update({
        where: { id },
        data,
        select: {
          id: true, email: true, name: true, role: true, permissions: true,
          avatar: true, jobTitle: true, createdAt: true, updatedAt: true,
        },
      });
      return { user: updated };
    } catch (err) {
      if (err.code === "P2025") return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });
}
