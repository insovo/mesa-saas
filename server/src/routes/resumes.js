// /api/resumes — LLM 解析简历(目前接 Kimi/Moonshot)
// 流程: 1) 前端先把简历 PUT 到 R2(走 /api/storage/presigned-url)
//       2) 拿到 r2 key 后调 POST /api/resumes/parse {key}
//       3) 后端从 R2 拉文件 → Kimi files API 上传 + 提取文本 → chat 输出 JSON
//       4) 返回结构化字段,前端用它创建 Candidate

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { parseResume, isKimiConfigured } from "../lib/kimi.js";

const PARSE_BODY = {
  type: "object",
  required: ["key"],
  properties: {
    key: { type: "string", minLength: 1, maxLength: 500 },
    contentType: { type: "string", maxLength: 100 },
  },
  additionalProperties: false,
};

async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  if (stream && typeof stream.transformToByteArray === "function") {
    // AWS SDK v3 自带 helper
    return Buffer.from(await stream.transformToByteArray());
  }
  const readable = Readable.isReadable?.(stream) ? stream : Readable.from(stream);
  const chunks = [];
  for await (const c of readable) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function resumesRoutes(app) {
  app.addHook("preHandler", app.authenticate);

  app.get("/llm-status", async () => ({
    provider: "kimi",
    model: process.env.KIMI_MODEL || "moonshot-v1-32k",
    configured: isKimiConfigured(),
    mode: "system",
  }));

  app.post("/parse", { schema: { body: PARSE_BODY } }, async (req, reply) => {
    if (!app.r2) {
      return reply.code(503).send({ error: "r2_not_configured", message: "R2 凭证未配置,无法读取简历" });
    }
    if (!isKimiConfigured()) {
      return reply.code(503).send({ error: "kimi_not_configured", message: "KIMI_API_KEY 未配置" });
    }

    const { key, contentType } = req.body;

    // 1) 从 R2 拉文件
    let buffer;
    try {
      const cmd = new GetObjectCommand({ Bucket: app.r2.bucket, Key: key });
      const obj = await app.r2.client.send(cmd);
      buffer = await streamToBuffer(obj.Body);
    } catch (err) {
      req.log.error({ err, key }, "fetch from r2 failed");
      return reply.code(404).send({ error: "r2_object_not_found", message: `R2 中找不到对象 ${key}` });
    }

    if (!buffer || buffer.length === 0) {
      return reply.code(400).send({ error: "empty_file", message: "文件为空" });
    }

    // 2) 调 Kimi 解析
    const filename = key.split("/").pop() || "resume.pdf";
    let result;
    try {
      result = await parseResume({
        buffer,
        filename,
        contentType: contentType || "application/octet-stream",
      });
    } catch (err) {
      req.log.error({ err, key }, "kimi parse failed");
      return reply.code(err.statusCode || 502).send({
        error: err.code || "kimi_error",
        message: err.message?.slice(0, 500) || "Kimi 解析失败",
      });
    }

    // 3) 把 r2 key 写进 attachment 字段,方便后续下载
    const candidate = {
      ...result.parsed,
      attachment: key,
      parser: "Kimi",
      parserConfidence: 92, // Kimi 自身不返回置信度,固定一个标识值
      source: "自动上传",
      status: result.parsed.status || "待筛选",
    };

    return {
      candidate,
      meta: result.meta,
    };
  });
}
