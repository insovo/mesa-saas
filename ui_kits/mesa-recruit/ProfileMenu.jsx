// MESA Recruit · Profile menu, account switcher, and admin account management
// Wires into Topbar's avatar. Roles: admin / editor / viewer.

const ROLES = {
  admin:  { label: '管理员',   bg: '#E9E3FF', fg: '#2111A5', dot: '#422AFB', icon: 'shield-check',
            desc: '可编辑所有内容 · 管理账号与权限 · 按 JD / 部门授权' },
  editor: { label: '编辑账号', bg: '#DBEAFE', fg: '#1D4ED8', dot: '#3B82F6', icon: 'pencil',
            desc: '可编辑授权范围内的内容 · 管理员细化页面权限' },
  viewer: { label: '仅阅读',   bg: '#F4F7FE', fg: '#707EAE', dot: '#A3AED0', icon: 'eye',
            desc: '需管理员或编辑授予阅读范围 · 不可修改' },
};

window.MESA_ACCOUNTS = [
  { id: 'u-001', name: '李薇',  email: 'liwei@mesa.app',     phone: '138-0013-4001', dept: 'HR · 招聘组',     title: '高级招聘经理', role: 'admin',  avatar: '../../assets/avatars/avatar4.png',  scopes: { jds: '全部 JD', depts: '全部部门', pages: '全部页面' } },
  { id: 'u-002', name: '张磊',  email: 'zhanglei@mesa.app',  phone: '139-2233-1102', dept: '智驾 · 感知',     title: '技术经理',     role: 'editor', avatar: '../../assets/avatars/avatar2.png',  scopes: { jds: '智驾 / 智舱 5 个 JD', depts: '智能驾驶部', pages: '候选人 · 面试 · 报表' } },
  { id: 'u-003', name: '陈璐',  email: 'chenlu@mesa.app',    phone: '186-1100-2244', dept: 'HRBP · 三电',     title: 'HRBP',         role: 'editor', avatar: '../../assets/avatars/avatar7.png',  scopes: { jds: '三电 / 底盘 8 个 JD', depts: '三电中心 · 底盘',     pages: '候选人 · 面试' } },
  { id: 'u-004', name: '王浩',  email: 'wanghao@mesa.app',   phone: '152-9988-7766', dept: '智驾 · 规控',     title: '面试官',       role: 'viewer', avatar: '../../assets/avatars/avatar9.png',  scopes: { jds: '智能驾驶感知工程师 · 底盘域控软件经理', depts: '智能驾驶部', pages: '候选人详情(只读)' } },
  { id: 'u-005', name: '吴敏',  email: 'wumin@mesa.app',     phone: '177-3344-5566', dept: '车身 · 工艺',     title: '招聘协调员',   role: 'viewer', avatar: '../../assets/avatars/avatar11.png', scopes: { jds: '车身工艺工程师',            depts: '车身工艺部', pages: '候选人详情(只读)' } },
];

window.MESA_CURRENT_USER_ID = 'u-001';

// ─────────────────────────── ProfileMenu (dropdown) ───────────────────────────
function ProfileMenu({ user, onClose, onOpenProfile, onOpenSwitch, onOpenAdmin, onLogout }) {
  const role = ROLES[user.role];
  const ref = useRef(null);
  useEffect(() => {
    function out(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function esc(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', out);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-12 right-0 z-50 w-[280px] rounded-2xl bg-white shadow-[0_25px_60px_-12px_rgba(27,37,75,0.25)] border border-[#E9ECEF] overflow-hidden"
    >
      {/* Header */}
      <div className="relative h-16" style={{ background: 'linear-gradient(135deg,#868CFF 0%,#432CF3 50%,#422AFB 100%)' }}>
        <div className="absolute -bottom-6 left-4">
          <img src={user.avatar} className="w-14 h-14 rounded-full ring-4 ring-white object-cover" alt={user.name} />
        </div>
      </div>
      <div className="pt-8 px-4 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-bold text-[#1B254B]">{user.name}</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                style={{ background: role.bg, color: role.fg }}>
            <I name={role.icon} size={10} />
            {role.label}
          </span>
        </div>
        <div className="mt-1 text-xs text-[#A3AED0]">{user.email}</div>
        <div className="mt-1 text-xs text-[#707EAE]">{user.dept} · {user.title}</div>
      </div>

      <div className="px-2 py-1 border-t border-[#F1F3F8]">
        <MenuItem icon="user-round" onClick={onOpenProfile} label="个人信息" sub="姓名 / 邮箱 / 密码" />
        {user.role === 'admin' && (
          <MenuItem icon="shield-check" onClick={onOpenAdmin} label="账号与权限管理"
                    sub={`${window.MESA_ACCOUNTS.length} 个账号 · 按 JD / 部门授权`} pill="管理员" />
        )}
        <MenuItem icon="users" onClick={onOpenSwitch} label="切换账号"
                  sub={`${window.MESA_ACCOUNTS.length - 1} 个已登录账号`} />
      </div>
      <div className="px-2 py-1 border-t border-[#F1F3F8]">
        <MenuItem icon="log-out" onClick={onLogout} label="退出账号" tone="red" />
      </div>
    </div>
  );
}

function MenuItem({ icon, label, sub, onClick, tone, pill }) {
  const toneCls = tone === 'red'
    ? 'text-[#B91C1C] hover:bg-[#FEE2E2]'
    : 'text-[#1B254B] hover:bg-[#F4F7FE]';
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition text-left ${toneCls}`}
    >
      <span className="w-8 h-8 rounded-lg bg-[#F4F7FE] flex items-center justify-center shrink-0">
        <I name={icon} size={15} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold truncate">{label}</span>
        {sub && <span className="block text-[11px] text-[#A3AED0] font-medium truncate">{sub}</span>}
      </span>
      {pill && <span className="text-[10px] font-bold text-[#422AFB]">{pill}</span>}
      <I name="chevron-right" size={14} className="text-[#A3AED0]" />
    </button>
  );
}

// ─────────────────────────── Profile Settings Modal ───────────────────────────
function ProfileSettingsModal({ open, onClose, user }) {
  const [tab, setTab] = useState('info');
  const [draft, setDraft] = useState(user);
  useEffect(() => { setDraft(user); }, [user]);
  if (!open) return null;
  const role = ROLES[user.role];
  return (
    <Modal open={open} onClose={onClose} width={620}>
      <div className="flex">
        {/* Sidebar tabs */}
        <div className="w-[180px] bg-[#F4F7FE] p-4 flex flex-col gap-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-2 px-2">个人设置</div>
          <SideTab icon="user-round"    active={tab === 'info'} onClick={() => setTab('info')}>基本信息</SideTab>
          <SideTab icon="lock-keyhole"  active={tab === 'security'} onClick={() => setTab('security')}>安全</SideTab>
          <SideTab icon="bell"          active={tab === 'notify'} onClick={() => setTab('notify')}>通知</SideTab>
          <SideTab icon="shield-check"  active={tab === 'access'} onClick={() => setTab('access')}>我的权限</SideTab>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between px-7 pt-6 pb-3 border-b border-[#E9ECEF]">
            <div>
              <div className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">个人信息管理</div>
              <h3 className="text-xl font-bold text-[#1B254B] mt-1">{user.name}</h3>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0]">
              <I name="x" size={18} />
            </button>
          </div>

          <div className="p-7 max-h-[55vh] overflow-auto">
            {tab === 'info' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <img src={user.avatar} className="w-16 h-16 rounded-full object-cover" alt="" />
                  <div>
                    <Button variant="ghost" size="sm" icon={<I name="upload" size={14} />}>上传新头像</Button>
                    <div className="text-[11px] text-[#A3AED0] mt-1.5">PNG / JPG · 自动裁剪为圆形</div>
                  </div>
                </div>
                <Field label="姓名" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
                <Field label="邮箱" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} />
                <Field label="手机号" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="部门" value={draft.dept} onChange={(v) => setDraft({ ...draft, dept: v })} />
                  <Field label="职位" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
                </div>
              </div>
            )}
            {tab === 'security' && (
              <div className="space-y-4">
                <Field label="当前密码" value="" type="password" placeholder="••••••••" />
                <Field label="新密码" value="" type="password" placeholder="至少 8 位 · 含数字和字母" />
                <Field label="确认新密码" value="" type="password" placeholder="再次输入新密码" />
                <div className="pt-3 mt-3 border-t border-[#E9ECEF]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-[#1B254B]">两步验证</div>
                      <div className="text-xs text-[#A3AED0]">登录时需输入手机验证码</div>
                    </div>
                    <Toggle defaultOn />
                  </div>
                </div>
              </div>
            )}
            {tab === 'notify' && (
              <div className="space-y-2">
                <NotifyRow label="新候选人推送" sub="JD 命中度 ≥ 80% 时通知" defaultOn />
                <NotifyRow label="面试日历提醒" sub="面试开始前 30 分钟" defaultOn />
                <NotifyRow label="周报与日报" sub="每周一 9:00 推送" />
                <NotifyRow label="协作 @ 我" sub="评论提及时" defaultOn />
              </div>
            )}
            {tab === 'access' && (
              <div className="space-y-4">
                <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: role.bg }}>
                  <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'white', color: role.fg }}>
                    <I name={role.icon} size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" style={{ color: role.fg }}>{role.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: role.fg, opacity: 0.85 }}>{role.desc}</div>
                  </div>
                </div>
                <ScopeRow icon="briefcase" label="可见 JD 范围" value={user.scopes.jds} />
                <ScopeRow icon="building-2" label="可见部门" value={user.scopes.depts} />
                <ScopeRow icon="layout-grid" label="可见页面" value={user.scopes.pages} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-7 py-4 border-t border-[#E9ECEF] bg-[#F4F7FE]/40">
            <Button variant="ghost" onClick={onClose}>取消</Button>
            <Button variant="primary" icon={<I name="check" size={16} />} onClick={onClose}>保存修改</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────── Switch Account Modal ───────────────────────────
function SwitchAccountModal({ open, onClose, currentId, onSwitch }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} width={460}>
      <div className="p-7">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">切换账号</div>
            <h3 className="text-xl font-bold text-[#1B254B] mt-1">选择要使用的账号</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0]">
            <I name="x" size={18} />
          </button>
        </div>

        <div className="space-y-1.5">
          {window.MESA_ACCOUNTS.map((a) => {
            const role = ROLES[a.role];
            const isCurrent = a.id === currentId;
            return (
              <button
                key={a.id}
                onClick={() => { if (!isCurrent) onSwitch(a.id); }}
                disabled={isCurrent}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
                  isCurrent ? 'bg-[#F4F7FE] ring-1 ring-[#E9ECEF] cursor-default' : 'hover:bg-[#F4F7FE]'
                }`}
              >
                <img src={a.avatar} className="w-10 h-10 rounded-full object-cover" alt={a.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#1B254B]">{a.name}</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                          style={{ background: role.bg, color: role.fg }}>
                      <I name={role.icon} size={9} />
                      {role.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#A3AED0] truncate">{a.email}</div>
                </div>
                {isCurrent ? (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-[#DCFCE7] text-[#15803D]">当前账号</span>
                ) : (
                  <I name="arrow-right" size={14} className="text-[#A3AED0]" />
                )}
              </button>
            );
          })}
        </div>

        <button className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-[#CBD5E0] text-sm font-bold text-[#707EAE] hover:border-[#422AFB] hover:text-[#422AFB] transition">
          <I name="plus" size={14} />
          添加新账号
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────── Admin: Account Management ───────────────────────
function AccountManagementModal({ open, onClose }) {
  const [tab, setTab] = useState('list');
  const [editing, setEditing] = useState(null);
  const [accounts, setAccounts] = useState(window.MESA_ACCOUNTS);
  if (!open) return null;

  function setRole(id, role) {
    const next = accounts.map((a) => (a.id === id ? { ...a, role } : a));
    setAccounts(next);
    window.MESA_ACCOUNTS = next;
  }

  return (
    <Modal open={open} onClose={onClose} width={920}>
      <div className="flex flex-col h-[80vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-7 pt-6 pb-4 border-b border-[#E9ECEF]">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#A3AED0] uppercase tracking-wide">
              <I name="shield-check" size={12} className="text-[#422AFB]" />
              管理员控制台
            </div>
            <h3 className="text-2xl font-bold text-[#1B254B] mt-1">账号与权限管理</h3>
            <p className="text-sm text-[#707EAE] mt-1">添加 / 移除账号 · 按 JD、入职部门批量授予编辑或阅读权限</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0]">
            <I name="x" size={18} />
          </button>
        </div>

        <div className="px-7 pt-3 flex items-center gap-5 border-b border-[#E9ECEF]">
          <TopTab active={tab === 'list'} onClick={() => setTab('list')}>账号列表 ({accounts.length})</TopTab>
          <TopTab active={tab === 'roles'} onClick={() => setTab('roles')}>角色权限</TopTab>
          <TopTab active={tab === 'bulk'} onClick={() => setTab('bulk')}>批量授权</TopTab>
          <div className="ml-auto pb-2">
            <Button variant="primary" size="sm" icon={<I name="user-plus" size={14} />}>邀请新账号</Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-7">
          {tab === 'list' && (
            <div className="space-y-2">
              {/* table header */}
              <div className="grid grid-cols-[1.4fr_0.8fr_1.4fr_1.4fr_0.6fr] gap-3 px-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">
                <span>账号</span>
                <span>角色</span>
                <span>可见 JD</span>
                <span>可见部门</span>
                <span className="text-right">操作</span>
              </div>
              {accounts.map((a) => {
                const role = ROLES[a.role];
                return (
                  <div key={a.id} className="grid grid-cols-[1.4fr_0.8fr_1.4fr_1.4fr_0.6fr] gap-3 items-center p-3 rounded-xl hover:bg-[#F4F7FE] transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={a.avatar} className="w-9 h-9 rounded-full object-cover shrink-0" alt={a.name} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#1B254B]">{a.name}</div>
                        <div className="text-[11px] text-[#A3AED0] truncate">{a.email}</div>
                      </div>
                    </div>
                    <div>
                      <RoleBadge role={a.role} onChange={(r) => setRole(a.id, r)} />
                    </div>
                    <div className="text-xs text-[#1B254B] truncate" title={a.scopes.jds}>{a.scopes.jds}</div>
                    <div className="text-xs text-[#707EAE] truncate" title={a.scopes.depts}>{a.scopes.depts}</div>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(a)} className="px-2.5 py-1 rounded-md text-xs font-bold text-[#422AFB] hover:bg-[#E9E3FF]/60">编辑</button>
                      <button className="w-7 h-7 rounded-md text-[#A3AED0] hover:bg-white hover:text-[#1B254B]"><I name="more-vertical" size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'roles' && (
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(ROLES).map(([key, r]) => (
                <Card key={key} extra="p-5 !shadow-none ring-1 ring-[#E9ECEF]">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: r.bg, color: r.fg }}>
                      <I name={r.icon} size={18} />
                    </span>
                    <span className="text-base font-bold text-[#1B254B]">{r.label}</span>
                  </div>
                  <p className="text-xs text-[#707EAE] leading-relaxed mb-4" style={{ textWrap: 'pretty' }}>{r.desc}</p>
                  <ul className="space-y-2 text-xs">
                    {key === 'admin' && [
                      '可编辑所有内容（候选人 / JD / 面试 / 报表）',
                      '管理所有账号的角色与权限',
                      '指定账号可见的候选人',
                      '按 JD、入职部门批量授予编辑 / 阅读权限',
                      '查看操作日志与分享记录',
                    ].map((p) => <Perm key={p} text={p} ok />)}
                    {key === 'editor' && [
                      '编辑授权范围内的候选人与 JD',
                      '管理面试与评价',
                      '由管理员细化每个页面的可编辑权限',
                      '不能管理其他账号',
                    ].map((p, i) => <Perm key={p} text={p} ok={i < 3} />)}
                    {key === 'viewer' && [
                      '阅读授权范围内的候选人详情',
                      '不可编辑、不可下载、不可分享（默认）',
                      '可由管理员 / 编辑临时授权',
                    ].map((p, i) => <Perm key={p} text={p} ok={i !== 1} />)}
                  </ul>
                </Card>
              ))}
            </div>
          )}

          {tab === 'bulk' && (
            <div className="max-w-[680px]">
              <Card extra="p-5 !shadow-none ring-1 ring-[#E9ECEF]">
                <h4 className="text-sm font-bold text-[#1B254B] mb-3">按 JD 批量授权</h4>
                <div className="space-y-3">
                  <Field label="选择 JD" placeholder="智能驾驶感知工程师 / 电池管理系统 …（可多选）" />
                  <Field label="选择账号" placeholder="王浩、吴敏（角色：仅阅读）" />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="权限" value="阅读" options={['阅读', '评论', '编辑']} />
                    <SelectField label="有效期" value="30 天" options={['7 天', '30 天', '90 天', '永久']} />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button variant="primary" size="sm" icon={<I name="check" size={14} />}>授予</Button>
                </div>
              </Card>

              <Card extra="p-5 !shadow-none ring-1 ring-[#E9ECEF] mt-4">
                <h4 className="text-sm font-bold text-[#1B254B] mb-3">按入职部门批量授权</h4>
                <div className="space-y-3">
                  <Field label="选择部门" placeholder="智能驾驶部 / 三电中心 / 车身工艺部 …" />
                  <Field label="选择账号" placeholder="张磊、陈璐（角色：编辑账号）" />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="权限" value="编辑" options={['阅读', '评论', '编辑']} />
                    <SelectField label="有效期" value="永久" options={['7 天', '30 天', '90 天', '永久']} />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button variant="primary" size="sm" icon={<I name="check" size={14} />}>授予</Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Per-account editor */}
      {editing && <PermissionEditor account={editing} onClose={() => setEditing(null)} />}
    </Modal>
  );
}

function PermissionEditor({ account, onClose }) {
  const role = ROLES[account.role];
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-[20px] shadow-[0_30px_60px_rgba(112,144,176,0.20)] w-[560px] max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-7 pt-6 pb-4 border-b border-[#E9ECEF] flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img src={account.avatar} className="w-12 h-12 rounded-full object-cover" alt={account.name} />
            <div>
              <h3 className="text-lg font-bold text-[#1B254B]">{account.name}</h3>
              <p className="text-xs text-[#A3AED0]">{account.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0]">
            <I name="x" size={18} />
          </button>
        </div>
        <div className="p-7 space-y-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-2">角色</div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ROLES).map(([key, r]) => {
                const sel = account.role === key;
                return (
                  <button
                    key={key}
                    className={`flex flex-col items-start gap-1.5 p-3 rounded-xl transition text-left ${sel ? 'ring-2 ring-[#422AFB] bg-[#F4F7FE]' : 'border border-[#E9ECEF] hover:bg-[#F4F7FE]'}`}
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: r.bg, color: r.fg }}>
                      <I name={r.icon} size={14} />
                    </span>
                    <span className="text-sm font-bold text-[#1B254B]">{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="可见 JD" value={account.scopes.jds} />
          <Field label="可见部门" value={account.scopes.depts} />
          <Field label="可见页面 (编辑/仅阅读账号可细化)" value={account.scopes.pages} />

          <div className="rounded-xl bg-[#F4F7FE] p-3 flex items-start gap-2.5">
            <I name="info" size={14} className="text-[#422AFB] mt-0.5 shrink-0" />
            <div className="text-[11px] text-[#707EAE] leading-relaxed" style={{ textWrap: 'pretty' }}>
              {account.role === 'admin' && '管理员账号无权限限制，所有作用域字段为预览。'}
              {account.role === 'editor' && '编辑账号可在授权范围内进行修改。可在"可见页面"中细化每个页面的读写权限。'}
              {account.role === 'viewer' && '仅阅读账号无法修改任何内容。需要管理员或编辑授予可阅读范围。'}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-7 py-4 border-t border-[#E9ECEF] bg-[#F4F7FE]/40">
          <Button variant="danger" size="sm" icon={<I name="trash-2" size={14} />}>移除账号</Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" icon={<I name="check" size={16} />} onClick={onClose}>保存权限</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Editable role badge ───────────────────────────
function RoleBadge({ role, onChange, size = 'md' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function out(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);
  const r = ROLES[role];
  const cls = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]';
  return (
    <span className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`group inline-flex items-center gap-1.5 rounded-md font-bold transition hover:ring-2 hover:ring-offset-1 hover:ring-[#422AFB]/30 ${cls}`}
        style={{ background: r.bg, color: r.fg }}
        title="点击修改角色"
      >
        <I name={r.icon} size={size === 'sm' ? 9 : 11} />
        {r.label}
        <I name="chevron-down" size={size === 'sm' ? 9 : 11} className="opacity-60 group-hover:opacity-100 transition" />
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 min-w-[180px] rounded-xl bg-white shadow-[0_12px_30px_rgba(112,144,176,0.20)] border border-[#E9ECEF] py-1.5">
          {Object.entries(ROLES).map(([key, opt]) => (
            <button
              key={key}
              onClick={(e) => { e.stopPropagation(); onChange && onChange(key); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F4F7FE] ${role === key ? 'bg-[#F4F7FE]/60' : ''}`}
            >
              <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: opt.bg, color: opt.fg }}>
                <I name={opt.icon} size={11} />
              </span>
              <span className="flex-1 font-bold text-[#1B254B]">{opt.label}</span>
              {role === key && <I name="check" size={14} className="text-[#422AFB]" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ─────────────────────────── Helpers ───────────────────────────
function SideTab({ icon, active, children, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-bold text-left transition ${active ? 'bg-white text-[#422AFB] shadow-sm' : 'text-[#707EAE] hover:bg-white/60'}`}>
      <I name={icon} size={15} />
      {children}
    </button>
  );
}

function TopTab({ active, children, onClick }) {
  return (
    <button onClick={onClick} className={`relative pb-3 text-sm font-bold transition ${active ? 'text-[#422AFB]' : 'text-[#707EAE] hover:text-[#1B254B]'}`}>
      {children}
      {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-[#422AFB]"></span>}
    </button>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5">{label}</div>
      <input
        type={type}
        defaultValue={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3 rounded-xl border border-[#E9ECEF] bg-white text-sm text-[#1B254B] font-medium outline-none focus:border-[#422AFB] transition"
      />
    </div>
  );
}

function SelectField({ label, value, options }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5">{label}</div>
      <select defaultValue={value} className="w-full h-10 px-3 rounded-xl border border-[#E9ECEF] bg-white text-sm text-[#1B254B] font-bold outline-none focus:border-[#422AFB] transition">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ScopeRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F4F7FE]">
      <span className="w-8 h-8 rounded-lg bg-white text-[#422AFB] flex items-center justify-center shrink-0">
        <I name={icon} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">{label}</div>
        <div className="text-sm font-bold text-[#1B254B] mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function Perm({ text, ok }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ok ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEE2E2] text-[#B91C1C]'}`}>
        <I name={ok ? 'check' : 'x'} size={9} strokeWidth={3} />
      </span>
      <span className={`text-xs leading-snug ${ok ? 'text-[#1B254B]' : 'text-[#A3AED0] line-through'}`} style={{ textWrap: 'pretty' }}>
        {text}
      </span>
    </li>
  );
}

function NotifyRow({ label, sub, defaultOn }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#F1F3F8] last:border-0">
      <div className="min-w-0 pr-3">
        <div className="text-sm font-bold text-[#1B254B]">{label}</div>
        <div className="text-xs text-[#A3AED0] mt-0.5">{sub}</div>
      </div>
      <Toggle defaultOn={defaultOn} />
    </div>
  );
}

function Toggle({ defaultOn }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <button onClick={() => setOn(!on)} className={`relative w-10 h-6 rounded-full transition ${on ? 'bg-[#422AFB]' : 'bg-[#CBD5E0]'}`}>
      <span className={`absolute top-0.5 ${on ? 'right-0.5' : 'left-0.5'} w-5 h-5 rounded-full bg-white shadow-sm transition-all`}></span>
    </button>
  );
}

// ─────────────────────────── Logout Confirm ───────────────────────────
function LogoutConfirmModal({ open, onClose, onConfirm }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} width={400}>
      <div className="p-7">
        <div className="w-12 h-12 rounded-full bg-[#FEE2E2] text-[#B91C1C] flex items-center justify-center mb-3">
          <I name="log-out" size={20} />
        </div>
        <h3 className="text-xl font-bold text-[#1B254B]">退出账号？</h3>
        <p className="text-sm text-[#707EAE] mt-1 leading-relaxed">退出后需重新登录才能继续使用 MESA Recruit。</p>
        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" icon={<I name="log-out" size={14} />} onClick={onConfirm}>确认退出</Button>
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, {
  ProfileMenu, ProfileSettingsModal, SwitchAccountModal,
  AccountManagementModal, LogoutConfirmModal, MESA_ROLES: ROLES,
});
