// MESA Recruit · Jobs (JD list + per-status kanban)

function Jobs({ onOpenCandidate, onAddCandidate }) {
  const jobs = window.MESA_JOBS;
  const [selectedJob, setSelectedJob] = useState(jobs[0].id);
  const job = jobs.find((j) => j.id === selectedJob);

  // partition candidates by status for the chosen JD
  const cands = window.MESA_CANDIDATES.filter((c) => c.appliedFor === job.title);
  const cols = window.MESA_STATUS_ORDER;

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* JD sidebar */}
        <Card extra="p-5 xl:col-span-1 self-start">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1B254B]">活跃 JD</h3>
            <Button variant="ghost" size="sm" icon={<I name="plus" size={14} />}>新建</Button>
          </div>
          <div className="flex flex-col gap-2">
            {jobs.map((j) => {
              const sel = j.id === selectedJob;
              return (
                <button
                  key={j.id}
                  onClick={() => setSelectedJob(j.id)}
                  className={`text-left rounded-xl p-3 transition border ${sel ? 'bg-[#F4F7FE] border-[#422AFB]' : 'bg-white border-transparent hover:bg-[#F4F7FE]'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${sel ? 'font-bold text-[#1B254B]' : 'font-medium text-[#1B254B]'} truncate`}>{j.title}</span>
                    {j.urgency === 'high' && <span className="text-[10px] font-bold text-[#B91C1C] bg-[#FEE2E2] px-1.5 py-0.5 rounded">急</span>}
                  </div>
                  <div className="text-[11px] text-[#707EAE] mt-1">{j.dept} · {j.location} · {j.level}</div>
                  <div className="flex items-center justify-between mt-2 text-[11px]">
                    <span className="text-[#A3AED0]">{j.candidates} 位候选人 · 开放 {j.openings}</span>
                    {sel && <span className="text-[#422AFB] font-bold">已选</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* JD detail + pipeline */}
        <div className="xl:col-span-3 flex flex-col gap-5">
          <Card extra="p-6">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0"
                style={{ background: 'linear-gradient(135deg,#868CFF 0%,#422AFB 100%)' }}>
                <I name="briefcase" size={26} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-[#1B254B] tracking-tight">{job.title}</h2>
                  <span className="text-[11px] font-bold text-[#1B254B] bg-[#F4F7FE] px-2 py-1 rounded">{job.dept}</span>
                  {job.urgency === 'high' && <span className="text-[11px] font-bold text-[#B91C1C] bg-[#FEE2E2] px-2 py-1 rounded">紧急岗位</span>}
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-[#707EAE] flex-wrap">
                  <span className="flex items-center gap-1"><I name="map-pin" size={14} />{job.location}</span>
                  <span className="flex items-center gap-1"><I name="user" size={14} />负责 {job.owner}</span>
                  <span className="flex items-center gap-1"><I name="trending-up" size={14} />{job.level}</span>
                  <span className="flex items-center gap-1"><I name="users" size={14} />开放 {job.openings} 人</span>
                  <span className="flex items-center gap-1"><I name="calendar" size={14} />更新 {job.updatedAt}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" icon={<I name="file-text" size={16} />}>编辑 JD</Button>
                <Button variant="primary" icon={<I name="upload-cloud" size={16} />} onClick={onAddCandidate}>推送候选人</Button>
              </div>
            </div>

            {/* JD summary stats */}
            <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-[#E9ECEF]">
              <Stat label="候选人池" value={job.candidates} />
              <Stat label="匹配 ≥ 80" value={cands.filter((c) => c.jdMatch >= 80).length} tone="brand" />
              <Stat label="面试中" value={cands.filter((c) => c.status === '面试中').length} tone="brand" />
              <Stat label="已入职" value={cands.filter((c) => c.status === '已入职').length} tone="green" />
            </div>
          </Card>

          {/* Kanban pipeline */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {cols.map((s) => {
              const tone = window.MESA_STATUS_TONE[s];
              const colCands = cands.filter((c) => c.status === s);
              return (
                <div key={s} className="flex flex-col gap-2 min-w-0">
                  <div className="flex items-center justify-between px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: tone.dot }}></span>
                      <span className="text-xs font-bold text-[#1B254B]">{s}</span>
                    </div>
                    <span className="text-[10px] font-bold text-[#A3AED0]">{colCands.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 min-h-[120px] p-1.5 rounded-xl" style={{ background: tone.bg + '40' }}>
                    {colCands.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onOpenCandidate(c.id)}
                        className="bg-white rounded-xl p-3 text-left shadow-[0_2px_8px_rgba(112,144,176,0.06)] hover:shadow-[0_6px_16px_rgba(66,42,251,0.10)] transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 inline-block">
                            {c.avatar
                              ? <img src={c.avatar} className="w-7 h-7 rounded-full object-cover"/>
                              : <AnimalAvatar animal={c.animal} size={28} />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-[#1B254B] truncate">{c.name}</div>
                            <div className="text-[10px] text-[#A3AED0] truncate">{c.education} · {c.yearsExp}y</div>
                          </div>
                          <div className="text-xs font-bold" style={{ color: c.jdMatch >= 80 ? '#422AFB' : c.jdMatch >= 50 ? '#F59E0B' : '#F53939' }}>{c.jdMatch}</div>
                        </div>
                      </button>
                    ))}
                    {colCands.length === 0 && (
                      <div className="text-[11px] text-[#A3AED0] text-center py-4 font-medium">无候选人</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }) {
  const colors = {
    neutral: 'text-[#1B254B]',
    brand: 'text-[#422AFB]',
    green: 'text-[#15803D]',
  };
  return (
    <div>
      <div className="text-[11px] text-[#A3AED0] font-medium">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 tracking-tight ${colors[tone]}`}>{value}</div>
    </div>
  );
}

Object.assign(window, { Jobs });
