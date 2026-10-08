// 学生端公共壳:移动端优先容器 + 顶部专场标题 + 数据 hook + 门禁跳转
// 门禁规则(设计 §4 规则 10,免登录版):投递 / 匹配前必须 有简历(首次上传时匿名建档)→ 已确认联系方式
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { campus, campusErr, getCampusToken, setCampusToken } from "../../../lib/campusApi.js";
import { I, ToastHost, toast } from "../../../components/Primitives.jsx";

const Ctx = createContext(null);

export function CampusProvider({ children }) {
  const { slug } = useParams();
  const [data, setData] = useState(null);   // { session, me, contactHints, pcUploadEnabled, emailConfigured }
  const [error, setError] = useState(null);
  const [me, setMe] = useState(null);       // 完整 me(/me),有会话时拉
  const [ready, setReady] = useState(false); // session 与 me 都加载完(门禁判断必须等它,避免 me 未到就误跳)
  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([campus.session(slug), getCampusToken() ? campus.me().catch(() => null) : Promise.resolve(null)]);
      setData(d); setError(null); setMe(r?.me || null);
    } catch (e) { setError(campusErr(e, "加载失败")); }
    finally { setReady(true); }
  }, [slug]);
  useEffect(() => { load(); }, [load]);
  const logout = useCallback(() => { setCampusToken(null); setMe(null); }, []);
  const value = useMemo(() => ({ slug, session: data?.session || null, info: data, me, setMe, reload: load, error, logout, ready }), [slug, data, me, load, error, logout, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useCampus = () => useContext(Ctx);

export const base = (slug) => `/campus/${slug}`;

// 门禁:返回应跳转的路径(null 表示可直接进入 target)
export function gatePath(slug, me, target) {
  const q = `?next=${encodeURIComponent(target)}`;
  if (!me || !me.hasResume) return `${base(slug)}/upload${q}`;
  if (!me.contactConfirmed) return `${base(slug)}/contact${q}`;
  return null;
}
export function useGate() {
  const { slug, me } = useCampus();
  const nav = useNavigate();
  return (target) => { const p = gatePath(slug, me, target); nav(p || target); };
}

export function Shell({ title, back, children, wide = false }) {
  const { slug, session, me, error } = useCampus();
  return (
    <div className="min-h-screen bg-gradient-to-b from-lightPrimary via-white to-lightPrimary text-navy-700">
      <ToastHost />
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className={`mx-auto ${wide ? "max-w-2xl" : "max-w-[480px]"} px-4 h-14 flex items-center gap-3`}>
          {back ? (
            <Link to={back === true ? base(slug) : back} className="p-2 -ml-2 rounded-lg hover:bg-lightPrimary"><I name="chevron-left" size={20} /></Link>
          ) : <I name="graduation-cap" size={20} className="text-brand" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{title || session?.heroTitle || "校园招聘"}</p>
            {session && <p className="text-[11px] text-gray-500 truncate">{session.school ? `${session.school} · ` : ""}{session.name}</p>}
          </div>
          <Link to={`${base(slug)}/mine`} className="relative p-2 rounded-lg hover:bg-lightPrimary" aria-label="我的投递">
            <I name="user-round" size={20} />
            {me?.applied > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">{me.applied}</span>}
          </Link>
        </div>
      </header>
      <main className={`mx-auto ${wide ? "max-w-2xl" : "max-w-[480px]"} px-4 py-5 pb-16`}>
        {error ? <ErrorCard message={error} /> : children}
      </main>
    </div>
  );
}

export function ErrorCard({ icon = "alert-triangle", title = "出错了", message }) {
  return (
    <div className="bg-white rounded-card shadow-card p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 mx-auto flex items-center justify-center mb-4"><I name={icon} size={26} /></div>
      <p className="font-bold">{title}</p>
      {message && <p className="text-xs text-gray-600 mt-1">{message}</p>}
    </div>
  );
}

export function BigButton({ to, onClick, icon, title, desc, tone = "brand" }) {
  const branded = tone === "brand";
  const cls = branded
    ? "bg-brand-gradient text-white shadow-button"
    : "bg-gradient-to-r from-white via-[#F8F7FF] to-[#EEE9FF] text-navy-700 border-2 border-brand shadow-button";
  const inner = (
    <div className={`w-full min-h-[104px] text-left rounded-card p-5 flex items-center gap-4 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] ${cls}`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${branded ? "bg-white/20" : "bg-brand text-white"}`}><I name={icon} size={24} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold">{title}</p>
        <p className={`text-xs mt-0.5 ${branded ? "text-white/80" : "text-gray-600"}`}>{desc}</p>
      </div>
      <I name="chevron-right" size={18} className={branded ? "text-white/70" : "text-brand"} />
    </div>
  );
  const className = "block w-full rounded-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30";
  return to ? <Link to={to} className={className}>{inner}</Link> : <button type="button" onClick={onClick} className={className}>{inner}</button>;
}

export function Spinner({ label = "加载中…" }) {
  return <div className="py-16 text-center text-sm text-gray-600"><I name="loader" size={16} className="animate-spin inline mr-2" />{label}</div>;
}

export const toastErr = (e, fb) => toast(campusErr(e, fb), "error");

// 后台任务提示条:抽取 / 匹配都在服务器后台跑,关页不中断;可取消 / 重试
export function TaskBanner({ status, running, label, onCancel, onRetry, busy }) {
  if (running) {
    return (
      <div className="flex items-center gap-2 text-xs text-blue-800 bg-blue-50 rounded-xl px-3 py-2">
        <I name="loader" size={13} className="animate-spin shrink-0" />
        <span className="flex-1">{label || "正在后台处理"},关闭页面也不会中断,稍后可在「我的投递」查看结果</span>
        {onCancel && <button type="button" disabled={busy} onClick={onCancel} className="shrink-0 font-bold text-blue-700 hover:text-red-600 disabled:opacity-50">取消</button>}
      </div>
    );
  }
  if (status === "cancelled" || status === "failed") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 rounded-xl px-3 py-2">
        <I name="info" size={13} className="shrink-0" />
        <span className="flex-1">{status === "cancelled" ? "简历解析已取消,不影响投递,信息可手动填写" : "简历解析失败,不影响投递,信息可手动填写"}</span>
        {onRetry && <button type="button" disabled={busy} onClick={onRetry} className="shrink-0 font-bold text-brand disabled:opacity-50">重新解析</button>}
      </div>
    );
  }
  return null;
}
