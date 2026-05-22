// MESA Recruit · 现有人员 (Staff Directory)
// All on-roll employees across the company, organized by department.
// Click an employee → EmployeeDetail.

function Staff({ onOpenEmployee }) {
  const all = window.MESA_EMPLOYEES.filter((e) => e.stage !== '已离职');
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('all');
  const [stageFilter, setStageFilter] = useState('all'); // 'all' | 'regular' | 'probation'
  const [view, setView] = useState('grid');

  const deptListRef = useRef(null);

  const depts = Array.from(new Set(all.map((e) => e.dept)));
  // Group by top-level dept (before "·")
  const groupMap = {};
  depts.forEach((d) => {
    const top = d.split('·')[0].trim() || d;
    if (!groupMap[top]) groupMap[top] = [];
    groupMap[top].push(d);
  });
  const groups = Object.entries(groupMap);

  const filtered = all.filter((e) => {
    if (dept !== 'all' && !e.dept.startsWith(dept)) return false;
    if (stageFilter === 'regular' && e.stage !== '已转正') return false;
    if (stageFilter === 'probation' && !['试用期', '入职当天', '入职准备'].includes(e.stage)) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!(
        e.name.includes(query) ||
        e.appliedFor.includes(query) ||
        e.dept.includes(query) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(q))
      )) return false;
    }
    return true;
  });

  // Stats
  const totalCount = all.length;
  const inProbation = all.filter((e) => e.stage === '试用期' || e.stage === '入职当天' || e.stage === '入职准备').length;
  const regularized = all.filter((e) => e.stage === '已转正').length;

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTilePill icon="users"        label="在职员工"        value={totalCount}  accent="#422AFB" sub="全公司"             active={stageFilter === 'all'}       onClick={() => setStageFilter('all')} />
        <StatTilePill icon="user-check"   label="已转正"          value={regularized} accent="#22C55E" sub={`${Math.round(regularized / totalCount * 100)}% 占比`} active={stageFilter === 'regular'}   onClick={() => setStageFilter('regular')} />
        <StatTilePill icon="clock"        label="试用期/入职中"     value={inProbation} accent="#F59E0B" sub="重点关注"            active={stageFilter === 'probation'} onClick={() => setStageFilter('probation')} />
        <StatTilePill icon="building-2"   label="部门数"          value={depts.length} accent="#1D4ED8" sub={`${groups.length} 个一级部门`}                                            onClick={() => deptListRef.current && deptListRef.current.scrollIntoView({ block: 'nearest' })} />
      </div>

      {/* Filter bar + dept chips + view toggle */}
      <Card extra="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[260px] flex items-center gap-2 bg-[#F4F7FE] rounded-xl px-3 h-11">
            <I name="search" size={16} className="text-[#A0AEC0]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="姓名 / 工号 / 岗位 / 部门 / 标签"
              className="flex-1 bg-transparent text-sm text-[#1B254B] outline-none placeholder:text-[#A0AEC0]"
            />
            {query && <button onClick={() => setQuery('')}><I name="x" size={14} className="text-[#A3AED0]" /></button>}
          </div>

          <div className="flex items-center gap-1 bg-[#F4F7FE] rounded-xl p-1">
            <ViewBtn active={view === 'grid'} icon="layout-grid" onClick={() => setView('grid')} label="卡片" />
            <ViewBtn active={view === 'list'} icon="list" onClick={() => setView('list')} label="列表" />
          </div>

          <Button variant="ghost" size="md" icon={<I name="download" size={16} />}>导出花名册</Button>
        </div>

        {/* Department chips */}
        <div ref={deptListRef} className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-[#F1F3F8]">
          <DeptChip active={dept === 'all'} onClick={() => setDept('all')} label={`全部 (${totalCount})`} />
          {groups.map(([top, subs]) => {
            const count = all.filter((e) => e.dept.startsWith(top)).length;
            return <DeptChip key={top} active={dept === top} onClick={() => setDept(top)} label={`${top} (${count})`} />;
          })}
        </div>
      </Card>

      {/* Result count */}
      <div className="flex items-center justify-between px-2 -mt-1">
        <div className="text-sm text-[#707EAE]">
          共 <span className="font-bold text-[#1B254B]">{filtered.length}</span> 位员工
          {stageFilter === 'regular'   && <span> · 已转正</span>}
          {stageFilter === 'probation' && <span> · 试用期/入职中</span>}
          {dept !== 'all' && <span> · {dept}</span>}
          {query && <span> · 搜索"{query}"</span>}
        </div>
        <div className="flex items-center gap-2">
          {(stageFilter !== 'all' || dept !== 'all' || query) && (
            <button onClick={() => { setStageFilter('all'); setDept('all'); setQuery(''); }} className="text-xs font-bold text-[#422AFB] hover:underline flex items-center gap-1">
              <I name="x" size={11} />
              清空筛选
            </button>
          )}
          <span className="text-xs text-[#A3AED0]">点击员工卡片查看完整档案</span>
        </div>
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <Card extra="p-10 items-center text-center">
          <div className="w-14 h-14 rounded-full bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0] mx-auto">
            <I name="users" size={26} />
          </div>
          <p className="mt-3 text-sm text-[#707EAE]">没有匹配的员工。调整筛选或搜索条件。</p>
        </Card>
      ) : view === 'grid' ? (
        <StaffGrid employees={filtered} onOpen={onOpenEmployee} />
      ) : (
        <StaffList employees={filtered} onOpen={onOpenEmployee} />
      )}
    </div>
  );
}

// ─────────────────────────── Stat tile ───────────────────────────
function StatTilePill({ icon, label, value, sub, accent, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 p-5 rounded-[20px] bg-white text-left transition ${
        active
          ? 'ring-2 ring-[#422AFB] shadow-[14px_17px_40px_4px_rgba(66,42,251,0.10)]'
          : 'shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] hover:shadow-[14px_17px_40px_4px_rgba(66,42,251,0.10)]'
      }`}
    >
      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#F4F7FE', color: accent }}>
        <I name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">{label}</div>
        <div className="text-2xl font-bold text-[#1B254B] tabular-nums leading-tight">{value}</div>
        {sub && <div className="text-[11px] text-[#707EAE] mt-0.5">{sub}</div>}
      </div>
    </button>
  );
}

function ViewBtn({ active, icon, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold transition ${active ? 'bg-white text-[#1B254B] shadow-sm' : 'text-[#707EAE] hover:text-[#1B254B]'}`}
    >
      <I name={icon} size={14} />
      {label}
    </button>
  );
}

function DeptChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 h-8 rounded-lg text-xs font-bold transition ${
        active ? 'bg-[#422AFB] text-white shadow-[0_4px_14px_rgba(66,42,251,0.22)]' : 'bg-[#F4F7FE] text-[#1B254B] hover:bg-[#E9E3FF]/40'
      }`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────── Grid view ───────────────────────────
function StaffGrid({ employees, onOpen }) {
  const tones = window.MESA_HIRE_STAGE_TONE;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {employees.map((e) => {
        const tone = tones[e.stage];
        const yrs = e.actualHireDate ? (window.MESA_daysBetween(e.actualHireDate, window.MESA_today()) / 365).toFixed(1) : '—';
        return (
          <Card
            key={e.id}
            extra="p-5 cursor-pointer hover:shadow-[14px_17px_40px_4px_rgba(66,42,251,0.10)] transition"
            onClick={() => onOpen(e.id)}
          >
            <div className="flex items-start gap-3 mb-3">
              <Avatar src={e.avatar} name={e.name} size={48} gender={e.gender} animal={e.animal} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-[#1B254B] truncate">{e.name}</span>
                </div>
                <div className="text-[11px] text-[#A3AED0] font-mono">{e.id} · {e.level}</div>
              </div>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0" style={{ background: tone.bg, color: tone.fg }}>
                <span className="w-1 h-1 rounded-full" style={{ background: tone.dot }}></span>
                {e.stage}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-[#1B254B] font-bold truncate" title={e.appliedFor}>
                <I name="briefcase" size={11} className="text-[#A3AED0] shrink-0" />
                {e.appliedFor}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#707EAE] truncate" title={e.dept}>
                <I name="building-2" size={11} className="text-[#A3AED0] shrink-0" />
                {e.dept}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#707EAE]">
                <I name="map-pin" size={11} className="text-[#A3AED0] shrink-0" />
                {e.workLocation} · 司龄 {yrs}y
              </div>
            </div>
            {(e.tags || []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#F1F3F8] flex flex-wrap gap-1">
                {e.tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-[10px] font-medium text-[#707EAE] bg-[#F4F7FE] px-1.5 py-0.5 rounded">{t}</span>
                ))}
                {e.tags.length > 3 && <span className="text-[10px] text-[#A3AED0]">+{e.tags.length - 3}</span>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────── List view ───────────────────────────
function StaffList({ employees, onOpen }) {
  const tones = window.MESA_HIRE_STAGE_TONE;
  return (
    <Card extra="p-0 overflow-hidden">
      <div className="grid grid-cols-[2fr_1.4fr_1.4fr_1fr_0.6fr_0.6fr] gap-3 px-5 py-3 border-b border-[#F1F3F8] text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] bg-[#F8FAFF]">
        <span>员工</span>
        <span>岗位</span>
        <span>部门</span>
        <span>入职日期</span>
        <span>状态</span>
        <span className="text-right">操作</span>
      </div>
      {employees.map((e) => {
        const tone = tones[e.stage];
        return (
          <div
            key={e.id}
            onClick={() => onOpen(e.id)}
            className="grid grid-cols-[2fr_1.4fr_1.4fr_1fr_0.6fr_0.6fr] gap-3 items-center px-5 py-3.5 border-b border-[#F1F3F8] hover:bg-[#F4F7FE]/50 cursor-pointer transition last:border-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar src={e.avatar} name={e.name} size={36} gender={e.gender} animal={e.animal} />
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#1B254B] truncate">{e.name}</div>
                <div className="text-[11px] text-[#A3AED0] font-mono truncate">{e.id} · {e.level}</div>
              </div>
            </div>
            <div className="text-xs text-[#1B254B] font-bold truncate" title={e.appliedFor}>{e.appliedFor}</div>
            <div className="text-xs text-[#707EAE] truncate" title={e.dept}>{e.dept}</div>
            <div className="text-xs text-[#1B254B] font-bold tabular-nums">{e.actualHireDate || '—'}</div>
            <div>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap" style={{ background: tone.bg, color: tone.fg }}>
                <span className="w-1 h-1 rounded-full" style={{ background: tone.dot }}></span>
                {e.stage}
              </span>
            </div>
            <div className="text-right">
              <button onClick={(ev) => { ev.stopPropagation(); onOpen(e.id); }} className="text-xs font-bold text-[#422AFB] hover:underline">查看 →</button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

Object.assign(window, { Staff });
