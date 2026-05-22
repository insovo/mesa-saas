// MESA Recruit · Candidate Detail (3-column redesign)
// Layout reference: SoftTech-style 3-column ATS — profile rail / pipeline center / comments rail.
// Data items unchanged from v1; only the composition changed.

function CandidateDetail({ candidateId, onBack, onScheduleInterview }) {
  const c = window.MESA_CANDIDATES.find((x) => x.id === candidateId);
  const [status, setStatus] = useState(c.status);
  const [showJD, setShowJD] = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);
  const [animal, setAnimal] = useState(c.animal);
  const [photo, setPhoto] = useState(c.avatar);
  const [rightTab, setRightTab] = useState('insights');
  const [tags, setTags] = useState(c.tags);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const tagInputRef = useRef(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Avatar modal: crop state
  const [cropSrc, setCropSrc] = useState(null);
  const [cropZoom, setCropZoom] = useState(1.4);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });

  // Current user role — drives admin-only UI affordances.
  const currentUser = (window.MESA_ACCOUNTS || []).find((a) => a.id === window.MESA_CURRENT_USER_ID);
  const isAdmin = currentUser ? currentUser.role === 'admin' : true;

  useEffect(() => {
    if (addingTag && tagInputRef.current) tagInputRef.current.focus();
  }, [addingTag]);

  function commitTag() {
    const v = tagDraft.trim();
    if (v && !tags.includes(v)) {
      const next = [...tags, v];
      setTags(next);
      c.tags = next;
    }
    setTagDraft('');
    setAddingTag(false);
  }

  function removeTag(t) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    c.tags = next;
  }

  const order = window.MESA_STATUS_ORDER.filter((s) => s !== '已淘汰');
  const stageIdx = order.indexOf(status);

  function advance() {
    const next = order[stageIdx + 1];
    if (next) setStatus(next);
  }

  // Derived display fields (no schema changes — composed from existing data)
  const profileCompletion = Math.min(98, 60 + (c.skills.length * 3) + (c.highlights.length * 2));
  const isStar = c.jdMatch >= 90;
  const matchedItems = ['学历', '核心技能', '经验年限'].slice(0, c.jdMatch >= 80 ? 3 : c.jdMatch >= 60 ? 2 : 1);
  const againstItems = c.risks.length === 0 ? ['—'] : ['期望薪资', '城市'].slice(0, Math.min(2, c.risks.length));
  const sourceIcon = {
    '内推': 'user-round-plus', '猎头': 'crown', 'BOSS 直聘': 'briefcase-business',
    '官网': 'globe', '自动上传': 'cloud-upload',
  }[c.source] || 'link';

  return (
    <div className="grid gap-5 pb-10 grid-cols-1 min-[1180px]:grid-cols-[320px_minmax(0,1fr)_320px]">

      {/* ╔═══════════════════════════════════════════════════════════════╗ */}
      {/* ║                    LEFT — PROFILE RAIL                        ║ */}
      {/* ╚═══════════════════════════════════════════════════════════════╝ */}
      <div className="flex flex-col gap-5">
        {/* Back link */}
        <button onClick={onBack} className="self-start flex items-center gap-1.5 text-sm font-medium text-[#707EAE] hover:text-[#1B254B] transition">
          <I name="arrow-left" size={16} />
          返回候选人列表
        </button>

        {/* Profile card */}
        <Card extra="p-6">
          {/* Avatar + name row */}
          <div className="flex items-start gap-4">
            <span className="relative inline-block shrink-0 group" style={{ width: 76, height: 76 }}>
              <span className="block w-[76px] h-[76px] rounded-full ring-2 ring-white shadow-[0_4px_16px_rgba(112,144,176,0.18)] overflow-hidden bg-white">
                {photo
                  ? <img src={photo} className="w-full h-full object-cover" alt={c.name} />
                  : <AnimalAvatar animal={animal} size={76} />}
              </span>
              {c.gender && <GenderBadge gender={c.gender} size={76} />}
              <button
                onClick={() => setShowAvatar(true)}
                className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center text-white transition"
                title="修改头像"
              >
                <I name="image-plus" size={20} />
              </button>
            </span>
            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-[20px] font-bold text-[#1B254B] tracking-tight leading-tight truncate">{c.name}</h1>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-[#707EAE]">
                <I name="phone" size={12} />
                <span className="truncate">{c.phone}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[#707EAE]">
                <I name="map-pin" size={12} />
                <span className="truncate">{c.location}</span>
              </div>
            </div>
          </div>

          {/* Quick action icons */}
          <div className="mt-4 flex items-center gap-2">
            <ActionIcon icon="mail" tone="brand" label={c.email} />
            <ActionIcon icon="copy" tone="brand" label="复制信息" />
            <ActionIcon icon="share-2" tone="brand" label="分享" onClick={() => setShareOpen(true)} />
            <ActionIcon icon="ban" tone="red" label="加入黑名单" />
          </div>

          {/* ID + Star + Source */}
          <div className="mt-5 flex items-center justify-between text-xs">
            <span className="text-[#A3AED0] font-bold tracking-wider uppercase">{c.id.toUpperCase()}</span>
            {isStar && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FEF3C7] text-[#92400E] font-bold">
                <I name="star" size={12} />
                Star Candidate
              </span>
            )}
            <span className="flex items-center gap-1.5 text-[#A3AED0]">
              <span>来源</span>
              <span className="w-6 h-6 rounded-full bg-[#E9E3FF] text-[#422AFB] flex items-center justify-center">
                <I name={sourceIcon} size={12} />
              </span>
            </span>
          </div>

          {/* Profile completion */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#707EAE]">资料完整度</span>
              <button className="text-xs font-bold text-[#422AFB] flex items-center gap-1 hover:underline">
                <I name="pencil" size={11} /> 编辑
              </button>
            </div>
            <div className="relative h-2 rounded-full bg-[#F4F7FE] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${profileCompletion}%`,
                  background: 'linear-gradient(90deg,#868CFF 0%,#422AFB 100%)',
                }}
              ></div>
            </div>
            <div className="mt-1 flex justify-end">
              <span className="text-[11px] font-bold text-[#1B254B] bg-white px-1.5 py-0.5 rounded shadow-sm border border-[#E9ECEF]" style={{ marginRight: `calc(${100 - profileCompletion}% - 12px)` }}>{profileCompletion}%</span>
            </div>
          </div>

          {/* Matched / Against + Ring */}
          <div className="mt-4 flex items-start gap-3">
            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0 mt-0.5">
                  <I name="check" size={12} strokeWidth={2.6} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#15803D]">JD 命中</div>
                  <div className="text-xs text-[#1B254B] font-medium leading-snug">{matchedItems.join('、')}</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[#FEE2E2] text-[#B91C1C] flex items-center justify-center shrink-0 mt-0.5">
                  <I name="x" size={12} strokeWidth={2.6} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#B91C1C]">需关注</div>
                  <div className="text-xs text-[#1B254B] font-medium leading-snug">{againstItems.join('、')}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <MatchRing value={c.jdMatch} size={72} stroke={7} showLabel={false} />
              <div className="text-[10px] text-[#A3AED0] font-medium mt-1 text-center">JD 匹配度</div>
            </div>
          </div>
        </Card>

        {/* Properties table */}
        <Card extra="overflow-hidden">
          <Row label="核心技能" value={c.skills.slice(0, 3).join('、')} />
          <Row label="学历" value={`${c.education} · ${c.school}`} more />
          <Row label="工作经验" value={`${c.yearsExp} 年 · ${c.experience.length} 段经历`} more />
          <Row label="期望薪资" value="40W / 年（当前 32W）" />
          <Row label="可入职" value="到岗 13 天内" last />
        </Card>

        {/* Documents */}
        <Card extra="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-[#1B254B]">附件文档</span>
            <button className="text-[11px] text-[#A3AED0] hover:text-[#422AFB] flex items-center gap-1">
              <I name="download" size={11} /> 点击下载
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <DocPill tone="brand" icon="file-text">简历</DocPill>
            <DocPill tone="brand" icon="file-pen">求职信</DocPill>
            <DocPill tone="red" icon="paperclip">附件</DocPill>
          </div>
          <div className="mt-4 pt-3 border-t border-[#E9ECEF] flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-[#707EAE]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#422AFB]"></span>
              未验证
            </span>
            <span className="flex items-center gap-1.5 text-[#707EAE]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F53939]"></span>
              未验证
            </span>
            <button className="ml-auto text-[#422AFB] font-bold hover:underline">全部下载</button>
          </div>
        </Card>

        {/* Tags */}
        <Card extra="p-5">
          <div className="text-xs font-bold uppercase tracking-wide text-[#A3AED0] mb-3">候选人标签</div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="group inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-lg text-[11px] font-medium bg-[#E9E3FF] text-[#2111A5]">
                {t}
                <button
                  onClick={() => removeTag(t)}
                  className="w-4 h-4 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/60 transition"
                  title="删除"
                >
                  <I name="x" size={10} strokeWidth={2.6} />
                </button>
              </span>
            ))}
            {addingTag ? (
              <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-white border border-[#422AFB]">
                <input
                  ref={tagInputRef}
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTag();
                    else if (e.key === 'Escape') { setTagDraft(''); setAddingTag(false); }
                  }}
                  onBlur={commitTag}
                  placeholder="新标签"
                  maxLength={20}
                  className="text-[11px] font-medium text-[#1B254B] bg-transparent outline-none w-[80px]"
                />
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={commitTag}
                  className="w-5 h-5 rounded-md text-[#422AFB] hover:bg-[#F4F7FE] flex items-center justify-center"
                >
                  <I name="check" size={11} strokeWidth={2.6} />
                </button>
              </span>
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-dashed border-[#CBD5E0] text-[#707EAE] hover:border-[#422AFB] hover:text-[#422AFB] transition"
              >
                <I name="plus" size={11} strokeWidth={2.6} />
                添加
              </button>
            )}
          </div>
        </Card>
      </div>

      {/* ╔═══════════════════════════════════════════════════════════════╗ */}
      {/* ║                  CENTER — PIPELINE / DETAILS                  ║ */}
      {/* ╚═══════════════════════════════════════════════════════════════╝ */}
      <div className="flex flex-col gap-5 pt-7">
        {/* Top selector bar */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#707EAE] font-medium">当前阶段</span>
            <StageSelect value={status} onChange={setStatus} order={order} tones={window.MESA_STATUS_TONE} />
            <button onClick={() => setShowJD(true)} className="text-sm text-[#422AFB] font-bold hover:underline">查看 JD</button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#707EAE] font-medium">投递岗位</span>
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E9ECEF] text-sm font-bold text-[#1B254B] bg-white">
              {c.appliedFor}
              <I name="chevron-down" size={14} className="text-[#A3AED0]" />
            </div>
          </div>
        </div>

        {/* Stage tabs */}
        <StageTabs order={order} stageIdx={stageIdx} status={status} onChange={setStatus} onAdvance={advance} />

        {/* AI Summary card */}
        <Card extra="p-6 relative overflow-hidden ring-1 ring-[#E9E3FF]">
          <div className="flex items-start gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-base font-bold text-[#1B254B]">生成简历 AI 总结</h3>
                <AiBadge parser={c.parser} confidence={c.parserConfidence} />
              </div>
              <p className="text-sm text-[#1B254B] leading-relaxed" style={{ textWrap: 'pretty' }}>
                「{c.highlights[0]}。{c.skills[0]}，{c.skills[1] || ''}。当前匹配度 {c.jdMatch}/100，
                {c.jdMatch >= 85 ? '建议优先推进' : c.jdMatch >= 70 ? '可纳入面试候选' : '建议二次评估'}。」
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button className="text-sm font-bold text-[#422AFB] hover:underline flex items-center gap-1">
                  <I name="external-link" size={13} /> 查看简历
                </button>
                <Button variant="ghost" size="sm" icon={<I name="refresh-cw" size={14} />}>重新生成</Button>
              </div>
            </div>
            <RobotIllustration />
          </div>
          {/* Subtle brand left-border accent removed in favor of full ring above */}
        </Card>

        {/* Interviews */}
        <Card extra="p-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <h3 className="text-base font-bold text-[#1B254B]">面试安排</h3>
            <span className="text-xs text-[#A3AED0] font-medium">
              安排人：<span className="text-[#1B254B] font-bold">李薇</span> · {c.pushedAt}
            </span>
          </div>

          <div className="rounded-xl bg-[#F4F7FE]/60 p-4 flex flex-wrap items-center gap-5">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#1B254B]">技术面 · 一轮</span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-[#E9ECEF] text-[#707EAE] font-medium">线上</span>
              </div>
              <div className="mt-1.5 text-xs text-[#707EAE]">2026-05-22 · 14:00–15:30</div>
              <div className="mt-1.5 text-xs text-[#707EAE] flex items-center gap-1.5">
                <I name="video" size={12} />
                <a href="#" className="text-[#422AFB] hover:underline truncate">meet.mesa.app/{c.id}</a>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-[11px] font-bold text-[#A3AED0]">面试官</div>
              <AvatarStack candidates={window.MESA_CANDIDATES.slice(0, 3)} max={3} size={28} />
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-[11px] font-bold text-[#A3AED0]">面试小组</div>
              <AvatarStack candidates={window.MESA_CANDIDATES.slice(3, 7)} max={3} size={28} />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <button className="text-sm text-[#422AFB] font-bold hover:underline">编辑成员</button>
            <button
              onClick={() => onScheduleInterview && onScheduleInterview(c.id)}
              className="text-sm text-[#422AFB] font-bold hover:underline ml-auto"
            >
              + 新增轮次
            </button>
          </div>
        </Card>

        {/* Job Overview */}
        <Card extra="p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h3 className="text-base font-bold text-[#1B254B]">岗位概览</h3>
            <span className="text-xs text-[#A3AED0] font-medium">
              新岗位 · 创建人：<span className="text-[#1B254B] font-bold">李薇</span> · {c.pushedAt}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <StatTile icon="briefcase" label="经验" value={`${c.yearsExp - 1}–${c.yearsExp + 2} 年`} />
            <StatTile icon="graduation-cap" label="学历" value={c.education} />
            <StatTile icon="users" label="HC" value={`${window.MESA_JOBS.find((j) => j.title === c.appliedFor)?.openings || 1} 人`} />
          </div>
        </Card>

        {/* Work + Edu timeline */}
        <Card extra="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-[#1B254B]">工作经历</h3>
            <span className="text-xs text-[#A3AED0] font-medium">{c.experience.length} 段 · 共 {c.yearsExp} 年</span>
          </div>
          <Timeline items={c.experience} />

          <div className="mt-6 mb-5 h-px bg-[#E9ECEF]"></div>

          <h3 className="text-base font-bold text-[#1B254B] mb-4">教育经历</h3>
          <Timeline items={c.educationHistory.map((e) => ({
            period: e.period, company: e.school, title: `${e.degree} · ${e.major}`, summary: '',
          }))} />
        </Card>

        {/* Actions strip */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" icon={<I name="mail" size={16} />}>发送邮件</Button>
          <Button
            variant="ghost"
            icon={<I name="calendar-plus" size={16} />}
            onClick={() => onScheduleInterview && onScheduleInterview(c.id)}
          >
            安排面试
          </Button>
          <Button variant="primary" icon={<I name="arrow-right" size={16} />} onClick={advance}>
            {stageIdx >= order.length - 1 ? '已入职' : `推进到 ${order[stageIdx + 1]}`}
          </Button>
        </div>
      </div>

      {/* ╔═══════════════════════════════════════════════════════════════╗ */}
      {/* ║                    RIGHT — COMMENTS RAIL                      ║ */}
      {/* ╚═══════════════════════════════════════════════════════════════╝ */}
      <div className="flex flex-col gap-5 pt-7">
        {/* Comments */}
        <Card extra="p-5">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E9ECEF]">
            <h3 className="text-base font-bold text-[#1B254B]">评价</h3>
            <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] px-2 rounded-md bg-[#422AFB] text-white text-[11px] font-bold">{c.highlights.length + c.risks.length}</span>
          </div>

          <div className="mt-3 max-h-[260px] overflow-auto pr-1 space-y-3">
            {[
              { name: '李薇', role: 'HR · 负责人', text: c.highlights[0] || '候选人技术扎实，建议进入下一轮。', avatar: '../../assets/avatars/avatar2.png', time: '2026-05-13 14:22' },
              { name: '张磊', role: '技术面试官', text: c.skills[1] || '专业能力匹配岗位要求，沟通顺畅。', avatar: '../../assets/avatars/avatar4.png', time: '2026-05-12 18:05' },
              { name: '陈璐', role: 'HRBP', text: c.risks[0] || '薪资期望已与候选人对齐。', avatar: '../../assets/avatars/avatar7.png', time: '2026-05-10 09:48' },
            ].map((cm, i) => (
              <div key={i} className="flex gap-2.5">
                <img src={cm.avatar} className="w-8 h-8 rounded-full object-cover shrink-0" alt={cm.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#1B254B]">{cm.name}</span>
                    <span className="text-[10px] text-[#A3AED0]">{cm.role}</span>
                    {isAdmin && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#A3AED0] font-medium" title={`评价时间：${cm.time}`}>
                        <I name="clock" size={9} />
                        {cm.time}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#707EAE] leading-snug mt-0.5" style={{ textWrap: 'pretty' }}>{cm.text}</p>
                </div>
              </div>
            ))}
          </div>

          <button className="mt-3 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F4F7FE] text-sm font-bold text-[#422AFB] hover:bg-[#E9E3FF]/60 transition">
            <span className="w-6 h-6 rounded-md bg-[#422AFB] text-white flex items-center justify-center">
              <I name="message-square" size={13} />
            </span>
            添加评价
          </button>
        </Card>

        {/* Insights / Feedback tabs */}
        <Card extra="p-5">
          <div className="flex items-center gap-5 pb-3 border-b border-[#E9ECEF]">
            <TabBtn active={rightTab === 'insights'} onClick={() => setRightTab('insights')}>洞察</TabBtn>
            <TabBtn active={rightTab === 'feedback'} onClick={() => setRightTab('feedback')}>反馈</TabBtn>
          </div>

          {rightTab === 'insights' ? (
            <div className="mt-4 space-y-3">
              <InsightRow tone="brand" icon="zap" title="核心技能" count={c.skills.length} items={c.skills} />
              <InsightRow tone="amber" icon="alert-triangle" title="风险与缺项" count={c.risks.length} items={c.risks.length ? c.risks : ['暂无显著风险项']} muted={c.risks.length === 0} />
              <InsightRow tone="green" icon="award" title="亮点与评价" count={c.highlights.length} items={c.highlights} />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {[
                { round: '初筛', who: '李薇', score: '通过', tone: 'green' },
                { round: '电话沟通', who: '陈璐', score: '推荐', tone: 'green' },
                { round: '技术一面', who: '张磊', score: '待评估', tone: 'amber' },
                { round: '技术二面', who: '王浩', score: '未开始', tone: 'gray' },
                { round: '终面', who: '—', score: '未开始', tone: 'gray' },
              ].map((f, i) => <FeedbackRow key={i} {...f} />)}
            </div>
          )}
        </Card>
      </div>

      <CandidateShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        candidateIds={[c.id]}
      />

      <Modal open={showJD} onClose={() => setShowJD(false)} width={680}>
        <div className="p-7">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">JOB DESCRIPTION</div>
              <h3 className="text-2xl font-bold text-[#1B254B] mt-1">{c.appliedFor}</h3>
            </div>
            <button onClick={() => setShowJD(false)} className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0]">
              <I name="x" size={18} />
            </button>
          </div>
          <div className="text-sm text-[#1B254B] leading-relaxed space-y-2">
            <p><strong>岗位职责：</strong></p>
            <p>负责属地适应性路试管理：故障描述、原因分析、措施制定、方案验证、问题关闭等推进解决；问题清单管理（专业分配、严重度定义）。</p>
            <p>负责市场抱怨管理：从产品经理 / 售后 / CRM / 联合驾评 / 海外舆情等渠道收集抱怨，按共性问题已立项整改、产品定义类、新立项整改分类。</p>
            <p>负责售后重大问题管理：第一时间获取重大质量问题，联合售后经理与质量改进经理输出解析报告，重大 SAB 类问题日清推进。</p>
            <p><strong>任职要求：</strong></p>
            <p>本科及以上学历；汽车、机械、机电一体化、整车质量管理等相关专业；具备主机厂工作经验，至少独立担当 1 个完整一级项目质量管理工作；熟悉主机厂产品开发流程；车辆驾驶评价技能良好，英语正常交流，有海外工作经验优先。</p>
          </div>
        </div>
      </Modal>

      <Modal open={showAvatar} onClose={() => { setShowAvatar(false); setCropSrc(null); }} width={cropSrc ? 540 : 520}>
        <div className="p-7">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">{cropSrc ? '手动裁剪' : '管理员操作'}</div>
              <h3 className="text-2xl font-bold text-[#1B254B] mt-1">{cropSrc ? '裁剪头像' : '修改候选人头像'}</h3>
              <p className="text-sm text-[#707EAE] mt-1" style={{ textWrap: 'pretty' }}>
                {cropSrc
                  ? '拖动图片调整位置，滑动下方滑块缩放。选择区域将作为圆形头像应用。'
                  : 'AI 从简历中提取了可用照片，选中后手动裁剪为圆形头像。'}
              </p>
            </div>
            <button onClick={() => { setShowAvatar(false); setCropSrc(null); }} className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0]">
              <I name="x" size={18} />
            </button>
          </div>

          {cropSrc ? (
            <AvatarCropper
              src={cropSrc}
              zoom={cropZoom}
              setZoom={setCropZoom}
              offset={cropOffset}
              setOffset={setCropOffset}
              onCancel={() => { setCropSrc(null); setCropOffset({ x: 0, y: 0 }); setCropZoom(1.4); }}
              onApply={() => {
                setPhoto(cropSrc);
                setAnimal(null);
                setCropSrc(null);
                setShowAvatar(false);
              }}
            />
          ) : (
            <ExtractedPhotosAndAnimals
              candidate={c}
              animal={animal}
              photo={photo}
              setAnimal={setAnimal}
              setPhoto={setPhoto}
              onPickForCrop={(src) => { setCropSrc(src); setCropOffset({ x: 0, y: 0 }); setCropZoom(1.4); }}
              onClose={() => setShowAvatar(false)}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────── small helpers ───────────────────────────

function ExtractedPhotosAndAnimals({ candidate: c, animal, photo, setAnimal, setPhoto, onPickForCrop, onClose }) {
  // Mock extracted photos from resume. In production these come from the LLM/OCR pipeline.
  // Use a mix of avatars as stand-ins for "AI detected face crops".
  const extracted = React.useMemo(() => {
    const pool = [c.avatar, '../../assets/avatars/avatar1.png', '../../assets/avatars/avatar3.png', '../../assets/avatars/avatar5.png', '../../assets/avatars/avatar6.png', '../../assets/avatars/avatar8.png']
      .filter(Boolean);
    // Pick 3 unique
    const seen = new Set();
    const out = [];
    for (const src of pool) {
      if (!seen.has(src) && out.length < 3) { seen.add(src); out.push(src); }
    }
    return out;
  }, [c.id]);

  return (
    <>
      {/* Extracted from resume */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">从简历中提取</div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E9E3FF] text-[#422AFB]">
          <I name="sparkles" size={10} />
          AI 识别 {extracted.length} 张面部照片
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {extracted.map((src, i) => (
          <button
            key={i}
            onClick={() => onPickForCrop(src)}
            className="group relative rounded-xl overflow-hidden bg-[#F4F7FE] border border-[#E9ECEF] hover:border-[#422AFB] transition aspect-[4/5]"
            title="点击手动裁剪"
          >
            <img src={src} className="w-full h-full object-cover" alt="" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end justify-center pb-2">
              <span className="text-[11px] font-bold text-white inline-flex items-center gap-1">
                <I name="crop" size={12} /> 裁剪
              </span>
            </div>
            {/* Faint face-detect frame */}
            <div className="absolute inset-3 border-2 border-white/40 border-dashed rounded-full pointer-events-none"></div>
            <span className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/90 text-[#1B254B]">
              #{i + 1}
            </span>
          </button>
        ))}
      </div>

      {/* Default animals */}
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-2">默认动物头像（隐私模式）</div>
      <div className="grid grid-cols-6 gap-3 mb-5">
        {Object.entries(window.MESA_ANIMAL_PRESETS).map(([key, p]) => {
          const sel = animal === key && !photo;
          return (
            <button
              key={key}
              onClick={() => { setAnimal(key); setPhoto(null); }}
              className={`relative flex flex-col items-center gap-1 p-2 rounded-xl transition ${sel ? 'bg-[#F4F7FE] ring-2 ring-[#422AFB]' : 'hover:bg-[#F4F7FE]'}`}
              title={p.label}
            >
              <AnimalAvatar animal={key} size={48} />
              <span className="text-[10px] text-[#707EAE] font-medium">{p.label}</span>
              {sel && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#422AFB] text-white flex items-center justify-center">
                  <I name="check" size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upload custom */}
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-2">或上传自定义图片</div>
      <button className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-[#CBD5E0] text-[#707EAE] hover:border-[#422AFB] hover:text-[#422AFB] hover:bg-[#F4F7FE] transition">
        <span className="w-10 h-10 rounded-full bg-[#F4F7FE] flex items-center justify-center">
          <I name="upload" size={16} />
        </span>
        <span className="flex-1 text-left">
          <span className="block text-sm font-bold">上传 PNG / JPG</span>
          <span className="block text-[11px] text-[#A3AED0]">上传后将进入手动裁剪 · 仅管理员可见</span>
        </span>
      </button>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#E9ECEF]">
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button variant="primary" icon={<I name="check" size={16} />} onClick={onClose}>保存</Button>
      </div>
    </>
  );
}

function AvatarCropper({ src, zoom, setZoom, offset, setOffset, onCancel, onApply }) {
  const dragRef = useRef(null);
  const dragging = useRef(null);

  function onDown(e) {
    const p = e.touches ? e.touches[0] : e;
    dragging.current = { startX: p.clientX, startY: p.clientY, ox: offset.x, oy: offset.y };
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging.current) return;
    const p = e.touches ? e.touches[0] : e;
    setOffset({
      x: dragging.current.ox + (p.clientX - dragging.current.startX),
      y: dragging.current.oy + (p.clientY - dragging.current.startY),
    });
  }
  function onUp() { dragging.current = null; }

  useEffect(() => {
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  });

  const FRAME = 260;
  return (
    <>
      <div className="flex items-start gap-5">
        {/* Crop stage */}
        <div className="relative shrink-0" style={{ width: FRAME, height: FRAME }}>
          <div
            ref={dragRef}
            onMouseDown={onDown}
            onTouchStart={onDown}
            className="absolute inset-0 rounded-2xl overflow-hidden bg-[#0B1437] cursor-grab active:cursor-grabbing select-none"
          >
            <img
              src={src}
              draggable={false}
              alt=""
              className="absolute pointer-events-none select-none"
              style={{
                left: '50%',
                top: '50%',
                width: FRAME,
                height: FRAME,
                objectFit: 'cover',
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: dragging.current ? 'none' : 'transform 0.15s ease-out',
              }}
            />
            {/* Dim mask outside the circular crop */}
            <svg className="absolute inset-0 pointer-events-none" width={FRAME} height={FRAME}>
              <defs>
                <mask id="cropMask">
                  <rect width="100%" height="100%" fill="white" />
                  <circle cx={FRAME / 2} cy={FRAME / 2} r={FRAME / 2 - 14} fill="black" />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(11, 20, 55, 0.55)" mask="url(#cropMask)" />
              <circle cx={FRAME / 2} cy={FRAME / 2} r={FRAME / 2 - 14} fill="none" stroke="white" strokeWidth="2" strokeOpacity="0.9" />
              {/* Crosshair guides */}
              <line x1={FRAME / 2} y1={14} x2={FRAME / 2} y2={FRAME - 14} stroke="white" strokeOpacity="0.18" strokeDasharray="3 4" />
              <line x1={14} y1={FRAME / 2} x2={FRAME - 14} y2={FRAME / 2} stroke="white" strokeOpacity="0.18" strokeDasharray="3 4" />
            </svg>
            <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/90 text-[10px] font-bold text-[#1B254B]">
              <I name="move" size={10} /> 拖动调整
            </div>
          </div>
        </div>

        {/* Side: preview + zoom + tips */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-2">预览</div>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-[#F4F7FE] ring-2 ring-white shadow">
                <div className="w-full h-full relative">
                  <img
                    src={src}
                    alt=""
                    className="absolute"
                    style={{
                      left: '50%',
                      top: '50%',
                      width: 64,
                      height: 64,
                      objectFit: 'cover',
                      transform: `translate(-50%, -50%) translate(${(offset.x / FRAME) * 64}px, ${(offset.y / FRAME) * 64}px) scale(${zoom})`,
                    }}
                  />
                </div>
              </div>
              <div className="w-10 h-10 rounded-full overflow-hidden bg-[#F4F7FE] ring-2 ring-white shadow">
                <div className="w-full h-full relative">
                  <img
                    src={src}
                    alt=""
                    className="absolute"
                    style={{
                      left: '50%',
                      top: '50%',
                      width: 40,
                      height: 40,
                      objectFit: 'cover',
                      transform: `translate(-50%, -50%) translate(${(offset.x / FRAME) * 40}px, ${(offset.y / FRAME) * 40}px) scale(${zoom})`,
                    }}
                  />
                </div>
              </div>
              <div className="w-7 h-7 rounded-full overflow-hidden bg-[#F4F7FE] ring-2 ring-white shadow">
                <div className="w-full h-full relative">
                  <img
                    src={src}
                    alt=""
                    className="absolute"
                    style={{
                      left: '50%',
                      top: '50%',
                      width: 28,
                      height: 28,
                      objectFit: 'cover',
                      transform: `translate(-50%, -50%) translate(${(offset.x / FRAME) * 28}px, ${(offset.y / FRAME) * 28}px) scale(${zoom})`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">缩放</span>
              <span className="text-[11px] text-[#707EAE] font-bold tabular-nums">{zoom.toFixed(2)}×</span>
            </div>
            <div className="flex items-center gap-2">
              <I name="zoom-out" size={14} className="text-[#A3AED0]" />
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-[#422AFB]"
              />
              <I name="zoom-in" size={14} className="text-[#A3AED0]" />
            </div>
          </div>

          <div className="rounded-xl bg-[#F4F7FE] p-3 text-[11px] text-[#707EAE] leading-relaxed" style={{ textWrap: 'pretty' }}>
            <div className="flex items-center gap-1.5 mb-1 text-[#1B254B] font-bold">
              <I name="info" size={12} className="text-[#422AFB]" />
              裁剪提示
            </div>
            建议将面部居中放在圆圈内，留出耳朵和下颌的空间，缩放控制在 1.2–1.8× 之间效果最佳。
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-[#E9ECEF]">
        <Button variant="ghost" icon={<I name="rotate-ccw" size={14} />} onClick={() => { setOffset({ x: 0, y: 0 }); setZoom(1.4); }}>
          重置
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>返回</Button>
          <Button variant="primary" icon={<I name="check" size={16} />} onClick={onApply}>
            应用为头像
          </Button>
        </div>
      </div>
    </>
  );
}

function ActionIcon({ icon, tone = 'brand', label, onClick }) {
  const tones = {
    brand: 'bg-[#F4F7FE] text-[#422AFB] hover:bg-[#E9E3FF]',
    red:   'bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FECACA]',
  };
  return (
    <button onClick={onClick} title={label} className={`w-9 h-9 rounded-full flex items-center justify-center transition ${tones[tone]}`}>
      <I name={icon} size={15} />
    </button>
  );
}

function Row({ label, value, more, last }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3.5 ${last ? '' : 'border-b border-[#F1F3F8]'} `}>
      <span className="text-xs font-bold text-[#1B254B] w-20 shrink-0">{label}</span>
      <span className="text-xs text-[#707EAE] flex-1 truncate" title={value}>{value}</span>
      {more && <I name="chevron-down" size={14} className="text-[#A3AED0]" />}
    </div>
  );
}

function DocPill({ icon, tone, children }) {
  const tones = {
    brand: 'border-[#A195FD] text-[#422AFB]',
    red:   'border-[#FCA5A5] text-[#B91C1C]',
  };
  return (
    <button className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white text-xs font-bold hover:bg-[#F4F7FE] transition ${tones[tone]}`}>
      <I name={icon} size={13} />
      {children}
    </button>
  );
}

function StageSelect({ value, onChange, order, tones }) {
  const [open, setOpen] = useState(false);
  const tone = tones[value];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E9ECEF] text-sm font-bold bg-white hover:bg-[#F4F7FE] transition"
        style={{ color: tone?.fg || '#1B254B' }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone?.dot || '#A3AED0' }}></span>
        {value}
        <I name="chevron-down" size={14} className="text-[#A3AED0]" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1.5 left-0 min-w-[140px] bg-white rounded-xl shadow-[0_12px_30px_rgba(112,144,176,0.18)] border border-[#E9ECEF] py-1.5">
          {order.map((s) => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[#F4F7FE] ${s === value ? 'font-bold text-[#1B254B]' : 'text-[#707EAE]'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: tones[s]?.dot }}></span>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StageTabs({ order, stageIdx, status, onChange }) {
  return (
    <div className="rounded-2xl border border-[#E9ECEF] bg-white p-1.5 flex items-center gap-1 overflow-x-auto">
      {order.map((s, i) => {
        const isActive = s === status;
        const isDone = i < stageIdx;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`relative flex-1 min-w-[88px] px-3 py-2 rounded-xl text-sm font-bold transition whitespace-nowrap ${
              isActive ? 'bg-[#422AFB] text-white shadow-[0_4px_14px_rgba(66,42,251,0.22)]' :
              isDone   ? 'text-[#15803D] hover:bg-[#F4F7FE]' :
                         'text-[#707EAE] hover:bg-[#F4F7FE]'
            }`}
          >
            {isDone && <I name="check" size={12} className="inline mr-1 -mt-0.5" />}
            {s}
          </button>
        );
      })}
    </div>
  );
}

function RobotIllustration() {
  return (
    <div className="relative shrink-0 hidden md:block" style={{ width: 132, height: 110 }}>
      {/* Soft tile grid backdrop */}
      <svg viewBox="0 0 132 110" className="absolute inset-0" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="botBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E9E3FF" />
            <stop offset="1" stopColor="#F4F7FE" />
          </linearGradient>
          <pattern id="grid" width="11" height="11" patternUnits="userSpaceOnUse">
            <path d="M11 0 H0 V11" stroke="#C0B8FE" strokeWidth="0.5" fill="none" opacity="0.5" />
          </pattern>
        </defs>
        <rect x="6" y="22" width="120" height="84" rx="14" fill="url(#botBg)" />
        <rect x="6" y="22" width="120" height="84" rx="14" fill="url(#grid)" />
        {/* circuit dots */}
        <g fill="#422AFB" opacity="0.5">
          <circle cx="22" cy="92" r="1.6" />
          <circle cx="44" cy="98" r="1.6" />
          <circle cx="108" cy="96" r="1.6" />
          <circle cx="118" cy="38" r="1.6" />
        </g>
      </svg>
      {/* Robot */}
      <svg viewBox="0 0 132 110" className="absolute inset-0" xmlns="http://www.w3.org/2000/svg">
        {/* Antenna */}
        <line x1="66" y1="16" x2="66" y2="28" stroke="#422AFB" strokeWidth="2" strokeLinecap="round" />
        <circle cx="66" cy="14" r="3" fill="#422AFB" />
        {/* Head */}
        <rect x="42" y="28" width="48" height="36" rx="10" fill="white" stroke="#422AFB" strokeWidth="2" />
        {/* Eyes */}
        <circle cx="55" cy="46" r="4" fill="#422AFB" />
        <circle cx="77" cy="46" r="4" fill="#422AFB" />
        <circle cx="56" cy="45" r="1.2" fill="white" />
        <circle cx="78" cy="45" r="1.2" fill="white" />
        {/* Mouth */}
        <rect x="58" y="55" width="16" height="3" rx="1.5" fill="#A195FD" />
        {/* Body */}
        <rect x="46" y="66" width="40" height="22" rx="6" fill="#422AFB" />
        <rect x="52" y="72" width="28" height="10" rx="2" fill="#E9E3FF" />
        {/* Arms */}
        <rect x="36" y="70" width="8" height="14" rx="3" fill="#422AFB" />
        <rect x="88" y="70" width="8" height="14" rx="3" fill="#422AFB" />
      </svg>
    </div>
  );
}

function StatTile({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-[#F4F7FE]/70">
      <div className="w-11 h-11 rounded-xl bg-white text-[#422AFB] flex items-center justify-center shrink-0 shadow-sm">
        <I name={icon} size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-base font-bold text-[#1B254B] leading-tight truncate">{value}</div>
        <div className="text-[11px] text-[#A3AED0] font-medium">{label}</div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`relative pb-3 -mb-px text-sm font-bold transition ${active ? 'text-[#422AFB]' : 'text-[#707EAE] hover:text-[#1B254B]'}`}
    >
      {children}
      {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-[#422AFB]"></span>}
    </button>
  );
}

function InsightRow({ tone, icon, title, count, items, muted }) {
  const tones = {
    brand: { bg: '#E9E3FF', fg: '#422AFB' },
    amber: { bg: '#FEF3C7', fg: '#92400E' },
    green: { bg: '#DCFCE7', fg: '#15803D' },
  };
  const t = tones[tone];
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-xl border border-[#F1F3F8] ${muted ? 'opacity-70' : ''}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2.5 px-3 py-2.5">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.bg, color: t.fg }}>
          <I name={icon} size={14} />
        </span>
        <span className="text-sm font-bold text-[#1B254B] flex-1 text-left">{title}</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: t.bg, color: t.fg }}>{count}</span>
        <I name={open ? 'chevron-up' : 'chevron-down'} size={14} className="text-[#A3AED0]" />
      </button>
      {open && (
        <ul className="px-3 pb-3 space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2 text-[12px] text-[#707EAE] leading-snug">
              <span className="w-1 h-1 rounded-full mt-2 shrink-0" style={{ background: t.fg }}></span>
              <span className="flex-1" style={{ textWrap: 'pretty' }}>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedbackRow({ round, who, score, tone }) {
  const tones = {
    green: { bg: '#DCFCE7', fg: '#15803D' },
    amber: { bg: '#FEF3C7', fg: '#92400E' },
    gray:  { bg: '#F4F7FE', fg: '#707EAE' },
  };
  const t = tones[tone];
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F4F7FE] transition">
      <span className="text-sm font-bold text-[#1B254B] flex-1">{round}</span>
      <span className="text-[11px] text-[#A3AED0]">{who}</span>
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: t.bg, color: t.fg }}>{score}</span>
    </div>
  );
}

function Timeline({ items }) {
  return (
    <ol className="relative ml-2">
      {items.map((it, i) => (
        <li key={i} className="relative pl-7 pb-5 last:pb-0">
          <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-white border-2 border-[#422AFB]"></div>
          {i < items.length - 1 && <div className="absolute left-[5px] top-4 bottom-0 w-px bg-[#E9ECEF]"></div>}
          <div className="text-[11px] font-bold text-[#422AFB] uppercase tracking-wide">{it.period}</div>
          <div className="text-sm font-bold text-[#1B254B] mt-0.5">{it.company} · <span className="font-medium text-[#707EAE]">{it.title}</span></div>
          {it.summary && <div className="text-xs text-[#707EAE] mt-1 leading-relaxed">{it.summary}</div>}
        </li>
      ))}
    </ol>
  );
}

Object.assign(window, { CandidateDetail });
