// MESA Recruit · Login screen
// 三种登录方式（密码 / 短信 / 微信扫码）+ 最近账号快速切换 + 退出后回流提示
// Style ref: 与品牌渐变 + Card 圆角 + DM Sans/Poppins 字体保持一致。
// 数据：复用 window.MESA_ACCOUNTS / window.MESA_ROLES。

function LoginScreen({ onLogin, justLoggedOutFrom }) {
  const [picker, setPicker] = useState(false);      // 切换账号面板
  const [identifier, setIdentifier] = useState(justLoggedOutFrom ? justLoggedOutFrom.email : 'liwei@mesa.app');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const accounts = window.MESA_ACCOUNTS || [];
  const ROLES = window.MESA_ROLES || {};

  // 默认匹配 identifier → user (用于头像展示)
  const matched =
    accounts.find((a) => a.email === identifier.trim()) || accounts[0];

  function submit(targetUserId) {
    setError('');
    if (!targetUserId) {
      if (!identifier.trim()) return setError('请输入邮箱或手机号');
      if (!password) return setError('请输入密码');
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const id =
        targetUserId ||
        (accounts.find((a) => a.email === identifier.trim()) || accounts[0]).id;
      onLogin(id);
    }, 600);
  }

  return (
    <div className="min-h-screen flex bg-[#F4F7FE] overflow-hidden">
      {/* ─── 左侧品牌面板 ─── */}
      <BrandPanel />

      {/* ─── 右侧表单区 ─── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 顶部 logo + 状态提示 */}
        <div className="flex items-center justify-between px-10 pt-7">
          <span
            className="text-[22px] uppercase text-[#1B254B] tracking-tight lg:hidden"
            style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
          >
            MESA <span style={{ fontWeight: 500 }}>RECRUIT</span>
          </span>
          <span className="hidden lg:block" />
          <div className="flex items-center gap-2 text-[12px] text-[#707EAE] font-medium">
            <span>还没有账号？</span>
            <button className="font-bold text-[#422AFB] hover:underline">联系管理员邀请</button>
          </div>
        </div>

        {/* 中间表单 */}
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="w-full max-w-[440px]">
            {/* 退出后回流提示 */}
            {justLoggedOutFrom && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl bg-[#DCFCE7] border border-[#86EFAC] px-4 py-3">
                <span className="w-8 h-8 rounded-full bg-[#22C55E] text-white flex items-center justify-center shrink-0">
                  <I name="check" size={14} strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[#15803D]">已安全退出</div>
                  <div className="text-[11px] text-[#15803D]/80 truncate">
                    {justLoggedOutFrom.name} · {justLoggedOutFrom.email}
                  </div>
                </div>
              </div>
            )}

            {/* 标题 */}
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[#A3AED0] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#422AFB]" />
              欢迎回来
            </div>
            <h1 className="text-[34px] font-bold text-[#1B254B] tracking-tight leading-[1.15]">
              登录 MESA Recruit
            </h1>
            <p className="mt-2 text-sm text-[#707EAE] leading-relaxed">
              用你的工作邮箱、手机号或微信扫码进入。
              <span className="font-bold text-[#1B254B]"> 管理员</span>可邀请新成员、按 JD 与部门授权。
            </p>

            {/* 表单本体 */}
            <div className="mt-7">
              <div className="space-y-3.5">
                <LabeledField
                  label="工作邮箱或手机号"
                  icon="at-sign"
                  value={identifier}
                  onChange={setIdentifier}
                  placeholder="liwei@mesa.app"
                  trailing={
                    matched && matched.email === identifier.trim() ? (
                      <img src={matched.avatar} className="w-7 h-7 rounded-full object-cover" alt="" />
                    ) : null
                  }
                />
                <LabeledField
                  label="密码"
                  icon="lock"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={setPassword}
                  placeholder="至少 8 位 · 含字母和数字"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPwd((x) => !x)}
                      className="text-[#A3AED0] hover:text-[#1B254B] w-7 h-7 rounded-md flex items-center justify-center"
                    >
                      <I name={showPwd ? 'eye-off' : 'eye'} size={15} />
                    </button>
                  }
                />
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span
                      onClick={() => setRemember((r) => !r)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                        remember ? 'bg-[#422AFB] border-[#422AFB]' : 'bg-white border-[#CBD5E0]'
                      }`}
                    >
                      {remember && <I name="check" size={11} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className="text-[12px] font-medium text-[#707EAE]">记住此设备 30 天</span>
                  </label>
                  <button className="text-[12px] font-bold text-[#422AFB] hover:underline">忘记密码？</button>
                </div>
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="mt-3 flex items-center gap-2 text-[12px] font-bold text-[#B91C1C]">
                  <I name="alert-circle" size={13} />
                  {error}
                </div>
              )}

              {/* 主 CTA */}
              <button
                onClick={() => submit()}
                disabled={loading}
                className="mt-5 w-full h-12 rounded-xl text-white text-[15px] font-bold transition shadow-[0_8px_24px_rgba(66,42,251,0.28)] hover:shadow-[0_10px_30px_rgba(66,42,251,0.34)] disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg,#868CFF 0%,#432CF3 50%,#422AFB 100%)' }}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    登录中…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    登录
                    <I name="arrow-right" size={16} />
                  </span>
                )}
              </button>

              {/* 快速切换账号 */}
              <div className="mt-6 pt-5 border-t border-[#E9ECEF]">
                <button
                  onClick={() => setPicker((x) => !x)}
                  className="w-full flex items-center justify-between text-[12px] font-bold text-[#707EAE] hover:text-[#1B254B] transition"
                >
                  <span className="flex items-center gap-2">
                    <I name="users" size={13} />
                    切换到其他账号
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#F4F7FE] text-[#422AFB]">
                      {accounts.length}
                    </span>
                  </span>
                  <I name={picker ? 'chevron-up' : 'chevron-down'} size={14} />
                </button>

                {picker && (
                  <div className="mt-3 grid grid-cols-1 gap-1.5 max-h-[230px] overflow-auto pr-1 -mr-1">
                    {accounts.map((a) => {
                      const role = ROLES[a.role] || { label: a.role, bg: '#F4F7FE', fg: '#707EAE', icon: 'user-round' };
                      return (
                        <button
                          key={a.id}
                          onClick={() => submit(a.id)}
                          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F4F7FE] transition text-left group"
                        >
                          <img src={a.avatar} className="w-9 h-9 rounded-full object-cover shrink-0" alt={a.name} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-[#1B254B] truncate">{a.name}</span>
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold shrink-0"
                                style={{ background: role.bg, color: role.fg }}
                              >
                                <I name={role.icon} size={8} />
                                {role.label}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#A3AED0] truncate">{a.email}</div>
                          </div>
                          <I name="arrow-right" size={14} className="text-[#A3AED0] group-hover:text-[#422AFB] transition shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 底部脚注 */}
        <div className="px-10 pb-6 flex items-center justify-between text-[11px] text-[#A3AED0]">
          <span>© 2026 MESA Recruit · AI-native hiring</span>
          <div className="flex items-center gap-4">
            <button className="hover:text-[#1B254B]">隐私协议</button>
            <button className="hover:text-[#1B254B]">服务条款</button>
            <button className="hover:text-[#1B254B] flex items-center gap-1">
              <I name="globe" size={11} />
              中文
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── 左侧品牌面板 ───────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex w-[44%] max-w-[640px] min-h-screen relative overflow-hidden p-10 flex-col text-white"
         style={{ background: 'linear-gradient(135deg,#868CFF 0%,#432CF3 45%,#2111A5 100%)' }}>
      {/* 背景纹理：点阵 + 圆光晕 */}
      <div className="absolute inset-0 opacity-[0.18]"
           style={{
             backgroundImage: 'radial-gradient(circle, #FFFFFF 1px, transparent 1px)',
             backgroundSize: '22px 22px',
           }} />
      <div className="absolute -top-32 -right-32 w-[440px] h-[440px] rounded-full"
           style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)' }} />
      <div className="absolute -bottom-32 -left-20 w-[360px] h-[360px] rounded-full"
           style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)' }} />

      {/* 顶部 wordmark */}
      <div className="relative z-10 flex items-center justify-between">
        <span
          className="text-[26px] uppercase tracking-tight"
          style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
        >
          MESA <span style={{ fontWeight: 500 }}>RECRUIT</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[10px] font-bold tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-[#86EFAC]" />
          v1.4 · BETA
        </span>
      </div>

      {/* 中部 tagline */}
      <div className="relative z-10 mt-auto mb-auto">
        <div className="text-[14px] uppercase tracking-[0.3em] opacity-70 mb-5">AI · NATIVE · HIRING</div>
        <div
          className="text-[44px] leading-[1.15] font-medium italic"
          style={{ fontFamily: "'Gill Sans Nova', 'DM Sans', serif" }}
        >
          Hire smarter,<br />
          not harder.
        </div>
        <p className="mt-6 text-[15px] leading-relaxed opacity-85 max-w-[420px]" style={{ textWrap: 'pretty' }}>
          一份简历，多个模型并行解析；候选人匹配度、风险、亮点全部一屏可见。
        </p>
      </div>

      {/* 底部 stats */}
      <div className="relative z-10 grid grid-cols-3 gap-4 pt-6 border-t border-white/15">
        <Stat n="2,148" label="累计候选人" />
        <Stat n="412" label="活跃 JD" />
        <Stat n="38" label="本月入职" />
      </div>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div>
      <div className="text-[22px] font-bold tabular-nums">{n}</div>
      <div className="text-[10px] uppercase tracking-wider opacity-70 mt-0.5">{label}</div>
    </div>
  );
}

// ─────────────────────── 子组件 ───────────────────────
function LabeledField({ label, icon, value, onChange, placeholder, type = 'text', trailing }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5 ml-0.5">{label}</div>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
            <I name={icon} size={15} />
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`h-12 w-full rounded-xl border border-[#E9ECEF] bg-white text-sm text-[#1B254B] font-medium outline-none focus:border-[#422AFB] transition ${
            icon ? 'pl-10' : 'pl-3'
          } ${trailing ? 'pr-12' : 'pr-3'}`}
        />
        {trailing && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen });
