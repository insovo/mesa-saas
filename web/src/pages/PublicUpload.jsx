// 公开上传页 — 通过 /upload/:token 访问,无需登录
// 流程:GET /api/public/upload/:token → 校验 token + 拿元数据(link.defaultJob/defaultSource/note)
//     → 用户填表 + 选简历文件
//     → POST /api/public/upload/:token/presigned-url → R2 直传
//     → POST /api/public/upload/:token/submit → 创建 candidate + uploadCount++
// 失败/过期/达上限会有友好提示页

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { api } from "../lib/api.js";
import { Card, Button, Input, I, toast, LoadingBlock, ToastHost } from "../components/Primitives.jsx";

const STATE_LOADING = "loading";
const STATE_READY = "ready";
const STATE_ERROR = "error";
const STATE_SUBMITTING = "submitting";
const STATE_SUCCESS = "success";

function ErrorScreen({ icon, title, message, code }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-gradient-to-br from-lightPrimary via-white to-lightPrimary">
      <Card className="p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 text-red-500 mx-auto flex items-center justify-center mb-5">
          <I name={icon} size={28} />
        </div>
        <h2 className="text-xl font-bold text-navy-700 mb-2">{title}</h2>
        <p className="text-sm text-gray-700">{message}</p>
        {code && <p className="text-[11px] text-gray-400 mt-3 font-mono">code: {code}</p>}
        <p className="text-xs text-gray-400 mt-6">请联系分享链接给您的招聘负责人。</p>
      </Card>
    </div>
  );
}

function SuccessScreen({ name, uploadCount, maxUploads }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-gradient-to-br from-lightPrimary via-white to-lightPrimary">
      <Card className="p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 text-green-600 mx-auto flex items-center justify-center mb-5">
          <I name="check-circle" size={32} />
        </div>
        <h2 className="text-xl font-bold text-navy-700 mb-2">上传成功</h2>
        <p className="text-sm text-gray-700">
          感谢 {name ? <b>{name}</b> : "您"} 的简历!我们已收到,
          招聘官会与您联系。
        </p>
        {maxUploads != null && (
          <p className="text-[11px] text-gray-500 mt-4">本链接收件进度 {uploadCount} / {maxUploads}</p>
        )}
      </Card>
    </div>
  );
}

export default function PublicUpload() {
  const { token } = useParams();
  const [state, setState] = useState(STATE_LOADING);
  const [link, setLink] = useState(null);
  const [errorInfo, setErrorInfo] = useState({ icon: "alert-triangle", title: "", message: "", code: "" });

  // 表单字段
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [uploaderSource, setUploaderSource] = useState("");   // 来源(独立),如"xxx 推荐"/"罗卡"
  const [uploaderNote, setUploaderNote] = useState("");        // 备注,会同步到候选人详情页"备注"卡

  // 提交后的成功元数据
  const [submitInfo, setSubmitInfo] = useState({ uploadCount: 0, maxUploads: null });

  useEffect(() => {
    if (!token) return;
    api.get(`/public/upload/${token}`)
      .then((r) => {
        setLink(r.data.link);
        setState(STATE_READY);
      })
      .catch((err) => {
        const data = err.response?.data || {};
        const status = err.response?.status;
        let icon = "alert-triangle";
        if (status === 410) icon = "clock";
        else if (status === 404) icon = "link-2-off";
        setErrorInfo({
          icon,
          title: status === 410 ? "链接已失效" : status === 404 ? "链接不存在" : "无法访问",
          message: data.message || "请向分享链接给您的招聘负责人核实",
          code: data.error,
        });
        setState(STATE_ERROR);
      });
  }, [token]);

  async function onSubmit() {
    if (!file) return toast("请先选择简历文件", "error");
    if (file.size > 20 * 1024 * 1024) return toast("文件超过 20MB", "error");
    setState(STATE_SUBMITTING);
    try {
      // 1) 拿 presigned URL
      const { data: presigned } = await api.post(`/public/upload/${token}/presigned-url`, {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        expectedSize: file.size,
      });
      // 2) R2 直传
      await axios.put(presigned.uploadUrl, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      // 3) 后端创建 candidate(source 写入 candidate.source,uploaderNote 写入 CandidateNote 表)
      const { data } = await api.post(`/public/upload/${token}/submit`, {
        key: presigned.key,
        filename: file.name,
        name: name.trim() || null,
        contact: contact.trim() || null,
        source: uploaderSource.trim() || null,
        uploaderNote: uploaderNote.trim() || null,
      });
      setSubmitInfo({ uploadCount: data.uploadCount, maxUploads: data.maxUploads });
      setState(STATE_SUCCESS);
    } catch (err) {
      const data = err.response?.data || {};
      toast(data.message || "上传失败,请稍后再试", "error");
      setState(STATE_READY);
    }
  }

  if (state === STATE_LOADING) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingBlock label="验证链接中..." height="h-16" />
        <ToastHost />
      </div>
    );
  }
  if (state === STATE_ERROR) {
    return <><ErrorScreen {...errorInfo} /><ToastHost /></>;
  }
  if (state === STATE_SUCCESS) {
    return <><SuccessScreen name={name} {...submitInfo} /><ToastHost /></>;
  }

  // STATE_READY / STATE_SUBMITTING
  const submitting = state === STATE_SUBMITTING;
  const remaining = link.maxUploads != null ? Math.max(0, link.maxUploads - link.uploadCount) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-lightPrimary via-white to-lightPrimary px-5 py-10">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* 头部 — 招聘官提示 */}
        <Card className="p-7 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-brand-gradient opacity-10 blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-brand-gradient flex items-center justify-center text-white">
                <I name="upload-cloud" size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-navy-700">Overseas R&amp;D · 简历上传</h2>
                <p className="text-xs text-gray-700">通过分享链接安全上传,无需登录</p>
              </div>
            </div>
            {link.defaultJob && (
              <div className="mt-4 p-3 bg-lightPrimary rounded-xl text-sm text-navy-700 flex items-center gap-2">
                <I name="briefcase" size={14} className="text-brand" />
                <span>本次将关联到岗位:<b>{link.defaultJob.title}</b></span>
              </div>
            )}
            {link.note && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <p className="font-bold flex items-center gap-1.5 mb-1"><I name="message-square" size={12} /> 招聘官留言</p>
                <p className="whitespace-pre-line">{link.note}</p>
              </div>
            )}
          </div>
        </Card>

        {/* 文件 + 表单 */}
        <Card className="p-7">
          <label
            htmlFor="public-upload-file"
            className={`block border-2 border-dashed rounded-card p-8 text-center cursor-pointer transition ${
              file ? "border-brand bg-lightPrimary" : "border-gray-200 hover:border-brand hover:bg-lightPrimary"
            }`}
          >
            <I name={file ? "file-text" : "file-up"} size={36} className="text-brand mx-auto" />
            <p className="mt-3 text-sm font-bold text-navy-700">
              {file ? file.name : "点击选择简历文件"}
            </p>
            <p className="text-xs text-gray-700 mt-1">
              {file ? `${(file.size / 1024).toFixed(1)} KB · 点击重选` : "PDF / DOCX / DOC · ≤ 20MB"}
            </p>
            <input
              id="public-upload-file"
              type="file"
              accept=".pdf,.docx,.doc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              disabled={submitting}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <Input
              label="姓名 (可选)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如:张三"
              disabled={submitting}
              maxLength={100}
            />
            <Input
              label="联系方式 (可选)"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="电话 / 邮箱"
              disabled={submitting}
              maxLength={200}
            />
          </div>

          <div className="mt-4">
            <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">来源 (可选)</label>
            <input
              type="text"
              value={uploaderSource}
              onChange={(e) => setUploaderSource(e.target.value)}
              placeholder="如:xxx 推荐、罗卡、英国猎头等"
              disabled={submitting}
              maxLength={500}
              className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 outline-none focus:border-brand bg-white"
            />
            <p className="text-[11px] text-gray-500 mt-1 text-right">{uploaderSource.length} / 500</p>
          </div>

          <div className="mt-4">
            <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">备注 (可选)</label>
            <textarea
              value={uploaderNote}
              onChange={(e) => setUploaderNote(e.target.value)}
              placeholder="添加备注信息"
              disabled={submitting}
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm text-navy-700 outline-none focus:border-brand bg-white resize-y"
            />
            <p className="text-[11px] text-gray-500 mt-1 text-right">{uploaderNote.length} / 2000</p>
          </div>

          <Button
            onClick={onSubmit}
            disabled={!file || submitting}
            icon={<I name={submitting ? "loader" : "upload"} size={14} className={submitting ? "animate-spin" : ""} />}
            className="w-full mt-6"
          >
            {submitting ? "上传中..." : "提交简历"}
          </Button>

          {remaining != null && (
            <p className="text-[11px] text-gray-500 mt-3 text-center">
              本链接还可收 <b>{remaining}</b> 份 ({link.uploadCount} / {link.maxUploads})
            </p>
          )}
        </Card>

        <p className="text-center text-[11px] text-gray-400">
          由 Overseas R&amp;D 提供安全上传服务 · 您的简历仅会被招聘官查看
        </p>
      </div>
      <ToastHost />
    </div>
  );
}
