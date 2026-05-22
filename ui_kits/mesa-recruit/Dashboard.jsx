// MESA Recruit · Dashboard
// Composition mirrors MESA/src/views/admin/default/index.jsx: a 6-widget row,
// then a 2-col charts row, then a recent-activity table + pipeline panel.

function Dashboard({ onOpenCandidate, onNavigate, onScheduleInterview }) {
  const candidates = window.MESA_CANDIDATES;
  const total = candidates.length;
  const recent = candidates.slice(0, 5);
  const counts = window.MESA_STATUS_ORDER.reduce((acc, s) => {
    acc[s] = candidates.filter((c) => c.status === s).length;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Widgets row */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Widget icon={<I name="users" size={26} strokeWidth={2.2} />} title="候选人池" value="2,148" trend="+126 本周" />
        <Widget icon={<I name="briefcase" size={26} strokeWidth={2.2} />} title="活跃 JD" value="38" trend="+4 本周" />
        <Widget icon={<I name="sparkles" size={26} strokeWidth={2.2} />} title="今日 AI 解析" value="184" trend="+22%" />
        <Widget icon={<I name="trending-up" size={26} strokeWidth={2.2} />} title="匹配 ≥ 80" value="412" trend="+38" />
        <Widget icon={<I name="calendar-clock" size={26} strokeWidth={2.2} />} title="本周面试" value="27" trend="+5" />
        <Widget icon={<I name="user-check" size={26} strokeWidth={2.2} />} title="待入职" value="9" trend="+2" />
      </div>

      {/* Funnel + AI insights */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card extra="p-6">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">候选人漏斗</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">本月 · 全部岗位</div>
            </div>
            <button className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0]">
              <I name="more-horizontal" size={18} />
            </button>
          </header>
          <FunnelChart counts={counts} total={Math.max(total, 1)} />
        </Card>

        <Card extra="p-6">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">AI 解析吞吐</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">最近 7 天 · Kimi + DeepSeek</div>
            </div>
            <div className="flex gap-1">
              <button className="px-2.5 py-1 rounded-md bg-[#F4F7FE] text-[#1B254B] text-[11px] font-bold">7D</button>
              <button className="px-2.5 py-1 rounded-md text-[#A3AED0] text-[11px] font-medium">30D</button>
              <button className="px-2.5 py-1 rounded-md text-[#A3AED0] text-[11px] font-medium">90D</button>
            </div>
          </header>
          <ThroughputChart />
          <div className="flex items-center gap-5 mt-4 pt-4 border-t border-[#E9ECEF]">
            <Legend dot="#422AFB" label="Kimi" value="1,284" />
            <Legend dot="#868CFF" label="DeepSeek" value="976" />
            <Legend dot="#22C55E" label="高置信(>90%)" value="83%" />
          </div>
        </Card>
      </div>

      {/* Recent candidates + Today's interviews */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card extra="p-6 xl:col-span-2 overflow-hidden">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">最近解析</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">点击查看候选人详情</div>
            </div>
            <button
              onClick={() => onNavigate('candidates')}
              className="text-sm font-bold text-[#422AFB] hover:underline"
            >
              查看全部 →
            </button>
          </header>
          <div className="flex flex-col gap-2">
            {recent.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenCandidate(c.id)}
                className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-[#F4F7FE] transition text-left"
              >
                <Avatar src={c.avatar} name={c.name} size={42} gender={c.gender} animal={c.animal} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1B254B] text-sm">{c.name}</span>
                    <span className="text-[10px] text-[#A3AED0] font-bold bg-[#F4F7FE] px-1.5 py-0.5 rounded">{c.education}</span>
                    <AiBadge parser={c.parser} confidence={c.parserConfidence} />
                  </div>
                  <div className="text-xs text-[#707EAE] mt-1 truncate">
                    投递 <span className="text-[#1B254B] font-bold">{c.appliedFor}</span> · {c.location} · {c.yearsExp}y · {c.pushedAt}
                  </div>
                </div>
                <MatchRing value={c.jdMatch} size={44} stroke={5} showLabel={false} />
                <StatusPill status={c.status} />
              </button>
            ))}
          </div>
        </Card>

        <Card extra="p-6">
          <header className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xl font-bold text-[#1B254B]">今日面试</div>
              <div className="text-xs text-[#A3AED0] mt-0.5">5 月 15 日 · 周五</div>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('interviews')}
              className="text-sm font-bold text-[#422AFB] hover:underline"
            >
              查看全部 →
            </button>
          </header>
          <div className="flex flex-col gap-3">
            {[
              { time: '10:00', name: '陈思琪', role: '智驾感知 · 终面', interviewer: '张磊', avatar: '../../assets/avatars/avatar7.png' },
              { time: '14:30', name: '刘晓萌', role: 'BMS · 二面', interviewer: '陈璐', avatar: '../../assets/avatars/avatar9.png' },
              { time: '16:00', name: '孙韵竹', role: '底盘软件 · 一面', interviewer: '王浩', avatar: '../../assets/avatars/avatar11.png' },
            ].map((iv, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#F4F7FE]">
                <div className="text-sm font-bold text-[#422AFB] font-mono w-12">{iv.time}</div>
                <img src={iv.avatar} className="w-9 h-9 rounded-full"/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#1B254B] truncate">{iv.name}</div>
                  <div className="text-[11px] text-[#707EAE] truncate">{iv.role} · 面 {iv.interviewer}</div>
                </div>
                <button className="text-[#A3AED0] hover:text-[#1B254B]"><I name="video" size={16} /></button>
              </div>
            ))}
          </div>
          <button
            onClick={() => (onScheduleInterview ? onScheduleInterview(null) : onNavigate && onNavigate('interviews'))}
            className="mt-4 w-full py-2.5 rounded-xl border border-dashed border-[#CBD5E0] text-sm text-[#707EAE] hover:bg-[#F4F7FE] hover:text-[#1B254B] transition"
          >
            + 安排新面试
          </button>
        </Card>
      </div>
    </div>
  );
}

function Legend({ dot, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }}></span>
      <span className="text-xs text-[#707EAE] font-medium">{label}</span>
      <span className="text-xs text-[#1B254B] font-bold">{value}</span>
    </div>
  );
}

function FunnelChart({ counts, total }) {
  const order = window.MESA_STATUS_ORDER;
  const max = Math.max(...order.map((s) => counts[s] || 0), 1);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="flex flex-col gap-3">
      {order.map((s, i) => {
        const tone = window.MESA_STATUS_TONE[s];
        const n = counts[s] || 0;
        const pct = (n / max) * 100;
        return (
          <div key={s} className="flex items-center gap-3">
            <div className="w-16 text-xs font-bold text-[#1B254B]">{s}</div>
            <div className="flex-1 h-7 bg-[#F4F7FE] rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg flex items-center px-3"
                style={{
                  background: tone.bg,
                  width: mounted ? `${pct}%` : '0%',
                  minWidth: mounted ? 48 : 0,
                  transition: `width 900ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 70}ms, min-width 900ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 70}ms`,
                }}
              >
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color: tone.fg, opacity: mounted ? 1 : 0, transition: `opacity 400ms ease ${300 + i * 70}ms` }}
                >{n}</span>
              </div>
            </div>
            <div className="text-xs font-medium text-[#A3AED0] w-10 text-right tabular-nums" style={{ opacity: mounted ? 1 : 0, transition: `opacity 400ms ease ${400 + i * 70}ms` }}>
              {Math.round((n / total) * 100)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThroughputChart() {
  const days = ['周五', '周六', '周日', '周一', '周二', '周三', '周四'];
  const kimi    = [120, 80, 60, 220, 240, 280, 184];
  const deepseek= [80,  60, 40, 160, 170, 200, 140];
  const max = Math.max(...kimi.map((v,i) => v + deepseek[i]));
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="flex items-end gap-3 h-32">
      {days.map((d, i) => (
        <div key={d} className="flex-1 flex flex-col items-center gap-1.5 h-full">
          <div className="flex-1 w-full flex flex-col justify-end">
            <div
              className="w-full rounded-t-md"
              style={{
                height: mounted ? (deepseek[i] / max) * 100 + '%' : '0%',
                background: '#868CFF',
                transition: `height 800ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 60}ms`,
              }}
            ></div>
            <div
              className="w-full"
              style={{
                height: mounted ? (kimi[i] / max) * 100 + '%' : '0%',
                background: '#422AFB',
                transition: `height 800ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 60 + 80}ms`,
              }}
            ></div>
          </div>
          <div className="text-[10px] text-[#A3AED0] font-medium">{d}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Dashboard });
