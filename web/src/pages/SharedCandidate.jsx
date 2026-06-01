// 公开候选人页 /share/:token
// 不在 AuthGuard 内 · 不显示 Sidebar / Topbar · 仅展示候选人简报
// 联系方式从 API 拿到时已经 mask, 详情 read-only

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import {
  Card,
  Button,
  Avatar,
  StatusPill,
  AiBadge,
  LiquidLoader,
  Tag,
  I,
  LoadingBlock,
  Empty,
  Modal,
  toast,
} from "../components/Primitives.jsx";
import MarkdownBullets from "../components/MarkdownBullets.jsx";

function fmtExpiresHint(iso) {
  if (!iso) return "永久有效";
  const d = new Date(iso);
  const now = Date.now();
  if (d.getTime() < now) return "已过期";
  const hrs = Math.round((d.getTime() - now) / 3600000);
  if (hrs < 24) return `${hrs} 小时后过期`;
  return `${Math.round(hrs / 24)} 天后过期`;
}

export default function SharedCandidate() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [evalStarting, setEvalStarting] = useState(false);

  async function startInterviewEval() {
    setEvalStarting(true);
    // 沿用访客在「添加评论」时填过的姓名(存本浏览器 localStorage)→ 预填面试官姓名(填写页可改)
    let savedName = "";
    try {
      const arr = JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) || "[]");
      if (Array.isArray(arr) && arr[0]) savedName = String(arr[0]).slice(0, 100);
    } catch { /* ignore */ }
    try {
      const r = await axios.post(`/api/public/share/${token}/interview-eval`, savedName ? { interviewer: savedName } : {});
      // 跳转到现有公开填写页(复用 /interview-eval/:token)
      window.location.assign(`/interview-eval/${r.data.token}`);
    } catch (e) {
      const code = e.response?.data?.error;
      toast(
        code === "interview_eval_quota" ? "面试评价待填数量已达上限,请联系招聘官"
          : code === "interview_eval_disabled" ? "此分享未开放面试评价"
          : (e.response?.data?.message || "无法创建面试评价,请稍后再试"),
        "error",
      );
      setEvalStarting(false);
    }
  }

  useEffect(() => {
    axios.get(`/api/public/share/${token}`)
      .then((r) => setData(r.data))
      .catch((e) => setErr(e.response?.data || { error: "fetch_failed", message: e.message }));
  }, [token]);

  useEffect(() => {
    if (!data) return;
    axios.get(`/api/public/share/${token}/reviews`).then((r) => setReviews(r.data.reviews || [])).catch(() => {});
  }, [data, token]);

  if (err) {
    return (
      <div className="min-h-screen bg-lightPrimary flex items-center justify-center px-4">
        <Card className="p-10 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <I name={
              err.error === "share_expired" ? "clock"
                : err.error === "share_quota_exceeded" ? "users"
                : "link-2-off"
            } size={28} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-navy-700 mb-2">
            {err.error === "share_expired" ? "链接已过期"
              : err.error === "share_quota_exceeded" ? "访问次数已达上限"
              : "链接无效"}
          </h1>
          <p className="text-sm text-gray-700">{err.message || "请联系分享方"}</p>
        </Card>
      </div>
    );
  }

  if (!data) return (
    <div className="min-h-screen bg-lightPrimary flex items-center justify-center p-6">
      <LoadingBlock label="加载候选人信息..." height="h-32" />
    </div>
  );

  const c = data.candidate;
  const share = data.share;

  return (
    <div className="min-h-screen bg-lightPrimary">
      {/* 顶部 banner */}
      <header className="bg-white border-b border-gray-200 py-4 px-4 md:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <span className="text-[20px] uppercase text-navy-700" style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700 }}>
            MESA <span style={{ fontWeight: 500 }}>RECRUIT</span>
          </span>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1"><I name="share-2" size={12} /> 招聘官只读视图</span>
            <span className="flex items-center gap-1"><I name="clock" size={12} /> {fmtExpiresHint(share?.expiresAt)}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-5">
        {/* === 头部 === */}
        <Card className="p-5 md:p-7">
          <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
            <Avatar name={c.name} animal={c.animal} src={c.avatar} size={88} />
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold text-navy-700">{c.name}</h1>
                {c.parser && <AiBadge parser={c.parser} confidence={c.parserConfidence} />}
                <StatusPill status={c.status} size="md" />
              </div>
              <p className="text-xs md:text-sm text-gray-700 mt-2">
                {[c.education, c.school, c.major, `${c.yearsExp || 0} 年经验`, c.location].filter(Boolean).join(" · ")}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(c.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
              </div>
              {/* 联系方式:share.showContact=true 时显示(已 mask),false 时整段隐藏 */}
              {data?.share?.showContact !== false ? (
                <>
                  <div className="flex flex-wrap gap-x-4 md:gap-x-6 gap-y-2 mt-4 text-[11px] md:text-xs text-gray-700">
                    <span className="flex items-center gap-1"><I name="phone" size={12} /> {c.phone || "—"}</span>
                    <span className="flex items-center gap-1"><I name="mail" size={12} /> {c.email || "—"}</span>
                    <span className="flex items-center gap-1"><I name="briefcase" size={12} /> {c.appliedFor || "—"}</span>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-2">
                    ⓘ 联系方式已自动打码,如需联系候选人请联系分享方
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap gap-x-4 md:gap-x-6 gap-y-2 mt-4 text-[11px] md:text-xs text-gray-700">
                  <span className="flex items-center gap-1"><I name="briefcase" size={12} /> {c.appliedFor || "—"}</span>
                  <span className="flex items-center gap-1 text-gray-500"><I name="eye-off" size={12} /> 分享方已隐藏联系方式</span>
                </div>
              )}
            </div>
            {c.jdMatch != null && (
              <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-lightPrimary">
                <LiquidLoader size={80} level={c.jdMatch} label={c.jdMatch} />
                <p className="text-xs text-gray-700 font-bold">JD 匹配度</p>
              </div>
            )}
          </div>
        </Card>

        {/* === AI 简报 === */}
        {c.aiSummary && (
          <Card className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="title-card flex items-center gap-2">
                <I name="file-text" size={18} className="text-brand" />
                AI 简历简报
              </h3>
              <AiBadge parser={c.parser || "Kimi"} confidence={c.parserConfidence} />
            </div>
            <pre className="whitespace-pre-wrap text-sm font-mono text-navy-700 bg-lightPrimary rounded-xl p-4 max-h-[500px] overflow-y-auto leading-relaxed">{c.aiSummary}</pre>
          </Card>
        )}

        {/* === 核心三栏 === */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          <Card className="p-5 md:p-6">
            <h3 className="title-card flex items-center gap-2">
              <I name="sparkles" size={18} className="text-brand" />
              核心技能
            </h3>
            {/* 两阶段:string → markdown bullet;array → 旧渲染兼容;空 → empty */}
            {typeof c.skills === "string" && c.skills.trim() ? (
              <MarkdownBullets md={c.skills} />
            ) : Array.isArray(c.skills) && c.skills.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {c.skills.map((s, i) => (
                  <li key={i} className="text-sm text-navy-700 flex items-start gap-2">
                    <I name="check-circle-2" size={14} className="text-brand mt-0.5 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="暂无技能识别" />
            )}
          </Card>
          <Card className="p-5 md:p-6">
            <h3 className="title-card flex items-center gap-2">
              <I name="alert-triangle" size={18} className="text-amber-500" />
              风险与缺项
            </h3>
            {(c.risks || []).length === 0 ? <Empty title="未识别显著风险" /> : (
              <ul className="mt-4 space-y-2.5">
                {c.risks.map((r, i) => (
                  <li key={i} className="text-sm text-navy-700 flex items-start gap-2">
                    <I name="dot" size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5 md:p-6">
            <h3 className="title-card flex items-center gap-2">
              <I name="trophy" size={18} className="text-green-500" />
              亮点
            </h3>
            {(c.highlights || []).length === 0 ? <Empty title="暂无亮点" /> : (
              <ul className="mt-4 space-y-2.5">
                {c.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-navy-700 flex items-start gap-2">
                    <I name="star" size={14} className="text-green-500 mt-0.5 shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* === 工作经历 / 教育 === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <Card className="p-5 md:p-6">
            <h3 className="title-card">工作经历</h3>
            {typeof c.experience === "string" && c.experience.trim() ? (
              <MarkdownBullets md={c.experience} />
            ) : Array.isArray(c.experience) && c.experience.length > 0 ? (
              <ul className="mt-4 space-y-4">
                {c.experience.map((e, i) => (
                  <li key={i} className="border-l-2 border-brand pl-4 relative">
                    <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-brand"></span>
                    <p className="text-xs text-gray-600">{e.period}</p>
                    <p className="text-sm font-bold text-navy-700 mt-0.5">{e.company}</p>
                    <p className="text-xs text-gray-700">{e.title}</p>
                    {e.summary && <p className="text-xs text-gray-700 mt-1">{e.summary}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="暂无工作经历" />
            )}
          </Card>
          <Card className="p-5 md:p-6">
            <h3 className="title-card">教育背景</h3>
            {typeof c.educationHistory === "string" && c.educationHistory.trim() ? (
              <MarkdownBullets md={c.educationHistory} />
            ) : Array.isArray(c.educationHistory) && c.educationHistory.length > 0 ? (
              <ul className="mt-4 space-y-4">
                {c.educationHistory.map((e, i) => (
                  <li key={i} className="border-l-2 border-gray-300 pl-4 relative">
                    <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-gray-400"></span>
                    <p className="text-xs text-gray-600">{e.period}</p>
                    <p className="text-sm font-bold text-navy-700 mt-0.5">{e.school}</p>
                    <p className="text-xs text-gray-700">{e.major} · {e.degree}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="暂无教育背景" />
            )}
          </Card>
        </div>

        {/* === 面试评价入口(分享设置开启时显示)=== */}
        {share?.showInterviewEval && (
          <Card className="p-5 md:p-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="title-card flex items-center gap-2">
                <I name="clipboard-check" size={18} className="text-brand" />
                面试评价
              </h3>
              <p className="text-xs text-gray-600 mt-1">面试官可在线填写本候选人的面试评价表,提交后自动归档到招聘系统。</p>
            </div>
            <Button
              onClick={startInterviewEval}
              disabled={evalStarting}
              icon={<I name={evalStarting ? "loader" : "pen-line"} size={14} className={evalStarting ? "animate-spin" : ""} />}
            >
              {evalStarting ? "生成中…" : "填写面试评价"}
            </Button>
          </Card>
        )}

        {/* === 评论 === */}
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="title-card flex items-center gap-2">
              <I name="message-circle" size={18} className="text-brand" />
              评论
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand text-white font-bold">{reviews.length}</span>
            </h3>
            <Button size="sm" onClick={() => setReviewOpen(true)} icon={<I name="message-square-plus" size={12} />}>
              添加评论
            </Button>
          </div>
          {(() => {
            const tree = reviews.filter((r) => !r.parentId);
            const repliesByParent = {};
            reviews.filter((r) => r.parentId).forEach((r) => {
              (repliesByParent[r.parentId] = repliesByParent[r.parentId] || []).push(r);
            });
            if (tree.length === 0) return <Empty icon="message-circle" title="还没有评论" desc="点击「添加评论」给候选人留下你的反馈" />;
            return (
              <>
                <ul className="space-y-4">
                  {tree.map((r) => (
                    <PublicReviewItem
                      key={r.id}
                      review={r}
                      replies={repliesByParent[r.id] || []}
                      token={token}
                      selectedIds={selectedIds}
                      toggleSelect={(id) => setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])}
                      onReply={(parent) => { setReplyTo(parent); setReviewOpen(true); }}
                      updateReview={(rr) => setReviews((p) => p.map((x) => x.id === rr.id ? rr : x))}
                    />
                  ))}
                </ul>
                {selectedIds.length > 0 && (
                  <div className="mt-3 p-2.5 rounded-xl bg-brand-50 border border-brand/30 flex items-center gap-2">
                    <span className="text-xs font-bold text-brand">已选 {selectedIds.length} 条</span>
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>清空</Button>
                    <Button size="sm" onClick={() => {
                      const targets = reviews.filter((r) => selectedIds.includes(r.id) && !r.deletedAt);
                      if (targets.length === 0) return;
                      setReplyTo({ ...targets[0], _bulk: targets });
                      setReviewOpen(true);
                    }} icon={<I name="reply" size={12} />}>批量回复</Button>
                  </div>
                )}
              </>
            );
          })()}
        </Card>

        <footer className="text-center text-[11px] text-gray-600 pt-4">
          Overseas R&amp;D · 此页面为只读分享链接 · 已被访问 {share.viewCount} 次
        </footer>

        <PublicReviewModal
          open={reviewOpen}
          onClose={() => { setReviewOpen(false); setReplyTo(null); }}
          candidate={c}
          token={token}
          replyTo={replyTo}
          allowAttachments={data?.share?.showAttachments === true}
          onCreated={(r) => { setReviews((p) => [...p, r]); setReviewOpen(false); setReplyTo(null); }}
        />
      </main>
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function PublicReviewItem({ review, replies = [], token, onReply, updateReview, isReply = false, selectedIds = [], toggleSelect }) {
  const [askName, setAskName] = useState("");
  const [showAsk, setShowAsk] = useState(false);
  const pendingDelete = !!review.deleteRequested && !review.deletedAt;
  const isSelected = selectedIds.includes(review.id);
  const canSelect = !isReply && !review.deletedAt && toggleSelect;

  async function requestDelete() {
    const name = askName.trim();
    if (!name) return toast("请输入您当时填写的姓名以验证身份", "error");
    try {
      const { data } = await axios.post(`/api/public/share/${token}/reviews/${review.id}/request-delete`, { authorName: name });
      updateReview(data.review);
      setShowAsk(false);
      setAskName("");
      toast("已请求,等管理员审核", "success");
    } catch (e) { toast(e.response?.data?.message || "操作失败", "error"); }
  }

  return (
    <li className={`rounded-lg transition ${isSelected ? "bg-brand-50 -mx-2 px-2" : ""}`}>
      <div className="flex items-start gap-2">
        {canSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(review.id)}
            className="mt-2 w-3.5 h-3.5 accent-brand cursor-pointer shrink-0"
            title="选中以批量回复"
          />
        )}
        <Avatar name={review.authorName} src={review.authorAvatar} size={isReply ? 28 : 32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className={`text-sm font-bold flex items-center gap-1 flex-wrap ${review.deletedAt ? "text-gray-500" : "text-navy-700"}`}>
              <span>{review.authorName}</span>
              {review.authorRole && <span className="text-[10px] text-gray-700 font-medium ml-1">{review.authorRole}</span>}
              {review.via === "public" && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">外部</span>
              )}
              {review.stance === "approve" && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-bold inline-flex items-center gap-1">
                  <I name="thumbs-up" size={9} /> 赞同
                </span>
              )}
              {review.stance === "reject" && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-bold inline-flex items-center gap-1">
                  <I name="thumbs-down" size={9} /> 否决
                </span>
              )}
              {pendingDelete && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">待审核删除</span>
              )}
            </p>
            <span className="text-[11px] text-gray-700 flex items-center gap-1">
              <I name="clock" size={11} /> {fmtTime(review.createdAt)}
            </span>
          </div>
          {(review.referencedIds || []).length > 1 && (
            <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1">
              <I name="quote" size={10} /> 引用 {review.referencedIds.length} 条评论
            </p>
          )}
          {review.deletedAt ? (
            <p className="text-sm text-gray-400 italic mt-1 line-through">[已删除]</p>
          ) : (
            <p className="text-sm text-navy-700 mt-1 whitespace-pre-wrap">{review.content}</p>
          )}
          {!review.deletedAt && (review.attachments || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {review.attachments.map((a, i) => <PublicAttachmentChip key={i} a={a} token={token} />)}
            </div>
          )}
          {!review.deletedAt && (
            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-gray-100 text-[11px] flex-wrap">
              {/* 公开端简化投票:仅显示 + 数,点击 +1,后端无登录态去重(前端 localStorage 限制) */}
              <PublicVoteButtons review={review} token={token} updateReview={updateReview} />
              <span className="text-gray-300">·</span>
              {!isReply && (
                <button onClick={() => onReply(review)} className="text-brand hover:bg-brand-50 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                  <I name="reply" size={10} /> 回复
                </button>
              )}
              {review.via === "public" && !pendingDelete && (
                <button onClick={() => setShowAsk((v) => !v)} className="text-gray-700 hover:text-red-500 hover:bg-red-50 px-2 py-0.5 rounded">请求删除</button>
              )}
            </div>
          )}
          {showAsk && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={askName}
                onChange={(e) => setAskName(e.target.value)}
                placeholder="请输入您当时填写的姓名"
                className="flex-1 h-8 px-2 rounded-lg border border-gray-200 text-xs outline-none focus:border-brand"
              />
              <button onClick={requestDelete} className="h-8 px-3 rounded-lg bg-brand text-white text-xs font-bold">提交</button>
              <button onClick={() => { setShowAsk(false); setAskName(""); }} className="h-8 px-2 text-gray-700 text-xs">取消</button>
            </div>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <ul className="mt-3 ml-9 pl-3 border-l-2 border-gray-100 space-y-3">
          {replies.slice().reverse().map((rp) => (
            <PublicReviewItem key={rp.id} review={rp} token={token} onReply={onReply} updateReview={updateReview} isReply />
          ))}
        </ul>
      )}
    </li>
  );
}

// 公开端投票按钮: 用 localStorage 记录每个 reviewId 上次投票, 切换时传 prevValue 给后端算 delta
const PUBLIC_VOTE_KEY = "mesa.public.review.votes";

function PublicVoteButtons({ review, token, updateReview }) {
  const [myVote, setMyVote] = useState(0);
  const [open, setOpen] = useState(null);  // "up" | "down" | null
  const [voters, setVoters] = useState(null);
  const [loading, setLoading] = useState(false);
  async function loadVoters() {
    if (voters || loading) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/public/share/${token}/reviews/${review.id}/voters`);
      setVoters(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }
  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(PUBLIC_VOTE_KEY) || "{}");
      setMyVote(m[review.id] || 0);
    } catch { /* ignore */ }
  }, [review.id]);

  async function cast(value) {
    const next = myVote === value ? 0 : value;  // 同方向再点 = 取消
    try {
      const { data } = await axios.post(`/api/public/share/${token}/reviews/${review.id}/vote`, {
        value: next,
        prevValue: myVote,
      });
      updateReview(data.review);
      // 持久化我的投票状态
      try {
        const m = JSON.parse(localStorage.getItem(PUBLIC_VOTE_KEY) || "{}");
        if (next === 0) delete m[review.id]; else m[review.id] = next;
        localStorage.setItem(PUBLIC_VOTE_KEY, JSON.stringify(m));
      } catch { /* ignore */ }
      setMyVote(next);
    } catch (e) { toast(e.response?.data?.message || "投票失败", "error"); }
  }

  function showVoters(direction) {
    setOpen(direction);
    loadVoters();
  }

  return (
    <>
      <div className="relative inline-block">
        <button
          onClick={() => cast(1)}
          onContextMenu={(e) => { e.preventDefault(); showVoters("up"); }}
          className={`px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 transition ${myVote === 1 ? "bg-green-100 text-green-700" : "text-gray-700 hover:bg-green-50 hover:text-green-700"}`}
          title="赞同(右键看名单)"
        >
          <I name="thumbs-up" size={11} />
          <span onClick={(e) => { e.stopPropagation(); showVoters("up"); }} className="hover:underline">{review.upvotes || 0}</span>
        </button>
        {open === "up" && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(null)} />
            <PublicVotersPopover voters={voters} loading={loading} direction="up" />
          </>
        )}
      </div>
      <div className="relative inline-block">
        <button
          onClick={() => cast(-1)}
          onContextMenu={(e) => { e.preventDefault(); showVoters("down"); }}
          className={`px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 transition ${myVote === -1 ? "bg-red-100 text-red-700" : "text-gray-700 hover:bg-red-50 hover:text-red-700"}`}
          title="否决(右键看名单)"
        >
          <I name="thumbs-down" size={11} />
          <span onClick={(e) => { e.stopPropagation(); showVoters("down"); }} className="hover:underline">{review.downvotes || 0}</span>
        </button>
        {open === "down" && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(null)} />
            <PublicVotersPopover voters={voters} loading={loading} direction="down" />
          </>
        )}
      </div>
    </>
  );
}

function PublicVotersPopover({ voters, loading, direction }) {
  const isUp = direction === "up";
  return (
    <div className="absolute top-full left-0 mt-1 z-40 bg-white rounded-xl shadow-card p-3 min-w-[200px] max-w-[260px]">
      <p className={`text-[11px] font-bold mb-2 ${isUp ? "text-green-700" : "text-red-700"} flex items-center gap-1`}>
        <I name={isUp ? "thumbs-up" : "thumbs-down"} size={11} />
        {isUp ? "赞同" : "否决"}的人
      </p>
      {loading && <p className="text-xs text-gray-700 py-2">加载中...</p>}
      {!loading && voters && (
        <>
          {(isUp ? voters.up : voters.down).length === 0 && (isUp ? voters.anonymousUp : voters.anonymousDown) === 0 ? (
            <p className="text-xs text-gray-700">还没有人</p>
          ) : (
            <ul className="space-y-1 max-h-[200px] overflow-y-auto">
              {(isUp ? voters.up : voters.down).map((u, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-navy-700">
                  <Avatar name={u.name} size={20} />
                  <span className="font-medium">{u.name}</span>
                  {u.role && <span className="text-[10px] text-gray-700">{u.role}</span>}
                </li>
              ))}
              {(isUp ? voters.anonymousUp : voters.anonymousDown) > 0 && (
                <li className="text-xs text-gray-700 pt-1 border-t border-gray-100 mt-1">
                  + {(isUp ? voters.anonymousUp : voters.anonymousDown)} 位匿名访客
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function PublicAttachmentChip({ a, token }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    if (a.type === "link") {
      window.open(a.url, "_blank", "noopener,noreferrer");
      return;
    }
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/public/share/${token}/signed-get-url`, { key: a.url });
      window.open(data.url, "_blank");
    } catch (e) { toast(e.response?.data?.message || "下载失败", "error"); }
    finally { setBusy(false); }
  }
  const icon = a.type === "image" ? "image" : a.type === "link" ? "link" : "paperclip";
  const tone = a.type === "image" ? "bg-blue-50 text-blue-700" : a.type === "link" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-700";
  return (
    <button onClick={open} disabled={busy} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${tone} hover:opacity-80 transition max-w-[180px]`}>
      <I name={busy ? "loader" : icon} size={11} className={busy ? "animate-spin shrink-0" : "shrink-0"} />
      <span className="truncate">{a.name}</span>
      {a.size != null && a.size > 0 && <span className="opacity-60 shrink-0">{(a.size / 1024).toFixed(0)}KB</span>}
    </button>
  );
}

const SAVED_NAMES_KEY = "mesa.public.review.names";

function PublicReviewModal({ open, onClose, candidate, token, replyTo, onCreated, allowAttachments }) {
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedNames, setSavedNames] = useState([]);

  const bulk = replyTo?._bulk;
  const isBulkReply = Array.isArray(bulk) && bulk.length > 1;
  const [stance, setStance] = useState(null);

  useEffect(() => {
    if (!open) {
      setContent("");
      setLinkInput("");
      setAttachments([]);
      setStance(null);
      // 不清空 authorName, 这样多次发评论不用重复输入
    } else {
      // 打开时读历史姓名
      try {
        const arr = JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) || "[]");
        if (Array.isArray(arr)) {
          setSavedNames(arr);
          if (!authorName && arr.length > 0) setAuthorName(arr[0]);
        }
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line
  }, [open]);

  function rememberName(name) {
    try {
      const arr = JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) || "[]");
      const next = [name, ...arr.filter((n) => n !== name)].slice(0, 5);
      localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }

  const totalSize = attachments.reduce((s, a) => s + (a.size || 0), 0);
  const MAX_TOTAL = 30 * 1024 * 1024;

  async function uploadFile(file) {
    if (totalSize + file.size > MAX_TOTAL) {
      toast(`总附件将超过 30MB,无法添加`, "error");
      return;
    }
    setUploading(true);
    try {
      const { data: presign } = await axios.post(`/api/public/share/${token}/presigned-url`, {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });
      await axios.put(presign.uploadUrl, file, { headers: { "Content-Type": file.type || "application/octet-stream" } });
      const isImage = (file.type || "").startsWith("image/");
      setAttachments((p) => [...p, { type: isImage ? "image" : "file", name: file.name, url: presign.key, size: file.size, contentType: file.type }]);
    } catch (e) {
      toast(e.response?.data?.message || "上传失败", "error");
    } finally { setUploading(false); }
  }

  function addLink() {
    const url = linkInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast("链接必须以 http(s):// 开头", "error"); return; }
    setAttachments((p) => [...p, { type: "link", name: url, url, size: 0 }]);
    setLinkInput("");
  }

  function removeAttachment(idx) {
    setAttachments((p) => p.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!authorName.trim()) return toast("请输入您的姓名", "error");
    if (!content.trim()) return toast("请输入评论内容", "error");
    setSaving(true);
    try {
      const body = { authorName: authorName.trim(), content: content.trim(), attachments };
      if (isBulkReply) {
        body.referencedIds = bulk.map((b) => b.id);
        body.parentId = bulk[0].id;
      } else if (replyTo?.id) {
        body.parentId = replyTo.id;
      }
      if (replyTo && stance) body.stance = stance;
      const { data } = await axios.post(`/api/public/share/${token}/reviews`, body);
      rememberName(authorName.trim());
      onCreated(data.review);
      toast(replyTo ? "已回复" : "评论已发布", "success");
    } catch (e) { toast(e.response?.data?.message || "发布失败", "error"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
            <I name={replyTo ? "reply" : "message-circle"} size={18} className="text-brand" />
            {replyTo ? `回复 ${replyTo.authorName}` : `添加评论 — ${candidate?.name}`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-navy-700"><I name="x" size={20} /></button>
        </div>

        {replyTo && (
          <div className="p-3 rounded-xl bg-lightPrimary border-l-4 border-brand">
            <p className="text-[11px] font-bold text-gray-700">引用 {replyTo.authorName} 的评论:</p>
            <p className="text-xs text-gray-700 mt-1 line-clamp-2">{replyTo.content}</p>
          </div>
        )}

        <div>
          <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">您的姓名 *</label>
          <input
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value.slice(0, 100))}
            placeholder="必填,显示在评论头部"
            className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm text-navy-700 outline-none focus:border-brand"
            disabled={saving}
          />
          {savedNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[11px] text-gray-600 self-center mr-1">历史:</span>
              {savedNames.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAuthorName(n)}
                  className={`text-[11px] px-2 py-0.5 rounded-full transition ${authorName === n ? "bg-brand text-white" : "bg-lightPrimary text-gray-700 hover:bg-gray-200"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 回复 stance */}
        {replyTo && (
          <div>
            <p className="text-xs font-bold text-gray-700 uppercase mb-2 flex items-center gap-1.5">
              <I name="vote" size={12} /> 对原评论的态度 (可选)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStance(stance === "approve" ? null : "approve")}
                disabled={saving}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-1.5
                  ${stance === "approve" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-700 hover:border-green-300"}`}
              >
                <I name="thumbs-up" size={12} /> 赞同
              </button>
              <button
                type="button"
                onClick={() => setStance(stance === "reject" ? null : "reject")}
                disabled={saving}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-1.5
                  ${stance === "reject" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 text-gray-700 hover:border-red-300"}`}
              >
                <I name="thumbs-down" size={12} /> 否决
              </button>
              <button
                type="button"
                onClick={() => setStance(null)}
                disabled={saving}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition flex items-center justify-center gap-1.5
                  ${stance === null ? "border-brand bg-brand-50 text-brand" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}
              >
                <I name="minus" size={12} /> 不表态
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">评论内容 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 500))}
            rows={5}
            placeholder="请输入您对此候选人的评论..."
            className="w-full p-3 rounded-xl border border-gray-200 text-sm text-navy-700 outline-none focus:border-brand resize-none"
            disabled={saving}
          />
          <p className={`text-[11px] mt-1.5 ${content.length >= 500 ? "text-red-500" : "text-gray-600"}`}>{content.length} / 500 字符</p>
        </div>

        {allowAttachments && (
        <div>
          <p className="text-xs font-bold text-gray-700 uppercase mb-2">附件(可选,总 ≤ 30MB)</p>
          {attachments.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {attachments.map((a, i) => (
                <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-lightPrimary rounded-lg text-xs">
                  <I name={a.type === "image" ? "image" : a.type === "link" ? "link" : "paperclip"} size={12} className="text-gray-700 shrink-0" />
                  <span className="flex-1 truncate text-navy-700">{a.name}</span>
                  <span className="text-[10px] text-gray-600 shrink-0">
                    {a.type === "link" ? "链接" : `${(a.size / 1024).toFixed(0)} KB`}
                  </span>
                  <button onClick={() => removeAttachment(i)} className="text-red-500 hover:bg-red-50 w-5 h-5 rounded flex items-center justify-center">
                    <I name="x" size={11} />
                  </button>
                </li>
              ))}
              <li className="text-[11px] text-gray-600 mt-1">总大小 {(totalSize / 1024 / 1024).toFixed(2)} / 30 MB</li>
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand text-xs font-bold text-gray-700">
              <I name={uploading ? "loader" : "upload"} size={12} className={uploading ? "animate-spin" : ""} />
              {uploading ? "上传中" : "图片 / 文件"}
              <input
                type="file"
                className="hidden"
                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,image/*"
                disabled={uploading || saving}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
              />
            </label>
            <div className="flex-1 min-w-[200px] flex items-center gap-1.5 px-2 rounded-xl border border-gray-200 h-9 focus-within:border-brand">
              <I name="link" size={12} className="text-gray-400 shrink-0" />
              <input
                type="url"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
                placeholder="粘贴 URL 链接,回车添加"
                className="flex-1 bg-transparent outline-none text-xs text-navy-700"
                disabled={saving}
              />
              <button onClick={addLink} disabled={!linkInput.trim()} className="text-[10px] font-bold text-brand hover:underline disabled:opacity-30 px-1">
                添加
              </button>
            </div>
          </div>
        </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving || !authorName.trim() || !content.trim()} icon={<I name={saving ? "loader" : "check"} size={12} className={saving ? "animate-spin" : ""} />}>
            {saving ? "保存中" : "发布评论"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
