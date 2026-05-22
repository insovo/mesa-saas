// MESA Recruit · New Hire / 入职管理 list page
// Stage tabs across the hiring lifecycle, per-employee row with checklist
// completion + probation progress + risk badge. Click row → Employee Detail.

function NewHire({ onOpenEmployee, onOpenCandidate }) {
  const all = window.MESA_EMPLOYEES;
  const stages = window.MESA_HIRE_STAGES;
  const tones = window.MESA_HIRE_STAGE_TONE;
  const candidates = window.MESA_CANDIDATES || [];

  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('all');

  const filtered = all.filter((e) => {
    if (tab !== 'all' && e.stage !== tab) return false;
    if (dept !== 'all' && e.dept !== dept) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!(e.name.includes(query) || e.appliedFor.includes(query) || (e.tags || []).some((t) => t.toLowerCase().includes(q)))) return false;
    }
    return true;
  });

  // Counts per stage (incl. "待入职" sourced from candidates with status 待入职)
  const pendingCandidates = candidates.filter((c) => c.status === '待入职');
  const counts = stages.reduce((acc, s) => {
    acc[s] = all.filter((e) => e.stage === s).length;
    return acc;
  }, {});
  counts['待入职'] += pendingCandidates.length;

  const depts = ['all', ...Array.from(new Set(all.map((e) => e.dept)))];

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Top metric tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {stages.slice(0, 6).map((s) => (
          <StageTile key={s} stage={s} count={counts[s]} tone={tones[s]} active={tab === s} onClick={() => setTab(s)} />
        ))}
      </div>

      {/* Filter row + tabs */}
      <Card extra="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-[#F4F7FE] rounded-xl px-3 h-10">
            <I name="search" size={15} className="text-[#A0AEC0]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="姓名 / 岗位 / 标签"
              className="flex-1 bg-transparent text-sm text-[#1B254B] outline-none placeholder:text-[#A0AEC0]"
            />
            {query && <button onClick={() => setQuery('')}><I name="x" size={13} className="text-[#A3AED0]" /></button>}
          </div>

          <NHFilterChip label="部门" value={dept} onChange={setDept} options={depts.map((d) => ({ v: d, l: d === 'all' ? '全部部门' : d }))} />

          <div className="flex items-center gap-1.5 ml-auto bg-[#F4F7FE] rounded-xl p-1 overflow-x-auto">
            <TabPill active={tab === 'all'} onClick={() => setTab('all')}>全部 ({all.length})</TabPill>
            {stages.slice(0, 5).map((s) => (
              <TabPill key={s} active={tab === s} onClick={() => setTab(s)} dotColor={tones[s].dot}>
                {s} ({counts[s]})
              </TabPill>
            ))}
          </div>
        </div>
      </Card>

      {/* Pending hire — candidates not yet "started" */}
      {tab === '待入职' && pendingCandidates.length > 0 && (
        <Card extra="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#FFEDD5] text-[#9A3412] flex items-center justify-center"><I name="user-plus" size={14} /></span>
              <h3 className="text-base font-bold text-[#1B254B]">来自候选人池</h3>
              <span className="text-xs text-[#A3AED0]">候选人状态为「待入职」,可一键发起入职</span>
            </div>
            <Button variant="primary" size="sm" icon={<I name="users" size={14} />}>批量发起入职</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pendingCandidates.map((c) => (
              <div key={c.id} onClick={() => onOpenCandidate && onOpenCandidate(c.id)} className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-[#FED7AA] bg-[#FFFBF5] hover:bg-[#FFF7ED] cursor-pointer transition">
                <Avatar src={c.avatar} name={c.name} size={36} gender={c.gender} animal={c.animal} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#1B254B]">{c.name}</span>
                    <span className="text-[10px] font-bold text-[#9A3412] bg-[#FFEDD5] px-1.5 py-0.5 rounded">待入职</span>
                  </div>
                  <div className="text-xs text-[#707EAE] mt-0.5 truncate">{c.appliedFor} · {c.location}</div>
                </div>
                <Button size="sm" variant="primary" icon={<I name="arrow-right" size={12} />}>发起入职</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Employee table */}
      <Card extra="p-0 overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1.4fr_0.9fr_1.1fr_1fr_0.6fr_0.6fr] gap-3 px-5 py-3 border-b border-[#F1F3F8] text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] bg-[#F8FAFF]">
          <span>员工</span>
          <span>投递岗位 / 部门</span>
          <span>阶段</span>
          <span>入职 / 试用期</span>
          <span>入职清单</span>
          <span className="text-center">风险</span>
          <span className="text-right">操作</span>
        </div>

        {filtered.length === 0 && (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0] mx-auto">
              <I name="users" size={26} />
            </div>
            <p className="mt-3 text-sm text-[#707EAE]">没有匹配的员工。调整筛选条件,或在「待入职」中发起新入职。</p>
          </div>
        )}

        {filtered.map((e) => (
          <EmployeeRow key={e.id} employee={e} tones={tones} onOpen={() => onOpenEmployee(e.id)} />
        ))}
      </Card>
    </div>
  );
}

// ─────────────────────────── Stage metric tile ───────────────────────────
function StageTile({ stage, count, tone, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-2xl bg-white transition text-left ${
        active
          ? 'ring-2 ring-[#422AFB] shadow-[14px_17px_40px_4px_rgba(66,42,251,0.10)]'
          : 'shadow-[14px_17px_40px_4px_rgba(112,144,176,0.06)] hover:shadow-[14px_17px_40px_4px_rgba(66,42,251,0.10)]'
      }`}
    >
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: tone.bg, color: tone.fg }}>
        <span className="w-2 h-2 rounded-full" style={{ background: tone.dot }}></span>
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">{stage}</div>
        <div className="text-xl font-bold text-[#1B254B] tabular-nums leading-tight">{count}</div>
      </div>
    </button>
  );
}

function TabPill({ active, onClick, children, dotColor }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition ${
        active ? 'bg-white text-[#1B254B] shadow-sm' : 'text-[#707EAE] hover:text-[#1B254B]'
      }`}
    >
      {dotColor && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }}></span>}
      {children}
    </button>
  );
}

function NHFilterChip({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function out(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);
  const current = options.find((o) => o.v === value) || options[0];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 h-10 px-3 rounded-xl bg-white border border-[#E9ECEF] text-sm font-medium text-[#1B254B] hover:border-[#422AFB] transition">
        <span className="text-[#A3AED0] text-xs">{label}</span>
        <span className="font-bold">{current.l}</span>
        <I name="chevron-down" size={13} className="text-[#A3AED0]" />
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-20 min-w-[160px] rounded-xl bg-white shadow-[0_20px_25px_-5px_rgba(112,144,176,0.20)] py-1.5">
          {options.map((o) => (
            <button key={o.v} onClick={() => { onChange(o.v); setOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#F4F7FE] ${o.v === value ? 'font-bold text-[#422AFB]' : 'text-[#1B254B] font-medium'}`}>
              {o.l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Employee row ───────────────────────────
function EmployeeRow({ employee: e, tones, onOpen }) {
  const tone = tones[e.stage];
  const checklist = e.checklist || {};
  const total = Object.keys(checklist).length;
  const done = Object.values(checklist).filter((s) => s.status === '已完成').length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  const probationPct = e.actualHireDate
    ? Math.max(0, Math.min(100, daysBetween(e.actualHireDate, todayStr()) / 90 * 100))
    : 0;

  const activeRisks = (e.risks || []).filter((r) => r.status !== '已完成' && r.status !== '无需跟进');
  const highRisk = activeRisks.some((r) => r.level === '高');

  return (
    <div
      onClick={onOpen}
      className="grid grid-cols-[1.6fr_1.4fr_0.9fr_1.1fr_1fr_0.6fr_0.6fr] gap-3 items-center px-5 py-3.5 border-b border-[#F1F3F8] hover:bg-[#F4F7FE]/50 cursor-pointer transition last:border-0"
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={e.avatar} name={e.name} size={40} gender={e.gender} animal={e.animal} />
        <div className="min-w-0">
          <div className="text-sm font-bold text-[#1B254B] truncate">{e.name}</div>
          <div className="text-[11px] text-[#A3AED0] font-mono truncate">{e.id} · {e.level}</div>
        </div>
      </div>

      {/* Job + dept */}
      <div className="min-w-0">
        <div className="text-sm font-bold text-[#1B254B] truncate">{e.appliedFor}</div>
        <div className="text-[11px] text-[#707EAE] truncate">{e.dept} · {e.workLocation} · {e.directManager}</div>
      </div>

      {/* Stage */}
      <div>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
          {e.stage}
        </span>
      </div>

      {/* Hire / Probation */}
      <div className="min-w-0">
        {e.actualHireDate ? (
          <>
            <div className="text-xs text-[#1B254B] font-bold tabular-nums">{e.actualHireDate}</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-[#EDF2F7] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${probationPct}%`, background: tone.dot }}></div>
              </div>
              <span className="text-[10px] text-[#707EAE] font-bold tabular-nums w-8 text-right">D{Math.round(daysBetween(e.actualHireDate, todayStr()))}</span>
            </div>
          </>
        ) : (
          <div className="text-xs text-[#707EAE]">预计 {e.plannedHireDate}</div>
        )}
      </div>

      {/* Checklist */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 h-1.5 rounded-full bg-[#EDF2F7] overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? '#22C55E' : 'linear-gradient(90deg,#868CFF,#422AFB)' }}></div>
        </div>
        <span className="text-[10px] text-[#1B254B] font-bold tabular-nums">{done}/{total}</span>
      </div>

      {/* Risk */}
      <div className="text-center">
        {activeRisks.length === 0 ? (
          <span className="inline-block w-5 h-5 rounded-full bg-[#DCFCE7] text-[#15803D] text-[10px] font-bold leading-5">✓</span>
        ) : (
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold"
            style={highRisk ? { background: '#FEE2E2', color: '#B91C1C' } : { background: '#FEF3C7', color: '#92400E' }}
          >
            {activeRisks.length}
          </span>
        )}
      </div>

      {/* Action */}
      <div className="flex items-center justify-end gap-1">
        <button onClick={(ev) => { ev.stopPropagation(); onOpen(); }} className="text-xs font-bold text-[#422AFB] hover:underline">查看</button>
        <button onClick={(ev) => ev.stopPropagation()} className="w-7 h-7 rounded-md text-[#A3AED0] hover:bg-white hover:text-[#1B254B]"><I name="more-vertical" size={14} /></button>
      </div>
    </div>
  );
}

// ─────────────────────────── Date helpers ───────────────────────────
function todayStr() {
  return '2026-05-15';
}
function daysBetween(a, b) {
  const da = new Date(a), db = new Date(b);
  return (db - da) / (1000 * 60 * 60 * 24);
}

Object.assign(window, { NewHire, MESA_today: todayStr, MESA_daysBetween: daysBetween });
