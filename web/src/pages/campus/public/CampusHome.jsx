// 学生端首页:专场 banner + 两个入口(智能匹配 / 查看岗位投递)
import { Link } from "react-router-dom";
import { I, toast } from "../../../components/Primitives.jsx";
import { Shell, BigButton, useCampus, useGate, base, Spinner, ErrorCard } from "./shell.jsx";

export default function CampusHome() {
  const { slug, session, ready, me, info } = useCampus();
  const go = useGate();
  if (!ready) return <Shell><Spinner /></Shell>;
  if (!session) return <Shell title="校园招聘"><ErrorCard icon="calendar-x" title="暂无进行中的校招专场" message="请关注后续通知,或向现场 HR 确认活动链接" /></Shell>;
  const closed = !session.open;
  return (
    <Shell>
      <div className="rounded-card bg-brand-gradient text-white p-6 shadow-button relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10" />
        <div className="absolute right-10 bottom-0 w-20 h-20 rounded-full bg-white/10" />
        <p className="text-xs text-white/80 inline-flex items-center gap-1"><I name="graduation-cap" size={12} />{session.school || "校园招聘"}</p>
        <h1 className="text-2xl font-bold mt-2 leading-tight">{session.heroTitle}</h1>
        {session.heroSubtitle && <p className="text-sm text-white/85 mt-1.5">{session.heroSubtitle}</p>}
        {session.location && <p className="text-xs text-white/75 mt-3 inline-flex items-center gap-1"><I name="map-pin" size={12} />{session.location}</p>}
        {session.preview && <span className="absolute top-3 right-3 text-[10px] bg-white/25 px-2 py-0.5 rounded-full">预览</span>}
      </div>

      {closed ? (
        <div className="mt-5"><ErrorCard icon="calendar-x" title="本专场已结束投递" message="感谢关注,如有疑问请联系现场 HR" /></div>
      ) : (
        <div className="mt-5 space-y-3">
          {session.matchEnabled && (
            <BigButton icon="sparkles" title={me?.latestMatchRun?.status === "done" && !me.latestMatchRun.stale ? "查看我的匹配结果" : "不知道投什么岗位?"} desc={me?.latestMatchRun?.status === "done" && !me.latestMatchRun.stale ? "已完成匹配分析,现场面试岗位优先展示" : "上传简历,系统分析与各岗位的匹配度,现场面试岗位优先"} onClick={() => go(`${base(slug)}/match`)} />
          )}
          <BigButton tone="light" icon="briefcase" title="查看岗位详情,直接投递" desc={`最多可投递 ${session.maxApplyJobs} 个岗位`} to={`${base(slug)}/jobs`} />
        </div>
      )}

      {!closed && info?.pcUpload?.path && (
        <button type="button" onClick={() => { const u = `${window.location.origin}${info.pcUpload.path}`; navigator.clipboard?.writeText(u).then(() => toast("电脑上传链接已复制,发给自己在电脑打开即可", "success")).catch(() => toast(u, "info")); }} className="mt-3 w-full flex items-center gap-3 bg-white/70 rounded-card p-3 text-left">
          <span className="w-9 h-9 rounded-xl bg-lightPrimary text-brand flex items-center justify-center shrink-0"><I name="monitor-up" size={16} /></span>
          <span className="flex-1 min-w-0"><span className="block text-xs font-bold text-navy-700">简历在电脑上?复制电脑上传链接</span><span className="block text-[11px] text-gray-500 truncate">上传后现场 HR 会与你的登记合并</span></span>
          <I name="copy" size={14} className="text-gray-400" />
        </button>
      )}

      <div className="mt-6 flex items-center justify-between text-xs text-gray-600">
        <Link to={`${base(slug)}/mine`} className="inline-flex items-center gap-1 text-brand font-medium"><I name="user-round" size={13} />我的投递{me ? ` · 已投 ${me.applied}/${session.maxApplyJobs}` : ""}</Link>
        {me ? <span>{me.name || me.phone || "已建档"}</span> : <Link to={`${base(slug)}/recover`} className="text-gray-600">换了设备?找回记录</Link>}
      </div>
      <p className="mt-8 text-[11px] text-gray-400 text-center leading-relaxed">无需注册登录,上传简历并确认联系方式即可投递</p>
    </Shell>
  );
}
