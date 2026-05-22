// MESA Recruit · App shell — wires Sidebar + Topbar + active page.

function App() {
  const [page, setPage] = useState('candidates'); // open on candidate list — most product-y view
  const [candidateId, setCandidateId] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [scheduleRequest, setScheduleRequest] = useState(null); // { candidateId, seq } — Dashboard / CandidateDetail 跳来时触发新建
  const [currentUserId, setCurrentUserId] = useState(window.MESA_CURRENT_USER_ID);

  // ── Auth gating ────────────────────────────────────────────────
  // Demo 默认进登录页;登录后进入主应用。Tweaks 里可以选择是否跳过登录。
  const [authed, setAuthed] = useState(false);
  const [loggedOutFrom, setLoggedOutFrom] = useState(null); // 退出后留在登录页头部的提示

  function handleLogin(userId) {
    if (userId) {
      window.MESA_CURRENT_USER_ID = userId;
      setCurrentUserId(userId);
      window.dispatchEvent(new CustomEvent('mesa-user-changed', { detail: userId }));
    }
    setLoggedOutFrom(null);
    setAuthed(true);
  }
  function handleLogout() {
    const u = (window.MESA_ACCOUNTS || []).find((a) => a.id === currentUserId);
    setLoggedOutFrom(u ? { name: u.name, email: u.email } : null);
    setAuthed(false);
  }

  useEffect(() => {
    function onUserChange(ev) { setCurrentUserId(ev.detail || window.MESA_CURRENT_USER_ID); }
    function onLogout() { handleLogout(); }
    window.addEventListener('mesa-user-changed', onUserChange);
    window.addEventListener('mesa-logout', onLogout);
    return () => {
      window.removeEventListener('mesa-user-changed', onUserChange);
      window.removeEventListener('mesa-logout', onLogout);
    };
  }, [currentUserId]);

  if (!authed) {
    return <LoginScreen onLogin={handleLogin} justLoggedOutFrom={loggedOutFrom} />;
  }

  function openCandidate(id) {
    setCandidateId(id);
    setPage('candidate-detail');
  }

  function openEmployee(id) {
    setEmployeeId(id);
    setPage('employee-detail');
  }

  function navigate(target) {
    setCandidateId(null);
    setEmployeeId(null);
    setPage(target);
  }

  function scheduleInterview(cid) {
    setScheduleRequest({ candidateId: cid || null, seq: Date.now() });
    setPage('interviews');
  }

  const pageMeta = {
    'dashboard':        { breadcrumb: 'Dashboard',     title: 'Dashboard' },
    'candidates':       { breadcrumb: 'Candidates',    title: '候选人列表' },
    'candidate-detail': { breadcrumb: 'Candidate',     title: '候选人详情' },
    'jobs':             { breadcrumb: 'Jobs',          title: 'Job Pipeline' },
    'upload':           { breadcrumb: 'Resume Inbox',  title: 'Resume Inbox' },
    'staff':            { breadcrumb: 'Staff',         title: '现有人员' },
    'newhire':          { breadcrumb: 'New Hire',      title: '入职管理' },
    'departments':      { breadcrumb: 'Departments',   title: '部门管理' },
    'employee-detail':  { breadcrumb: 'Employee',      title: '员工档案' },
    'interviews':       { breadcrumb: 'Interviews',    title: '面试安排' },
    'reports':          { breadcrumb: 'Reports',       title: 'Reports' },
  };
  const meta = pageMeta[page] || pageMeta['candidates'];

  // sidebar `active` should reflect the section, not the detail sub-page
  const sidebarActive =
    page === 'candidate-detail' ? 'candidates' :
    page === 'employee-detail' ? (employeeId && window.MESA_EMPLOYEES.find((e) => e.id === employeeId)?.stage === '已转正' ? 'staff' : 'newhire') :
    page;

  return (
    <div className="flex bg-[#F4F7FE] min-h-screen">
      <Sidebar active={sidebarActive} onNavigate={navigate} currentUserId={currentUserId} />
      <main className="flex-1 min-w-0 pl-7 pr-7 pb-10">
        <Topbar
          breadcrumb={meta.breadcrumb}
          title={meta.title}
          onAddCandidate={() => setUploadOpen(true)}
        />
        <div className="mt-6">
          {page === 'dashboard' && (
            <Dashboard onOpenCandidate={openCandidate} onNavigate={navigate} onScheduleInterview={scheduleInterview} />
          )}
          {page === 'candidates' && (
            <Candidates onOpenCandidate={openCandidate} onAddCandidate={() => navigate('upload')} />
          )}
          {page === 'candidate-detail' && candidateId && (
            <CandidateDetail
              candidateId={candidateId}
              onBack={() => navigate('candidates')}
              onScheduleInterview={scheduleInterview}
            />
          )}
          {page === 'jobs' && (
            <Jobs onOpenCandidate={openCandidate} onAddCandidate={() => navigate('upload')} />
          )}
          {page === 'upload' && (
            <Upload onOpenCandidate={openCandidate} />
          )}
          {page === 'staff' && (
            <Staff onOpenEmployee={openEmployee} />
          )}
          {page === 'newhire' && (
            <NewHire onOpenEmployee={openEmployee} onOpenCandidate={openCandidate} />
          )}
          {page === 'departments' && (
            <Departments onOpenEmployee={openEmployee} />
          )}
          {page === 'employee-detail' && employeeId && (
            <EmployeeDetail
              employeeId={employeeId}
              onBack={() => {
                const e = window.MESA_EMPLOYEES.find((x) => x.id === employeeId);
                navigate(e && e.stage === '已转正' ? 'staff' : 'newhire');
              }}
              onOpenCandidate={openCandidate}
            />
          )}
          {page === 'interviews' && (
            <Interviews
              onOpenCandidate={openCandidate}
              scheduleRequest={scheduleRequest}
              onConsumeRequest={() => setScheduleRequest(null)}
            />
          )}
          {page === 'reports' && (
            <Reports onNavigate={navigate} />
          )}
        </div>
      </main>
    </div>
  );
}

function Placeholder({ name }) {
  return (
    <Card extra="p-14 items-center text-center">
      <div className="w-16 h-16 rounded-full bg-[#F4F7FE] text-[#422AFB] flex items-center justify-center mx-auto">
        <I name="clock" size={28} />
      </div>
      <h3 className="text-xl font-bold text-[#1B254B] mt-4">{name}</h3>
      <p className="text-sm text-[#707EAE] mt-1 max-w-md mx-auto">这个模块属于 UI kit 的下一阶段。点击侧栏其他链接查看候选人 / JD / 上传等已实现的核心流程。</p>
    </Card>
  );
}

Object.assign(window, { App });
