// 面试评价 Card — 嵌入候选人详情页右侧 aside,在「面试安排」和「附件」之间
// 提供能力:
//   - 列出本候选人所有面试评价邀请(状态/总分/推荐结论)
//   - 新建评价邀请 → 生成 token + 二维码,招聘官扫码或复制链接发面试官
//   - 已提交评价可下载 xlsx
//   - 撤销 / admin 退回 / admin 软删除
//
// 后端: server/src/routes/interview-evals.js
// 数据接口: resources.interviewEvals.* (web/src/lib/api.js)

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { resources } from "../lib/api.js";
import { Card, Button, Input, I, toast, Modal, LiquidLoader } from "./Primitives.jsx";

const STATUS_CONFIG = {
  link_sent: { label: "链接已发", tone: "bg-gray-100 text-gray-700" },
  draft:     { label: "面试官填写中", tone: "bg-amber-100 text-amber-700" },
  submitted: { label: "已提交", tone: "bg-green-100 text-green-700" },
  revoked:   { label: "已撤销", tone: "bg-red-100 text-red-700" },
};

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, tone: "bg-gray-100 text-gray-700" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.tone}`}>{cfg.label}</span>;
}

function RecommendChip({ recommendation }) {
  if (!recommendation) return null;
  const tone = recommendation === "建议录用" ? "bg-green-100 text-green-700"
    : recommendation === "建议复试" ? "bg-brand-50 text-brand-700"
    : recommendation === "谨慎考虑" ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${tone}`}>{recommendation}</span>;
}

function fmtExpiry(expiresAt) {
  if (!expiresAt) return "永久有效";
  const d = new Date(expiresAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return "已过期";
  if (days === 0) return "今日过期";
  return `${days} 天后过期`;
}

function evalLinkUrl(token) {
  return `${window.location.origin}/interview-eval/${token}`;
}

// ─── 新建邀请 Modal ──────────────────────────────────────────────
function NewEvalModal({ open, onClose, candidate, onCreated }) {
  const [interviewer, setInterviewer] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [duration, setDuration] = useState("7d");
  const [busy, setBusy] = useState(false);
  // 反映 candidate.interviews 供下拉选关联
  const interviews = Array.isArray(candidate?.interviews) ? candidate.interviews : [];

  useEffect(() => {
    if (!open) return;
    setInterviewer("");
    setInterviewId("");
    setDuration("7d");
  }, [open]);

  // 从评价人快选 chip — 反映已有评价者
  const quickPickNames = [];
  for (const iv of interviews) {
    for (const it of (iv.interviewers || [])) {
      if (it?.name && !quickPickNames.includes(it.name)) quickPickNames.push(it.name);
    }
  }

  async function onSubmit() {
    if (!interviewer.trim()) return toast("请填写面试官姓名", "error");
    setBusy(true);
    try {
      const item = await resources.interviewEvals.create(candidate.id, {
        interviewer: interviewer.trim(),
        interviewId: interviewId || null,
        duration,
        prefill: true,
      });
      onCreated && onCreated(item);
      toast("评价邀请已创建", "success");
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      toast(`创建失败: ${msg}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <h3 className="text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
          <I name="clipboard-plus" size={20} className="text-brand" /> 新建面试评价邀请
        </h3>

        <div className="space-y-4">
          {interviews.length > 0 && (
            <div>
              <label className="text-xs text-navy-700 font-bold ml-3 block mb-2">关联面试 (可选)</label>
              <select
                value={interviewId}
                onChange={(e) => {
                  setInterviewId(e.target.value);
                  // 关联后,如果面试官姓名为空,自动从面试官列表抽第一个
                  const iv = interviews.find((x) => x.id === e.target.value);
                  if (iv && !interviewer && iv.interviewers?.[0]?.name) {
                    setInterviewer(iv.interviewers[0].name);
                  }
                }}
                className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 bg-white outline-none focus:border-brand"
              >
                <option value="">不关联</option>
                {interviews.map((iv) => (
                  <option key={iv.id} value={iv.id}>
                    {iv.round}{iv.category ? ` · ${iv.category}` : ""}
                    {iv.scheduledAt ? ` · ${new Date(iv.scheduledAt).toLocaleDateString("zh-CN")}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input
            label="面试官姓名"
            required
            value={interviewer}
            onChange={(e) => setInterviewer(e.target.value)}
            placeholder="如:王浩"
            maxLength={100}
          />
          {quickPickNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] text-gray-400 self-center">从面试官快选:</span>
              {quickPickNames.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInterviewer(n)}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-lightPrimary text-brand hover:bg-brand hover:text-white transition"
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="text-xs text-navy-700 font-bold ml-3 block mb-2">有效期</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm text-navy-700 bg-white outline-none focus:border-brand"
            >
              <option value="3d">3 天</option>
              <option value="7d">7 天 (推荐)</option>
              <option value="30d">30 天</option>
              <option value="forever">永久</option>
            </select>
          </div>

          <div className="text-[11px] text-gray-700 bg-amber-50 border border-amber-200 p-3 rounded-xl">
            候选人信息将自动从档案预填，面试官打开链接后可微调。
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={onSubmit} disabled={busy} icon={<I name={busy ? "loader" : "send"} size={14} className={busy ? "animate-spin" : ""} />}>
            {busy ? "创建中…" : "生成链接"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── 查看链接 (QR + 复制) Modal ─────────────────────────────────
function LinkViewModal({ open, onClose, item }) {
  const qrRef = useRef(null);
  if (!item) return null;
  const url = evalLinkUrl(item.token);

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => toast("链接已复制", "success"));
  }

  function saveQR() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `mesa-interview-eval-${item.token.slice(0, 8)}.svg`;
    a.click();
    URL.revokeObjectURL(u);
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6">
        <h3 className="text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
          <I name="qr-code" size={20} className="text-brand" /> 发给面试官
        </h3>
        <p className="text-xs text-gray-700 mb-4">面试官 <b>{item.interviewer}</b> · 扫码或点链接即可填写,无需登录</p>

        <div className="flex gap-4 items-start flex-wrap">
          <div ref={qrRef} className="p-2 bg-white rounded-xl border border-brand/20 shrink-0">
            <QRCodeSVG value={url} size={140} fgColor="#1B254B" bgColor="#FFFFFF" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gray-700 mb-2">链接</div>
            <div className="font-mono text-[11px] text-navy-700 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl break-all">
              {url}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={copyLink} size="sm" icon={<I name="copy" size={12} />}>复制链接</Button>
              <Button onClick={saveQR} variant="ghost" size="sm" icon={<I name="download" size={12} />}>保存二维码</Button>
            </div>
            <p className="text-[10px] text-gray-500 mt-3">
              <I name="clock" size={10} className="inline mr-1" />{fmtExpiry(item.expiresAt)}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── 操作菜单 ────────────────────────────────────────────────────
function ActionMenu({ item, onAction, isAdmin }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!e.target.closest(".eval-action-menu")) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return (
    <div className="relative eval-action-menu">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-700"
      >
        <I name="more-horizontal" size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-card py-1">
          <button onClick={() => { setOpen(false); onAction("link"); }} className="w-full px-3 py-2 text-left text-xs hover:bg-lightPrimary flex items-center gap-2">
            <I name="qr-code" size={12} /> 查看链接 / 二维码
          </button>
          <button onClick={() => { setOpen(false); onAction("copy"); }} className="w-full px-3 py-2 text-left text-xs hover:bg-lightPrimary flex items-center gap-2">
            <I name="copy" size={12} /> 复制链接
          </button>
          {item.status === "submitted" && (
            <button onClick={() => { setOpen(false); onAction("export"); }} className="w-full px-3 py-2 text-left text-xs hover:bg-lightPrimary flex items-center gap-2">
              <I name="download" size={12} /> 导出 xlsx
            </button>
          )}
          {item.status === "submitted" && isAdmin && (
            <button onClick={() => { setOpen(false); onAction("reopen"); }} className="w-full px-3 py-2 text-left text-xs hover:bg-lightPrimary flex items-center gap-2 text-amber-600">
              <I name="rotate-ccw" size={12} /> 退回编辑
            </button>
          )}
          {item.status !== "revoked" && (
            <button onClick={() => { setOpen(false); onAction("revoke"); }} className="w-full px-3 py-2 text-left text-xs hover:bg-lightPrimary flex items-center gap-2 text-red-600">
              <I name="ban" size={12} /> 撤销链接
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { setOpen(false); onAction("delete"); }} className="w-full px-3 py-2 text-left text-xs hover:bg-lightPrimary flex items-center gap-2 text-red-600 border-t border-gray-100">
              <I name="trash-2" size={12} /> 删除 (admin)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 主卡片 ──────────────────────────────────────────────────────
export default function InterviewEvalCard({ candidate, currentUser }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [linkViewItem, setLinkViewItem] = useState(null);

  const isAdmin = currentUser?.role === "ADMIN";

  function refresh() {
    if (!candidate?.id) return;
    setLoading(true);
    resources.interviewEvals.listByCandidate(candidate.id)
      .then((arr) => setItems(arr || []))
      .catch((err) => {
        // 404 = candidate 不存在;其他错误 toast
        if (err.response?.status !== 404) {
          toast(`加载评价失败: ${err.response?.data?.message || err.message}`, "error");
        }
        setItems([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id]);

  async function handleAction(item, action) {
    if (action === "link") {
      setLinkViewItem(item);
    } else if (action === "copy") {
      navigator.clipboard.writeText(evalLinkUrl(item.token))
        .then(() => toast("链接已复制", "success"))
        .catch(() => toast("复制失败", "error"));
    } else if (action === "export") {
      window.location.href = resources.interviewEvals.exportUrl(item.id);
    } else if (action === "reopen") {
      try {
        await resources.interviewEvals.update(item.id, { status: "draft" });
        toast("已退回编辑", "success");
        refresh();
      } catch (err) {
        toast(`退回失败: ${err.response?.data?.message || err.message}`, "error");
      }
    } else if (action === "revoke") {
      if (!window.confirm("确认撤销此评价链接?面试官将无法继续填写。")) return;
      try {
        await resources.interviewEvals.update(item.id, { status: "revoked" });
        toast("链接已撤销", "success");
        refresh();
      } catch (err) {
        toast(`撤销失败: ${err.response?.data?.message || err.message}`, "error");
      }
    } else if (action === "delete") {
      if (!window.confirm("确认删除此评价记录?(软删除,可在 DB 查询历史)")) return;
      try {
        await resources.interviewEvals.remove(item.id);
        toast("已删除", "success");
        refresh();
      } catch (err) {
        toast(`删除失败: ${err.response?.data?.message || err.message}`, "error");
      }
    }
  }

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="text-sm font-bold text-[#1B254B] flex items-center gap-2">
            <I name="clipboard-check" size={16} className="text-[#422AFB]" />
            面试评价
            {items.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-lightPrimary text-brand font-bold">{items.length}</span>}
          </h3>
          <button onClick={() => setNewOpen(true)} className="text-[11px] text-[#422AFB] font-bold hover:underline flex items-center gap-1">
            <I name="plus" size={11} /> 新建评价
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl bg-[#F4F7FE] py-5 text-center">
            <I name="loader" size={18} className="text-[#A0AEC0] mx-auto mb-1 animate-spin" />
            <p className="text-[11px] text-[#707EAE]">加载中…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl bg-[#F4F7FE] py-6 text-center">
            <I name="clipboard-x" size={24} className="text-[#A0AEC0] mx-auto mb-2" />
            <p className="text-xs text-[#707EAE]">还没有面试评价</p>
            <button onClick={() => setNewOpen(true)} className="mt-2 text-xs text-[#422AFB] font-bold hover:underline">+ 创建第一份评价邀请</button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl bg-[#F4F7FE] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[#1B254B] truncate">
                        {item.interviewer}
                      </p>
                      <StatusChip status={item.status} />
                      {item.recommendation && <RecommendChip recommendation={item.recommendation} />}
                    </div>
                    <p className="text-[10px] text-[#707EAE] mt-1 flex items-center gap-1.5 flex-wrap">
                      {item.interviewDate && (
                        <>
                          <I name="calendar" size={10} />
                          <span>{new Date(item.interviewDate).toLocaleDateString("zh-CN")}</span>
                          <span className="text-gray-300">·</span>
                        </>
                      )}
                      <I name="clock" size={10} />
                      <span>{fmtExpiry(item.expiresAt)}</span>
                      {item.viewCount > 0 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <I name="eye" size={10} />
                          <span>{item.viewCount} 次访问</span>
                        </>
                      )}
                    </p>
                    {item.submittedAt && (
                      <p className="text-[10px] text-[#A3AED0] mt-0.5">
                        提交于 {new Date(item.submittedAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {item.status === "submitted" && item.totalScore != null && (
                      <LiquidLoader size={48} level={item.totalScore} label={item.totalScore} />
                    )}
                    <ActionMenu item={item} onAction={(a) => handleAction(item, a)} isAdmin={isAdmin} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <NewEvalModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        candidate={candidate}
        onCreated={(item) => {
          setItems((prev) => [item, ...prev]);
          setLinkViewItem(item);  // 创建后自动弹出二维码 modal,招聘官立刻可分享
        }}
      />
      <LinkViewModal
        open={!!linkViewItem}
        onClose={() => setLinkViewItem(null)}
        item={linkViewItem}
      />
    </>
  );
}
