// MESA Recruit · Candidate List
// Style ref: MESA/src/views/admin/default/components/CheckTable.jsx + ComplexTable.jsx

function Candidates({ onOpenCandidate, onAddCandidate, prefilterStatus }) {
  const all = window.MESA_CANDIDATES;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(prefilterStatus || 'all');
  const [edu, setEdu] = useState('all');
  const [sortBy, setSortBy] = useState('match');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [shareOpen, setShareOpen] = useState(false);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  const filtered = all.filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (edu !== 'all' && c.education !== edu) return false;
    if (query && !(c.name.includes(query) || c.appliedFor.includes(query) || c.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())))) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'match')   return b.jdMatch - a.jdMatch;
    if (sortBy === 'recent')  return b.pushedAt.localeCompare(a.pushedAt);
    if (sortBy === 'years')   return b.yearsExp - a.yearsExp;
    return 0;
  });

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Filters row */}
      <Card extra="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[260px] flex items-center gap-2 bg-[#F4F7FE] rounded-xl px-3 h-11">
            <I name="search" size={16} className="text-[#A0AEC0]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="姓名 / 投递岗位 / 技能标签…"
              className="flex-1 bg-transparent text-sm text-[#1B254B] outline-none placeholder:text-[#A0AEC0]"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[#A3AED0] hover:text-[#1B254B]">
                <I name="x" size={14} />
              </button>
            )}
          </div>

          <FilterChip label="状态" value={status} onChange={setStatus}
            options={[
              { v: 'all', l: '全部' },
              ...window.MESA_STATUS_ORDER.map((s) => ({ v: s, l: s })),
            ]} />

          <FilterChip label="学历" value={edu} onChange={setEdu}
            options={[
              { v: 'all', l: '全部' },
              { v: '本科', l: '本科' },
              { v: '硕士', l: '硕士' },
              { v: '博士', l: '博士' },
            ]} />

          <FilterChip label="排序" value={sortBy} onChange={setSortBy}
            options={[
              { v: 'match',  l: '匹配度 ↓' },
              { v: 'recent', l: '最近推送' },
              { v: 'years',  l: '经验年限 ↓' },
            ]} />

          <div className="flex-1" />

          {selecting ? (
            <>
              <Button variant="ghost" size="md" icon={<I name="x" size={16} />} onClick={exitSelect}>退出选择</Button>
              <Button
                variant="primary"
                size="md"
                icon={<I name="share-2" size={16} />}
                onClick={() => setShareOpen(true)}
                className={selected.size === 0 ? 'opacity-50 pointer-events-none' : ''}
              >
                分享 {selected.size > 0 ? `${selected.size} 人` : ''}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="md" icon={<I name="share-2" size={16} />} onClick={() => setSelecting(true)}>分享</Button>
              <Button variant="ghost" size="md" icon={<I name="download" size={16} />}>导出</Button>
              <Button variant="primary" size="md" icon={<I name="upload-cloud" size={16} />} onClick={onAddCandidate}>
                上传简历
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Result count + bulk */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-[#707EAE]">
          共 <span className="font-bold text-[#1B254B]">{filtered.length}</span> 位候选人
          {status !== 'all' && <span> · 状态 <span className="font-bold text-[#1B254B]">{status}</span></span>}
          {selecting && (
            <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#E9E3FF] text-[#422AFB] font-bold text-xs">
              <I name="check-square" size={12} />
              选择模式
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {selecting && (
            <button
              onClick={() => {
                if (selected.size === filtered.length) setSelected(new Set());
                else setSelected(new Set(filtered.map((c) => c.id)));
              }}
              className="text-xs text-[#422AFB] font-bold hover:underline"
            >
              {selected.size === filtered.length && filtered.length > 0 ? '取消全选' : '全选当前页'}
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-[#A3AED0]">
            <I name="info" size={14} />
            <span>{selecting ? '点击卡片勾选 · 点击“分享”生成链接' : '左键卡片查看详情 · 右键批量操作'}</span>
          </div>
        </div>
      </div>

      {/* Candidate grid (cards, not a plain table) */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {filtered.map((c) => (
          <CandidateRow
            key={c.id}
            candidate={c}
            selecting={selecting}
            isSelected={selected.has(c.id)}
            onToggle={() => toggleSelect(c.id)}
            onOpen={() => onOpenCandidate(c.id)}
          />
        ))}
        {filtered.length === 0 && (
          <Card extra="col-span-2 p-10 items-center text-center">
            <div className="w-14 h-14 rounded-full bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0] mx-auto">
              <I name="users" size={26} />
            </div>
            <p className="mt-3 text-sm text-[#707EAE]">没有匹配的候选人。调整筛选条件或上传新的简历。</p>
            <div className="mt-4"><Button onClick={onAddCandidate}>上传简历</Button></div>
          </Card>
        )}
      </div>

      {/* Floating bottom selection bar */}
      {selecting && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#1B254B] text-white shadow-[0_20px_50px_rgba(27,37,75,0.35)]">
            <div className="flex items-center gap-2 pr-3 border-r border-white/15">
              <span className="w-8 h-8 rounded-full bg-[#422AFB] flex items-center justify-center font-bold text-sm">
                {selected.size}
              </span>
              <span className="text-sm font-medium">已选中</span>
            </div>
            <button
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
              className="text-sm font-medium text-white/80 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              清空
            </button>
            <button
              onClick={() => setShareOpen(true)}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-[#422AFB] hover:bg-[#3311DB] text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <I name="share-2" size={14} />
              生成分享链接
            </button>
            <button onClick={exitSelect} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center">
              <I name="x" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Share modal */}
      <CandidateShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        candidateIds={[...selected]}
      />
    </div>
  );
}

function FilterChip({ label, value, options, onChange }) {
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-11 px-4 rounded-xl bg-white border border-[#E9ECEF] text-sm font-medium text-[#1B254B] hover:border-[#422AFB] transition"
      >
        <span className="text-[#A3AED0] text-xs">{label}</span>
        <span className="font-bold">{current.l}</span>
        <I name="chevron-down" size={14} className="text-[#A3AED0]" />
      </button>
      {open && (
        <div className="absolute top-12 left-0 z-20 min-w-[160px] rounded-xl bg-white shadow-[0_20px_25px_-5px_rgba(112,144,176,0.20)] py-2">
          {options.map((o) => (
            <button
              key={o.v}
              onClick={() => { onChange(o.v); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-[#F4F7FE] ${o.v === value ? 'font-bold text-[#422AFB]' : 'text-[#1B254B] font-medium'}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateRow({ candidate: c, onOpen, selecting, isSelected, onToggle }) {
  const [tags, setTags] = useState(c.tags);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  function commit() {
    const v = draft.trim();
    if (v && !tags.includes(v)) {
      const next = [...tags, v];
      setTags(next);
      c.tags = next; // mutate source so detail page reflects change
    }
    setDraft('');
    setAdding(false);
  }

  function remove(t, e) {
    e.stopPropagation();
    const next = tags.filter((x) => x !== t);
    setTags(next);
    c.tags = next;
  }

  function stop(e) { e.stopPropagation(); }

  return (
    <Card
      extra={`p-5 transition cursor-pointer ${
        selecting && isSelected
          ? 'ring-2 ring-[#422AFB] shadow-[14px_17px_40px_4px_rgba(66,42,251,0.14)]'
          : 'hover:shadow-[14px_17px_40px_4px_rgba(66,42,251,0.10)]'
      }`}
      onClick={() => (selecting ? onToggle() : onOpen())}
    >
      <div className="flex items-start gap-4">
        {selecting && (
          <div
            className={`w-5 h-5 mt-1.5 rounded-md flex items-center justify-center transition shrink-0 ${
              isSelected
                ? 'bg-[#422AFB] text-white'
                : 'bg-white border-2 border-[#CBD5E0]'
            }`}
          >
            {isSelected && <I name="check" size={12} strokeWidth={3} />}
          </div>
        )}
        <Avatar src={c.avatar} name={c.name} size={56} gender={c.gender} animal={c.animal} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[#1B254B] text-base">{c.name}</span>
            <span className="text-[10px] font-bold text-[#1B254B] bg-[#F4F7FE] px-2 py-0.5 rounded">{c.education}</span>
            <AiBadge parser={c.parser} confidence={c.parserConfidence} />
            <span className="ml-auto" />
            <StatusPill status={c.status} />
          </div>
          <div className="text-xs text-[#707EAE] mt-1.5 truncate">
            投递 <span className="text-[#1B254B] font-bold">{c.appliedFor}</span> · {c.location} · {c.yearsExp}y · {c.source}
          </div>
          <div className="flex items-center gap-1.5 mt-3 flex-wrap" onClick={stop}>
            {tags.map((t) => (
              <EditableTag key={t} label={t} onRemove={(e) => remove(t, e)} />
            ))}
            {adding ? (
              <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-lg bg-white border border-[#422AFB]">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    else if (e.key === 'Escape') { setDraft(''); setAdding(false); }
                  }}
                  onBlur={commit}
                  placeholder="新标签"
                  maxLength={20}
                  className="text-[11px] font-medium text-[#1B254B] bg-transparent outline-none w-[72px]"
                />
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={commit}
                  className="w-5 h-5 rounded-md text-[#422AFB] hover:bg-[#F4F7FE] flex items-center justify-center"
                >
                  <I name="check" size={11} strokeWidth={2.6} />
                </button>
              </span>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setAdding(true); }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium text-[#707EAE] border border-dashed border-[#CBD5E0] hover:border-[#422AFB] hover:text-[#422AFB] transition"
                title="添加标签"
              >
                <I name="plus" size={11} strokeWidth={2.6} />
                添加
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 pt-1">
          <MatchRing value={c.jdMatch} size={56} stroke={6} showLabel={false} />
          <div className="text-[10px] text-[#A3AED0] font-medium">JD 匹配</div>
        </div>
      </div>
    </Card>
  );
}

function EditableTag({ label, onRemove }) {
  const isBrandLike = label.length <= 6 && /^[A-Za-z0-9/]+$/.test(label);
  const cls = isBrandLike
    ? 'bg-[#E9E3FF] text-[#2111A5] font-bold'
    : 'bg-[#F4F7FE] text-[#1B254B]';
  return (
    <span className={`group inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-lg text-[11px] font-medium ${cls}`}>
      {label}
      <button
        onClick={onRemove}
        className="w-4 h-4 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/60 transition"
        title="删除"
      >
        <I name="x" size={10} strokeWidth={2.6} />
      </button>
    </span>
  );
}

Object.assign(window, { Candidates, CandidateRow });
