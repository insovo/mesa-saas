import crypto from "node:crypto";
import { buildSalaryEditCard } from "../lib/campusSalary/cards.js";
import { CATEGORY_LABELS, FIELD_LABELS, ROLE_LABELS } from "../lib/campusSalary/policy.js";
import { requestSalaryEvaluation, salaryError } from "../lib/campusSalary/service.js";

const retired = new Set(["pick_jd", "view_jd", "new_jd", "create_jd", "set_jd", "parse"]);
const toast = (type, content) => ({ toast: { type, content } });
function decryptBody(encrypt, key) {
  const data = Buffer.from(encrypt, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", crypto.createHash("sha256").update(key).digest(), data.subarray(0, 16));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]).toString("utf8"));
}
function fromLabel(value, labels) {
  const entry = Object.entries(labels).find(([, label]) => label === value.trim());
  if (!entry) throw salaryError("请使用表单提示中的类别名称");
  return entry[0];
}

export default async function feishuRoutes(app) {
  app.post("/card-callback", { schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const verification = process.env.FEISHU_VERIFICATION_TOKEN;
    if (!verification) return reply.code(503).send({ error: "feishu_callback_disabled" });
    let body = req.body || {};
    if (body.encrypt) {
      if (!process.env.FEISHU_ENCRYPT_KEY) return reply.code(400).send({ error: "encrypt_key_not_configured" });
      try { body = decryptBody(body.encrypt, process.env.FEISHU_ENCRYPT_KEY); }
      catch { return reply.code(400).send({ error: "decrypt_failed" }); }
    }
    if (body.type === "url_verification") {
      if (body.token !== verification) return reply.code(403).send({ error: "invalid_token" });
      return { challenge: body.challenge };
    }
    if (body.header?.token !== verification) return reply.code(403).send({ error: "invalid_token" });
    if (body.header.event_type !== "card.action.trigger") return {};
    let value = body.event?.action?.value || {};
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { value = {}; } }
    if (retired.has(value.a)) return toast("info", "旧简历入库与JD评分已停用，请在已配置群发送简历自动定薪");
    if (!["salary_edit", "salary_save"].includes(value.a)) return toast("info", "未知操作");
    if (!/^[a-f\d-]{36}$/i.test(value.sid || "")) return toast("error", "记录无效");
    const row = await app.prisma.salarySubmission.findUnique({ where: { id: value.sid }, include: { group: true } });
    const event = body.event || {};
    const tenantKey = body.header.tenant_key || "default";
    const openId = event.operator?.open_id || event.operator?.operator_id?.open_id;
    if (!row || row.status === "deleted" || !row.group.enabled || row.group.chatId !== event.context?.open_chat_id || row.group.tenantKey !== tenantKey) return toast("error", "记录不存在或不属于当前群");
    const userId = row.group.operators?.[openId];
    const user = userId && await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } });
    if (!user?.isActive || (row.group.ownerId !== userId && !row.group.memberUserIds.includes(userId))) return toast("error", "请由群配置中已授权的HR补充信息");
    if (row.supersededById) return toast("error", "此简历已有更新，请使用最新简历的结果卡片或MESA定薪记录");
    if (value.revision !== row.revision) return toast("error", "已有更新，请使用最新结果卡片或MESA定薪记录页");
    if (value.a === "salary_edit") return { card: buildSalaryEditCard(row) };
    try {
      const form = event.action.form_value || {};
      if (typeof form.reason !== "string" || !form.reason.trim() || form.reason.length > 1000) return toast("error", "请填写补充信息的依据");
      const context = {}, confirmed = {};
      for (const key of ["contractCity", "cityType", "salaryFactor", "majorCategory", "doctorField", "roleType"]) {
        if (form[key] == null || form[key] === "") continue;
        if (typeof form[key] !== "string" || form[key].length > 200) throw salaryError("表单字段无效");
        const val = form[key].trim();
        if (key === "majorCategory") confirmed.majorCategory = fromLabel(val, CATEGORY_LABELS);
        else if (key === "doctorField") confirmed.doctorField = fromLabel(val, FIELD_LABELS);
        else if (key === "roleType") context.roleType = fromLabel(val, ROLE_LABELS);
        else if (key === "cityType") context.cityType = fromLabel(val, { first: "一线", nonfirst: "非一线" });
        else if (key === "salaryFactor") {
          if (!/^\d+(?:\.\d+)?$/.test(val) || Number(val) <= 0 || Number(val) > 1000) throw salaryError("薪数须为已确认的大于0且不超过1000的数字");
          context.salaryFactor = Number(val);
        } else context.contractCity = val;
      }
      await requestSalaryEvaluation(app, row.id, { revision: row.revision, context, confirmed, reason: form.reason.trim(), requestedBy: userId });
      return { ...toast("success", "已保存，正在重新测算，稍后回复到原简历消息"), card: { type: "raw", data: { schema: "2.0", body: { elements: [{ tag: "markdown", content: "定薪信息已补充，正在生成新版本；旧版本保留在MESA记录页。" }] } } } };
    } catch (err) {
      return toast("error", err.statusCode && err.statusCode < 500 ? err.message : "保存失败，请稍后重试");
    }
  });
}
