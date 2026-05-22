// MESA Recruit · Resume Inbox / Upload
// Drag-drop, user API key setup, LLM model picker, live parsing progress.

function Upload({ onOpenCandidate }) {
  const [provider, setProvider] = useState('kimi');
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [queue, setQueue] = useState([
    { id: 'q1', filename: '张子轩-云架构-202605.pdf',  size: '218 KB', status: 'done',    progress: 100, candidateId: 'c-010', match: 87 },
    { id: 'q2', filename: '马天宇-高压-202604.pdf',     size: '189 KB', status: 'done',    progress: 100, candidateId: 'c-012', match: 73 },
    { id: 'q3', filename: '林子璇-视觉算法-cv.pdf',    size: '256 KB', status: 'parsing', progress: 64,  candidateId: null,    match: null },
    { id: 'q4', filename: '王嘉伟-车身-202605.pdf',    size: '142 KB', status: 'parsing', progress: 28,  candidateId: null,    match: null },
    { id: 'q5', filename: '周明璐-财务分析师.docx',     size: '94 KB',  status: 'queue',   progress: 0,   candidateId: null,    match: null },
  ]);

  // Simulate streaming progress
  useEffect(() => {
    const t = setInterval(() => {
      setQueue((q) => q.map((it) => {
        if (it.status === 'parsing') {
          const next = it.progress + 4;
          if (next >= 100) return { ...it, status: 'done', progress: 100, match: 70 + Math.floor(Math.random() * 25) };
          return { ...it, progress: next };
        }
        return it;
      }));
    }, 400);
    return () => clearInterval(t);
  }, []);

  const providerName = provider === 'kimi' ? 'Kimi' : 'DeepSeek';
  const keyConfigured = keySaved && apiKey.trim().length > 0;

  function updateApiKey(e) {
    setApiKey(e.target.value);
    if (keySaved) setKeySaved(false);
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <Card extra="p-6">
        <div className="flex items-center gap-3 mb-4">
          <I name="sparkles" size={18} className="text-[#422AFB]" />
          <h3 className="text-lg font-bold text-[#1B254B]">AI 解析引擎</h3>
          <span className="ml-auto text-xs text-[#A3AED0]">使用你自己的 API Key · 密钥仅保存在当前浏览器会话</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-5 grid grid-cols-2 gap-3">
            <ProviderCard
              name="Kimi"
              description="Moonshot · 适合长文档结构化抽取"
              active={provider === 'kimi'}
              onClick={() => setProvider('kimi')}
            />
            <ProviderCard
              name="DeepSeek"
              description="DeepSeek · 适合复杂经历归纳推理"
              active={provider === 'deepseek'}
              onClick={() => setProvider('deepseek')}
            />
          </div>
          <div className="xl:col-span-7 rounded-2xl border border-[#E9ECEF] bg-[#F8FAFF] p-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#E9E3FF] text-[#422AFB] flex items-center justify-center">
                <I name="key-round" size={20} />
              </div>
              <div>
                <div className="text-base font-bold text-[#1B254B]">添加 API Key</div>
                <div className="text-xs text-[#707EAE]">当前模型：{providerName} · 支持 sk- 开头的密钥格式</div>
              </div>
              <span className={`ml-auto text-[11px] px-2.5 py-1 rounded-full font-bold ${keyConfigured ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEF3C7] text-[#92400E]'}`}>
                {keyConfigured ? '已保存' : '待配置'}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A3AED0]">
                  <I name="lock-keyhole" size={16} />
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={updateApiKey}
                  placeholder="sk-..."
                  className="h-11 w-full rounded-xl border border-[#E9ECEF] bg-white pl-10 pr-3 text-sm font-medium text-[#1B254B] outline-none placeholder:text-[#A0AEC0] focus:border-[#422AFB]"
                />
              </div>
              <Button
                variant="primary"
                size="md"
                icon={<I name="save" size={16} />}
                disabled={!apiKey.trim()}
                className={!apiKey.trim() ? 'opacity-50 cursor-not-allowed' : ''}
                onClick={() => setKeySaved(true)}
              >
                保存 Key
              </Button>
              <Button
                variant="ghost"
                size="md"
                icon={<I name="plug-zap" size={16} />}
                disabled={!keyConfigured}
                className={!keyConfigured ? 'opacity-50 cursor-not-allowed' : ''}
              >
                测试连接
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-[#707EAE]">
              <I name="shield-check" size={14} className="text-[#22C55E]" />
              <span>密钥不会写入示例数据；真实产品中应从加密存储或环境变量读取。</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Dropzone */}
      <Card extra="p-8">
        <div className="border-2 border-dashed border-[#CBD5E0] rounded-2xl p-10 flex flex-col items-center text-center bg-[#F4F7FE]/60 hover:bg-[#F4F7FE] transition">
          <div className="w-16 h-16 rounded-full bg-[#E9E3FF] text-[#422AFB] flex items-center justify-center mb-4">
            <I name="upload-cloud" size={30} />
          </div>
          <h3 className="text-xl font-bold text-[#1B254B]">拖拽简历到此处</h3>
          <p className="text-sm text-[#707EAE] mt-1">支持 PDF / DOCX / 链接 · 单次最多 20 份 · {keyConfigured ? '自动调用' : '添加 API Key 后调用'} <span className="font-bold text-[#1B254B]">{providerName}</span> 解析</p>
          <div className="flex items-center gap-2 mt-5">
            <Button variant="primary" icon={<I name="folder" size={16} />}>选择文件</Button>
            <Button variant="ghost" icon={<I name="link" size={16} />}>粘贴链接</Button>
            <Button variant="ghost" icon={<I name="link-2" size={16} />}>接入 BOSS / 智联</Button>
          </div>
        </div>

        {/* JD selector */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <label className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">默认归口 JD</label>
            <div className="mt-2 px-4 h-11 rounded-xl border border-[#E9ECEF] flex items-center justify-between">
              <span className="text-sm font-bold text-[#1B254B]">智能驾驶感知工程师</span>
              <I name="chevron-down" size={14} className="text-[#A3AED0]" />
            </div>
          </div>
          <div className="col-span-1">
            <label className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">来源</label>
            <div className="mt-2 px-4 h-11 rounded-xl border border-[#E9ECEF] flex items-center justify-between">
              <span className="text-sm font-bold text-[#1B254B]">自动上传</span>
              <I name="chevron-down" size={14} className="text-[#A3AED0]" />
            </div>
          </div>
          <div className="col-span-1">
            <label className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">自动操作</label>
            <div className="mt-2 px-4 h-11 rounded-xl border border-[#E9ECEF] flex items-center justify-between">
              <span className="text-sm font-bold text-[#1B254B]">匹配 ≥ 80 自动通知</span>
              <I name="chevron-down" size={14} className="text-[#A3AED0]" />
            </div>
          </div>
        </div>
      </Card>

      {/* Mobile / QR / link upload */}
      <MobileUploadCard />

      {/* Queue */}
      <Card extra="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[#1B254B]">解析队列</h3>
            <p className="text-xs text-[#A3AED0]">{queue.filter((q) => q.status !== 'done').length} 份进行中 · {queue.filter((q) => q.status === 'done').length} 份已完成</p>
          </div>
          <Button variant="ghost" icon={<I name="rotate-cw" size={14} />} size="sm">刷新</Button>
        </div>
        <div className="flex flex-col gap-2">
          {queue.map((q) => (
            <QueueRow key={q.id} item={q} onOpen={() => q.candidateId && onOpenCandidate(q.candidateId)} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function ProviderCard({ name, description, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left rounded-2xl p-4 border-2 transition ${active ? 'border-[#422AFB] bg-[#F4F7FE]' : 'border-[#E9ECEF] hover:border-[#A195FD]'}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${active ? 'text-white' : 'text-[#422AFB] bg-[#E9E3FF]'}`}
          style={active ? { background: 'linear-gradient(135deg,#868CFF 0%,#422AFB 100%)' } : {}}>
          <I name="sparkles" size={20} />
        </div>
        <div>
          <div className="text-base font-bold text-[#1B254B]">{name}</div>
          <div className="text-xs text-[#707EAE]">{description}</div>
        </div>
        {active && (
          <span className="ml-auto w-6 h-6 rounded-full bg-[#422AFB] text-white flex items-center justify-center">
            <I name="check" size={14} />
          </span>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-[#E9ECEF] flex items-center gap-2">
        <I name="badge-check" size={14} className="text-[#22C55E]" />
        <span className="text-xs font-bold text-[#1B254B]">自带 Key 接入</span>
      </div>
    </button>
  );
}

function QueueRow({ item, onOpen }) {
  const isDone = item.status === 'done';
  const isParsing = item.status === 'parsing';
  return (
    <div
      onClick={isDone ? onOpen : undefined}
      className={`flex items-center gap-4 px-3 py-3 rounded-xl border border-[#E9ECEF] ${isDone ? 'cursor-pointer hover:bg-[#F4F7FE]' : ''} bg-white`}
    >
      <div className="w-10 h-12 rounded-md bg-[#F4F7FE] border border-[#E9ECEF] flex items-center justify-center text-[#422AFB] shrink-0">
        <I name="file-text" size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#1B254B] truncate">{item.filename}</span>
          <span className="text-[11px] text-[#A3AED0]">{item.size}</span>
        </div>
        {isParsing && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[#EDF2F7] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${item.progress}%`, background: 'linear-gradient(90deg,#868CFF,#422AFB)' }}></div>
            </div>
            <span className="text-[11px] text-[#422AFB] font-bold">{item.progress}%</span>
          </div>
        )}
        {item.status === 'queue' && <div className="text-[11px] text-[#A3AED0] mt-1">等待中…</div>}
        {isDone && <div className="text-[11px] text-[#15803D] font-bold mt-0.5">解析完成 · 匹配 {item.match}</div>}
      </div>
      {isDone && (
        <div className="flex items-center gap-2">
          <MatchRing value={item.match} size={36} stroke={4} showLabel={false} />
          <button className="text-sm font-bold text-[#422AFB] hover:underline">查看 →</button>
        </div>
      )}
      {isParsing && (
        <span className="text-[11px] font-bold text-[#422AFB] bg-[#E9E3FF] px-2 py-1 rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#422AFB] animate-pulse"></span>
          AI 解析中
        </span>
      )}
    </div>
  );
}

function MobileUploadCard() {
  const [copied, setCopied] = useState(false);
  const uploadLink = 'https://recruit.mesa.app/upload/u-2a8f3b';

  function copy() {
    if (navigator.clipboard) navigator.clipboard.writeText(uploadLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Card extra="p-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <I name="smartphone" size={18} className="text-[#422AFB]" />
        <h3 className="text-lg font-bold text-[#1B254B]">更多上传方式</h3>
        <span className="text-xs text-[#A3AED0] ml-auto">向候选人本人或同事分享，可远程上传简历</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* QR code */}
        <div className="rounded-2xl border border-[#E9ECEF] bg-[#F8FAFF] p-5 flex items-start gap-4">
          <div className="w-[124px] h-[124px] rounded-xl bg-white p-2 ring-1 ring-[#E9ECEF] shrink-0">
            <FakeQrCode />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <I name="qr-code" size={14} className="text-[#422AFB]" />
              <span className="text-sm font-bold text-[#1B254B]">扫码上传</span>
            </div>
            <p className="text-xs text-[#707EAE] mt-1.5 leading-relaxed" style={{ textWrap: 'pretty' }}>
              用手机掃描二维码，从微信 / 飞书 / 文件库直接上传简历到当前 JD。
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button variant="ghost" size="sm" icon={<I name="download" size={12} />}>保存图片</Button>
              <Button variant="ghost" size="sm" icon={<I name="rotate-cw" size={12} />}>重生成</Button>
            </div>
            <div className="mt-2.5 flex items-center gap-3 text-[10px] text-[#A3AED0] font-medium flex-wrap">
              <span className="flex items-center gap-1"><I name="clock" size={10} /> 30 天有效</span>
              <span className="flex items-center gap-1"><I name="users" size={10} /> 最多 200 份</span>
            </div>
          </div>
        </div>

        {/* Shareable link */}
        <div className="rounded-2xl border border-[#E9ECEF] bg-[#F8FAFF] p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1.5">
            <I name="link" size={16} className="text-[#422AFB]" />
            <span className="text-sm font-bold text-[#1B254B]">分享上传链接</span>
          </div>
          <p className="text-xs text-[#707EAE] leading-relaxed mb-3" style={{ textWrap: 'pretty' }}>
            把链接发给候选人本人或同事，对方点开即可上传简历，无需登录。
          </p>

          <div className="flex items-stretch gap-2 p-1 rounded-xl bg-white border border-[#E9ECEF]">
            <div className="flex-1 min-w-0 flex items-center px-3">
              <span className="text-xs text-[#1B254B] truncate" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {uploadLink}
              </span>
            </div>
            <button
              onClick={copy}
              className={`px-3 h-8 rounded-lg font-bold text-xs inline-flex items-center gap-1 transition ${
                copied ? 'bg-[#15803D] text-white' : 'bg-[#422AFB] text-white hover:bg-[#3311DB]'
              }`}
            >
              <I name={copied ? 'check' : 'copy'} size={11} />
              {copied ? '已复制' : '复制'}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-1 flex-wrap">
            <SocialSendChip name="飞书" bg="#00D6B9" glyph="飞" />
            <SocialSendChip name="微信" bg="#07C160" glyph="微" />
            <SocialSendChip name="QQ" bg="#1D72F8" glyph="Q" />
            <SocialSendChip name="钉钉" bg="#1677FF" glyph="钉" />
            <SocialSendChip name="邮件" bg="#422AFB" icon="mail" />
          </div>

          <div className="mt-auto pt-3 flex items-center gap-3 text-[10px] text-[#A3AED0] font-medium flex-wrap">
            <span className="flex items-center gap-1"><I name="clock" size={10} /> 30 天有效</span>
            <span className="flex items-center gap-1"><I name="shield-check" size={10} /> 无需登录</span>
            <span className="flex items-center gap-1"><I name="inbox" size={10} /> 0 / 200 已收</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SocialSendChip({ name, bg, glyph, icon }) {
  return (
    <button
      title={`分享到 ${name}`}
      className="inline-flex items-center gap-1.5 pl-1 pr-2 h-7 rounded-md hover:bg-white border border-transparent hover:border-[#E9ECEF] transition"
    >
      <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ background: bg }}>
        {icon ? <I name={icon} size={10} /> : glyph}
      </span>
      <span className="text-xs text-[#707EAE] font-medium">{name}</span>
    </button>
  );
}

function FakeQrCode() {
  const N = 21;
  const cells = React.useMemo(() => {
    let s = 31415;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const arr = [];
    for (let r = 0; r < N; r++) {
      const row = [];
      for (let c = 0; c < N; c++) row.push(rnd() > 0.55 ? 1 : 0);
      arr.push(row);
    }
    // Clear finder patterns + center logo area
    const clearArea = (rs, cs, rsize, csize) => {
      for (let r = rs; r < rs + rsize; r++)
        for (let c = cs; c < cs + csize; c++)
          if (arr[r] && arr[r][c] !== undefined) arr[r][c] = 0;
    };
    clearArea(0, 0, 8, 8);
    clearArea(0, N - 8, 8, 8);
    clearArea(N - 8, 0, 8, 8);
    clearArea(N / 2 - 2, N / 2 - 2, 5, 5);
    return arr;
  }, []);

  const size = 100;
  const cell = size / N;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <rect width={size} height={size} fill="white" />
      {cells.flatMap((row, r) =>
        row.map((v, c) =>
          v ? <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell + 0.2} height={cell + 0.2} fill="#1B254B" rx={cell * 0.15} /> : null
        )
      )}
      {/* Finder patterns */}
      {[[0, 0], [0, N - 7], [N - 7, 0]].map(([r, c], i) => (
        <g key={i}>
          <rect x={c * cell} y={r * cell} width={cell * 7} height={cell * 7} rx={cell * 0.8} fill="#1B254B" />
          <rect x={(c + 1) * cell} y={(r + 1) * cell} width={cell * 5} height={cell * 5} rx={cell * 0.6} fill="white" />
          <rect x={(c + 2) * cell} y={(r + 2) * cell} width={cell * 3} height={cell * 3} rx={cell * 0.4} fill="#422AFB" />
        </g>
      ))}
      {/* Center MESA logo bubble */}
      <rect x={size / 2 - 11} y={size / 2 - 11} width={22} height={22} rx={6} fill="white" />
      <rect x={size / 2 - 9} y={size / 2 - 9} width={18} height={18} rx={5} fill="#422AFB" />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" fontFamily="DM Sans, sans-serif">M</text>
    </svg>
  );
}

Object.assign(window, { Upload });