// MESA Recruit · 部门管理 (Admin only)
// Two-pane: department tree on left, detail panel on right.
// Counts members + open JDs by joining MESA_EMPLOYEES and MESA_JOBS.

function Departments({ onOpenEmployee }) {
  const allDepts = window.MESA_DEPARTMENTS || [];
  const employees = window.MESA_EMPLOYEES || [];
  const jobs = window.MESA_JOBS || [];

  const [depts, setDepts] = useState(allDepts);
  const [selectedId, setSelectedId] = useState(allDepts[0]?.id || null);
  const [expanded, setExpanded] = useState(() => new Set(allDepts.filter((d) => d.parentId === null).map((d) => d.id)));
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const selected = depts.find((d) => d.id === selectedId);

  // Build full path "智驾 · 感知"
  function pathOf(d) {
    const stack = [d.name];
    let cur = d;
    while (cur && cur.parentId) {
      cur = depts.find((x) => x.id === cur.parentId);
      if (cur) stack.unshift(cur.name);
    }
    return stack.join(' · ');
  }

  // Match by full path so "智驾·感知" maps to dept "感知" under "智驾"
  function membersOf(d) {
    const path = pathOf(d);
    return employees.filter((e) => e.dept === path || e.dept.startsWith(path));
  }
  function jobsOf(d) {
    const path = pathOf(d);
    return jobs.filter((j) => j.dept === path || j.dept.startsWith(path));
  }
  function descendantsOf(id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      depts.filter((d) => d.parentId === cur).forEach((d) => { out.push(d); stack.push(d.id); });
    }
    return out;
  }

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function addDept(parentId) {
    const newId = 'd-new-' + Date.now();
    const next = [...depts, {
      id: newId, name: '新部门', parentId: parentId || null,
      head: '—', hrbp: '陈璐', location: '—', founded: String(new Date().getFullYear()),
      status: 'active', desc: '请补充部门描述',
    }];
    setDepts(next);
    window.MESA_DEPARTMENTS = next;
    if (parentId) setExpanded((p) => new Set([...p, parentId]));
    setSelectedId(newId);
    setShowEdit(true);
  }

  function updateDept(id, patch) {
    const next = depts.map((d) => (d.id === id ? { ...d, ...patch } : d));
    setDepts(next);
    window.MESA_DEPARTMENTS = next;
  }

  function deleteDept(id) {
    if (!confirm('删除该部门及其所有子部门?')) return;
    const toDelete = new Set([id, ...descendantsOf(id).map((d) => d.id)]);
    const next = depts.filter((d) => !toDelete.has(d.id));
    setDepts(next);
    window.MESA_DEPARTMENTS = next;
    setSelectedId(next[0]?.id || null);
  }

  const topLevel = depts.filter((d) => d.parentId === null);
  const memberCount = depts.length > 0 ? employees.length : 0;
  const headCount = new Set(depts.map((d) => d.head).filter((h) => h !== '—')).size;
  const totalJobs = depts.reduce((acc, d) => acc + jobsOf(d).length, 0) / 2; // halved because of overlap

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DStat icon="building-2"  label="部门总数"   value={depts.length}    accent="#422AFB" sub={`${topLevel.length} 个一级部门`} />
        <DStat icon="users-round" label="在职员工"   value={employees.length} accent="#22C55E" sub="覆盖全部门" />
        <DStat icon="user-cog"    label="部门负责人" value={headCount}        accent="#1D4ED8" sub="去重后" />
        <DStat icon="briefcase"   label="活跃 JD"   value={jobs.length}      accent="#F59E0B" sub="跨部门统计" />
      </div>

      {/* Toolbar */}
      <Card extra="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[260px] flex items-center gap-2 bg-[#F4F7FE] rounded-xl px-3 h-10">
            <I name="search" size={15} className="text-[#A0AEC0]" />
            <input
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="搜索部门 · 负责人 · 地点"
              className="flex-1 bg-transparent text-sm text-[#1B254B] outline-none placeholder:text-[#A0AEC0]"
            />
            {query && <button onClick={() => setQuery('')}><I name="x" size={13} className="text-[#A3AED0]" /></button>}
          </div>
          <Button variant="ghost" size="md" icon={<I name="expand" size={14} />} onClick={() => setExpanded(new Set(depts.map((d) => d.id)))}>展开全部</Button>
          <Button variant="ghost" size="md" icon={<I name="minimize" size={14} />} onClick={() => setExpanded(new Set())}>折叠全部</Button>
          <Button variant="primary" size="md" icon={<I name="plus" size={14} />} onClick={() => addDept(null)}>新建一级部门</Button>
        </div>
      </Card>

      {/* Two-pane */}
      <div className="grid gap-5 grid-cols-1 min-[1100px]:grid-cols-[380px_minmax(0,1fr)]">
        {/* Tree */}
        <Card extra="p-4 self-start">
          <div className="text-xs font-bold uppercase tracking-wide text-[#A3AED0] mb-2 px-1">部门树</div>
          <div className="space-y-0.5">
            {topLevel.map((d) => (
              <DeptNode
                key={d.id}
                dept={d}
                depts={depts}
                level={0}
                expanded={expanded}
                onToggle={toggle}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddChild={addDept}
                query={query}
                membersOf={membersOf}
              />
            ))}
          </div>
        </Card>

        {/* Detail */}
        {selected ? (
          <DepartmentDetail
            dept={selected}
            depts={depts}
            members={membersOf(selected)}
            jobs={jobsOf(selected)}
            pathOf={pathOf}
            onEdit={() => setShowEdit(true)}
            onAddChild={() => addDept(selected.id)}
            onDelete={() => deleteDept(selected.id)}
            onOpenEmployee={onOpenEmployee}
          />
        ) : (
          <Card extra="p-10 items-center text-center self-start">
            <div className="w-14 h-14 rounded-full bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0] mx-auto">
              <I name="building-2" size={26} />
            </div>
            <p className="mt-3 text-sm text-[#707EAE]">从左侧选择一个部门,或点击「新建一级部门」开始。</p>
          </Card>
        )}
      </div>

      {showEdit && selected && (
        <EditDeptModal
          dept={selected}
          depts={depts}
          onSave={(patch) => { updateDept(selected.id, patch); setShowEdit(false); }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Stat tile ───────────────────────────
function DStat({ icon, label, value, sub, accent }) {
  return (
    <Card extra="p-5">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#F4F7FE', color: accent }}>
          <I name={icon} size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0]">{label}</div>
          <div className="text-2xl font-bold text-[#1B254B] tabular-nums leading-tight">{value}</div>
          {sub && <div className="text-[11px] text-[#707EAE] mt-0.5">{sub}</div>}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────── Tree node ───────────────────────────
function DeptNode({ dept, depts, level, expanded, onToggle, selectedId, onSelect, onAddChild, query, membersOf }) {
  const children = depts.filter((d) => d.parentId === dept.id);
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(dept.id);
  const isSelected = selectedId === dept.id;
  const memberCount = membersOf(dept).length;

  const matches = !query ||
    dept.name.includes(query) ||
    dept.head.includes(query) ||
    dept.location.includes(query);
  const someChildMatches = hasChildren && children.some((c) => deepMatches(c, depts, query));
  if (query && !matches && !someChildMatches) return null;

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 pr-1.5 rounded-lg transition cursor-pointer ${
          isSelected ? 'bg-[#E9E3FF]/60 ring-1 ring-[#A195FD]' : 'hover:bg-[#F4F7FE]'
        }`}
        style={{ paddingLeft: 6 + level * 16 }}
        onClick={() => onSelect(dept.id)}
      >
        <button
          onClick={(ev) => { ev.stopPropagation(); hasChildren && onToggle(dept.id); }}
          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${hasChildren ? 'text-[#1B254B] hover:bg-white' : 'opacity-0'}`}
        >
          {hasChildren && <I name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} />}
        </button>
        <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isSelected ? 'bg-[#422AFB] text-white' : 'bg-[#F4F7FE] text-[#422AFB]'}`}>
          <I name={level === 0 ? 'building-2' : 'folder'} size={12} />
        </span>
        <span className={`flex-1 py-1.5 text-sm truncate ${isSelected ? 'font-bold text-[#1B254B]' : 'font-medium text-[#1B254B]'}`}>
          {dept.name}
        </span>
        <span className="text-[10px] font-bold text-[#A3AED0] tabular-nums">{memberCount}</span>
        <button
          onClick={(ev) => { ev.stopPropagation(); onAddChild(dept.id); }}
          className="w-5 h-5 rounded flex items-center justify-center text-[#A3AED0] hover:bg-white hover:text-[#422AFB] opacity-0 group-hover:opacity-100 transition"
          title="添加子部门"
        >
          <I name="plus" size={11} />
        </button>
      </div>
      {hasChildren && isOpen && (
        <div>
          {children.map((c) => (
            <DeptNode key={c.id} dept={c} depts={depts} level={level + 1} expanded={expanded} onToggle={onToggle} selectedId={selectedId} onSelect={onSelect} onAddChild={onAddChild} query={query} membersOf={membersOf} />
          ))}
        </div>
      )}
    </div>
  );
}

function deepMatches(dept, depts, query) {
  if (!query) return true;
  if (dept.name.includes(query) || dept.head.includes(query) || dept.location.includes(query)) return true;
  return depts.filter((d) => d.parentId === dept.id).some((c) => deepMatches(c, depts, query));
}

// ─────────────────────────── Detail panel ───────────────────────────
function DepartmentDetail({ dept, depts, members, jobs, pathOf, onEdit, onAddChild, onDelete, onOpenEmployee }) {
  const path = pathOf(dept);
  const children = depts.filter((d) => d.parentId === dept.id);
  return (
    <Card extra="p-7 self-start">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">{path === dept.name ? '一级部门' : '子部门'}</div>
          <h2 className="text-2xl font-bold text-[#1B254B] mt-1">{dept.name}</h2>
          <p className="text-sm text-[#707EAE] mt-1" style={{ textWrap: 'pretty' }}>{dept.desc}</p>
          <div className="mt-2 text-[11px] text-[#A3AED0] font-mono">完整路径 · {path}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" icon={<I name="pencil" size={13} />} onClick={onEdit}>编辑</Button>
          <Button variant="ghost" size="sm" icon={<I name="folder-plus" size={13} />} onClick={onAddChild}>添加子部门</Button>
          <button onClick={onDelete} className="w-9 h-9 rounded-lg hover:bg-[#FEE2E2] text-[#A3AED0] hover:text-[#B91C1C] flex items-center justify-center" title="删除部门">
            <I name="trash-2" size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <KV icon="user-cog"    label="负责人"  value={dept.head} />
        <KV icon="heart-handshake" label="HRBP"  value={dept.hrbp} />
        <KV icon="map-pin"     label="所在地"  value={dept.location} />
        <KV icon="calendar"    label="成立"    value={dept.founded} />
      </div>

      {/* Members */}
      <div className="mt-7">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-[#1B254B]">本部门员工 ({members.length})</h4>
          <button className="text-xs font-bold text-[#422AFB] hover:underline">查看全部 →</button>
        </div>
        {members.length === 0 ? (
          <div className="text-xs text-[#A3AED0] py-4 text-center bg-[#F4F7FE] rounded-xl">暂无员工归属此部门</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {members.slice(0, 8).map((m) => {
              const tone = window.MESA_HIRE_STAGE_TONE[m.stage] || { bg: '#F4F7FE', fg: '#1B254B', dot: '#A3AED0' };
              return (
                <button key={m.id} onClick={() => onOpenEmployee && onOpenEmployee(m.id)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F4F7FE] transition text-left">
                  <Avatar src={m.avatar} name={m.name} size={36} gender={m.gender} animal={m.animal} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#1B254B] truncate">{m.name}</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
                        <span className="w-1 h-1 rounded-full" style={{ background: tone.dot }}></span>
                        {m.stage}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#707EAE] truncate">{m.appliedFor} · {m.level}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {members.length > 8 && (
          <div className="mt-2 text-center text-[11px] text-[#A3AED0]">还有 {members.length - 8} 位员工 · 在「现有人员」中按部门筛选</div>
        )}
      </div>

      {/* Sub-departments */}
      {children.length > 0 && (
        <div className="mt-7 pt-5 border-t border-[#F1F3F8]">
          <h4 className="text-sm font-bold text-[#1B254B] mb-3">子部门 ({children.length})</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {children.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#F1F3F8]">
                <span className="w-9 h-9 rounded-lg bg-[#F4F7FE] text-[#422AFB] flex items-center justify-center"><I name="folder" size={14} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#1B254B] truncate">{c.name}</div>
                  <div className="text-[11px] text-[#707EAE] truncate">{c.head} · {c.location}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Jobs */}
      {jobs.length > 0 && (
        <div className="mt-7 pt-5 border-t border-[#F1F3F8]">
          <h4 className="text-sm font-bold text-[#1B254B] mb-3">在招 JD ({jobs.length})</h4>
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#F1F3F8]">
                <span className="w-9 h-9 rounded-lg bg-[#F4F7FE] text-[#422AFB] flex items-center justify-center"><I name="briefcase" size={14} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#1B254B] truncate">{j.title}</div>
                  <div className="text-[11px] text-[#707EAE] truncate">{j.owner} · {j.location} · {j.openings} 人</div>
                </div>
                <span className="text-[10px] font-bold text-[#422AFB] tabular-nums">{j.candidates} 候选</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function KV({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-[#F4F7FE] p-3">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#A3AED0]">
        <I name={icon} size={11} />
        {label}
      </div>
      <div className="text-sm font-bold text-[#1B254B] mt-0.5 truncate" title={value}>{value}</div>
    </div>
  );
}

// ─────────────────────────── Edit modal ───────────────────────────
function EditDeptModal({ dept, depts, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...dept });
  function set(k, v) { setDraft((p) => ({ ...p, [k]: v })); }
  const parentChoices = [{ id: null, name: '(顶级)' }, ...depts.filter((d) => d.id !== dept.id && !isDescendant(d, dept, depts))];
  return (
    <Modal open onClose={onClose} width={560}>
      <div className="p-7">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-xs font-bold text-[#A3AED0] uppercase tracking-wide">部门管理</div>
            <h3 className="text-2xl font-bold text-[#1B254B] mt-1">编辑部门</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#F4F7FE] flex items-center justify-center text-[#A3AED0]">
            <I name="x" size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <DField label="部门名称" value={draft.name} onChange={(v) => set('name', v)} />
          <DField label="负责人"  value={draft.head}  onChange={(v) => set('head', v)} />
          <div className="grid grid-cols-2 gap-3">
            <DField label="HRBP"   value={draft.hrbp}    onChange={(v) => set('hrbp', v)} />
            <DField label="所在地" value={draft.location} onChange={(v) => set('location', v)} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5">上级部门</div>
            <select value={draft.parentId || ''} onChange={(ev) => set('parentId', ev.target.value || null)} className="w-full h-10 px-3 rounded-xl border border-[#E9ECEF] bg-white text-sm text-[#1B254B] font-bold outline-none focus:border-[#422AFB]">
              {parentChoices.map((p) => <option key={p.id || 'root'} value={p.id || ''}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5">部门描述</div>
            <textarea
              value={draft.desc}
              onChange={(ev) => set('desc', ev.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-[#E9ECEF] bg-white text-sm text-[#1B254B] outline-none focus:border-[#422AFB] resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#E9ECEF]">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" icon={<I name="check" size={16} />} onClick={() => onSave(draft)}>保存</Button>
        </div>
      </div>
    </Modal>
  );
}

function isDescendant(candidate, root, depts) {
  let cur = candidate;
  while (cur && cur.parentId) {
    if (cur.parentId === root.id) return true;
    cur = depts.find((d) => d.id === cur.parentId);
  }
  return false;
}

function DField({ label, value, onChange }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#A3AED0] mb-1.5">{label}</div>
      <input
        value={value || ''}
        onChange={(ev) => onChange(ev.target.value)}
        className="w-full h-10 px-3 rounded-xl border border-[#E9ECEF] bg-white text-sm text-[#1B254B] font-medium outline-none focus:border-[#422AFB] transition"
      />
    </div>
  );
}

Object.assign(window, { Departments });
