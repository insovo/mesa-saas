// Cloudflare R2 客户端(S3 兼容)— 阶段② 预留 plugin
// 只有当 R2_* 环境变量齐全时才注册客户端;否则跳过,/api/storage/* 路由将自动返回 503。
// 凭证读自 .env,严禁硬编码。

import fp from "fastify-plugin";

const REQUIRED = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];

export default fp(async (app) => {
  const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].startsWith("__"));
  if (missing.length > 0) {
    app.log.warn({ missing }, "r2 plugin not enabled: missing or placeholder env");
    app.decorate("r2", null);
    return;
  }

  // 延迟 import,避免没 R2 时也强制安装 SDK
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
    await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  app.decorate("r2", {
    client,
    bucket: process.env.R2_BUCKET,
    publicBase: process.env.R2_PUBLIC_BASE_URL || null,

    async presignPut({ key, contentType, expiresIn = 900 }) {
      const cmd = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        ContentType: contentType,
      });
      return getSignedUrl(client, cmd, { expiresIn });
    },

    async presignGet({ key, expiresIn = 600 }) {
      const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key });
      return getSignedUrl(client, cmd, { expiresIn });
    },

    async deleteObject(key) {
      const cmd = new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key });
      return client.send(cmd);
    },
  });

  app.log.info({ bucket: process.env.R2_BUCKET }, "r2 plugin ready");
}, { name: "r2" });
