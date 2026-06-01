// /api/feishu-config — 飞书 bot 自动分享设置(登录态)
//   GET  /share-defaults  读全局(admin 设的)+ 我的 + 生效 + 是否 admin
//   PUT  /share-defaults  保存(scope=global 仅 admin;scope=mine 各人改自己的)
// 生效模型见 lib/feishuShareDefaults.js(取更严:单人被 admin 上限/锁 clamp)

import {
  getGlobalDefaults, getUserDefaults, getEffectiveShareDefaults,
  saveShareDefaults, BUILTIN_SHARE_DEFAULTS,
} from "../lib/feishuShareDefaults.js";

const PUT_BODY = {
  type: "object",
  required: ["scope"],
  properties: {
    scope: { type: "string", enum: ["global", "mine"] },
    duration: { type: "string", maxLength: 20 },
    maxViews: { type: ["integer", "null"], minimum: 1, maximum: 9999 },
    showContact: { type: "boolean" },
    showAttachments: { type: "boolean" },
    showInterviewEval: { type: "boolean" },
    showInterviewEvalList: { type: "boolean" },
    showReviews: { type: "boolean" },
    showResume: { type: "boolean" },
  },
  additionalProperties: false,
};

export default async function feishuConfigRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/share-defaults", async (req) => {
    const uid = req.user.sub;
    const user = await app.prisma.user.findUnique({ where: { id: uid }, select: { role: true } });
    const [global, mine, effective] = await Promise.all([
      getGlobalDefaults(), getUserDefaults(uid), getEffectiveShareDefaults(uid),
    ]);
    return { isAdmin: user?.role === "ADMIN", builtin: BUILTIN_SHARE_DEFAULTS, global, mine, effective };
  });

  app.put("/share-defaults", { schema: { body: PUT_BODY } }, async (req, reply) => {
    const uid = req.user.sub;
    const { scope, ...value } = req.body;
    if (scope === "global") {
      const user = await app.prisma.user.findUnique({ where: { id: uid }, select: { role: true } });
      if (user?.role !== "ADMIN") {
        return reply.code(403).send({ error: "forbidden", message: "仅管理员可设置全局策略" });
      }
    }
    const saved = await saveShareDefaults({ scope, userId: uid, value, updatedBy: uid });
    const effective = await getEffectiveShareDefaults(uid);
    return { ok: true, scope, saved, effective };
  });
}
