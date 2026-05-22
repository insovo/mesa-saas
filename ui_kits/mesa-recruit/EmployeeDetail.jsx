// MESA Recruit · Employee Detail (post-hire)
// 3-column layout mirrors CandidateDetail:
//   Left:  employee profile (snapshot from candidate, immutable basic info)
//   Center: lifecycle stage tabs + onboarding checklist + probation reviews
//   Right: career events timeline + HRBP risk register

function EmployeeDetail({ employeeId, onBack, onOpenCandidate }) {
  const e = window.MESA_EMPLOYEES.find((x) => x.id === employeeId);
  if (!e) return <div className="p-10 text-center text-[#707EAE]">未找到该员工</div>;

  const tones = window.MESA_HIRE_STAGE_TONE;
  const stages = window.MESA_HIRE_STAGES;
  const taskTones = window.MESA_TASK_STATUS_TONE;
  const tone = tones[e.stage];

  const [stage, setStage] = useState(e.stage);
  const [rightTab, setRightTab] = useState('events');

  const currentUser = (window.MESA_ACCOUNTS || []).find((a) => a.id === window.MESA_CURRENT_USER_ID);
  const isAdmin = currentUser ? currentUser.role === 'admin' : true;

  // Lifecycle progress 0–1 (待入职 → 已转正)
  const order = ['待入职', '入职准备', '入职当天', '试用期', '已转正'];
  const stageIdx = order.indexOf(stage);

  // Probation progress
  const probationDays = e.actualHireDate ? Math.max(0, Math.min(90, window.MESA_daysBetween(e.actualHireDate, window.MESA_today()))) : 0;
  const probationPct = (probationDays / 90) * 100;

  // Risks
  const risks = e.risks || [];
  const activeRisks = risks.filter((r) => r.status !== '已完成' && r.status !== '无需跟进');

  // Checklist
  const checklistKeys = window.MESA_HIRE_CHECKLIST_KEYS;
  const initialChecklist = React.useMemo(() => {
    const init = {};
    checklistKeys.forEach((k) => { init[k.key] = e.checklist?.[k.key] || { status: '待开始' }; });
    return init;
  }, [e.id]);
  const [checklistState, setChecklistState] = useState(initialChecklist);
  useEffect(() => { setChecklistState(initialChecklist); }, [initialChecklist]);
  const doneCount = checklistKeys.filter((k) => checklistState[k.key]?.status === '已完成').length;

  return (
    <div className="grid gap-5 pb-10 grid-cols-1 min-[1180px]:grid-cols-[320px_minmax(0,1fr)_320px]">
      {/* ╔═══════════════════ LEFT — PROFILE ═══════════════════╗ */}
      <div className="flex flex-col gap-5">
        <button onClick={onBack} className="self-start flex items-center gap-1.5 text-sm font-medium text-[#707EAE] hover:text-[#1B254B]">
          <I name="arrow-left" size={16} />
          返回员工列表
        </button>

        <Card extra="p-6">
          <div className="flex items-start gap-4">
            <span className="relative inline-block" style={{ width: 76, height: 76 }}>
              <span className="block w-[76px] h-[76px] rounded-full ring-2 ring-white shadow-[0_4px_16px_rgba(112,144,176,0.18)] overflow-hidden bg-white">
                {e.avatar
                  ? <img src={e.avatar} className="w-full h-full object-cover" alt={e.name} />
                  : <AnimalAvatar animal={e.animal} size={76} />}
              </span>
              {e.gender && <GenderBadge gender={e.gender} size={76} />}
            </span>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[20px] font-bold text-[#1B254B] tracking-tight leading-tight truncate">{e.name}</h1>
              </div>
              <div className="mt-1 text-[11px] text-[#A3AED0] font-mono">{e.id} · {e.level}</div>
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
                  {stage}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <SmallStat icon="briefcase" label="岗位" value={e.appliedFor} />
            <SmallStat icon="building-2" label="部门" value={e.dept} />
            <SmallStat icon="map-pin" label="工作地" value={e.workLocation} />
            <SmallStat icon="user-round" label="直属上级" value={e.directManager} />
          </div>

          <div className="mt-4 pt-4 border-t border-[#F1F3F8] space-y-2">
            <ContactLine icon="phone" value={e.phone} privacy={!isAdmin} />
            <ContactLine icon="mail"  value={e.email} privacy={!isAdmin} />
            <ContactLine icon="user-round-cog" value={`HRBP · ${e.hrbp}`} />
          </div>

          {e.candidateId && (
            <button
              onClick={() => onOpenCandidate && onOpenCandidate(e.candidateId)}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#F4F7FE] text-sm font-bold text-[#422AFB] hover:bg-[#E9E3FF]/60 transition"
            >
              <I name="external-link" size={13} />
              查看招聘期档案
            </button>
          )}
        </Card>

        {/* JD match snapshot */}
        <Card extra="p-5 flex items-center gap-4">
          <MatchRing value={e.jdMatch} size={64} stroke={6} showLabel={false} />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">招聘期 JD 匹配</div>
            <div className="text-sm font-bold text-[#1B254B] mt-0.5">解析器 {e.parser} · {e.parserConfidence}%</div>
            <div className="text-[11px] text-[#707EAE] mt-0.5">来源 {e.source}</div>
          </div>
        </Card>

        {/* Personal background */}
        <Card extra="overflow-hidden">
          <ERow label="学历" value={`${e.education} · ${e.school}`} />
          <ERow label="专业" value={e.major} />
          <ERow label="工作年限" value={`${e.yearsExp} 年`} />
          <ERow label="所在地" value={e.location} last />
        </Card>

        {/* Tags */}
        {(e.tags || []).length > 0 && (
          <Card extra="p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-[#A3AED0] mb-2.5">员工标签</div>
            <div className="flex flex-wrap gap-1.5">
              {e.tags.map((t) => <Tag key={t} tone="brand">{t}</Tag>)}
            </div>
          </Card>
        )}
      </div>

      {/* ╔══════════════════ CENTER — LIFECYCLE ══════════════════╗ */}
      <div className="flex flex-col gap-5 pt-7">
        {/* Lifecycle stage tracker */}
        <Card extra="p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#1B254B]">入职生涯</h3>
              <span className="text-xs text-[#A3AED0]">{stageIdx >= 0 ? `阶段 ${stageIdx + 1}/${order.length}` : '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" icon={<I name="message-square-plus" size={14} />}>新增记录</Button>
              <Button variant="primary" size="sm" icon={<I name="arrow-right" size={14} />} onClick={() => {
                const next = order[stageIdx + 1];
                if (next) setStage(next);
              }}>
                {stageIdx >= order.length - 1 ? '已到终点' : `推进到 ${order[stageIdx + 1]}`}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {order.map((s, i) => {
              const done = i < stageIdx;
              const current = s === stage;
              const t = tones[s];
              return (
                <React.Fragment key={s}>
                  <button onClick={() => setStage(s)} className="flex items-center gap-2 group">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition ${
                        done ? 'bg-[#22C55E] text-white' : current ? 'text-white ring-4' : 'bg-[#F4F7FE] text-[#A3AED0]'
                      }`}
                      style={current ? { background: t.dot, ringColor: t.bg } : (current ? {} : {})}
                    >
                      {done ? <I name="check" size={12} /> : i + 1}
                    </div>
                    <span className={`text-xs whitespace-nowrap ${done || current ? 'text-[#1B254B] font-bold' : 'text-[#A3AED0] font-medium'}`}>{s}</span>
                  </button>
                  {i < order.length - 1 && <div className={`flex-1 h-px ${done ? 'bg-[#22C55E]' : 'bg-[#E9ECEF]'}`}></div>}
                </React.Fragment>
              );
            })}
          </div>
        </Card>

        {/* Onboarding checklist */}
        <OnboardingChecklist
          employee={e}
          checklistKeys={checklistKeys}
          checklistState={checklistState}
          setChecklistState={setChecklistState}
          doneCount={doneCount}
          taskTones={taskTones}
        />

        {/* Probation review (only after onboarding) */}
        {e.actualHireDate && (
          <Card extra="p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-[#1B254B]">试用期评估</h3>
                <span className="text-xs text-[#A3AED0]">入职 → {e.probationEndDate}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold" style={{ background: tones[e.stage].bg, color: tones[e.stage].fg }}>
                {e.regularizeAdvice || '待定'}
              </span>
            </div>

            {/* Probation progress bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-[#A3AED0] font-medium">试用期进度</span>
                <span className="text-[#1B254B] font-bold tabular-nums">Day {Math.round(probationDays)} / 90</span>
              </div>
              <div className="relative h-2 rounded-full bg-[#F4F7FE] overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${probationPct}%`, background: 'linear-gradient(90deg,#868CFF,#422AFB)' }}></div>
                {/* Milestones */}
                {[30, 60, 90].map((d) => (
                  <span key={d} className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-white border-l border-r border-[#CBD5E0]" style={{ left: `${(d / 90) * 100}%` }}></span>
                ))}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-[#A3AED0] font-medium">
                <span>Day 0</span>
                <span>Day 30</span>
                <span>Day 60</span>
                <span>Day 90 · 转正</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ProbationCard label="30 天访谈" review={e.probation?.day30} accent="#868CFF" />
              <ProbationCard label="60 天评估" review={e.probation?.day60} accent="#7551FF" />
              <ProbationCard label="90 天评估" review={e.probation?.day90} accent="#422AFB" showCompletion />
            </div>

            <div className="mt-5 pt-4 border-t border-[#E9ECEF] flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#A3AED0] font-bold uppercase">转正建议</span>
                <span className="text-sm font-bold text-[#1B254B]">{e.regularizeAdvice || '待定'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm">延长试用</Button>
                <Button variant="primary" size="sm" icon={<I name="badge-check" size={14} />}>发起转正</Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ╔══════════════════ RIGHT — EVENTS / RISKS ══════════════════╗ */}
      <div className="flex flex-col gap-5 pt-7">
        <Card extra="p-5">
          <div className="flex items-center gap-5 pb-3 border-b border-[#E9ECEF]">
            <ETabBtn active={rightTab === 'events'} onClick={() => setRightTab('events')}>
              生涯时间轴
            </ETabBtn>
            <ETabBtn active={rightTab === 'risks'} onClick={() => setRightTab('risks')}>
              HRBP 风险 ({activeRisks.length}/{risks.length})
            </ETabBtn>
          </div>

          {rightTab === 'events' ? (
            <CareerTimelineFull employee={e} />
          ) : (
            <div className="mt-4 space-y-2">
              {risks.length === 0 ? (
                <div className="py-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto">
                    <I name="shield-check" size={18} />
                  </div>
                  <p className="mt-2 text-xs text-[#707EAE]">无风险记录</p>
                </div>
              ) : risks.map((r, i) => <RiskRow key={i} risk={r} />)}
              <button className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-[#CBD5E0] text-xs font-bold text-[#707EAE] hover:border-[#422AFB] hover:text-[#422AFB] transition">
                <I name="plus" size={12} />
                添加风险项
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────── Helpers ───────────────────────────
function SmallStat({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-[#F4F7FE] p-2.5">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#A3AED0]">
        <I name={icon} size={10} />
        {label}
      </div>
      <div className="text-xs font-bold text-[#1B254B] mt-0.5 truncate" title={value}>{value}</div>
    </div>
  );
}

function ContactLine({ icon, value, privacy }) {
  const display = privacy && value ? value.replace(/.(?=.{4})/g, '*') : value;
  return (
    <div className="flex items-center gap-2 text-xs text-[#707EAE]">
      <I name={icon} size={12} className="text-[#A3AED0]" />
      <span className="truncate" title={value}>{display}</span>
      {privacy && <span className="ml-auto text-[9px] text-[#A3AED0] font-bold">脱敏</span>}
    </div>
  );
}

function ERow({ label, value, last }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3 ${last ? '' : 'border-b border-[#F1F3F8]'}`}>
      <span className="text-xs font-bold text-[#1B254B] w-20 shrink-0">{label}</span>
      <span className="text-xs text-[#707EAE] flex-1 truncate" title={value}>{value}</span>
    </div>
  );
}

function ETabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`relative pb-3 -mb-px text-sm font-bold transition ${active ? 'text-[#422AFB]' : 'text-[#707EAE] hover:text-[#1B254B]'}`}>
      {children}
      {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-[#422AFB]"></span>}
    </button>
  );
}

function ProbationCard({ label, review, accent, showCompletion }) {
  if (!review) return null;
  const tone = window.MESA_TASK_STATUS_TONE[review.status] || window.MESA_TASK_STATUS_TONE['待开始'];
  return (
    <div className="rounded-xl border border-[#F1F3F8] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: accent }}>{label}</span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
          <span className="w-1 h-1 rounded-full" style={{ background: tone.dot }}></span>
          {review.status}
        </span>
      </div>
      <div className="text-xs text-[#1B254B] font-bold tabular-nums mb-1.5">{review.date}</div>
      <p className="text-[11px] text-[#707EAE] leading-snug" style={{ textWrap: 'pretty' }}>
        {review.notes || (review.status === '待开始' ? '尚未开始,系统将在到期前 3 天发起提醒。' : '—')}
      </p>
      {showCompletion && review.completion != null && (
        <div className="mt-3 pt-3 border-t border-[#F1F3F8]">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-[#A3AED0] font-bold uppercase">OKR 完成度</span>
            <span className="text-[#1B254B] font-bold tabular-nums">{Math.round(review.completion * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#F4F7FE] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${review.completion * 100}%`, background: accent }}></div>
          </div>
        </div>
      )}
    </div>
  );
}

function CareerTimelineFull({ employee: e }) {
  const [filter, setFilter] = useState('all');
  const c = e.candidateId ? (window.MESA_CANDIDATES || []).find((x) => x.id === e.candidateId) : null;

  // Education: prefer employee.educationHistory, else candidate's, else synthesize from base fields
  const eduSrc = e.educationHistory || c?.educationHistory || (e.school ? [{ period: '—', school: e.school, major: e.major, degree: e.education }] : []);
  const eduEvents = eduSrc.map((ed) => ({
    date: ed.period,
    sortKey: parsePeriodStart(ed.period),
    type: '教育',
    title: `${ed.degree || ''} · ${ed.school || ''}`.replace(/^\s·\s/, ''),
    desc: ed.major,
    owner: ed.period,
    _bucket: 'edu',
  }));

  // Pre-hire work: prefer employee.experience, else candidate's. If neither, derive a single summary item from yearsExp.
  const workSrc = e.experience || c?.experience || (
    e.yearsExp && e.actualHireDate
      ? [{ period: `入职前 ${Math.max(0, e.yearsExp)} 年`, company: '行业从业经历', title: `约 ${e.yearsExp} 年累计经验`, summary: '' }]
      : []
  );
  const workEvents = workSrc.map((w) => ({
    date: w.period,
    sortKey: parsePeriodStart(w.period),
    type: '入职前工作',
    title: `${w.company}${w.title ? ' · ' + w.title : ''}`,
    desc: w.summary,
    owner: w.period,
    _bucket: 'prehire',
  }));

  // Post-hire (already at this company)
  const postEvents = (e.events || []).map((ev) => ({
    ...ev,
    sortKey: parsePeriodStart(ev.date),
    _bucket: 'post',
  }));

  let merged = [...postEvents, ...workEvents, ...eduEvents].sort((a, b) => b.sortKey - a.sortKey);
  if (filter !== 'all') merged = merged.filter((ev) => ev._bucket === filter);

  const buckets = [
    { id: 'all',     label: '全部', count: postEvents.length + workEvents.length + eduEvents.length },
    { id: 'post',    label: '入职后', count: postEvents.length },
    { id: 'prehire', label: '入职前工作', count: workEvents.length },
    { id: 'edu',     label: '教育', count: eduEvents.length },
  ];

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1 mb-3 -mx-1 overflow-x-auto pb-1">
        {buckets.map((b) => (
          <button
            key={b.id}
            onClick={() => setFilter(b.id)}
            className={`whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-bold transition ${
              filter === b.id ? 'bg-[#422AFB] text-white' : 'bg-[#F4F7FE] text-[#707EAE] hover:text-[#1B254B]'
            }`}
          >
            {b.label}
            <span className={`text-[10px] tabular-nums ${filter === b.id ? 'opacity-80' : 'opacity-60'}`}>{b.count}</span>
          </button>
        ))}
      </div>

      <CareerTimeline events={merged} />

      <button className="mt-3 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F4F7FE] text-sm font-bold text-[#422AFB] hover:bg-[#E9E3FF]/60 transition">
        <span className="w-6 h-6 rounded-md bg-[#422AFB] text-white flex items-center justify-center">
          <I name="plus" size={13} />
        </span>
        新增事件
      </button>
    </div>
  );
}

// Parse start year-month from strings like "2009.1 – 2011.12", "2026-05-13", "2024.2 – 至今", "—".
function parsePeriodStart(s) {
  if (!s) return 0;
  // Standard YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (isoMatch) {
    return new Date(+isoMatch[1], +isoMatch[2] - 1, +(isoMatch[3] || 1)).getTime();
  }
  // YYYY.M form, take first occurrence
  const dotMatch = s.match(/(\d{4})\.(\d{1,2})/);
  if (dotMatch) return new Date(+dotMatch[1], +dotMatch[2] - 1, 1).getTime();
  // Just YYYY
  const ym = s.match(/(\d{4})/);
  if (ym) return new Date(+ym[1], 0, 1).getTime();
  return 0;
}

function CareerTimeline({ events }) {
  const tones = {
    '入职':     { bg: '#E9E3FF', fg: '#422AFB' },
    '转正':     { bg: '#DCFCE7', fg: '#15803D' },
    '晋升':     { bg: '#DBEAFE', fg: '#1D4ED8' },
    '关键项目': { bg: '#FEF3C7', fg: '#854D0E' },
    '培训':     { bg: '#FFEDD5', fg: '#9A3412' },
    '试用期':   { bg: '#F4F7FE', fg: '#1B254B' },
    'Offer':    { bg: '#E9E3FF', fg: '#2111A5' },
    '招聘':     { bg: '#F4F7FE', fg: '#707EAE' },
    '入职前工作': { bg: '#FFE4E6', fg: '#9F1239' },
    '教育':     { bg: '#E0F2FE', fg: '#0C4A6E' },
  };
  if (events.length === 0) {
    return <div className="text-xs text-[#A3AED0] py-4 text-center">暂无事件</div>;
  }
  return (
    <ol className="relative ml-1.5">
      {events.map((ev, i) => {
        const t = tones[ev.type] || tones['招聘'];
        return (
          <li key={i} className="relative pl-6 pb-4 last:pb-0">
            <div className="absolute left-0 top-1 w-2.5 h-2.5 rounded-full ring-2 ring-white shadow" style={{ background: t.fg }}></div>
            {i < events.length - 1 && <div className="absolute left-[5px] top-3.5 bottom-0 w-px bg-[#E9ECEF]"></div>}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#A3AED0] tabular-nums">{ev.date}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: t.bg, color: t.fg }}>{ev.type}</span>
            </div>
            <div className="text-xs font-bold text-[#1B254B] mt-1">{ev.title}</div>
            {ev.desc && <div className="text-[11px] text-[#707EAE] mt-0.5 leading-snug" style={{ textWrap: 'pretty' }}>{ev.desc}</div>}
            {ev.owner && <div className="text-[10px] text-[#A3AED0] mt-1">负责人 · {ev.owner}</div>}
          </li>
        );
      })}
    </ol>
  );
}

function RiskRow({ risk }) {
  const levelTone = {
    '高': { bg: '#FEE2E2', fg: '#B91C1C', dot: '#F53939' },
    '中': { bg: '#FEF3C7', fg: '#92400E', dot: '#F59E0B' },
    '低': { bg: '#F4F7FE', fg: '#707EAE', dot: '#A3AED0' },
  }[risk.level] || { bg: '#F4F7FE', fg: '#707EAE', dot: '#A3AED0' };

  const statusTone = window.MESA_TASK_STATUS_TONE[risk.status] || { bg: '#F4F7FE', fg: '#707EAE', dot: '#A3AED0' };

  return (
    <div className="rounded-xl border border-[#F1F3F8] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold" style={{ background: levelTone.bg, color: levelTone.fg }}>
          <span className="w-1 h-1 rounded-full" style={{ background: levelTone.dot }}></span>
          {risk.level}风险
        </span>
        <span className="text-[10px] text-[#A3AED0]">{risk.source}</span>
        <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold" style={{ background: statusTone.bg, color: statusTone.fg }}>
          {risk.status}
        </span>
      </div>
      <p className="text-xs text-[#1B254B] font-bold mt-2 leading-snug" style={{ textWrap: 'pretty' }}>{risk.item}</p>
      <p className="text-[11px] text-[#707EAE] mt-1 leading-snug" style={{ textWrap: 'pretty' }}>
        <span className="text-[#A3AED0]">动作:</span> {risk.action}
      </p>
      <div className="mt-2 pt-2 border-t border-[#F1F3F8] flex items-center justify-between text-[10px] text-[#A3AED0]">
        <span>{risk.owner}</span>
        {risk.dueDate && risk.dueDate !== '—' && <span className="tabular-nums">截止 {risk.dueDate}</span>}
      </div>
    </div>
  );
}

// ─────────────────────── Onboarding checklist (interactive) ───────────────────────
function OnboardingChecklist({ employee: e, checklistKeys, checklistState, setChecklistState, doneCount, taskTones }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [statusMenuKey, setStatusMenuKey] = useState(null);
  const [editingNoteKey, setEditingNoteKey] = useState(null);
  const [draft, setDraft] = useState('');
  const total = checklistKeys.length;
  const allDone = doneCount >= total;
  const today = (window.MESA_today && window.MESA_today()) || '今日';
  const STATUSES = ['已完成', '进行中', '待开始', '已逾期', '不适用'];

  function update(key, patch) {
    setChecklistState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function setStatus(key, status) {
    const cur = checklistState[key] || {};
    const dateUpdate = status === '已完成' && (!cur.date || cur.date === '—') ? { date: today } : {};
    update(key, { status, ...dateUpdate });
    setStatusMenuKey(null);
  }
  function completeAll() {
    setChecklistState((prev) => {
      const next = { ...prev };
      checklistKeys.forEach((k) => {
        const cur = next[k.key] || {};
        next[k.key] = { ...cur, status: '已完成', date: cur.date && cur.date !== '—' ? cur.date : today };
      });
      return next;
    });
  }
  function applyBulk(action) {
    if (selected.size === 0) return;
    setChecklistState((prev) => {
      const next = { ...prev };
      [...selected].forEach((k) => {
        const cur = next[k] || {};
        if (action === 'complete') {
          next[k] = { ...cur, status: '已完成', date: cur.date && cur.date !== '—' ? cur.date : today };
        } else if (action === 'revert') {
          next[k] = { ...cur, status: '待开始' };
        } else if (action === 'skip') {
          next[k] = { ...cur, status: '不适用' };
        }
      });
      return next;
    });
    setSelected(new Set());
  }
  function toggleSel(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function startEditNote(key) {
    setEditingNoteKey(key);
    setDraft(checklistState[key]?.note || '');
  }
  function commitNote() {
    if (editingNoteKey) update(editingNoteKey, { note: draft.trim() });
    setEditingNoteKey(null);
    setDraft('');
  }

  const selAllOnPage = selectMode && selected.size === total;

  return (
    <Card extra="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-[#1B254B]">入职准备清单</h3>
          <span className="text-xs text-[#A3AED0]">{doneCount}/{total} 已完成</span>
          {selectMode && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#E9E3FF] text-[#422AFB] font-bold text-[10px]">
              <I name="check-square" size={10} />
              选择模式 · 已选 {selected.size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!selectMode && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<I name="check-check" size={13} />}
                onClick={completeAll}
                className={allDone ? 'opacity-50 pointer-events-none' : ''}
              >
                一键全部完成
              </Button>
              <Button variant="ghost" size="sm" icon={<I name="check-square" size={13} />} onClick={() => setSelectMode(true)}>
                批量操作
              </Button>
            </>
          )}
          {selectMode && (
            <>
              <button
                onClick={() => setSelected(selAllOnPage ? new Set() : new Set(checklistKeys.map((k) => k.key)))}
                className="text-xs font-bold text-[#422AFB] hover:underline px-2"
              >
                {selAllOnPage ? '取消全选' : '全选'}
              </button>
              <Button variant="ghost" size="sm" icon={<I name="x" size={13} />} onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
                退出
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Date strip */}
      <div className="text-xs text-[#707EAE] flex items-center gap-3 -mt-1 mb-3 flex-wrap">
        <span>预计入职 <span className="text-[#1B254B] font-bold">{e.plannedHireDate}</span></span>
        {e.actualHireDate && <span>实际入职 <span className="text-[#1B254B] font-bold">{e.actualHireDate}</span></span>}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {checklistKeys.map((k) => {
          const t = checklistState[k.key] || { status: '待开始' };
          const st = taskTones[t.status] || taskTones['待开始'];
          const isMenuOpen = statusMenuKey === k.key;
          const isEditing = editingNoteKey === k.key;
          const isSel = selected.has(k.key);
          return (
            <div
              key={k.key}
              className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                isSel ? 'border-[#422AFB] bg-[#F4F7FE]' : 'border-[#F1F3F8] hover:bg-[#F4F7FE]/60'
              }`}
            >
              {selectMode && (
                <button
                  onClick={() => toggleSel(k.key)}
                  className={`w-5 h-5 mt-1 rounded-md flex items-center justify-center transition shrink-0 ${
                    isSel ? 'bg-[#422AFB] text-white' : 'bg-white border-2 border-[#CBD5E0]'
                  }`}
                >
                  {isSel && <I name="check" size={12} strokeWidth={3} />}
                </button>
              )}

              <span className="w-8 h-8 rounded-lg bg-[#F4F7FE] text-[#422AFB] flex items-center justify-center shrink-0">
                <I name={k.icon} size={14} />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[#1B254B]">{k.label}</span>
                  {/* Status pill (dropdown) */}
                  <div className="relative">
                    <button
                      onClick={() => setStatusMenuKey(isMenuOpen ? null : k.key)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold hover:ring-2 hover:ring-offset-1 hover:ring-[#422AFB]/30 transition"
                      style={{ background: st.bg, color: st.fg }}
                    >
                      <span className="w-1 h-1 rounded-full" style={{ background: st.dot }}></span>
                      {t.status}
                      <I name="chevron-down" size={9} className="opacity-70" />
                    </button>
                    {isMenuOpen && (
                      <StatusMenu
                        statuses={STATUSES}
                        current={t.status}
                        onPick={(s) => setStatus(k.key, s)}
                        onClose={() => setStatusMenuKey(null)}
                        taskTones={taskTones}
                      />
                    )}
                  </div>
                  {/* Quick complete (only if not done) */}
                  {!selectMode && t.status !== '已完成' && (
                    <button
                      onClick={() => setStatus(k.key, '已完成')}
                      className="text-[10px] text-[#15803D] font-bold hover:underline flex items-center gap-0.5"
                      title="单条标记完成"
                    >
                      <I name="check" size={10} strokeWidth={2.8} />
                      标记完成
                    </button>
                  )}
                  {!selectMode && t.status === '已完成' && (
                    <button
                      onClick={() => setStatus(k.key, '待开始')}
                      className="text-[10px] text-[#A3AED0] font-bold hover:text-[#B91C1C] flex items-center gap-0.5"
                      title="取消完成"
                    >
                      <I name="rotate-ccw" size={10} />
                      撤销
                    </button>
                  )}
                </div>

                {/* Note */}
                {isEditing ? (
                  <div className="mt-2 flex items-start gap-1">
                    <textarea
                      value={draft}
                      onChange={(ev) => setDraft(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) commitNote();
                        else if (ev.key === 'Escape') { setEditingNoteKey(null); setDraft(''); }
                      }}
                      autoFocus
                      rows={2}
                      placeholder="添加备注 · Cmd/Ctrl + Enter 保存"
                      className="flex-1 text-[11px] text-[#1B254B] bg-white border border-[#422AFB] rounded-lg p-2 outline-none resize-none"
                    />
                    <button onClick={commitNote} className="w-7 h-7 rounded-md bg-[#422AFB] text-white flex items-center justify-center" title="保存">
                      <I name="check" size={12} strokeWidth={2.6} />
                    </button>
                    <button onClick={() => { setEditingNoteKey(null); setDraft(''); }} className="w-7 h-7 rounded-md hover:bg-[#F4F7FE] text-[#A3AED0] flex items-center justify-center" title="取消">
                      <I name="x" size={12} />
                    </button>
                  </div>
                ) : t.note ? (
                  <button onClick={() => startEditNote(k.key)} className="mt-0.5 text-left text-[11px] text-[#707EAE] hover:text-[#1B254B] truncate w-full flex items-start gap-1 group" title={t.note}>
                    <I name="message-square" size={9} className="mt-1 text-[#A3AED0] shrink-0" />
                    <span className="truncate">{t.note}</span>
                    <I name="pencil" size={9} className="ml-auto mt-1 text-[#A3AED0] opacity-0 group-hover:opacity-100 transition shrink-0" />
                  </button>
                ) : (
                  !selectMode && (
                    <button onClick={() => startEditNote(k.key)} className="mt-0.5 text-[11px] text-[#A3AED0] hover:text-[#422AFB] inline-flex items-center gap-1 transition">
                      <I name="plus" size={9} />
                      添加备注
                    </button>
                  )
                )}
              </div>

              <div className="text-[11px] text-[#A3AED0] font-medium text-right shrink-0">
                {t.date && t.date !== '—' && <div className="tabular-nums">{t.date}</div>}
                {t.owner && <div>{t.owner}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk action bar (sticky in card) */}
      {selectMode && selected.size > 0 && (
        <div className="mt-4 -mx-6 -mb-6 px-6 py-3 bg-[#1B254B] text-white rounded-b-[20px] flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 pr-3 border-r border-white/15">
            <span className="w-7 h-7 rounded-full bg-[#422AFB] flex items-center justify-center text-sm font-bold">{selected.size}</span>
            <span className="text-sm font-medium">已选 {selected.size} 项</span>
          </span>
          <button onClick={() => applyBulk('complete')} className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-sm font-bold transition">
            <I name="check-check" size={13} />
            标记完成
          </button>
          <button onClick={() => applyBulk('revert')} className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold transition">
            <I name="rotate-ccw" size={13} />
            撤销 / 重置
          </button>
          <button onClick={() => applyBulk('skip')} className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold transition">
            <I name="minus" size={13} />
            标为不适用
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-sm font-medium text-white/80 hover:text-white">清空</button>
        </div>
      )}
    </Card>
  );
}

function StatusMenu({ statuses, current, onPick, onClose, taskTones }) {
  const ref = useRef(null);
  useEffect(() => {
    function out(ev) { if (ref.current && !ref.current.contains(ev.target)) onClose(); }
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute z-30 top-full left-0 mt-1 min-w-[140px] rounded-xl bg-white shadow-[0_12px_30px_rgba(112,144,176,0.20)] border border-[#E9ECEF] py-1.5">
      {statuses.map((s) => {
        const t = taskTones[s];
        return (
          <button
            key={s}
            onClick={(ev) => { ev.stopPropagation(); onPick(s); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#F4F7FE] ${s === current ? 'bg-[#F4F7FE]/60' : ''}`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.dot }}></span>
            <span className="flex-1 font-bold text-[#1B254B]">{s}</span>
            {s === current && <I name="check" size={11} className="text-[#422AFB]" />}
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, { EmployeeDetail });