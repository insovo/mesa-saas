// JD 详情弹窗 — 候选人详情页 / 公开分享页共用。
// onSwitch 可选:传入则显示「切换 JD」按钮(详情页);不传则纯只读(公开分享页)。
import { Modal, I, Button } from "./Primitives.jsx";

export default function JdDescModal({ open, onClose, job, onSwitch }) {
  if (!job) return null;
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#1B254B] flex items-center gap-2 flex-wrap">
              <I name="file-text" size={18} className="text-[#422AFB]" />
              {job.title}
              {job.dept && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F4F7FE] text-[#707EAE] font-bold">{job.dept}</span>}
            </h3>
            {job.description && <p className="text-sm text-[#707EAE] mt-1.5 leading-relaxed whitespace-pre-wrap">{job.description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1B254B] shrink-0"><I name="x" size={20} /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { icon: "map-pin", label: "工作地点", value: job.location },
            { icon: "briefcase", label: "经验要求", value: job.yearsExp },
            { icon: "graduation-cap", label: "学历", value: job.education },
            { icon: "dollar-sign", label: "薪资范围", value: job.salary },
          ].filter(x => x.value).map((x, i) => (
            <div key={i} className="p-3 rounded-xl bg-[#F4F7FE]">
              <p className="text-[10px] text-[#A3AED0] uppercase tracking-wide flex items-center gap-1"><I name={x.icon} size={11} />{x.label}</p>
              <p className="text-sm font-bold text-[#1B254B] mt-1">{x.value}</p>
            </div>
          ))}
        </div>

        <div className="max-h-[50vh] overflow-y-auto -mx-2 px-2 space-y-5">
          {Array.isArray(job.responsibilities) && job.responsibilities.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                <I name="list-checks" size={14} className="text-[#422AFB]" />
                岗位职责
              </h4>
              <ul className="space-y-1.5">
                {job.responsibilities.map((r, i) => (
                  <li key={i} className="text-xs text-[#1B254B] flex items-start gap-2 leading-relaxed">
                    <span className="w-5 h-5 rounded-md bg-[#F4F7FE] text-[#422AFB] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Array.isArray(job.requirements) && job.requirements.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                <I name="check-circle-2" size={14} className="text-[#422AFB]" />
                任职要求
              </h4>
              <ul className="space-y-1.5">
                {job.requirements.map((r, i) => (
                  <li key={i} className="text-xs text-[#1B254B] flex items-start gap-2 leading-relaxed">
                    <I name="check" size={11} className="text-[#422AFB] mt-1 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Array.isArray(job.nice) && job.nice.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                <I name="sparkles" size={14} className="text-[#422AFB]" />
                加分项
              </h4>
              <ul className="space-y-1.5">
                {job.nice.map((r, i) => (
                  <li key={i} className="text-xs text-[#707EAE] flex items-start gap-2 leading-relaxed">
                    <I name="plus" size={11} className="text-[#A3AED0] mt-1 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Array.isArray(job.benefits) && job.benefits.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-[#1B254B] flex items-center gap-2 mb-2">
                <I name="gift" size={14} className="text-[#422AFB]" />
                福利待遇
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {job.benefits.map((b, i) => (
                  <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#F4F7FE] text-[#1B254B]">{b}</span>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-[#E9ECEF] flex-wrap">
          <div className="text-[11px] text-[#A3AED0]">
            {job.publishedAt && <span>发布: {job.publishedAt}</span>}
            {job.deadline && <span className="ml-3">截止: {job.deadline}</span>}
            {job.owner && <span className="ml-3">负责人: {job.owner}</span>}
          </div>
          <div className="flex gap-2 ml-auto">
            {onSwitch && (
              <Button variant="ghost" onClick={onSwitch} icon={<I name="repeat" size={12} />}>切换 JD</Button>
            )}
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
