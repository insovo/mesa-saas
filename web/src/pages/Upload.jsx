import { useState } from "react";
import axios from "axios";
import { api, resources } from "../lib/api.js";
import { Card, Button, I, Tag, AiBadge, toast, Empty } from "../components/Primitives.jsx";

// 简历收件箱
// 流程: 1) 前端拿到文件 → 调 /api/storage/presigned-url 拿短时效 PUT URL
//       2) 浏览器 PUT 文件流到 R2(零后端流量)
//       3) 调 /api/storage/confirm 让后端关联到 Candidate
//       4) 触发 LLM 解析(预留,当前用本地 mock)
//
// 如果 R2 未配置(后端返回 503),自动降级为「只入库元数据 + Mock 解析」,
// 保证阶段① 期间也能演示完整流程。

const SAMPLE_PARSE = {
  name: "新候选人",
  appliedFor: "智能驾驶感知工程师",
  status: "待筛选",
  source: "自动上传",
  parser: "Kimi",
  parserConfidence: 92,
  jdMatch: 78,
  tags: ["BEV 感知", "Python", "C++"],
  skills: ["AI 解析后将自动填充技能"],
  risks: [],
  highlights: ["AI 解析高亮"],
  experience: [],
  educationHistory: [],
};

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState([]);

  function onPick(e) {
    const fs = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...fs]);
  }

  async function uploadOne(file) {
    // 1) 申请预签名 URL
    let r2Key = null;
    try {
      const { data } = await api.post("/storage/presigned-url", {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        expectedSize: file.size,
      });
      // 2) 直传 R2 — 用裸 axios,不带 Authorization
      await axios.put(data.uploadUrl, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      r2Key = data.key;
      await api.post("/storage/confirm", { key: r2Key });
    } catch (e) {
      // R2 未配置 / 网络异常 — 降级为仅入库元数据
      if (e.response?.status !== 503) console.warn("R2 upload failed, falling back to metadata-only", e);
    }
    // 3) 创建 Candidate(含附件 key)
    return resources.candidates.create({
      ...SAMPLE_PARSE,
      name: file.name.replace(/\.[^/.]+$/, ""),
      attachment: r2Key || file.name,
    });
  }

  async function onParse() {
    if (files.length === 0) {
      toast("先选择简历", "error");
      return;
    }
    setParsing(true);
    try {
      const results = [];
      for (const f of files) {
        results.push(await uploadOne(f));
      }
      setParsed((prev) => [...results, ...prev]);
      setFiles([]);
      toast(`已解析 ${results.length} 份简历`, "success");
    } catch (e) {
      toast(e.response?.data?.message || e.message || "解析失败", "error");
    } finally {
      setParsing(false);
    }
  }

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
              支持 PDF / DOCX / DOC,LLM(Kimi / DeepSeek) 自动解析为候选人结构化字段。
            </p>
          </div>
          <AiBadge parser="Kimi" />
        </div>
      </Card>

      <Card className="p-8">
        <label
          htmlFor="resume-upload"
          className="block border-2 border-dashed border-gray-200 rounded-card p-10 text-center cursor-pointer hover:border-brand hover:bg-lightPrimary transition"
        >
          <I name="file-up" size={36} className="text-brand mx-auto" />
          <p className="mt-3 text-sm font-bold text-navy-700">点击或拖拽文件到这里</p>
          <p className="text-xs text-gray-700 mt-1">单次最多 10 份 · 总大小 ≤ 50MB</p>
          <input id="resume-upload" type="file" multiple accept=".pdf,.docx,.doc" className="hidden" onChange={onPick} />
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
                  >
                    <I name="x" size={16} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-3 mt-5">
              <Button variant="ghost" onClick={() => setFiles([])}>清空</Button>
              <Button onClick={onParse} disabled={parsing} icon={<I name="sparkles" size={14} />}>
                {parsing ? "解析中..." : `开始解析 (${files.length})`}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {parsed.length > 0 && (
        <Card className="p-6">
          <h3 className="title-card mb-4">本次已入库</h3>
          <ul className="divide-y divide-gray-200">
            {parsed.map((c) => (
              <li key={c.id} className="py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-gradient text-white flex items-center justify-center">
                  <I name="user" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-navy-700">{c.name}</p>
                  <p className="text-xs text-gray-700">{c.attachment}</p>
                </div>
                <div className="flex gap-1.5">
                  {(c.tags || []).slice(0, 3).map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <I name="check-circle-2" size={14} />
                  已入库
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {parsed.length === 0 && files.length === 0 && (
        <Card className="p-6">
          <Empty icon="inbox" title="收件箱为空" desc="上传简历后将自动出现在候选人列表里" />
        </Card>
      )}
    </div>
  );
}
