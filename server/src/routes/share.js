// /api/candidates/:id/share — ShareLink CRUD (admin only)
// /api/public/share/:token — 公开访问入口(无鉴权,但 token 不可猜 + 过期校验)

import { randomBytes } from "node:crypto";

function tokenGen() {
  // 32 字符 URL-safe (24 字节 base64url)
  return randomBytes(24).toString("base64url");
}

// 把 duration 字符串转 expiresAt (Date 或 null)
// presets: "1d" / "3d" / "7d" / "30d" / "60s" / "Nd" / "forever"
// 自定义: number + unit (s/m/h/d), 范围 60s - 30d
function computeExpiresAt(duration) {
  if (!duration || duration === "forever") return null;
  const match = duration.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) throw Object.assign(new Error("invalid duration format"), { statusCode: 400, code: "invalid_duration" });
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const secs = unit === "s" ? n : unit === "m" ? n * 60 : unit === "h" ? n * 3600 : n * 86400;
  const MIN = 60, MAX = 30 * 86400;
  if (secs < MIN || secs > MAX) {
    throw Object.assign(new Error("duration must be 60s - 30d"), { statusCode: 400, code: "duration_out_of_range" });
  }
  return new Date(Date.now() + secs * 1000);
}

export default async function shareRoutes(app) {
  // ─── Admin 端: 在 candidates 路由前缀下挂载 ──────────────────
  app.register(async (admin) => {
    admin.addHook("preHandler", admin.authenticate);

    // GET 查询某候选人当前 ShareLink
    admin.get("/candidates/:id/share", async (req) => {
      const link = await admin.prisma.shareLink.findFirst({
        where: { candidateId: req.params.id },
        orderBy: { createdAt: "desc" },
      });
      return { link };
    });

    // POST 创建 / 重置 ShareLink (重新生成新 token)
    admin.post("/candidates/:id/share", {
      schema: {
        body: {
          type: "object",
          properties: {
            duration: { type: "string", maxLength: 20 },
            maxViews: { type: ["integer", "null"], minimum: 1, maximum: 9999 },
          },
          additionalProperties: false,
        },
      },
    }, async (req, reply) => {
      const candidate = await admin.prisma.candidate.findUnique({ where: { id: req.params.id } });
      if (!candidate) return reply.code(404).send({ error: "candidate_not_found" });

      const duration = req.body?.duration || "3d";
      let expiresAt;
      try { expiresAt = computeExpiresAt(duration); }
      catch (err) { return reply.code(400).send({ error: err.code, message: err.message }); }

      // 先删旧 link (1 candidate : 1 active link)
      await admin.prisma.shareLink.deleteMany({ where: { candidateId: req.params.id } });

      const link = await admin.prisma.shareLink.create({
        data: {
          token: tokenGen(),
          candidateId: req.params.id,
          expiresAt,
          maxViews: req.body?.maxViews ?? null,
          createdBy: req.user.sub,
        },
      });
      return reply.code(201).send({ link });
    });

    // PATCH 修改有效期 / 访问次数上限
    admin.patch("/candidates/:id/share", {
      schema: {
        body: {
          type: "object",
          properties: {
            duration: { type: "string", maxLength: 20 },
            maxViews: { type: ["integer", "null"], minimum: 1, maximum: 9999 },
          },
          additionalProperties: false,
        },
      },
    }, async (req, reply) => {
      const data = {};
      if (typeof req.body?.duration !== "undefined") {
        try { data.expiresAt = computeExpiresAt(req.body.duration); }
        catch (err) { return reply.code(400).send({ error: err.code, message: err.message }); }
      }
      if (typeof req.body?.maxViews !== "undefined") {
        data.maxViews = req.body.maxViews;  // 可为 null 表示移除上限
      }
      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: "no_fields", message: "duration 或 maxViews 至少一个" });
      }

      const existing = await admin.prisma.shareLink.findFirst({ where: { candidateId: req.params.id } });
      if (!existing) return reply.code(404).send({ error: "share_not_found" });

      const link = await admin.prisma.shareLink.update({ where: { id: existing.id }, data });
      return { link };
    });

    // DELETE 删除 ShareLink
    admin.delete("/candidates/:id/share", async (req, reply) => {
      await admin.prisma.shareLink.deleteMany({ where: { candidateId: req.params.id } });
      return reply.code(204).send();
    });
  });

  // ─── 公开端: 不鉴权,只能通过 token 访问对应候选人 ─────────
  app.get("/public/share/:token", async (req, reply) => {
    const link = await app.prisma.shareLink.findUnique({
      where: { token: req.params.token },
      include: { candidate: true },
    });
    if (!link) return reply.code(404).send({ error: "share_not_found", message: "链接无效" });
    if (link.expiresAt && link.expiresAt < new Date()) {
      return reply.code(410).send({ error: "share_expired", message: "此分享链接已过期" });
    }
    if (link.maxViews != null && link.viewCount >= link.maxViews) {
      return reply.code(410).send({ error: "share_quota_exceeded", message: `此链接访问次数已达上限 (${link.maxViews} 次)` });
    }

    // 记录访问
    await app.prisma.shareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    }).catch(() => {});

    // 严格只返回候选人,不附带其他敏感字段
    const c = link.candidate;
    return {
      candidate: {
        id: c.id,
        externalId: c.externalId,
        name: c.name,
        gender: c.gender,
        animal: c.animal,
        avatar: c.avatar,
        education: c.education,
        school: c.school,
        major: c.major,
        age: c.age,
        location: c.location,
        yearsExp: c.yearsExp,
        // 注意:不返回 phone / email 真实联系方式给公开访问者
        phone: c.phone ? c.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : null,
        email: c.email ? c.email.replace(/(.{2}).+(@.+)/, "$1***$2") : null,
        appliedFor: c.appliedFor,
        jdMatch: c.jdMatch,
        status: c.status,
        parser: c.parser,
        parserConfidence: c.parserConfidence,
        tags: c.tags,
        skills: c.skills,
        risks: c.risks,
        highlights: c.highlights,
        experience: c.experience,
        educationHistory: c.educationHistory,
        aiSummary: c.aiSummary,
      },
      share: {
        expiresAt: link.expiresAt,
        viewCount: link.viewCount,
        createdAt: link.createdAt,
      },
    };
  });
}
