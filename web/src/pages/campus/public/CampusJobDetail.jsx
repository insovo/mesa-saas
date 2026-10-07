// JD 详情 + 投递(门禁:登录 → 简历 → 联系方式;?apply=1 回跳后自动投递)
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { campus } from "../../../lib/campusApi.js";
import { Button, I, toast } from "../../../components/Primitives.jsx";
import { KindTag } from "../../../components/campus/ui.jsx";
import { Shell, useCampus, base, gatePath, Spinner, toastErr } from "./shell.jsx";

function Block({ title, items, text }) {
  if ((!items || !items.length) && !text) return null;
  return (
    <section className="mt-4">
      <h3 className="text-sm font-bold mb-1.5">{title}</h3>
      {items?.length ? <ul className="space-y-1 text-sm text-gray-700 list-disc pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-sm text-gray-700 whitespace-pre-wrap">{text}</p>}
    </section>
  );
}

export default function CampusJobDetail() {
  const { slug, id } = useParams();
  const { me, session, ready, reload } = useCampus();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { applied, maxApplyJobs }
  const autoRan = useRef(false);

  useEffect(() => { campus.job(slug, id).then(setJob).catch((e) => toastErr(e, "加载岗位失败")); }, [slug, id]);

  async function apply() {
    const target = `${base(slug)}/jobs/${id}?apply=1`;
    const gp = gatePath(slug, me, target);
    if (gp) return nav(gp);
    setBusy(true);
    try {
      const r = await campus.apply({ jobId: id, source: "direct" });
      setDone({ applied: r.applied, maxApplyJobs: r.maxApplyJobs });
      setJob((j) => (j ? { ...j, applied: true } : j));
      await reload();
    } catch (e) {
      const code = e.response?.data?.error;
      if (code === "campus_resume_required" || code === "campus_unauthorized") nav(gatePath(slug, null, target));
      else if (code === "campus_contact_unconfirmed") nav(gatePath(slug, { ...me, hasResume: true, contactConfirmed: false }, target));
      else toastErr(e, "投递失败");
    } finally { setBusy(false); }
  }
  // 门禁回跳自动投递
  useEffect(() => {
    if (sp.get("apply") !== "1" || autoRan.current || !job || !ready) return;
    if (!me) { setSp({}, { replace: true }); return; } // 无会话:门禁会在点击时引导上传
    if (job.applied) { setSp({}, { replace: true }); return; }
    autoRan.current = true;
    setSp({}, { replace: true });
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, job, me, ready]);

  const quotaFull = me && session && me.applied >= session.maxApplyJobs;
  const closed = session && !session.open;

  return (
    <Shell title="岗位详情" back={`${base(slug)}/jobs`}>
      {!job ? <Spinner /> : done ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 text-green-600 mx-auto flex items-center justify-center mb-4"><I name="check-circle" size={32} /></div>
          <h2 className="text-lg font-bold">投递成功</h2>
          <p className="text-sm text-gray-700 mt-1">{job.title}</p>
          <p className="text-xs text-gray-600 mt-3">{job.kind === "referral" ? "该岗位为内推岗位,将由内推人跟进,不安排现场面试。" : "请留意电话 / 邮箱 / 微信,现场面试安排将通知你。"}</p>
          <p className="text-xs text-gray-500 mt-2">已投 {done.applied}/{done.maxApplyJobs},还可投 {Math.max(0, done.maxApplyJobs - done.applied)} 个岗位</p>
          <div className="flex gap-2 mt-5">
            <Button variant="secondary" className="flex-1" as={Link} to={`${base(slug)}/jobs`}>继续看岗位</Button>
            <Button className="flex-1" as={Link} to={`${base(slug)}/mine`}>我的投递</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-card shadow-card p-5">
            <div className="flex items-start gap-2">
              <h1 className="text-lg font-bold flex-1">{job.title}</h1>
              <KindTag kind={job.kind} />
            </div>
            <p className="text-xs text-gray-600 mt-1">{[job.dept, job.location, job.employment].filter(Boolean).join(" · ")}</p>
            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
              {job.salary && <span className="px-2 py-1 rounded-lg bg-brand-50 text-brand font-bold">{job.salary}</span>}
              {job.educationRequirement && <span className="px-2 py-1 rounded-lg bg-lightPrimary">{job.educationRequirement}</span>}
              {job.yearsExpRange && <span className="px-2 py-1 rounded-lg bg-lightPrimary">{job.yearsExpRange}</span>}
              {job.languageRequirement && <span className="px-2 py-1 rounded-lg bg-lightPrimary">{job.languageRequirement}</span>}
            </div>
            {job.kind === "referral" && <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">内推岗位:投递后由内推人跟进,不安排现场面试</p>}
            <Block title="岗位职责" items={job.responsibilities} />
            <Block title="任职要求" items={job.requirements} />
            <Block title="加分项" items={job.nice} />
            <Block title="福利待遇" items={job.benefits} />
            {!job.responsibilities?.length && !job.requirements?.length && <Block title="岗位描述" text={job.description || "暂无描述"} />}
          </div>
          <div className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-gray-100 p-3">
            <div className="mx-auto max-w-[480px] flex items-center gap-3">
              <div className="text-[11px] text-gray-600 flex-1">{me && session ? `已投 ${me.applied}/${session.maxApplyJobs}` : "投递前需上传简历并确认联系方式"}</div>
              <Button className="!h-11 px-6" disabled={busy || job.applied || quotaFull || closed} onClick={apply} icon={busy ? <I name="loader" size={16} className="animate-spin" /> : <I name="send" size={16} />}>
                {closed ? "已结束" : job.applied ? "已投递" : quotaFull ? "名额已用完" : !me || !me.hasResume ? "上传简历并投递" : "投递"}
              </Button>
            </div>
          </div>
          <div className="h-16" />
        </>
      )}
    </Shell>
  );
}
