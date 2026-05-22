// MESA Recruit · Share Modal + Bulk-share floating bar
// Used by Candidates list (multi-select) and CandidateDetail (single).

function CandidateShareModal({ open, onClose, candidateIds = [] }) {
  const candidates = (candidateIds || [])
    .map((id) => window.MESA_CANDIDATES.find((c) => c.id === id))
    .filter(Boolean);

  const [permission, setPermission] = useState('view');
  const [expires, setExpires] = useState('7d');
  const [hideContact, setHideContact] = useState(true);
  const [copied, setCopied] = useState(false);

  const linkId = React.useMemo(() => {
    if (candidates.length === 0) return 'preview';
    const base = candidates.map((c) => c.id).join(',') + ':' + permission + ':' + expires;
    return btoa(unescape(encodeURIComponent(base))).replace(/[+/=]/g, '').slice(0, 16);
  }, [candidates.length, permission, expires]);

  const link = `https://recruit.mesa.app/share/${linkId}`;

  function copy() {
    if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const platforms = [
    { name: '飞书', bg: '#00D6B9', glyph: '飞' },
    { name: '微信', bg: '#07C160', glyph: '微' },
    { name: 'QQ',   bg: '#1D72F8', glyph: 'Q' },
    { name: '钉钉', bg: '#1677FF', glyph: '钉' },
    { name: '邮件', bg: '#422AFB', icon: 'mail' },
  ];

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} width={540}>
      <div className="p-7">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">分享候选人</div>
            <h3 className="text-2xl font-bold text-[#1B254B] mt-1 truncate">
              {candidates.length === 0 ? '请先选择候选人' :
               candidates.length === 1 ? candidates[0].name :
               `${candidates.length} 位候选人`}
            </h3>
            <p className="text-sm text-[#707EAE] mt-1" style={{ textWrap: 'pretty' }}>
              生成只读链接，接收方无需登录即可查看候选人详情。
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0] shrink-0">
            <I name="x" size={18} />
          </button>
        </div>

        {/* Selected candidates preview */}
        {candidates.length > 0 && (
          <div className="rounded-xl bg-[#F4F7FE] p-3 mb-4 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold text-[#1B254B] shrink-0">
              {candidates.length === 1 ? candidates[0].appliedFor : `已选 ${candidates.length} 人`}
            </span>
            <div className="flex -space-x-2 flex-1 min-w-0">
              {candidates.slice(0, 8).map((c) => (
                <span key={c.id} className="inline-block w-7 h-7 rounded-full ring-2 ring-white overflow-hidden shrink-0" title={c.name}>
                  {c.avatar
                    ? <img src={c.avatar} className="w-full h-full object-cover" alt={c.name} />
                    : <AnimalAvatar animal={c.animal} size={28} />}
                </span>
              ))}
              {candidates.length > 8 && (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full ring-2 ring-white bg-white text-[10px] font-bold text-[#707EAE]">
                  +{candidates.length - 8}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <ShareSelect
            label="查看权限"
            value={permission}
            options={[
              { v: 'view',    l: '仅查看', icon: 'eye' },
              { v: 'comment', l: '可评论', icon: 'message-square' },
              { v: 'edit',    l: '可编辑', icon: 'pencil' },
            ]}
            onChange={setPermission}
          />
          <ShareSelect
            label="有效期"
            value={expires}
            options={[
              { v: '24h',     l: '24 小时', icon: 'clock' },
              { v: '7d',      l: '7 天',    icon: 'calendar' },
              { v: '30d',     l: '30 天',   icon: 'calendar-days' },
              { v: 'forever', l: '永久',     icon: 'infinity' },
            ]}
            onChange={setExpires}
          />
        </div>

        <label className="flex items-center gap-2.5 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={hideContact}
            onChange={(e) => setHideContact(e.target.checked)}
            className="w-4 h-4 accent-[#422AFB] rounded"
          />
          <span className="text-sm text-[#1B254B] font-medium">隐藏联系方式</span>
          <span className="text-xs text-[#A3AED0]">手机号、邮箱将自动打码</span>
        </label>

        {/* Link */}
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-2">分享链接</div>
        <div className="flex items-stretch gap-2 mb-5 p-1 rounded-xl border border-[#E9ECEF] bg-[#F4F7FE]">
          <div className="flex-1 min-w-0 flex items-center px-3">
            <I name="link" size={14} className="text-[#A3AED0] mr-2 shrink-0" />
            <span className="text-sm text-[#1B254B] truncate" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {link}
            </span>
          </div>
          <button
            onClick={copy}
            disabled={candidates.length === 0}
            className={`px-4 h-9 rounded-lg font-bold text-sm transition inline-flex items-center gap-1.5 disabled:opacity-50 ${
              copied ? 'bg-[#15803D] text-white' : 'bg-[#422AFB] text-white hover:bg-[#3311DB]'
            }`}
          >
            <I name={copied ? 'check' : 'copy'} size={14} />
            {copied ? '已复制' : '复制'}
          </button>
        </div>

        {/* Platforms */}
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-3">分享到</div>
        <div className="grid grid-cols-5 gap-2">
          {platforms.map((p) => (
            <button
              key={p.name}
              disabled={candidates.length === 0}
              className="flex flex-col items-center gap-2 p-2.5 rounded-xl hover:bg-[#F4F7FE] disabled:opacity-40 disabled:cursor-not-allowed transition group"
            >
              <span
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow-[0_4px_10px_rgba(0,0,0,0.08)] group-hover:scale-105 transition-transform"
                style={{ background: p.bg, fontSize: 18 }}
              >
                {p.icon ? <I name={p.icon} size={20} /> : p.glyph}
              </span>
              <span className="text-xs text-[#707EAE] font-medium">{p.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between pt-4 border-t border-[#E9ECEF] text-xs text-[#A3AED0]">
          <div className="flex items-center gap-1.5">
            <I name="shield-check" size={13} />
            链接已加密 · 接收方可见操作日志
          </div>
          <button className="text-[#422AFB] hover:underline font-bold">分享记录</button>
        </div>
      </div>
    </Modal>
  );
}

function ShareSelect({ label, value, options, onChange }) {
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
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-2">{label}</div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 h-10 px-3 rounded-xl bg-white border border-[#E9ECEF] text-sm font-bold text-[#1B254B] hover:border-[#422AFB] transition"
      >
        {current.icon && <I name={current.icon} size={14} className="text-[#422AFB]" />}
        <span className="flex-1 text-left">{current.l}</span>
        <I name="chevron-down" size={14} className="text-[#A3AED0]" />
      </button>
      {open && (
        <div className="absolute z-30 top-[68px] left-0 right-0 rounded-xl bg-white shadow-[0_12px_30px_rgba(112,144,176,0.20)] border border-[#E9ECEF] py-1.5">
          {options.map((o) => (
            <button
              key={o.v}
              onClick={() => { onChange(o.v); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#F4F7FE] ${o.v === value ? 'font-bold text-[#422AFB]' : 'text-[#1B254B] font-medium'}`}
            >
              {o.icon && <I name={o.icon} size={14} />}
              {o.l}
              {o.v === value && <I name="check" size={14} className="ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CandidateShareModal });
