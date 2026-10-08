// 上传简历:第 n/N 次;presigned PUT R2 → submit(上传成功即后台抽取)→ 联系方式确认页
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { campus, sha256File, setCampusToken } from "../../../lib/campusApi.js";
import { Button, I, toast } from "../../../components/Primitives.jsx";
import { Shell, useCampus, base, Spinner, toastErr } from "./shell.jsx";

const ACCEPT = ".pdf,.doc,.docx";
const MIME = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

export default function CampusUpload() {
  const { slug, me, session, ready, reload, setMe } = useCampus();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || base(slug);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const inputRef = useRef(null);
  if (!ready) return <Shell title="上传简历" back><Spinner /></Shell>;
  // 未建档:按专场默认值显示次数,上传时先 /auth/start
  const used = me?.uploadsUsed ?? 0, allowed = me?.uploadsAllowed ?? session?.maxResumeUploads ?? 3, left = Math.max(0, allowed - used);
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

  function pick(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!MIME[ext]) return toast("仅支持 PDF / Word(doc / docx)", "error");
    if (f.size > 20 * 1024 * 1024) return toast("文件不能超过 20MB", "error");
    setFile(f);
  }
  async function upload() {
    if (!file) return;
    if (!me && !consent) return toast("请先阅读并同意《个人信息处理告知》", "error");
    setBusy(true); setProgress(0);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const contentType = MIME[ext] || file.type || "application/octet-stream";
    try {
      let current = me;
      if (!current) {
        const r = await campus.start({ slug, consent: true });
        if (r.token) setCampusToken(r.token);
        current = r.me; setMe(r.me);
      }
      const { uploadUrl, key } = await campus.presign({ filename: file.name, contentType, size: file.size });
      await axios.put(uploadUrl, file, { headers: { "Content-Type": contentType }, onUploadProgress: (ev) => setProgress(ev.total ? Math.round((ev.loaded / ev.total) * 100) : 50) });
      const sha256 = await sha256File(file);
      const r = await campus.submitResume({ key, filename: file.name, size: file.size, contentType, sha256 });
      if (r.duplicate) toast("这份简历和上一版相同,未重复计次", "info");
      else toast(r.parseTaskId ? "上传成功,系统正在后台读取简历,关闭页面也不会中断" : "上传成功", "success");
      await reload();
      const contactNext = `${base(slug)}/contact?next=${encodeURIComponent(next)}`;
      nav(current.contactConfirmed && r.duplicate ? next : contactNext, { replace: true });
    } catch (e) {
      if (e.response?.status === 503) toast("文件存储未配置,请联系现场 HR", "error");
      else toastErr(e, "上传失败,请重试(失败不计次)");
    } finally { setBusy(false); }
  }

  return (
    <Shell title="上传简历" back>
      <div className="bg-white rounded-card shadow-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{me?.hasResume ? "上传新版简历" : "上传你的简历"}</h2>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${left === 0 ? "bg-red-100 text-red-700" : "bg-lightPrimary text-brand"}`}>第 {Math.min(used + 1, allowed)}/{allowed} 次</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">{me?.hasResume ? "新版将覆盖旧版用于匹配与投递,旧版仅存档。" : "无需注册,投递与智能匹配都需要先有简历。"}上传后系统自动读取学校、专业与经历,不需要等待。</p>
        {session && !session.open && <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">本专场未开放,暂不能上传</p>}

        {left === 0 ? (
          <div className="mt-5 text-center text-sm text-gray-700 bg-lightPrimary rounded-xl p-5">已用完 {allowed} 次上传机会<br /><span className="text-xs text-gray-500">如需更新简历请联系现场 HR</span></div>
        ) : (
          <>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={`mt-5 w-full rounded-card border-2 border-dashed p-6 text-center transition ${file ? "border-brand/50 bg-brand-50/40" : "border-gray-300 bg-lightPrimary/50"}`}>
              <I name={file ? "file-check" : "file-up"} size={30} className={`mx-auto ${file ? "text-brand" : "text-gray-400"}`} />
              {file ? (
                <><p className="text-sm font-bold mt-2 break-all">{file.name}</p><p className="text-[11px] text-gray-500 mt-0.5">{(file.size / 1024).toFixed(0)} KB · 点击重新选择</p></>
              ) : (
                <><p className="text-sm font-bold mt-2">点击选择简历文件</p><p className="text-[11px] text-gray-500 mt-0.5">PDF / Word,不超过 20MB</p></>
              )}
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={pick} />
            </button>
            {busy && <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-brand-gradient transition-all" style={{ width: `${progress}%` }} /></div>}
            {!me && (
              <>
                <label className="flex items-start gap-2 text-xs text-gray-700 mt-4 ml-1">
                  <input type="checkbox" className="accent-brand mt-0.5 w-4 h-4 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>我已阅读并同意<button type="button" onClick={() => setShowNotice((v) => !v)} className="text-brand font-medium">《个人信息处理告知》</button>,同意将简历与联系方式用于本次校园招聘的评估与联系</span>
                </label>
                {showNotice && <div className="mt-2 text-[11px] text-gray-600 bg-lightPrimary rounded-xl p-3 leading-relaxed">我们收集你的手机号、邮箱、毕业年份与简历文件,仅用于本次校园招聘的岗位匹配、筛选与面试联系;简历由系统自动抽取学校 / 专业 / 经历等信息用于评估;数据存储于招聘方系统,招聘流程结束后按招聘方留存政策处理;你可联系现场 HR 要求更正或删除。本次会话保存在当前浏览器,更换设备需用手机号和邮箱找回。</div>}
              </>
            )}
            <Button className="w-full !h-12 mt-4" disabled={!file || busy || (session && !session.open) || (!me && !consent)} onClick={upload} icon={busy ? <I name="loader" size={16} className="animate-spin" /> : <I name="upload-cloud" size={16} />}>{busy ? (progress < 100 ? `上传中 ${progress}%` : "提交中…") : "上传"}</Button>
          </>
        )}

        {isWeChat && (
          <div className="mt-5 text-[11px] text-gray-600 bg-amber-50 rounded-xl p-3 leading-relaxed">
            <p className="font-bold text-amber-800 mb-1">微信里的简历怎么选?</p>
            <p>iPhone:在聊天里长按简历文件 → 用其他应用打开 → 存储到「文件」,再回到这里从「文件」中选择。</p>
            <p>安卓:直接在弹出的文件选择器里找到微信下载目录即可。</p>
          </div>
        )}
        {me?.hasResume && <p className="mt-4 text-center text-xs"><button type="button" onClick={() => nav(next)} className="text-brand font-medium">不换了,沿用当前简历继续</button></p>}
        {!me && <p className="mt-4 text-center text-xs text-gray-500">之前在其他设备投递过?<Link to={`${base(slug)}/recover?next=${encodeURIComponent(next)}`} className="text-brand font-medium ml-1">找回记录</Link></p>}
      </div>
    </Shell>
  );
}
