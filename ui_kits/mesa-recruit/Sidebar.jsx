// MESA Recruit · Sidebar
// Style ref: MESA/src/components/sidebar/index.jsx + sidebar/components/Links.jsx

function Sidebar({ active, onNavigate, currentUserId }) {
  const currentUser = (window.MESA_ACCOUNTS || []).find((a) => a.id === (currentUserId || window.MESA_CURRENT_USER_ID));
  const isAdmin = currentUser ? currentUser.role === 'admin' : true;

  const items = [
    { id: 'dashboard',  label: '概览',      icon: 'layout-dashboard' },
    { id: 'candidates', label: '候选人',    icon: 'users' },
    { id: 'jobs',       label: '岗位',      icon: 'briefcase' },
    { id: 'upload',     label: '简历收件箱', icon: 'upload-cloud' },
    { id: 'staff',      label: '现有人员',   icon: 'users-round' },
    { id: 'newhire',    label: '入职管理',   icon: 'user-plus' },
    { id: 'departments',label: '部门管理',   icon: 'building-2', adminOnly: true },
    { id: 'interviews', label: '面试安排',   icon: 'calendar' },
    { id: 'reports',    label: '数据报表',   icon: 'bar-chart-3' },
  ].filter((it) => !it.adminOnly || isAdmin);
  return (
    <aside className="w-[268px] bg-white shrink-0 min-h-screen flex flex-col pb-8 shadow-[2px_0_30px_rgba(112,144,176,0.06)]">
      {/* Wordmark */}
      <div className="mx-[40px] mt-[44px] flex items-center">
        <span
          className="text-[24px] uppercase text-[#1B254B] tracking-tight"
          style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700 }}
        >
          MESA <span style={{ fontWeight: 500 }}>RECRUIT</span>
        </span>
      </div>
      <div className="mt-[42px] mb-6 h-px bg-[#E9ECEF]"></div>

      <nav className="flex-1">
        <ul>
          {items.map((it) => {
            const isActive = active === it.id;
            return (
              <li key={it.id} className="relative">
                <button
                  onClick={() => onNavigate(it.id)}
                  className="my-[3px] flex w-full items-center px-9 py-2 text-left"
                >
                  <span
                    className="flex items-center justify-center"
                    style={{ width: 22, height: 22, color: isActive ? '#422AFB' : '#A3AED0' }}
                  >
                    <I name={it.icon} size={20} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span
                    className={`ml-4 text-sm ${isActive ? 'font-bold text-[#1B254B]' : 'font-medium text-[#707EAE]'}`}
                  >
                    {it.label}
                  </span>
                </button>
                {isActive && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 h-9 w-1 rounded-l-lg bg-[#422AFB]"></div>
                )}
                {it.adminOnly && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#E9E3FF] text-[#422AFB]" title="仅管理员可见">
                    <I name="shield-check" size={10} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-7 mx-9 h-px bg-[#E9ECEF]"></div>
        <div className="px-9 mt-5 mb-3 text-[11px] tracking-wide font-bold text-[#A3AED0]">
          AI 配置
        </div>
        <div className="mx-7 px-3 py-2 rounded-xl bg-[#F4F7FE] flex items-center gap-2">
          <I name="key-round" size={16} className="text-[#422AFB]" />
          <span className="text-sm font-bold text-[#1B254B]">自带 Key</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] font-bold">待配置</span>
        </div>
      </nav>

    </aside>
  );
}

Object.assign(window, { Sidebar });
