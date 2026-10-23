import { createHmac } from "node:crypto";

export async function salaryRequest(baseUrl, secret, path, body, fetcher = fetch) {
  const method = body == null ? "GET" : "POST";
  const data = body == null ? "" : JSON.stringify(body);
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret).update(`${timestamp}.${method}.${path}.${data}`).digest("hex");
  const response = await fetcher(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json", "x-mesa-timestamp": timestamp, "x-mesa-signature": signature }, ...(body == null ? {} : { body: data }), signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw Object.assign(new Error("salary_service_request_failed"), { statusCode: response.status });
  return response.json();
}

export function messageContext(obj, defaultTenant = "default") {
  const event = obj?.event || obj;
  const m = obj?.message_type ? obj : event?.message || event;
  return {
    type: m.message_type, messageId: m.message_id || m.id, chatId: m.chat_id,
    chatType: m.chat_type, tenantKey: obj?.header?.tenant_key || obj.tenant_key || defaultTenant,
    senderOpenId: event?.sender?.sender_id?.open_id || m.sender_open_id || undefined,
    messageCreatedAt: messageTime(m.create_time),
  };
}

export function messageTime(value) {
  if (value == null || value === "") return undefined;
  const timestamp = /^\d+$/.test(String(value)) ? Number(value) * (String(value).length <= 10 ? 1000 : 1) : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : undefined;
}

export function createEventQueue(handle, { concurrency = 3, onError = () => {} } = {}) {
  const pending = [], waiters = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && pending.length) {
      const event = pending.shift(); active++;
      Promise.resolve().then(() => handle(event)).catch(onError).finally(() => {
        active--; pump();
        if (!active && !pending.length) waiters.splice(0).forEach((resolve) => resolve());
      });
    }
  };
  return { push: (event) => { pending.push(event); pump(); }, drain: () => active || pending.length ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve() };
}

export function createSalaryHandler({ request, download, remove, reply, defaultTenant = "default", maxSize = 20 * 1024 * 1024 }) {
  let groups = [], expires = 0, refreshing;
  const refreshGroups = () => refreshing ||= request("/api/internal/campus-salary/groups").then((data) => { groups = data.items; expires = Date.now() + 30000; }).finally(() => { refreshing = null; });
  const inFlight = new Set();
  const mime = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
  return async (obj) => {
    const context = messageContext(obj, defaultTenant);
    if (context.type !== "file" || context.chatType !== "group" || !context.chatId || !context.messageId) return;
    let refreshed = false;
    if (Date.now() > expires) { await refreshGroups(); refreshed = true; }
    const configured = () => groups.some((g) => g.tenantKey === context.tenantKey && g.chatId === context.chatId);
    if (!configured() && !refreshed) await refreshGroups();
    if (!configured()) return;
    const eventKey = `${context.tenantKey}:${context.chatId}:${context.messageId}`;
    if (inFlight.has(eventKey)) return;
    inFlight.add(eventKey);
    let file;
    try {
      file = await download(context.messageId);
      const ext = file.filename.split(".").pop()?.toLowerCase();
      if (!mime[ext]) return;
      if (!file.buffer.length || file.buffer.length > maxSize) {
        await reply(context.messageId, "文件为空或超过20MB，请重新发送单人简历文件。"); return;
      }
      const ack = await request("/api/internal/campus-salary/submissions", { ...context, messageCreatedAt: messageTime(file.messageCreatedAt) || context.messageCreatedAt, type: undefined, chatType: undefined, filename: file.filename, contentType: mime[ext], data: file.buffer.toString("base64") });
      if (!ack.duplicate) await reply(context.messageId, `已收到简历，正在自动定薪。稍后回显当前建议、条件情景、政策依据和待补材料。\n记录：${ack.submissionId}`);
      return ack;
    } catch (err) {
      await reply(context.messageId, "简历暂未处理成功，请稍后重新发送或联系HR；系统不会猜测金额。").catch(() => {});
      throw err;
    } finally {
      if (file?.path) await remove(file.path);
      inFlight.delete(eventKey);
    }
  };
}
