// 岗位列表:现场面试在前,内推在后
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { campus } from "../../../lib/campusApi.js";
import { I } from "../../../components/Primitives.jsx";
import { KindTag } from "../../../components/campus/ui.jsx";
import { Shell, useCampus, base, Spinner, toastErr } from "./shell.jsx";

function Section({ title, desc, items, slug }) {
  if (!items.length) return null;
  return (
    <section className="mt-5">
      <div className="flex items-baseline gap-2 mb-2 px-1"><h2 className="text-sm font-bold">{title}</h2><span className="text-[11px] text-gray-500">{desc}</span></div>
      <div className="space-y-2.5">
        {items.map((j) => (
          <Link key={j.id} to={`${base(slug)}/jobs/${j.id}`} className="block bg-white rounded-card shadow-card p-4 active:scale-[0.99] transition-transform">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm flex-1 min-w-0 truncate">{j.title}</p>
              <KindTag kind={j.kind} />
              {j.applied && <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">已投递</span>}
            </div>
            <p className="text-xs text-gray-600 mt-1 truncate">{[j.dept, j.location, j.employment, j.salary].filter(Boolean).join(" · ") || "—"}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function CampusJobs() {
  const { slug, me, session } = useCampus();
  const [data, setData] = useState(null);
  useEffect(() => { campus.jobs(slug).then(setData).catch((e) => toastErr(e, "加载岗位失败")); }, [slug, me?.applied]);
  return (
    <Shell title="岗位列表" back>
      {!data ? <Spinner /> : (data.onsite.length + data.referral.length === 0 ? (
        <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gray-600"><I name="inbox" size={24} className="mx-auto mb-2 text-gray-400" />本专场还没有发布岗位</div>
      ) : (
        <>
          {me && session && <p className="text-xs text-gray-600 px-1">已投 {me.applied}/{session.maxApplyJobs} 个岗位</p>}
          <Section title="现场面试岗位" desc="投递后可在现场参加面试" items={data.onsite} slug={slug} />
          <Section title="内推岗位" desc="由内推人跟进,不安排现场面试" items={data.referral} slug={slug} />
        </>
      ))}
    </Shell>
  );
}
