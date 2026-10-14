import archiver from "archiver";
import { once } from "node:events";
import { attachmentHeaderForFilename } from "./interviewEvalExport.js";

function filenamePart(value, fallback) {
  let part = String(value || "").normalize("NFC").trim().replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_");
  while (Buffer.byteLength(part) > 55) part = [...part].slice(0, -1).join("");
  return part.replace(/[. ]+$/g, "") || fallback;
}

export function resumeFilename(candidate, used) {
  const applicant = candidate.campusApplicant;
  const manual = applicant?.summaryData || {};
  const value = (field, automatic) => typeof manual[field] === "string" ? manual[field] : automatic;
  const base = [value("name", applicant?.name || candidate.name), value("major", applicant?.major || candidate.major), value("degree", applicant?.degree || candidate.education), value("school", applicant?.school || candidate.school)].map((item, index) => filenamePart(item, ["未填写姓名", "未填写专业", "未填写学历", "未填写学校"][index])).join("-");
  const version = applicant?.resumeVersions?.find((item) => item.id === applicant.currentResumeVersionId);
  const key = version?.attachmentKey || candidate.attachment;
  const extension = key?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() || version?.filename?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() || "bin";
  let name = `${base}.${extension}`;
  let suffix = 2;
  while (used.has(name.toLowerCase())) name = `${base} (${suffix++}).${extension}`;
  used.add(name.toLowerCase());
  return { key, name };
}

export async function sendResumeArchive(app, req, reply, candidates) {
  const used = new Set();
  const entries = candidates.map((candidate) => resumeFilename(candidate, used));
  const skipped = [];
  const read = async (entry) => {
    if (!entry.key) { skipped.push(`${entry.name}：未上传原始简历`); return null; }
    try { return await app.r2.getObjectBuffer(entry.key, { timeoutMs: 20000 }); }
    catch { skipped.push(`${entry.name}：原始简历暂时无法读取，请重试`); return null; }
  };
  let index = 0;
  let first;
  while (index < entries.length && !(first = await read(entries[index]))) index++;
  if (!first) return reply.code(409).send({ error: "no_resumes", message: "所选人员没有可下载的原始简历" });

  const archive = archiver("zip", { store: true });
  const cancelled = new AbortController();
  archive.on("error", () => archive.destroy());
  reply.header("Content-Type", "application/zip").header("Cache-Control", "no-store").header("Content-Disposition", attachmentHeaderForFilename(`原始简历_${new Date().toISOString().slice(0, 10)}.zip`)).send(archive);
  reply.raw.on("close", () => { if (!reply.raw.writableFinished) { cancelled.abort(); archive.abort(); } });
  const append = async (data, name) => {
    const written = once(archive, "entry", { signal: cancelled.signal });
    archive.append(data, { name });
    await written;
  };
  try {
    await append(first, entries[index].name);
    for (index++; index < entries.length && !archive.destroyed; index++) {
      const data = await read(entries[index]);
      if (data) await append(data, entries[index].name);
    }
    if (skipped.length) await append(Buffer.from(`以下原始简历未包含在本次下载中：\n${skipped.join("\n")}\n`), "下载说明.txt");
    await archive.finalize();
  } catch { archive.destroy(); }
  return reply;
}
