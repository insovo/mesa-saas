// 专场 tab:列表卡片 + 新建 / 编辑 + 上线 / 结束 / 草稿 / 删除 + 岗位配置 + 学生端二维码
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { resources } from "../../lib/api.js";
import { Card, Button, I, Empty, Modal, toast } from "../Primitives.jsx";
import { SessionStatusPill, fmtDate, errMsg } from "./ui.jsx";
import SessionFormModal from "./SessionFormModal.jsx";
import SessionJobsPanel from "./SessionJobsPanel.jsx";

export default function CampusSessions({ sessions, canManage, onChanged }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [qr, setQr] = useState(null);

  async function act(s, action) {
    const label = { live: "上线(其它上线中的专场会自动结束)", close: "结束", draft: "退回草稿" }[action];
    if (!confirm(`确定${label}「${s.name}」?`)) return;
    try { await resources.campus.setSessionStatus(s.id, action); toast("已更新", "success"); onChanged?.(); }
    catch (e) { toast(errMsg(e), "error"); }
  }
  async function remove(s) {
    if (!confirm(`删除专场「${s.name}」?(已有学生的专场不能删除)`)) return;
    try { await resources.campus.removeSession(s.id); toast("已删除", "success"); onChanged?.(); }
    catch (e) { toast(errMsg(e), "error"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">同一时刻只有一个专场「上线中」,学生端首页展示它。学生端页面将在下一阶段上线,二维码链接已可预留。</p>
        {canManage && <Button size="sm" icon={<I name="plus" size={14} />} onClick={() => { setEditing(null); setFormOpen(true); }}>新建专场</Button>}
      </div>
      {sessions.length === 0 ? (
        <Card className="p-6"><Empty icon="graduation-cap" title="还没有专场" desc={canManage ? "点右上「新建专场」" : "请联系管理员创建专场"} /></Card>
      ) : sessions.map((s) => (
        <Card key={s.id} className="p-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-navy-700">{s.name}</h3>
                <SessionStatusPill status={s.status} />
                {s.school && <span className="text-xs text-gray-600">{s.school}</span>}
              </div>
              <p className="text-xs text-gray-600 mt-1">{s.startsAt || s.endsAt ? `${fmtDate(s.startsAt)} ~ ${fmtDate(s.endsAt)}` : "未设时间"}{s.location ? ` · ${s.location}` : ""}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-navy-700">
                <span><b>{s.jobsCount}</b> 岗位</span><span><b>{s.applicantsCount}</b> 学生</span><span><b>{s.applicationsCount}</b> 投递</span>
                <span className="text-gray-500">投 ≤{s.maxApplyJobs} · 传 ≤{s.maxResumeUploads} · 展示分 ≥{s.scoreFloor}{s.matchEnabled ? "" : " · 匹配关闭"}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-2 inline-flex items-center gap-1"><I name="link" size={11} />/campus/{s.slug}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="ghost" icon={<I name="qr-code" size={14} />} onClick={() => setQr(s)}>二维码</Button>
              <Button size="sm" variant="ghost" icon={<I name="briefcase" size={14} />} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>岗位配置{expanded === s.id ? "▴" : "▾"}</Button>
              {canManage && <>
                <Button size="sm" variant="ghost" icon={<I name="pencil" size={14} />} onClick={() => { setEditing(s); setFormOpen(true); }}>编辑</Button>
                {s.status !== "live" && <Button size="sm" icon={<I name="play" size={14} />} onClick={() => act(s, "live")}>上线</Button>}
                {s.status === "live" && <Button size="sm" variant="secondary" icon={<I name="square" size={14} />} onClick={() => act(s, "close")}>结束</Button>}
                {s.status === "closed" && <Button size="sm" variant="ghost" onClick={() => act(s, "draft")}>退回草稿</Button>}
                {s.applicantsCount === 0 && <button type="button" onClick={() => remove(s)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-lightPrimary" title="删除"><I name="trash-2" size={14} /></button>}
              </>}
            </div>
          </div>
          {expanded === s.id && <div className="mt-4 pt-4 border-t border-gray-100"><SessionJobsPanel session={s} canManage={canManage} onChanged={onChanged} /></div>}
        </Card>
      ))}

      <SessionFormModal open={formOpen} onClose={() => setFormOpen(false)} session={editing} onSaved={() => onChanged?.()} />

      {qr && <QrModal session={qr} onClose={() => setQr(null)} />}
    </div>
  );
}

// 三个入口码:首页(两个按钮)/ 直接投递(岗位列表)/ 智能匹配(上传 → 匹配)。学生扫到哪个就直接进哪个流程,免登录。
const ENTRIES = [
  { key: "home", label: "首页", path: "", desc: "展示两个入口,学生自己选" },
  { key: "jobs", label: "直接投递", path: "/jobs", desc: "直达岗位列表,看 JD 后投递" },
  { key: "match", label: "智能匹配", path: "/match", desc: "直达上传简历 → 匹配度分析" },
];
function QrModal({ session, onClose }) {
  const [entry, setEntry] = useState(ENTRIES[0]);
  const [pc, setPc] = useState(null); // { path } 电脑端上传链接(按需创建)
  async function pickPc() {
    try { const r = await resources.campus.pcUploadLink(session.id); setPc(r); setEntry({ key: "pc", label: "电脑上传", path: null, desc: "学生在电脑浏览器打开,上传后 HR 在台账「合并电脑端上传」" }); }
    catch (e) { toast(errMsg(e, "创建电脑上传链接失败"), "error"); }
  }
  const url = entry.key === "pc" && pc ? `${window.location.origin}${pc.path}` : `${window.location.origin}/campus/${session.slug}${entry.path}`;
  function downloadPng() {
    const svg = document.getElementById("campus-qr-svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 1024; c.height = 1024;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1024, 1024); ctx.drawImage(img, 64, 64, 896, 896);
      const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `校招二维码_${session.name}_${entry.label}.png`; a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }
  // 用 Portal Modal(Primitives):页内 fixed 会被 Layout 的 transform 祖先当作定位基准而裁切
  return (
    <Modal open onClose={onClose} maxWidth="max-w-sm">
      <div className="p-6 text-center">
        <h3 className="text-base font-bold text-navy-700">{session.heroTitle || session.name}</h3>
        <p className="text-xs text-gray-600 mt-1">学生扫码 / 点链接直达,无需登录</p>
        <div className="flex items-center gap-1 bg-lightPrimary rounded-xl p-1 mt-4">
          {ENTRIES.map((e) => (
            <button key={e.key} type="button" onClick={() => setEntry(e)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${entry.key === e.key ? "bg-white text-brand shadow-card" : "text-gray-600"}`}>{e.label}</button>
          ))}
          <button type="button" onClick={pickPc} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${entry.key === "pc" ? "bg-white text-brand shadow-card" : "text-gray-600"}`}>电脑上传</button>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">{entry.desc}</p>
        <div className="inline-block p-3 bg-white rounded-xl shadow-card mt-3"><QRCodeSVG id="campus-qr-svg" value={url} size={200} level="M" includeMargin /></div>
        <p className="text-[11px] text-gray-500 mt-3 break-all">{url}</p>
        <div className="flex justify-center gap-2 mt-4 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(url); toast("链接已复制", "success"); }} icon={<I name="copy" size={14} />}>复制链接</Button>
          <Button size="sm" variant="secondary" onClick={downloadPng} icon={<I name="download" size={14} />}>下载 PNG</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>
      </div>
    </Modal>
  );
}
