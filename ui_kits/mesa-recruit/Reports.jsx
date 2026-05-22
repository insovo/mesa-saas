// MESA Recruit · Reports / 数据报表
// 招聘漏斗、转化率、来源、AI 解析质量、部门完成度、面试结果、月度趋势 —— 全部基于现有 mock。

function Reports({ onNavigate }) {
  const [range, setRange] = useState('30D'); // 7D · 30D · 90D · YTD —— 装饰性

  const candidates  = window.MESA_CANDIDATES || [];
  const jobs        = window.MESA_JOBS || [];
  const employees   = window.MESA_EMPLOYEES || [];
  const interviews  = window.MESA_INTERVIEWS || [];
  const departments = window.MESA_DEPARTMENTS || [];

  const statusOrder = window.MESA_STATUS_ORDER;
  const statusCounts = statusOrder.reduce((a, s) => {
    a[s] = candidates.filter((c) => c.status === s).length;
    return a;
  }, {});

  // Funnel conversion (excluding 已淘汰)
  const funnelOrder = ['待筛选', '已沟通', '面试中', '待入职', '已入职'];
  const funnelCounts = funnelOrder.map((s) => statusCounts[s] || 0);
  const funnelMax = Math.max(...funnelCounts, 1);

  const totalApplied = candidates.length;
  const totalHired   = statusCounts['已入职'] || 0;
  const hiredEmp     = employees.filter((e) => e.stage === '已转正').length;
  const offerHired   = (statusCounts['待入职'] || 0) + (statusCounts['已入职'] || 0);
  const interviewed  = (statusCounts['面试中'] || 0) + offerHired;
  const passedRate   = totalApplied > 0 ? Math.round((offerHired / totalApplied) * 100) : 0;

  // Source breakdown
  const sourceMap = {};
  candidates.forEach((c) => {
    const k = c.source || '其它';
    sourceMap[k] = (sourceMap[k] || 0) + 1;
  });
  const sources = Object.entries(sourceMap)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ name: k, count: v, pct: Math.round((v / totalApplied) * 100) }));

  // Parser quality
  const kimi     = candidates.filter((c) => c.parser === 'Kimi');
  const deepseek = candidates.filter((c) => c.parser === 'DeepSeek');
  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, c) => s + (c.parserConfidence || 0), 0) / arr.length) : 0;
  const highConfPct = totalApplied > 0
    ? Math.round((candidates.filter((c) => (c.parserConfidence || 0) >= 90).length / totalApplied) * 100)
    : 0;

  // Interview outcomes
  const completedIvs = interviews.filter((iv) => iv.feedback && iv.feedback.recommendation);
  const outcomeBuckets = { pass: 0, hold: 0, reject: 0 };
  completedIvs.forEach((iv) => { outcomeBuckets[iv.feedback.recommendation] = (outcomeBuckets[iv.feedback.recommendation] || 0) + 1; });
  const avgRating = completedIvs.length
    ? (completedIvs.reduce((s, iv) => s + (iv.feedback.rating || 0), 0) / completedIvs.length)
    : 0;

  // Top JDs by candidate volume (using actual candidate.appliedFor)
  const jdMap = {};
  candidates.forEach((c) => {
    const k = c.appliedFor || '未指定';
    jdMap[k] = (jdMap[k] || 0) + 1;
  });
  const topJds = Object.entries(jdMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([title, count]) => {
      const j = jobs.find((j) => j.title === title);
      return { title, count, openings: j?.openings, dept: j?.dept, owner: j?.owner, urgency: j?.urgency };
    });

  // Department completion — openings vs filled (employees by dept)
  const deptFilled = {};
  employees.forEach((e) => {
    const d = e.dept || '未分配';
    deptFilled[d] = (deptFilled[d] || 0) + 1;
  });
  const deptStats = jobs.reduce((acc, j) => {
    const key = j.dept;
    if (!acc[key]) acc[key] = { name: key, openings: 0, candidates: 0 };
    acc[key].openings += (j.openings || 0);
    acc[key].candidates += (j.candidates || 0);
    return acc;
  }, {});
  const deptRows = Object.values(deptStats).map((d) => {
    const filled = deptFilled[d.name] || 0;
    const completion = d.openings > 0 ? Math.min(100, Math.round((filled / d.openings) * 100)) : 0;
    return { ...d, filled, completion };
  }).sort((a, b) => b.openings - a.openings);

  // 12-week trend — slight bumps near 'today' to look real (decorative)
  const trendWeeks = ['W08','W09','W10','W11','W12','W13','W14','W15','W16','W17','W18','W19'];
  const trendApplied = [18, 26, 24, 31, 28, 35, 42, 38, 47, 52, 58, 49];
  const trendHired   = [2,  3,  4,  3,  5,  4,  6,  7,  6,  8,  9,  7];

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Top toolbar — range chips + export */}
      <Card extra="px-6 py-4 flex flex-row items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-[#F4F7FE] text-[#422AFB] flex items-center justify-center shrink-0">
            <I name="bar-chart-3" size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#1B254B] whitespace-nowrap">招聘数据洞察</div>
            <div className="text-[11px] text-[#A3AED0] whitespace-nowrap">截至 {window.MESA_TODAY || '2026-05-15'} · 每日 09:00 同步</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 bg-[#F4F7FE] rounded-xl p-1 shrink-0">
          {['7D','30D','90D','YTD'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${range === r ? 'bg-white text-[#1B254B] shadow-sm' : 'text-[#707EAE] hover:text-[#1B254B]'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <button className="h-9 px-3 rounded-xl border border-[#E9ECEF] text-xs font-bold text-[#1B254B] hover:bg-[#F4F7FE] inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
          <I name="filter" size={14} /> 筛选
        </button>
        <button className="h-9 px-3 rounded-xl bg-[#422AFB] text-white text-xs font-bold hover:bg-[#3311DB] inline-flex items-center gap-1.5 shadow-[0_4px_14px_rgba(66,42,251,0.18)] shrink-0 whitespace-nowrap">
          <I name="download" size={14} /> 导出 PDF
        </button>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
        <Widget icon={<I name="users" size={26} strokeWidth={2.2} />} title="候选人池" value={String(totalApplied)} trend="+12% MoM" />
        <Widget icon={<I name="user-check" size={26} strokeWidth={2.2} />} title="进面率" value={`${totalApplied > 0 ? Math.round((interviewed / totalApplied) * 100) : 0}%`} trend="+4pt" />
        <Widget icon={<I name="check-check" size={26} strokeWidth={2.2} />} title="Offer 接受" value={`${passedRate}%`} trend="+6pt" />
        <Widget icon={<I name="briefcase" size={26} strokeWidth={2.2} />} title="活跃 JD" value={String(jobs.length)} trend="+2 本月" />
        <Widget icon={<I name="timer" size={26} strokeWidth={2.2} />} title="平均闭环" value="23d" trend="-3d MoM" />
        <Widget icon={<I name="badge-check" size={26} strokeWidth={2.2} />} title="试用通过" value="92%" trend="+2pt" />
      </div>

      {/* Funnel + Trend */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card extra="p-6 xl:col-span-2">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">招聘漏斗 · 阶段转化</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">当前快照 · 全部岗位</div>
            </div>
          </header>
          <FunnelStages stages={funnelOrder} counts={funnelCounts} max={funnelMax} />
        </Card>

        <Card extra="p-6 xl:col-span-3">
          <header className="flex items-center justify-between mb-5 gap-3">
            <div className="min-w-0">
              <div className="text-xl font-bold text-[#1B254B] whitespace-nowrap">月度趋势</div>
              <div className="text-xs text-[#A3AED0] mt-0.5 whitespace-nowrap">最近 12 周 · 投递 vs 入职</div>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <Legend dot="#422AFB" label="投递" />
              <Legend dot="#22C55E" label="入职" />
            </div>
          </header>
          <TrendChart weeks={trendWeeks} applied={trendApplied} hired={trendHired} />
        </Card>
      </div>

      {/* Sources + Department completion */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card extra="p-6 xl:col-span-2">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">来源分布</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">按渠道统计</div>
            </div>
          </header>
          <SourceDonut sources={sources} total={totalApplied} />
        </Card>

        <Card extra="p-6 xl:col-span-3">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">部门招聘完成度</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">openings · 已入职 · 完成率</div>
            </div>
            <button onClick={() => onNavigate && onNavigate('departments')} className="text-xs font-bold text-[#422AFB] hover:underline">查看部门 →</button>
          </header>
          <DeptTable rows={deptRows.slice(0, 8)} />
        </Card>
      </div>

      {/* AI quality + interview outcomes */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card extra="p-6 xl:col-span-3">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">AI 解析质量</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">Kimi vs DeepSeek · 置信度均值</div>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#E9E3FF] text-[#422AFB] font-bold inline-flex items-center gap-1">
              <I name="sparkles" size={11} /> 高置信占比 {highConfPct}%
            </span>
          </header>
          <ParserCompare kimi={kimi} deepseek={deepseek} />
        </Card>

        <Card extra="p-6 xl:col-span-2">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">面试结果</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">已完成 {completedIvs.length} 场 · 均分 {avgRating.toFixed(1)}</div>
            </div>
          </header>
          <OutcomePanel buckets={outcomeBuckets} total={completedIvs.length || 1} />
        </Card>
      </div>

      {/* Top JDs */}
      <Card extra="p-6">
        <header className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xl font-bold text-[#1B254B]">岗位投递榜</div>
            <div className="text-xs text-[#A3AED0] mt-0.5">候选人投递量最高的 JD</div>
          </div>
          <button onClick={() => onNavigate && onNavigate('jobs')} className="text-xs font-bold text-[#422AFB] hover:underline">查看全部 JD →</button>
        </header>
        <TopJobsTable rows={topJds} />
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────── helpers ───────────────────────────────────────────

function Legend({ dot, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }}></span>
      <span className="text-xs text-[#707EAE] font-medium">{label}</span>
      {value != null && <span className="text-xs text-[#1B254B] font-bold tabular-nums">{value}</span>}
    </div>
  );
}

function FunnelStages({ stages, counts, max }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s, i) => {
        const tone = window.MESA_STATUS_TONE[s];
        const n = counts[i];
        const pct = (n / max) * 100;
        const conv = i > 0 && counts[i - 1] > 0 ? Math.round((n / counts[i - 1]) * 100) : null;
        return (
          <div key={s}>
            <div className="flex items-center gap-3">
              <div className="w-16 text-xs font-bold text-[#1B254B]">{s}</div>
              <div className="flex-1 h-9 bg-[#F4F7FE] rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg flex items-center px-3"
                  style={{
                    background: tone.bg,
                    width: mounted ? `${pct}%` : '0%',
                    minWidth: mounted ? 56 : 0,
                    transition: `width 900ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 70}ms, min-width 900ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 70}ms`,
                  }}
                >
                  <span className="text-xs font-bold tabular-nums" style={{ color: tone.fg }}>{n}</span>
                </div>
              </div>
              <div className="w-14 text-right">
                {conv != null ? (
                  <span className="text-[11px] font-bold text-[#1B254B] tabular-nums inline-flex items-center gap-0.5">
                    <I name="arrow-down-right" size={11} className="text-[#A3AED0]" />{conv}%
                  </span>
                ) : (
                  <span className="text-[11px] text-[#A3AED0]">起点</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ weeks, applied, hired }) {
  const W = 600, H = 220, padL = 32, padR = 12, padT = 12, padB = 28;
  const max = Math.ceil(Math.max(...applied, ...hired) * 1.15);
  const xs = weeks.map((_, i) => padL + (i * (W - padL - padR)) / (weeks.length - 1));
  const yScale = (v) => padT + (1 - v / max) * (H - padT - padB);

  const pathFrom = (arr) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs[i]} ${yScale(v)}`).join(' ');
  const areaFrom = (arr) =>
    `${pathFrom(arr)} L ${xs[xs.length - 1]} ${H - padB} L ${xs[0]} ${H - padB} Z`;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // gridlines
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + t * (H - padT - padB));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 240 }}>
        <defs>
          <linearGradient id="reportFillApplied" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stopColor="#422AFB" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#422AFB" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="reportFillHired" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stopColor="#22C55E" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridY.map((y, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={y} y2={y} stroke="#EDF2F7" strokeDasharray="3 4" />
        ))}
        {gridY.map((y, i) => (
          <text key={`l${i}`} x={padL - 6} y={y + 3} fontSize="9" fill="#A3AED0" textAnchor="end">
            {Math.round(max * (1 - i * 0.25))}
          </text>
        ))}

        <path d={areaFrom(applied)} fill="url(#reportFillApplied)" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 700ms ease 200ms' }} />
        <path d={pathFrom(applied)} fill="none" stroke="#422AFB" strokeWidth="2.2"
          style={{
            strokeDasharray: 2000, strokeDashoffset: mounted ? 0 : 2000,
            transition: 'stroke-dashoffset 1200ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        <path d={areaFrom(hired)} fill="url(#reportFillHired)" style={{ opacity: mounted ? 1 : 0, transition: 'opacity 700ms ease 400ms' }} />
        <path d={pathFrom(hired)} fill="none" stroke="#22C55E" strokeWidth="2.2"
          style={{
            strokeDasharray: 2000, strokeDashoffset: mounted ? 0 : 2000,
            transition: 'stroke-dashoffset 1200ms cubic-bezier(0.22, 1, 0.36, 1) 200ms',
          }}
        />

        {xs.map((x, i) => (
          <g key={`pt${i}`}>
            <circle cx={x} cy={yScale(applied[i])} r="3" fill="#fff" stroke="#422AFB" strokeWidth="2"
              style={{ opacity: mounted ? 1 : 0, transition: `opacity 300ms ease ${600 + i * 30}ms` }}/>
            <circle cx={x} cy={yScale(hired[i])} r="2.5" fill="#22C55E"
              style={{ opacity: mounted ? 1 : 0, transition: `opacity 300ms ease ${700 + i * 30}ms` }}/>
          </g>
        ))}

        {weeks.map((w, i) => (
          <text key={`x${i}`} x={xs[i]} y={H - 8} fontSize="10" fill="#A3AED0" textAnchor="middle">{w}</text>
        ))}
      </svg>
    </div>
  );
}

function SourceDonut({ sources, total }) {
  const palette = ['#422AFB', '#868CFF', '#22C55E', '#F59E0B', '#3B82F6', '#EC4899', '#14B8A6'];
  const SIZE = 180, R = 70, STROKE = 26;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = sources.map((s, i) => {
    const frac = s.count / Math.max(total, 1);
    const arc = { ...s, color: palette[i % palette.length], offset: acc, length: C * frac };
    acc += C * frac;
    return arc;
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={SIZE/2} cy={SIZE/2} r={R} stroke="#EDF2F7" strokeWidth={STROKE} fill="none" />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={SIZE/2} cy={SIZE/2} r={R}
              stroke={a.color} strokeWidth={STROKE} fill="none"
              strokeDasharray={`${mounted ? a.length : 0} ${C}`}
              strokeDashoffset={-a.offset}
              style={{ transition: `stroke-dasharray 800ms cubic-bezier(0.22,1,0.36,1) ${i * 80}ms` }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] text-[#A3AED0] font-medium">候选人</div>
          <div className="text-2xl font-bold text-[#1B254B] tabular-nums">{total}</div>
        </div>
      </div>
      <div className="flex-1 min-w-[180px] flex flex-col gap-2">
        {arcs.map((a) => (
          <div key={a.name} className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }}></span>
            <span className="text-xs font-medium text-[#1B254B] flex-1">{a.name}</span>
            <span className="text-xs font-bold text-[#1B254B] tabular-nums w-8 text-right">{a.count}</span>
            <span className="text-[10px] text-[#A3AED0] font-medium tabular-nums w-9 text-right">{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeptTable({ rows }) {
  if (!rows.length) return <div className="text-sm text-[#A3AED0]">暂无数据</div>;
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">
            <th className="text-left px-2 pb-2">部门</th>
            <th className="text-right px-2 pb-2">在招</th>
            <th className="text-right px-2 pb-2">已入职</th>
            <th className="text-right px-2 pb-2">候选人</th>
            <th className="text-left px-2 pb-2 w-[40%]">完成度</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.name} className="border-t border-[#F4F7FE]">
              <td className="px-2 py-2.5">
                <div className="font-bold text-[#1B254B]">{d.name}</div>
              </td>
              <td className="px-2 py-2.5 text-right text-[#1B254B] font-bold tabular-nums">{d.openings}</td>
              <td className="px-2 py-2.5 text-right text-[#15803D] font-bold tabular-nums">{d.filled}</td>
              <td className="px-2 py-2.5 text-right text-[#707EAE] tabular-nums">{d.candidates}</td>
              <td className="px-2 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-[#F4F7FE] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${d.completion}%`,
                        background: d.completion >= 80 ? '#22C55E' : d.completion >= 40 ? '#422AFB' : '#F59E0B',
                        transition: 'width 800ms cubic-bezier(0.22,1,0.36,1)',
                      }}
                    ></div>
                  </div>
                  <span className="text-xs font-bold text-[#1B254B] w-10 text-right tabular-nums">{d.completion}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParserCompare({ kimi, deepseek }) {
  const total = kimi.length + deepseek.length;
  const kimiAvg     = kimi.length     ? Math.round(kimi.reduce((s,c) => s + (c.parserConfidence||0), 0) / kimi.length) : 0;
  const deepseekAvg = deepseek.length ? Math.round(deepseek.reduce((s,c) => s + (c.parserConfidence||0), 0) / deepseek.length) : 0;
  const kimiShare = total ? Math.round((kimi.length / total) * 100) : 0;
  const dsShare   = total ? 100 - kimiShare : 0;

  // confidence histogram buckets
  const buckets = [
    { label: '60–70', min: 60, max: 70 },
    { label: '70–80', min: 70, max: 80 },
    { label: '80–90', min: 80, max: 90 },
    { label: '90–95', min: 90, max: 95 },
    { label: '95+',   min: 95, max: 101 },
  ];
  const histo = buckets.map((b) => {
    const k = kimi.filter((c) => (c.parserConfidence||0) >= b.min && (c.parserConfidence||0) < b.max).length;
    const d = deepseek.filter((c) => (c.parserConfidence||0) >= b.min && (c.parserConfidence||0) < b.max).length;
    return { ...b, k, d };
  });
  const maxBar = Math.max(1, ...histo.map((h) => h.k + h.d));
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* top — two parser cards */}
      <div className="grid grid-cols-2 gap-4">
        <ParserStat name="Kimi" color="#422AFB" count={kimi.length} share={kimiShare} avg={kimiAvg} />
        <ParserStat name="DeepSeek" color="#868CFF" count={deepseek.length} share={dsShare} avg={deepseekAvg} />
      </div>
      {/* histogram */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-[#1B254B]">置信度分布</div>
          <div className="flex items-center gap-3 text-[11px]">
            <Legend dot="#422AFB" label="Kimi" />
            <Legend dot="#868CFF" label="DeepSeek" />
          </div>
        </div>
        <div className="flex items-end gap-3 h-32 mt-3">
          {histo.map((h, i) => (
            <div key={h.label} className="flex-1 flex flex-col items-center gap-1.5 h-full">
              <div className="flex-1 w-full flex flex-col justify-end">
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height: mounted ? ((h.d / maxBar) * 100) + '%' : '0%',
                    background: '#868CFF',
                    transition: `height 800ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms`,
                  }}
                ></div>
                <div
                  className="w-full"
                  style={{
                    height: mounted ? ((h.k / maxBar) * 100) + '%' : '0%',
                    background: '#422AFB',
                    transition: `height 800ms cubic-bezier(0.22,1,0.36,1) ${i * 60 + 80}ms`,
                  }}
                ></div>
              </div>
              <div className="text-[10px] text-[#A3AED0] font-medium">{h.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ParserStat({ name, color, count, share, avg }) {
  return (
    <div className="rounded-xl bg-[#F4F7FE] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }}></span>
        <span className="text-sm font-bold text-[#1B254B]">{name}</span>
        <span className="ml-auto text-[11px] font-bold text-[#707EAE] tabular-nums">{share}%</span>
      </div>
      <div className="flex items-end gap-3">
        <div>
          <div className="text-[11px] text-[#A3AED0] font-medium">解析数</div>
          <div className="text-2xl font-bold text-[#1B254B] tabular-nums leading-tight">{count}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[11px] text-[#A3AED0] font-medium">平均置信</div>
          <div className="text-2xl font-bold tabular-nums leading-tight" style={{ color }}>{avg}%</div>
        </div>
      </div>
    </div>
  );
}

function OutcomePanel({ buckets, total }) {
  const items = [
    { key: 'pass',   label: '建议通过', value: buckets.pass   || 0, color: '#22C55E', bg: '#DCFCE7' },
    { key: 'hold',   label: '保留待评估', value: buckets.hold   || 0, color: '#EAB308', bg: '#FEF3C7' },
    { key: 'reject', label: '不建议推进', value: buckets.reject || 0, color: '#EF4444', bg: '#FEE2E2' },
  ];
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Stacked bar segments
  const sumNonZero = items.reduce((s, i) => s + i.value, 0) || 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="h-3 w-full rounded-full overflow-hidden bg-[#F4F7FE] flex">
        {items.map((it, i) => (
          <div
            key={it.key}
            style={{
              width: mounted ? `${(it.value / sumNonZero) * 100}%` : '0%',
              background: it.color,
              transition: `width 800ms cubic-bezier(0.22,1,0.36,1) ${i * 100}ms`,
            }}
          ></div>
        ))}
      </div>
      {items.map((it) => {
        const pct = total > 0 ? Math.round((it.value / total) * 100) : 0;
        return (
          <div key={it.key} className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: it.bg, color: it.color }}>
              <I name={it.key === 'pass' ? 'thumbs-up' : it.key === 'hold' ? 'pause' : 'thumbs-down'} size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[#1B254B]">{it.label}</div>
              <div className="text-[11px] text-[#A3AED0]">{it.value} 场 · {pct}%</div>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: it.color }}>{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

function TopJobsTable({ rows }) {
  const URGENCY_TONE = {
    high:   { fg: '#B91C1C', bg: '#FEE2E2', label: '紧急' },
    medium: { fg: '#854D0E', bg: '#FEF3C7', label: '常规' },
    low:    { fg: '#15803D', bg: '#DCFCE7', label: '储备' },
  };
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">
            <th className="text-left px-2 pb-2">JD</th>
            <th className="text-left px-2 pb-2">部门 · 负责人</th>
            <th className="text-right px-2 pb-2">在招</th>
            <th className="text-right px-2 pb-2">投递量</th>
            <th className="text-left px-2 pb-2 w-[28%]">热度</th>
            <th className="text-right px-2 pb-2">优先级</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const u = URGENCY_TONE[r.urgency] || URGENCY_TONE.medium;
            return (
              <tr key={r.title} className="border-t border-[#F4F7FE]">
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-[#F4F7FE] text-[#422AFB] inline-flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
                    <span className="font-bold text-[#1B254B]">{r.title}</span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-[#707EAE]">
                  {r.dept || '—'}{r.owner ? ` · ${r.owner}` : ''}
                </td>
                <td className="px-2 py-2.5 text-right text-[#1B254B] font-bold tabular-nums">{r.openings ?? '—'}</td>
                <td className="px-2 py-2.5 text-right text-[#1B254B] font-bold tabular-nums">{r.count}</td>
                <td className="px-2 py-2.5">
                  <div className="h-2 bg-[#F4F7FE] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#868CFF] to-[#422AFB]"
                      style={{ width: `${(r.count / max) * 100}%`, transition: 'width 800ms cubic-bezier(0.22,1,0.36,1)' }}
                    ></div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                    style={{ background: u.bg, color: u.fg }}
                  >
                    {u.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

Object.assign(window, { Reports });
