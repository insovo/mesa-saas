// MESA Recruit · Topbar
// Style ref: MESA/src/components/navbar/index.jsx

function Topbar({ breadcrumb, title, onAddCandidate }) {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(window.MESA_CURRENT_USER_ID);

  const user = (window.MESA_ACCOUNTS || []).find((a) => a.id === currentUserId) || {
    id: 'u-001', name: '李薇', avatar: '../../assets/avatars/avatar4.png',
    email: 'liwei@mesa.app', phone: '', dept: '', title: '', role: 'admin',
    scopes: { jds: '全部 JD', depts: '全部部门', pages: '全部页面' },
  };

  function switchTo(id) {
    setCurrentUserId(id);
    window.MESA_CURRENT_USER_ID = id;
    window.dispatchEvent(new CustomEvent('mesa-user-changed', { detail: id }));
    setShowSwitch(false);
  }
  function confirmLogout() {
    setShowLogout(false);
    window.dispatchEvent(new CustomEvent('mesa-logout'));
  }

  return (
    <nav className="sticky top-4 z-40 mx-7 flex flex-row flex-wrap items-center justify-between rounded-2xl bg-white/60 px-4 py-2 backdrop-blur-xl">
      {/* Left: breadcrumb + title */}
      <div className="ml-1.5 py-2">
        <div className="h-5 text-sm flex items-center gap-1 text-[#1B254B]">
          <span className="font-normal">Pages</span>
          <span className="text-[#1B254B]">/</span>
          <span className="font-normal capitalize">{breadcrumb}</span>
        </div>
        <p className="text-[33px] font-bold text-[#1B254B] tracking-tight leading-tight">
          {title}
        </p>
      </div>

      {/* Right: utility bar */}
      <div className="relative mt-1 flex h-[56px] w-[420px] flex-grow items-center justify-around gap-2 rounded-full bg-white px-2 shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] md:flex-grow-0">
        <div className="flex h-full items-center rounded-full bg-[#F4F7FE] text-[#1B254B] flex-1">
          <span className="pl-3 pr-2 text-[#A0AEC0]"><I name="search" size={16} /></span>
          <input
            type="text"
            placeholder="搜索候选人 / JD / 标签…"
            className="block h-full w-full rounded-full bg-transparent text-sm font-medium text-[#1B254B] outline-none placeholder:text-[#A0AEC0]"
          />
          <span className="px-3 text-[11px] text-[#707EAE] font-bold border-l border-[#E9ECEF] py-1.5">⌘K</span>
        </div>

        <button className="p-2 text-[#707EAE] hover:text-[#1B254B] transition relative">
          <I name="bell" size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#F53939] ring-2 ring-white"></span>
        </button>

        <button
          onClick={() => setDark((d) => !d)}
          className="p-2 text-[#707EAE] hover:text-[#1B254B] transition"
        >
          <I name={dark ? 'sun' : 'moon'} size={18} />
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-1.5 pr-1.5 py-1 rounded-full hover:bg-[#F4F7FE] transition"
            title={`${user.name} · ${window.MESA_ROLES?.[user.role]?.label || ''}`}
          >
            <img className="h-9 w-9 rounded-full object-cover" src={user.avatar} alt={user.name} />
          </button>
          {menuOpen && (
            <ProfileMenu
              user={user}
              onClose={() => setMenuOpen(false)}
              onOpenProfile={() => { setMenuOpen(false); setShowProfile(true); }}
              onOpenSwitch={() => { setMenuOpen(false); setShowSwitch(true); }}
              onOpenAdmin={() => { setMenuOpen(false); setShowAdmin(true); }}
              onLogout={() => { setMenuOpen(false); setShowLogout(true); }}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <ProfileSettingsModal open={showProfile} onClose={() => setShowProfile(false)} user={user} />
      <SwitchAccountModal open={showSwitch} onClose={() => setShowSwitch(false)} currentId={currentUserId} onSwitch={switchTo} />
      <AccountManagementModal open={showAdmin} onClose={() => setShowAdmin(false)} />
      <LogoutConfirmModal open={showLogout} onClose={() => setShowLogout(false)} onConfirm={confirmLogout} />
    </nav>
  );
}

Object.assign(window, { Topbar });
