import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { api, resources, LONG_TIMEOUT } from "../lib/api.js";
import {
  Card, Button, I, Tag, AiBadge, toast, Empty, LoadingBlock, MatchRing, StatusPill,
} from "../components/Primitives.jsx";

// 简历收件箱 · 真实流程
// 1) 前端拿到文件 → POST /api/storage/presigned-url 拿短时效 PUT URL
// 2) 浏览器 PUT 文件流到 R2(零后端流量)
// 3) POST /api/storage/confirm 让后端关联 key
// 4) POST /api/resumes/parse {key} → 后端从 R2 拉文件 → Kimi files API → JSON
// 5) 用解析结果 POST /api/candidates 创建候选人
//
// 任一环节失败:
//   - R2 未配置(503) → 自动降级为「只入库元数据 + 仅文件名」,候选人仍可创建
//   - Kimi 未配置(503) → 同上,Kimi 报错前端 toast 提示但已入库的不删

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState([]);
  const [llmStatus, setLlmStatus] = useState(null);

  useEffect(() => {
    api.get("/resumes/llm-status").then((r) => setLlmStatus(r.data)).catch(() => setLlmStatus({ configured: false }));
  }, []);

  function onPick(e) {
    const fs = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...fs]);
  }

  async function uploadOne(file) {
    // ── 1) 预签名 + R2 直传 ─────────────────────────
    let r2Key = null;
    try {
      const { data } = await api.post("/storage/presigned-url", {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        expectedSize: file.size,
      });
      await axios.put(data.uploadUrl, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      r2Key = data.key;
      await api.post("/storage/confirm", { key: r2Key });
    } catch (e) {
      if (e.response?.status !== 503) console.warn("R2 upload failed:", e);
    }

    // ── 2) 调 Kimi 解析(仅当 R2 上传成功 + Kimi 已配置)─
    // ⚠️ timeout 120s — Kimi 解析 PDF/Word 实测 10-30s,Word/扫描件偶尔 60s+
    let parsedFields = null;
    if (r2Key && llmStatus?.configured) {
      try {
        const model = localStorage.getItem("mesa.llm.model") || llmStatus.model;
        const { data } = await api.post(
          "/resumes/parse",
          {
            key: r2Key,
            contentType: file.type || "application/octet-stream",
            model, // 让后端用用户选的模型;为空时后端用 KIMI_MODEL 默认值
          },
          { timeout: LONG_TIMEOUT },
        );
        parsedFields = data.candidate;
      } catch (e) {
        const msg = e.response?.data?.message || e.message;
        toast(`${file.name}: ${msg}`, "error");
        // 解析失败不阻塞 — 仍按元数据降级入库
      }
    }

    // ── 3) 创建 Candidate ────────────────────────────
    const payload = parsedFields
      ? parsedFields
      : {
          name: file.name.replace(/\.[^/.]+$/, ""),
          status: "待筛选",
          source: "自动上传",
          attachment: r2Key || file.name,
          // 占位 — 等用户在 UI 编辑或事后触发再解析
          tags: ["待解析"],
          skills: [],
          risks: [],
          highlights: [],
          experience: [],
          educationHistory: [],
        };

    return resources.candidates.create(payload);
  }

  async function onParse() {
    if (files.length === 0) return toast("先选择简历", "error");
    setParsing(true);
    try {
      const results = [];
      for (const f of files) results.push(await uploadOne(f));
      setParsed((prev) => [...results, ...prev]);
      setFiles([]);
      const real = results.filter((r) => r.parser).length;
      toast(
        real > 0 ? `已 AI 解析 ${real}/${results.length} 份简历` : `已入库 ${results.length} 份(LLM 未启用)`,
        "success",
      );
    } catch (e) {
      toast(e.response?.data?.message || "解析失败", "error");
    } finally {
      setParsing(false);
    }
  }

  const llmReady = llmStatus?.configured;

  return (
    <div className="space-y-6">
      <Card className="p-8 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-brand-gradient opacity-10 blur-3xl"></div>
        <div className="relative flex items-start gap-5 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-brand-gradient flex items-center justify-center text-white shrink-0">
            <I name="upload-cloud" size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-navy-700">简历收件箱</h2>
            <p className="text-sm text-gray-700 mt-1">
              支持 PDF / DOCX / DOC,通过 {llmStatus?.provider === "kimi" ? "Kimi (Moonshot AI)" : "LLM"} 自动解析为候选人结构化字段。
            </p>
          </div>
          {llmReady ? (
            <AiBadge parser="Kimi" confidence={null} />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold bg-amber-100 text-amber-700">
              <I name="alert-triangle" size={11} />
              LLM 未配置 · 降级入库
            </span>
          )}
        </div>
      </Card>

      <Card className="p-8">
        <label
          htmlFor="resume-upload"
          className="block border-2 border-dashed border-gray-200 rounded-card p-10 text-center cursor-pointer hover:border-brand hover:bg-lightPrimary transition"
        >
          <I name="file-up" size={36} className="text-brand mx-auto" />
          <p className="mt-3 text-sm font-bold text-navy-700">点击或拖拽文件到这里</p>
          <p className="text-xs text-gray-700 mt-1">单次最多 10 份 · 单文件 ≤ 20MB · PDF / DOCX / DOC</p>
          <input
            id="resume-upload"
            type="file"
            multiple
            accept=".pdf,.docx,.doc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={onPick}
          />
        </label>

        {files.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-bold text-gray-700 uppercase mb-3">待解析 ({files.length})</p>
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3 bg-lightPrimary rounded-xl">
                  <I name="file-text" size={18} className="text-brand" />
                  <span className="flex-1 text-sm text-navy-700 truncate">{f.name}</span>
                  <span className="text-xs text-gray-700">{(f.size / 1024).toFixed(1)} KB</span>
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500"
                    disabled={parsing}
                  >
                    <I name="x" size={16} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-3 mt-5">
              <Button variant="ghost" onClick={() => setFiles([])} disabled={parsing}>清空</Button>
              <Button onClick={onParse} disabled={parsing} icon={<I name={parsing ? "loader" : "sparkles"} size={14} className={parsing ? "animate-spin" : ""} />}>
                {parsing ? "解析中(每份约 10-30 秒)..." : `${llmReady ? "AI 解析" : "上传入库"} (${files.length})`}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {parsing && <LoadingBlock label="Kimi 正在阅读简历,请稍候..." height="h-16" />}

      {parsed.length > 0 && (
        <Card className="p-6">
          <h3 className="title-card mb-4">本次已入库</h3>
          <ul className="divide-y divide-gray-200">
            {parsed.map((c) => (
              <li key={c.id} className="py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold">
                  {(c.name || "?").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/candidates/${c.externalId || c.id}`} className="text-sm font-bold text-navy-700 hover:text-brand block truncate">
                    {c.name || "—"}
                  </Link>
                  <p className="text-xs text-gray-700 truncate">
                    {[c.education, c.school, c.major].filter(Boolean).join(" · ") || c.attachment}
                  </p>
                </div>
                <div className="hidden md:flex gap-1.5 max-w-[280px] flex-wrap">
                  {(c.tags || []).slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}
                </div>
                {c.jdMatch != null && <MatchRing value={c.jdMatch} size={40} stroke={4} />}
                {c.parser ? (
                  <AiBadge parser={c.parser} confidence={c.parserConfidence} />
                ) : (
                  <StatusPill status={c.status || "待筛选"} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {parsed.length === 0 && files.length === 0 && (
        <Card className="p-6">
          <Empty icon="inbox" title="收件箱为空" desc="上传简历后会自动出现在候选人列表里" />
        </Card>
      )}
    </div>
  );
}
