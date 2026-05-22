// MESA Recruit · 面试安排
// Buckets: 今天 / 即将到来 / 已完成 / 例外（取消+改期）
// Plus a week-grid view, status filters, 详情 + 反馈 + 新建 Modal.

function Interviews({ onOpenCandidate, scheduleRequest, onConsumeRequest }) {
  const [tick, setTick] = useState(0);
  const [view, setView] = useState('list'); // 'list' | 'week'
  const [statusFilter, setStatusFilter] = useState('all'); // all | 已安排 | 已完成 | 已取消 | 已改期
  const [modeFilter, setModeFilter] = useState('all'); // all | video | onsite | phone
  const [mineOnly, setMineOnly] = useState(false);
  const [query, setQuery] = useState('');

  // Drawer-as-Modal state
  const [detailId, setDetailId] = useState(null);
  const [feedbackId, setFeedbackId] = useState(null);
  const [rescheduleId, setRescheduleId] = useState(null);
  const [cancelId, setCancelId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState(null);

  // External hand-off (Dashboard / CandidateDetail 「安排面试」总是打开 Create Modal，可选预填候选人)
  useEffect(() => {
    if (!scheduleRequest) return;
    setCreatePrefill(scheduleRequest.candidateId ? { candidateId: scheduleRequest.candidateId } : null);
    setCreateOpen(true);
    onConsumeRequest && onConsumeRequest();
  }, [scheduleRequest, onConsumeRequest]);

  const today = window.MESA_TODAY || '2026-05-15';
  const me = window.MESA_CURRENT_USER_ID;
  const accounts = window.MESA_ACCOUNTS || [];
  const candidates = window.MESA_CANDIDATES || [];
  const jobs = window.MESA_JOBS || [];

  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const candidateById = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const jobById = Object.fromEntries(jobs.map((j) => [j.id, j]));

  // Reading window.MESA_INTERVIEWS each render; tick forces re-evaluation after mutation.
  const all = window.MESA_INTERVIEWS;
  void tick;

  const filtered = all.filter((iv) => {
    if (statusFilter !== 'all' && iv.status !== statusFilter) return false;
    if (modeFilter !== 'all' && iv.mode !== modeFilter) return false;
    if (mineOnly && !iv.interviewers.includes(me)) return false;
    if (query) {
      const q = query.toLowerCase();
      const c = candidateById[iv.candidateId];
      const j = jobById[iv.jobId];
      const ivers = iv.interviewers.map((id) => accountById[id]?.name || '').join('');
      const hit =
        (c?.name || '').includes(query) ||
        (j?.title || '').includes(query) ||
        ivers.includes(query) ||
        iv.round.toLowerCase().includes(q) ||
        (iv.location || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  // Bucket
  const todayList    = filtered.filter((iv) => iv.date === today && ['已安排', '进行中'].includes(iv.status))
                               .sort(byTimeAsc);
  const upcomingList = filtered.filter((iv) => iv.date > today && ['已安排'].includes(iv.status))
                               .sort(byTimeAsc);
  const doneList     = filtered.filter((iv) => iv.status === '已完成')
                               .sort(byTimeDesc);
  const exceptionList= filtered.filter((iv) => ['已取消', '已改期'].includes(iv.status))
                               .sort(byTimeDesc);

  // Counts (independent of filters)
  const allTodayCount = all.filter((iv) => iv.date === today && ['已安排', '进行中'].includes(iv.status)).length;
  const allThisWeekCount = (() => {
    const { start, end } = weekRange(today);
    return all.filter((iv) => iv.date >= start && iv.date <= end && ['已安排', '进行中'].includes(iv.status)).length;
  })();
  const allDoneMonth = all.filter((iv) => iv.status === '已完成' && iv.date.startsWith(today.slice(0,7))).length;
  const allPendingFeedback = all.filter((iv) => iv.status === '已完成' && !iv.feedback).length;

  // Mutations
  function bump() { setTick((t) => t + 1); }
  function patch(id, partial) {
    const idx = all.findIndex((x) => x.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...partial }; bump(); }
  }
  function append(rec) {
    all.unshift(rec);
    bump();
  }

  function clearFilters() {
    setStatusFilter('all'); setModeFilter('all'); setMineOnly(false); setQuery('');
  }
  const hasFilter = statusFilter !== 'all' || modeFilter !== 'all' || mineOnly || query;

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Top stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <IvStat
          icon="calendar-clock" label="今日面试" value={allTodayCount}
          accent="#422AFB" sub={`${formatDateCN(today)} · 周${weekdayCN(today)}`}
          active={statusFilter === 'all' && !mineOnly}
          onClick={() => { clearFilters(); }}
        />
        <IvStat
          icon="calendar-days" label="本周已安排" value={allThisWeekCount}
          accent="#1D4ED8" sub={(() => { const r = weekRange(today); return `${formatRange(r.start, r.end)}`; })()}
          active={statusFilter === '已安排'}
          onClick={() => setStatusFilter('已安排')}
        />
        <IvStat
          icon="check-circle-2" label="本月已完成" value={allDoneMonth}
          accent="#22C55E" sub="带评分与建议"
          active={statusFilter === '已完成'}
          onClick={() => setStatusFilter('已完成')}
        />
        <IvStat
          icon="clipboard-edit" label="待补反馈" value={allPendingFeedback}
          accent="#F59E0B" sub="点击查看待评估"
          active={false}
          onClick={() => setStatusFilter('已完成')}
        />
      </div>

      {/* Filter / toolbar */}
      <Card extra="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[260px] flex items-center gap-2 bg-[#F4F7FE] rounded-xl px-3 h-11">
            <I name="search" size={16} className="text-[#A0AEC0]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="候选人 / 岗位 / 面试官 / 地点"
              className="flex-1 bg-transparent text-sm text-[#1B254B] outline-none placeholder:text-[#A0AEC0]"
            />
            {query && <button onClick={() => setQuery('')}><I name="x" size={14} className="text-[#A3AED0]" /></button>}
          </div>

          <div className="flex items-center gap-1 bg-[#F4F7FE] rounded-xl p-1">
            <ViewToggle active={view === 'list'} icon="list" onClick={() => setView('list')} label="列表" />
            <ViewToggle active={view === 'week'} icon="calendar-range" onClick={() => setView('week')} label="周历" />
          </div>

          <button
            onClick={() => setMineOnly((m) => !m)}
            className={`h-11 px-4 rounded-xl text-sm font-bold flex items-center gap-2 transition ${mineOnly ? 'bg-[#422AFB] text-white shadow-[0_4px_14px_rgba(66,42,251,0.22)]' : 'bg-[#F4F7FE] text-[#1B254B] hover:bg-[#E9E3FF]/40'}`}
          >
            <I name={mineOnly ? 'check' : 'user'} size={14} />
            只看我的
          </button>

          <Button
            variant="primary" size="md"
            icon={<I name="calendar-plus" size={16} />}
            onClick={() => { setCreatePrefill(null); setCreateOpen(true); }}
          >
            安排面试
          </Button>
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-[#F1F3F8]">
          <ChipPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label={`全部 (${all.length})`} />
          {['已安排', '已完成', '已改期', '已取消'].map((s) => {
            const n = all.filter((iv) => iv.status === s).length;
            const t = window.MESA_INTERVIEW_STATUS_TONE[s];
            return (
              <ChipPill
                key={s} active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                tone={t}
                label={`${s} (${n})`}
              />
            );
          })}
          <span className="mx-2 h-5 w-px bg-[#E9ECEF]"></span>
          <ChipPill active={modeFilter === 'all'} onClick={() => setModeFilter('all')} label="任意形式" />
          {Object.entries(window.MESA_INTERVIEW_MODE).map(([k, m]) => (
            <ChipPill
              key={k}
              active={modeFilter === k}
              onClick={() => setModeFilter(k)}
              icon={m.icon}
              label={m.label}
            />
          ))}
        </div>
      </Card>

      {/* Result count */}
      <div className="flex items-center justify-between px-2 -mt-1">
        <div className="text-sm text-[#707EAE]">
          共 <span className="font-bold text-[#1B254B]">{filtered.length}</span> 场面试
          {statusFilter !== 'all' && <span> · {statusFilter}</span>}
          {modeFilter !== 'all' && <span> · {window.MESA_INTERVIEW_MODE[modeFilter].label}</span>}
          {mineOnly && <span> · 仅我参与</span>}
          {query && <span> · 搜索"{query}"</span>}
        </div>
        {hasFilter && (
          <button onClick={clearFilters} className="text-xs font-bold text-[#422AFB] hover:underline flex items-center gap-1">
            <I name="x" size={11} />
            清空筛选
          </button>
        )}
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <Card extra="p-12 items-center text-center">
          <div className="w-14 h-14 rounded-full bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0] mx-auto">
            <I name="calendar" size={26} />
          </div>
          <p className="mt-3 text-sm text-[#707EAE]">当前条件下没有面试。试试清空筛选或安排一场新面试 ~</p>
          <div className="mt-4 inline-flex">
            <Button
              variant="primary" size="md"
              icon={<I name="calendar-plus" size={16} />}
              onClick={() => { setCreatePrefill(null); setCreateOpen(true); }}
            >
              安排面试
            </Button>
          </div>
        </Card>
      ) : view === 'list' ? (
        <ListView
          buckets={[
            { key: 'today',     title: '今日',         icon: 'calendar-clock', accent: '#422AFB', list: todayList,    emptyHint: '今天暂无安排。' },
            { key: 'upcoming',  title: '即将到来',     icon: 'calendar-days',  accent: '#1D4ED8', list: upcomingList, emptyHint: '近期没有已安排面试。' },
            { key: 'done',      title: '已完成',       icon: 'check-circle-2', accent: '#22C55E', list: doneList,     emptyHint: '没有已完成的面试。' },
            { key: 'exception', title: '取消 / 改期',  icon: 'calendar-x',     accent: '#F59E0B', list: exceptionList,emptyHint: '没有异常面试。' },
          ]}
          accountById={accountById}
          candidateById={candidateById}
          jobById={jobById}
          today={today}
          onOpenCandidate={onOpenCandidate}
          onOpenDetail={(id) => setDetailId(id)}
          onAddFeedback={(id) => setFeedbackId(id)}
          onReschedule={(id) => setRescheduleId(id)}
          onCancel={(id) => setCancelId(id)}
          onMarkInProgress={(id) => patch(id, { status: '进行中' })}
        />
      ) : (
        <WeekView
          interviews={filtered}
          today={today}
          accountById={accountById}
          candidateById={candidateById}
          jobById={jobById}
          onOpenDetail={(id) => setDetailId(id)}
        />
      )}

      {/* Detail */}
      <DetailModal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        interview={all.find((x) => x.id === detailId)}
        accountById={accountById}
        candidateById={candidateById}
        jobById={jobById}
        onOpenCandidate={(cid) => { setDetailId(null); onOpenCandidate && onOpenCandidate(cid); }}
        onEditFeedback={(id) => { setDetailId(null); setFeedbackId(id); }}
        onReschedule={(id) => { setDetailId(null); setRescheduleId(id); }}
        onCancel={(id) => { setDetailId(null); setCancelId(id); }}
      />

      {/* Feedback */}
      <FeedbackModal
        open={!!feedbackId}
        onClose={() => setFeedbackId(null)}
        interview={all.find((x) => x.id === feedbackId)}
        candidateById={candidateById}
        onSubmit={(payload) => {
          patch(feedbackId, { status: '已完成', feedback: payload });
          setFeedbackId(null);
        }}
      />

      {/* Reschedule */}
      <RescheduleModal
        open={!!rescheduleId}
        onClose={() => setRescheduleId(null)}
        interview={all.find((x) => x.id === rescheduleId)}
        onSubmit={({ date, start, end, reason }) => {
          const iv = all.find((x) => x.id === rescheduleId);
          patch(rescheduleId, {
            status: '已改期',
            date, start, end,
            reschedule: { from: `${iv.date} ${iv.start}`, to: `${date} ${start}`, reason },
          });
          setRescheduleId(null);
        }}
      />

      {/* Cancel */}
      <CancelModal
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        interview={all.find((x) => x.id === cancelId)}
        candidateById={candidateById}
        onConfirm={(reason) => { patch(cancelId, { status: '已取消', cancelReason: reason }); setCancelId(null); }}
      />

      {/* Create */}
      <CreateModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreatePrefill(null); }}
        prefill={createPrefill}
        candidates={candidates}
        jobs={jobs}
        accounts={accounts}
        today={today}
        onSubmit={(rec) => { append(rec); setCreateOpen(false); setCreatePrefill(null); }}
      />
    </div>
  );
}

// ─────────────────────────── Bucket list view ───────────────────────────
function ListView({ buckets, today, accountById, candidateById, jobById, onOpenCandidate, onOpenDetail, onAddFeedback, onReschedule, onCancel, onMarkInProgress }) {
  return (
    <div className="flex flex-col gap-5">
      {buckets.filter((b) => b.list.length > 0).map((b) => (
        <Card key={b.key} extra="p-6">
          <header className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#F4F7FE', color: b.accent }}>
                <I name={b.icon} size={18} />
              </span>
              <div>
                <div className="text-base font-bold text-[#1B254B]">{b.title}</div>
                <div className="text-[11px] text-[#A3AED0] font-medium">{b.list.length} 场</div>
              </div>
            </div>
          </header>

          <div className="flex flex-col gap-2">
            {b.list.map((iv) => (
              <InterviewRow
                key={iv.id}
                iv={iv}
                today={today}
                bucket={b.key}
                accountById={accountById}
                candidateById={candidateById}
                jobById={jobById}
                onOpenCandidate={onOpenCandidate}
                onOpenDetail={onOpenDetail}
                onAddFeedback={onAddFeedback}
                onReschedule={onReschedule}
                onCancel={onCancel}
                onMarkInProgress={onMarkInProgress}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function InterviewRow({ iv, today, bucket, accountById, candidateById, jobById, onOpenCandidate, onOpenDetail, onAddFeedback, onReschedule, onCancel, onMarkInProgress }) {
  const c = candidateById[iv.candidateId];
  const j = jobById[iv.jobId];
  const mode = window.MESA_INTERVIEW_MODE[iv.mode] || window.MESA_INTERVIEW_MODE.video;
  const tone = window.MESA_INTERVIEW_STATUS_TONE[iv.status];
  const ivers = iv.interviewers.map((id) => accountById[id]).filter(Boolean);
  const isPast = iv.date < today;
  const showStart = bucket === 'today' && iv.status === '已安排';

  return (
    <div className="flex items-center gap-4 p-3 rounded-2xl bg-white hover:bg-[#F8FAFE] transition group ring-1 ring-transparent hover:ring-[#E9ECEF]/80">
      {/* Date / time block */}
      <button
        onClick={() => onOpenDetail(iv.id)}
        className="text-left shrink-0 w-[88px] rounded-xl px-3 py-2.5 bg-[#F4F7FE]"
      >
        <div className="text-[10px] font-bold text-[#A3AED0] uppercase tracking-wide">
          {bucket === 'today' ? '今天' : formatDateShort(iv.date)}
        </div>
        <div className="font-mono font-bold text-[#1B254B] text-lg leading-tight tabular-nums">{iv.start}</div>
        <div className="text-[10px] text-[#A3AED0] font-medium">至 {iv.end}</div>
      </button>

      {/* Mode */}
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: mode.bg, color: mode.fg }}
        title={mode.label}
      >
        <I name={mode.icon} size={16} />
      </span>

      {/* Candidate + job */}
      <button
        onClick={() => onOpenCandidate && onOpenCandidate(iv.candidateId)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-90"
      >
        {c ? <Avatar src={c.avatar} name={c.name} size={40} gender={c.gender} animal={c.animal} /> : null}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-sm text-[#1B254B] truncate">{c?.name || iv.candidateId}</span>
            <Tag tone="brand">{iv.round}</Tag>
            {c && <span className="text-[10px] font-bold text-[#707EAE] bg-[#F4F7FE] px-1.5 py-0.5 rounded">{c.education}</span>}
          </div>
          <div className="text-xs text-[#707EAE] mt-0.5 truncate">
            {j ? <span className="text-[#1B254B] font-medium">{j.title}</span> : iv.jobId}
            <span> · {iv.location}</span>
          </div>
        </div>
      </button>

      {/* Interviewers */}
      <div className="hidden md:flex flex-col items-end shrink-0">
        <div className="text-[10px] font-bold text-[#A3AED0] uppercase tracking-wide mb-1">面试官</div>
        <div className="flex items-center -space-x-2">
          {ivers.map((u) => (
            <img
              key={u.id}
              src={u.avatar}
              title={`${u.name} · ${u.title || ''}`}
              className="w-7 h-7 rounded-full ring-2 ring-white object-cover"
            />
          ))}
        </div>
      </div>

      {/* Status pill */}
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap shrink-0"
        style={{ background: tone.bg, color: tone.fg }}
      >
        <I name={tone.icon} size={11} />
        {iv.status}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {showStart && (
          <button
            onClick={() => onMarkInProgress(iv.id)}
            className="px-3 h-9 rounded-lg text-xs font-bold text-[#422AFB] hover:bg-[#E9E3FF]/50 flex items-center gap-1.5"
            title="标记进行中"
          >
            <I name="play" size={12} />
            开始
          </button>
        )}
        {(iv.status === '进行中' || (isPast && iv.status === '已安排')) && (
          <button
            onClick={() => onAddFeedback(iv.id)}
            className="px-3 h-9 rounded-lg text-xs font-bold text-white bg-[#422AFB] hover:bg-[#3311DB] flex items-center gap-1.5"
          >
            <I name="clipboard-edit" size={12} />
            填反馈
          </button>
        )}
        {iv.status === '已完成' && !iv.feedback && (
          <button
            onClick={() => onAddFeedback(iv.id)}
            className="px-3 h-9 rounded-lg text-xs font-bold text-white bg-[#F59E0B] hover:bg-[#D97706] flex items-center gap-1.5"
          >
            <I name="clipboard-edit" size={12} />
            补反馈
          </button>
        )}
        <button
          onClick={() => onOpenDetail(iv.id)}
          className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#707EAE]"
          title="查看详情"
        >
          <I name="eye" size={15} />
        </button>
        {['已安排', '进行中'].includes(iv.status) && (
          <>
            <button
              onClick={() => onReschedule(iv.id)}
              className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#707EAE]"
              title="改期"
            >
              <I name="calendar-x" size={15} />
            </button>
            <button
              onClick={() => onCancel(iv.id)}
              className="w-9 h-9 rounded-lg hover:bg-[#FEE2E2] hover:text-[#B91C1C] flex items-center justify-center text-[#707EAE]"
              title="取消"
            >
              <I name="x" size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Week view ───────────────────────────
function WeekView({ interviews, today, accountById, candidateById, jobById, onOpenDetail }) {
  // 5 weekdays Mon–Fri starting from this week's Monday
  const monday = mondayOf(today);
  const days = Array.from({ length: 5 }, (_, i) => addDays(monday, i));

  return (
    <Card extra="p-6">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#F4F7FE] text-[#422AFB]">
            <I name="calendar-range" size={18} />
          </span>
          <div>
            <div className="text-base font-bold text-[#1B254B]">本周面试</div>
            <div className="text-[11px] text-[#A3AED0] font-medium">{formatRange(days[0], days[4])} · 周一 – 周五</div>
          </div>
        </div>
        <div className="text-[11px] text-[#A3AED0]">点击卡片查看详情</div>
      </header>

      <div className="grid grid-cols-5 gap-3 min-h-[420px]">
        {days.map((d) => {
          const list = interviews
            .filter((iv) => iv.date === d)
            .sort(byTimeAsc);
          const isToday = d === today;
          return (
            <div
              key={d}
              className={`rounded-2xl p-3 flex flex-col gap-2 ${isToday ? 'bg-[#E9E3FF]/30 ring-1 ring-[#422AFB]/40' : 'bg-[#F4F7FE]'}`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <div className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? 'text-[#422AFB]' : 'text-[#A3AED0]'}`}>
                    周{weekdayCN(d)}
                  </div>
                  <div className="text-base font-bold text-[#1B254B] tabular-nums">{d.slice(5)}</div>
                </div>
                {list.length > 0 && (
                  <span className="text-[10px] font-bold text-[#1B254B] bg-white px-1.5 py-0.5 rounded">{list.length}</span>
                )}
              </div>
              {list.length === 0 ? (
                <div className="text-[11px] text-[#A3AED0] text-center py-6">—</div>
              ) : list.map((iv) => {
                const c = candidateById[iv.candidateId];
                const tone = window.MESA_INTERVIEW_STATUS_TONE[iv.status];
                const mode = window.MESA_INTERVIEW_MODE[iv.mode] || window.MESA_INTERVIEW_MODE.video;
                return (
                  <button
                    key={iv.id}
                    onClick={() => onOpenDetail(iv.id)}
                    className="text-left rounded-xl bg-white p-2.5 hover:shadow-md transition border-l-[3px]"
                    style={{ borderLeftColor: tone.dot }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono font-bold text-[#1B254B] text-xs tabular-nums">{iv.start}</div>
                      <span style={{ color: mode.fg }}>
                        <I name={mode.icon} size={11} />
                      </span>
                    </div>
                    <div className="text-xs font-bold text-[#1B254B] truncate mt-1">{c?.name || iv.candidateId}</div>
                    <div className="text-[10px] text-[#707EAE] truncate">{iv.round} · {jobById[iv.jobId]?.title || ''}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─────────────────────────── Detail Modal ───────────────────────────
function DetailModal({ open, onClose, interview, accountById, candidateById, jobById, onOpenCandidate, onEditFeedback, onReschedule, onCancel }) {
  if (!interview) return null;
  const iv = interview;
  const c = candidateById[iv.candidateId];
  const j = jobById[iv.jobId];
  const mode = window.MESA_INTERVIEW_MODE[iv.mode] || window.MESA_INTERVIEW_MODE.video;
  const tone = window.MESA_INTERVIEW_STATUS_TONE[iv.status];
  const ivers = iv.interviewers.map((id) => accountById[id]).filter(Boolean);
  const rec = iv.feedback ? window.MESA_INTERVIEW_RECOMMENDATION[iv.feedback.recommendation] : null;

  return (
    <Modal open={open} onClose={onClose} width={780}>
      <div className="p-6 flex items-start justify-between border-b border-[#E9ECEF]">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: mode.bg, color: mode.fg }}>
            <I name={mode.icon} size={22} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-[#1B254B]">{c?.name || iv.candidateId}</span>
              <Tag tone="brand">{iv.round}</Tag>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <I name={tone.icon} size={11} />
                {iv.status}
              </span>
            </div>
            <div className="text-sm text-[#707EAE] mt-1">
              {j?.title || iv.jobId} · {formatDateCN(iv.date)} 周{weekdayCN(iv.date)} {iv.start} – {iv.end}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-[#A3AED0] hover:text-[#1B254B]"><I name="x" size={20} /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Left: 面试基本信息 */}
          <div className="p-6 md:border-r md:border-[#E9ECEF]">
            <SectionTitle>面试信息</SectionTitle>
            <DescRow label="形式">
              <span className="inline-flex items-center gap-1 text-sm text-[#1B254B] font-medium">
                <span style={{ color: mode.fg }}><I name={mode.icon} size={13} /></span>
                {mode.label}
              </span>
            </DescRow>
            <DescRow label="地点 / 链接">
              <span className="text-sm text-[#1B254B] font-medium break-all">{iv.location}</span>
            </DescRow>
            <DescRow label="面试官">
              <div className="flex items-center gap-2 flex-wrap">
                {ivers.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 bg-[#F4F7FE] rounded-lg pl-1 pr-2.5 py-1">
                    <img src={u.avatar} className="w-5 h-5 rounded-full object-cover" />
                    <span className="text-xs font-bold text-[#1B254B]">{u.name}</span>
                    <span className="text-[10px] text-[#707EAE]">{u.title}</span>
                  </span>
                ))}
              </div>
            </DescRow>
            <DescRow label="备注">
              <span className="text-sm text-[#1B254B]">{iv.notes || '—'}</span>
            </DescRow>
            <DescRow label="发起人">
              <span className="text-sm text-[#1B254B]">{accountById[iv.createdBy]?.name || iv.createdBy} · {iv.createdAt}</span>
            </DescRow>

            {iv.reschedule && (
              <div className="mt-3 p-3 rounded-xl bg-[#FEF3C7]/60 border border-[#FCD34D]/60 text-xs">
                <div className="font-bold text-[#92400E] mb-1 flex items-center gap-1"><I name="calendar-x" size={12} />已改期</div>
                <div className="text-[#92400E]">
                  {iv.reschedule.from} → {iv.reschedule.to}
                  <div className="mt-0.5 opacity-80">原因：{iv.reschedule.reason}</div>
                </div>
              </div>
            )}
            {iv.cancelReason && (
              <div className="mt-3 p-3 rounded-xl bg-[#FEE2E2]/70 border border-[#FCA5A5]/60 text-xs text-[#B91C1C]">
                <div className="font-bold mb-1 flex items-center gap-1"><I name="x-circle" size={12} />已取消</div>
                <div>原因：{iv.cancelReason}</div>
              </div>
            )}
          </div>

          {/* Right: 候选人 + 反馈 */}
          <div className="p-6">
            <SectionTitle>候选人快照</SectionTitle>
            {c ? (
              <button onClick={() => onOpenCandidate(c.id)} className="w-full text-left p-3 rounded-2xl bg-[#F4F7FE] hover:bg-[#E9E3FF]/40 transition flex items-center gap-3">
                <Avatar src={c.avatar} name={c.name} size={48} gender={c.gender} animal={c.animal} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1B254B] text-sm truncate">{c.name}</span>
                    <span className="text-[10px] font-bold text-[#707EAE] bg-white px-1.5 py-0.5 rounded">{c.education}</span>
                  </div>
                  <div className="text-[11px] text-[#707EAE] mt-0.5 truncate">{c.school} · {c.major} · {c.yearsExp}y</div>
                </div>
                <MatchRing value={c.jdMatch} size={40} stroke={5} showLabel={false} animate={false} />
                <I name="arrow-up-right" size={14} className="text-[#A3AED0]" />
              </button>
            ) : (
              <div className="text-sm text-[#707EAE]">未找到候选人 {iv.candidateId}</div>
            )}

            <div className="mt-5">
              <SectionTitle>面试反馈</SectionTitle>
              {iv.feedback ? (
                <div className="p-4 rounded-2xl bg-[#F4F7FE]">
                  <div className="flex items-center justify-between">
                    <Rating value={iv.feedback.rating} />
                    {rec && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{ background: rec.bg, color: rec.fg }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: rec.dot }}></span>
                        {rec.label}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#1B254B] leading-relaxed mt-3 whitespace-pre-line">{iv.feedback.summary}</p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#FEF3C7]/60 border border-[#FCD34D]/40 text-sm text-[#92400E]">
                  尚未提交反馈。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[#E9ECEF] flex items-center justify-end gap-2 bg-[#F8FAFE]">
        {['已安排', '进行中'].includes(iv.status) && (
          <>
            <Button variant="ghost" size="sm" icon={<I name="calendar-x" size={14} />} onClick={() => onReschedule(iv.id)}>改期</Button>
            <Button variant="danger" size="sm" icon={<I name="x" size={14} />} onClick={() => onCancel(iv.id)}>取消面试</Button>
          </>
        )}
        {['已安排', '进行中', '已完成'].includes(iv.status) && (
          <Button variant="primary" size="sm" icon={<I name="clipboard-edit" size={14} />} onClick={() => onEditFeedback(iv.id)}>
            {iv.feedback ? '编辑反馈' : '填写反馈'}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>关闭</Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────── Feedback Modal ───────────────────────────
function FeedbackModal({ open, onClose, interview, candidateById, onSubmit }) {
  const [rating, setRating] = useState(4);
  const [summary, setSummary] = useState('');
  const [recommendation, setRecommendation] = useState('pass');

  useEffect(() => {
    if (interview && interview.feedback) {
      setRating(interview.feedback.rating || 4);
      setSummary(interview.feedback.summary || '');
      setRecommendation(interview.feedback.recommendation || 'pass');
    } else {
      setRating(4); setSummary(''); setRecommendation('pass');
    }
  }, [interview]);

  if (!interview) return null;
  const c = candidateById[interview.candidateId];

  return (
    <Modal open={open} onClose={onClose} width={620}>
      <div className="p-6 border-b border-[#E9ECEF]">
        <div className="flex items-center gap-2 text-sm text-[#707EAE]">
          <I name="clipboard-edit" size={14} className="text-[#422AFB]" />
          面试反馈
        </div>
        <div className="text-xl font-bold text-[#1B254B] mt-1">{c?.name} · {interview.round}</div>
        <div className="text-xs text-[#A3AED0] mt-0.5">{formatDateCN(interview.date)} {interview.start} – {interview.end}</div>
      </div>

      <div className="p-6 flex flex-col gap-5 overflow-y-auto">
        <Field label="评分">
          <RatingInput value={rating} onChange={setRating} />
        </Field>

        <Field label="评语 / 总结">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="技术能力、沟通、文化契合度、风险点…"
            className="w-full min-h-[120px] p-3 rounded-xl border border-[#E9ECEF] text-sm outline-none focus:border-[#422AFB] resize-y"
          />
        </Field>

        <Field label="建议">
          <div className="flex items-center gap-2">
            {Object.entries(window.MESA_INTERVIEW_RECOMMENDATION).map(([k, r]) => (
              <button
                key={k}
                onClick={() => setRecommendation(k)}
                className={`flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-bold transition ${recommendation === k ? '' : 'opacity-60 hover:opacity-100'}`}
                style={{ background: r.bg, color: r.fg, outline: recommendation === k ? `2px solid ${r.dot}` : 'none' }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.dot }}></span>
                {r.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="p-4 border-t border-[#E9ECEF] flex items-center justify-end gap-2 bg-[#F8FAFE]">
        <Button variant="secondary" size="sm" onClick={onClose}>取消</Button>
        <Button
          variant="primary" size="sm"
          icon={<I name="check" size={14} />}
          onClick={() => onSubmit({ rating, summary: summary.trim() || '（无）', recommendation })}
        >
          保存反馈
        </Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────── Reschedule Modal ───────────────────────────
function RescheduleModal({ open, onClose, interview, onSubmit }) {
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (interview) {
      setDate(interview.date); setStart(interview.start); setEnd(interview.end); setReason('');
    }
  }, [interview]);

  if (!interview) return null;

  return (
    <Modal open={open} onClose={onClose} width={520}>
      <div className="p-6 border-b border-[#E9ECEF]">
        <div className="flex items-center gap-2 text-sm text-[#707EAE]">
          <I name="calendar-x" size={14} className="text-[#F59E0B]" />
          改期
        </div>
        <div className="text-xl font-bold text-[#1B254B] mt-1">{interview.round}</div>
        <div className="text-xs text-[#A3AED0] mt-0.5">原时间：{interview.date} {interview.start} – {interview.end}</div>
      </div>
      <div className="p-6 flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="新日期"><HtmlInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="开始"><HtmlInput type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="结束"><HtmlInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="原因">
          <HtmlInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：候选人出差冲突" />
        </Field>
      </div>
      <div className="p-4 border-t border-[#E9ECEF] flex items-center justify-end gap-2 bg-[#F8FAFE]">
        <Button variant="secondary" size="sm" onClick={onClose}>取消</Button>
        <Button
          variant="primary" size="sm"
          icon={<I name="check" size={14} />}
          onClick={() => onSubmit({ date, start, end, reason: reason || '未填写' })}
        >
          确认改期
        </Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────── Cancel Modal ───────────────────────────
function CancelModal({ open, onClose, interview, candidateById, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => { setReason(''); }, [interview]);
  if (!interview) return null;
  const c = candidateById[interview.candidateId];
  return (
    <Modal open={open} onClose={onClose} width={460}>
      <div className="p-6">
        <div className="w-12 h-12 rounded-full bg-[#FEE2E2] text-[#B91C1C] flex items-center justify-center mb-3">
          <I name="alert-triangle" size={22} />
        </div>
        <div className="text-lg font-bold text-[#1B254B]">取消面试？</div>
        <div className="text-sm text-[#707EAE] mt-1">
          将取消 <span className="font-bold text-[#1B254B]">{c?.name}</span> 的 {interview.round}（{interview.date} {interview.start}）。取消后候选人和面试官都会收到通知。
        </div>
        <div className="mt-4">
          <Field label="取消原因（可选）">
            <HtmlInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：候选人已接 offer" />
          </Field>
        </div>
      </div>
      <div className="p-4 border-t border-[#E9ECEF] flex items-center justify-end gap-2 bg-[#F8FAFE]">
        <Button variant="secondary" size="sm" onClick={onClose}>再想想</Button>
        <Button variant="danger" size="sm" icon={<I name="x" size={14} />} onClick={() => onConfirm(reason || '未填写')}>
          确认取消
        </Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────── Create Modal ───────────────────────────
function CreateModal({ open, onClose, prefill, candidates, jobs, accounts, today, onSubmit }) {
  const [candidateId, setCandidateId] = useState('');
  const [jobId, setJobId] = useState('');
  const [round, setRound] = useState('一面');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [mode, setMode] = useState('video');
  const [location, setLocation] = useState('');
  const [interviewers, setInterviewers] = useState([]);
  const [notes, setNotes] = useState('');
  const [candSearch, setCandSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const pre = prefill && prefill.candidateId ? prefill.candidateId : '';
    const preC = pre ? candidates.find((c) => c.id === pre) : null;
    setCandidateId(pre);
    const matchedJob = preC ? jobs.find((j) => j.title === preC.appliedFor) : null;
    setJobId(matchedJob ? matchedJob.id : '');
    setRound('一面'); setMode('video'); setLocation(''); setNotes('');
    setInterviewers([]); setCandSearch('');
    // Default date: tomorrow
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    setDate(t.toISOString().slice(0, 10));
    setStart('10:00'); setEnd('11:00');
  }, [open, prefill, today, candidates, jobs]);

  if (!open) return null;
  const cand = candidates.find((c) => c.id === candidateId);

  const filteredCands = !candSearch ? candidates.slice(0, 8) : candidates.filter((c) =>
    c.name.includes(candSearch) || c.appliedFor.includes(candSearch)
  ).slice(0, 12);

  function toggleIver(id) {
    setInterviewers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const canSubmit = candidateId && jobId && date && start && end && interviewers.length > 0;

  function submit() {
    if (!canSubmit) return;
    const id = 'iv-' + Math.random().toString(36).slice(2, 8);
    const now = new Date();
    const stamp = now.toISOString().replace('T', ' ').slice(0, 16);
    onSubmit({
      id, candidateId, jobId, round, date, start, end, mode,
      location: location || (mode === 'video' ? '飞书会议（待生成）' : mode === 'phone' ? '电话（按候选人手机号）' : '待补充'),
      interviewers,
      status: '已安排',
      createdBy: window.MESA_CURRENT_USER_ID,
      createdAt: stamp,
      notes: notes || '',
      feedback: null,
    });
  }

  return (
    <Modal open={open} onClose={onClose} width={780}>
      <div className="p-6 border-b border-[#E9ECEF] flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-[#707EAE]">
            <I name="calendar-plus" size={14} className="text-[#422AFB]" />
            新建面试
          </div>
          <div className="text-xl font-bold text-[#1B254B] mt-1">安排一场面试</div>
          <div className="text-xs text-[#A3AED0] mt-0.5">提交后状态置为「已安排」，候选人会收到通知（演示）</div>
        </div>
        <button onClick={onClose} className="text-[#A3AED0] hover:text-[#1B254B]"><I name="x" size={20} /></button>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5 overflow-y-auto">
        {/* Candidate picker */}
        <Field label={`候选人${cand ? '' : ' *'}`} className="md:col-span-2">
          {cand ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#F4F7FE]">
              <Avatar src={cand.avatar} name={cand.name} size={40} gender={cand.gender} animal={cand.animal} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[#1B254B]">{cand.name}</span>
                  <span className="text-[10px] font-bold text-[#707EAE] bg-white px-1.5 py-0.5 rounded">{cand.education}</span>
                </div>
                <div className="text-xs text-[#707EAE] truncate">{cand.appliedFor} · {cand.school} · {cand.yearsExp}y</div>
              </div>
              <button onClick={() => setCandidateId('')} className="text-xs text-[#707EAE] hover:text-[#1B254B]">更换</button>
            </div>
          ) : (
            <div>
              <HtmlInput value={candSearch} onChange={(e) => setCandSearch(e.target.value)} placeholder="搜索候选人姓名 / 应聘岗位…" icon="search" />
              <div className="mt-2 max-h-[180px] overflow-y-auto flex flex-col gap-1">
                {filteredCands.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCandidateId(c.id);
                      const matchedJob = jobs.find((j) => j.title === c.appliedFor);
                      if (matchedJob) setJobId(matchedJob.id);
                    }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#F4F7FE] text-left"
                  >
                    <Avatar src={c.avatar} name={c.name} size={32} gender={c.gender} animal={c.animal} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#1B254B] truncate">{c.name}</div>
                      <div className="text-[11px] text-[#707EAE] truncate">{c.appliedFor} · {c.school}</div>
                    </div>
                  </button>
                ))}
                {filteredCands.length === 0 && (
                  <div className="text-xs text-[#A3AED0] py-3 text-center">没有匹配的候选人</div>
                )}
              </div>
            </div>
          )}
        </Field>

        <Field label="岗位">
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="h-11 w-full px-3 rounded-xl border border-[#E9ECEF] text-sm bg-white outline-none focus:border-[#422AFB]">
            <option value="">选择 JD…</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title} · {j.dept}</option>)}
          </select>
        </Field>

        <Field label="轮次">
          <div className="flex flex-wrap gap-1.5">
            {window.MESA_INTERVIEW_ROUNDS.map((r) => (
              <button
                key={r}
                onClick={() => setRound(r)}
                className={`px-3 h-9 rounded-lg text-xs font-bold transition ${round === r ? 'bg-[#422AFB] text-white' : 'bg-[#F4F7FE] text-[#1B254B] hover:bg-[#E9E3FF]/40'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>

        <Field label="日期"><HtmlInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="时间">
          <div className="grid grid-cols-2 gap-2">
            <HtmlInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <HtmlInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </Field>

        <Field label="形式" className="md:col-span-2">
          <div className="flex items-center gap-2">
            {Object.entries(window.MESA_INTERVIEW_MODE).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-bold transition ${mode === k ? '' : 'opacity-60 hover:opacity-100'}`}
                style={{ background: m.bg, color: m.fg, outline: mode === k ? `2px solid ${m.fg}` : 'none' }}
              >
                <I name={m.icon} size={14} />
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="地点 / 链接" className="md:col-span-2">
          <HtmlInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder={mode === 'video' ? 'Zoom / 飞书会议链接' : mode === 'phone' ? '电话号码' : '地址 + 会议室'} icon={window.MESA_INTERVIEW_MODE[mode].icon} />
        </Field>

        <Field label="面试官（多选）" className="md:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {accounts.map((a) => {
              const active = interviewers.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleIver(a.id)}
                  className={`flex items-center gap-2 pl-1 pr-3 h-9 rounded-full text-xs font-bold transition ${active ? 'bg-[#422AFB] text-white' : 'bg-[#F4F7FE] text-[#1B254B] hover:bg-[#E9E3FF]/40'}`}
                >
                  <img src={a.avatar} className="w-6 h-6 rounded-full object-cover" />
                  {a.name}
                  <span className={`text-[10px] ${active ? 'opacity-80' : 'text-[#A3AED0]'}`}>{a.title}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="备注" className="md:col-span-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="例：提醒候选人提前 5 分钟入会"
            className="w-full min-h-[80px] p-3 rounded-xl border border-[#E9ECEF] text-sm outline-none focus:border-[#422AFB] resize-y"
          />
        </Field>
      </div>

      <div className="p-4 border-t border-[#E9ECEF] flex items-center justify-between bg-[#F8FAFE]">
        <div className="text-xs text-[#A3AED0]">{canSubmit ? '准备就绪' : '请填写候选人、岗位、日期、时间与面试官'}</div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>取消</Button>
          <Button
            variant="primary" size="sm"
            icon={<I name="check" size={14} />}
            onClick={submit}
            className={canSubmit ? '' : 'opacity-50 pointer-events-none'}
          >
            创建面试
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────── Tiny shared bits ───────────────────────────
function IvStat({ icon, label, value, sub, accent, active, onClick }) {
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
        {sub && <div className="text-[11px] text-[#707EAE] mt-0.5 truncate">{sub}</div>}
      </div>
    </button>
  );
}

function ViewToggle({ active, icon, onClick, label }) {
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

function ChipPill({ active, onClick, label, tone, icon }) {
  const base = active
    ? { background: tone?.dot || '#422AFB', color: '#FFFFFF' }
    : { background: tone?.bg || '#F4F7FE', color: tone?.fg || '#1B254B' };
  return (
    <button
      onClick={onClick}
      className="px-3 h-8 rounded-lg text-xs font-bold transition flex items-center gap-1.5 hover:opacity-90"
      style={base}
    >
      {icon && <I name={icon} size={12} />}
      {label}
    </button>
  );
}

function SectionTitle({ children }) {
  return <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-2">{children}</div>;
}

function DescRow({ label, children }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 py-1.5">
      <div className="text-[11px] font-bold text-[#A3AED0] uppercase tracking-wide pt-1">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">{label}</label>
      {children}
    </div>
  );
}

function HtmlInput(props) {
  const icon = props.icon;
  return (
    <div className="relative">
      {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]"><I name={icon} size={14} /></span>}
      <input
        type={props.type || 'text'}
        value={props.value}
        onChange={props.onChange}
        placeholder={props.placeholder}
        className={`h-11 w-full px-3 rounded-xl border border-[#E9ECEF] text-sm outline-none focus:border-[#422AFB] bg-white ${icon ? 'pl-9' : ''}`}
      />
    </div>
  );
}

function Rating({ value }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = value >= i;
        const half = !filled && value > i - 1;
        return (
          <span key={i} style={{ color: filled || half ? '#F59E0B' : '#E9ECEF' }}>
            <I name={half ? 'star-half' : 'star'} size={16} strokeWidth={2.2} />
          </span>
        );
      })}
      <span className="text-sm font-bold text-[#1B254B] tabular-nums ml-1.5">{value.toFixed(1)}</span>
    </div>
  );
}

function RatingInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          style={{ color: value >= i ? '#F59E0B' : '#CBD5E0' }}
        >
          <I name="star" size={22} strokeWidth={2.2} />
        </button>
      ))}
      <span className="ml-2 text-sm font-bold text-[#1B254B] tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}

// ─────────────────────────── Date helpers ───────────────────────────
function byTimeAsc(a, b) {
  return (a.date + ' ' + a.start).localeCompare(b.date + ' ' + b.start);
}
function byTimeDesc(a, b) {
  return (b.date + ' ' + b.start).localeCompare(a.date + ' ' + a.start);
}
function mondayOf(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0..6 (Sun..Sat)
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekRange(dateStr) {
  const start = mondayOf(dateStr);
  const end = addDays(start, 6);
  return { start, end };
}
function weekdayCN(dateStr) {
  const map = ['日', '一', '二', '三', '四', '五', '六'];
  return map[new Date(dateStr).getDay()];
}
function formatDateCN(dateStr) {
  // 2026-05-15 → 5 月 15 日
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m} 月 ${d} 日`;
}
function formatDateShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}
function formatRange(a, b) {
  return `${formatDateShort(a)} – ${formatDateShort(b)}`;
}

Object.assign(window, { Interviews });
