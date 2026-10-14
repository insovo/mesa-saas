import { useState } from "react";
import { resources } from "../lib/api.js";
import { Button, I, toast } from "./Primitives.jsx";

export default function ResumeDownloadButton({ ids, campus = false, disabled = false }) {
  const [downloading, setDownloading] = useState(false);
  async function download() {
    setDownloading(true);
    try {
      const response = await resources.downloadResumes({ [campus ? "applicantIds" : "candidateIds"]: ids });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `原始简历_${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast("简历已打包；缺少或暂时无法读取的文件会列在包内“下载说明”中", "success");
    } catch (error) {
      let message = error.response?.data?.message;
      if (error.response?.data instanceof Blob) {
        try { message = JSON.parse(await error.response.data.text()).message; } catch {}
      }
      toast(message || "下载失败，请稍后重试", "error");
    } finally { setDownloading(false); }
  }
  return <Button size="sm" variant="secondary" disabled={disabled || downloading || !ids.length || ids.length > 1000} icon={<I name={downloading ? "loader" : "download"} size={14} className={downloading ? "animate-spin" : ""} />} onClick={download}>{downloading ? "打包中…" : `下载原始简历 (${ids.length})`}</Button>;
}
