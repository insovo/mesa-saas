// 文档层统一入口:任意简历 / JD 文件 → 文本(markdown)
//   1) TextIn xParse(已配置且开关开)— 扫描件 / 图片 / doc / docx / 多栏 PDF 都能读对
//   2) 失败或未启用 → 旧回退链(kimi.js extractResumeTextForLlm:pdftotext -layout → Kimi Files API)
// 返回 { text, provider, providerVersion, raw, pageCount, durationMs, detail, fallbackReason }

import { createHash } from "node:crypto";
import { isTextinEnabled, parseDocument } from "./textin.js";
import { extractResumeTextForLlm } from "./kimi.js";

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function extractDocument({ buffer, filename, contentType, log = null, allowTextin = true }) {
  let fallbackReason = null;
  if (allowTextin && (await isTextinEnabled())) {
    try {
      const r = await parseDocument({ buffer, filename, contentType });
      return {
        text: r.markdown,
        provider: "textin",
        providerVersion: r.version,
        raw: r.raw,
        pageCount: r.pageCount,
        durationMs: r.durationMs,
        detail: r.detail,
        fallbackReason: null,
      };
    } catch (err) {
      fallbackReason = `${err.code || "textin_error"}: ${String(err.message).slice(0, 200)}`;
      (log || console).warn?.({ err: err.message, code: err.code, filename }, "[documents] TextIn failed, falling back to local chain");
    }
  }
  const t0 = Date.now();
  const { extractedText, meta } = await extractResumeTextForLlm({ buffer, filename, contentType });
  return {
    text: extractedText,
    provider: meta.extractionSource === "pdftotext-layout" ? "pdftotext" : "kimi-files",
    providerVersion: null,
    raw: null,
    pageCount: null,
    durationMs: Date.now() - t0,
    detail: [],
    fallbackReason,
  };
}
