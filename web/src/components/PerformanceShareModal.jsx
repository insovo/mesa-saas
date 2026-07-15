import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { resources, api } from "../lib/api.js";
import { Modal, Button, Input, I, toast, RequiredMark } from "./Primitives.jsx";

const DURATIONS = [
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
  { value: "forever", label: "永久" },
];

const EXPORT_LANGS = [
  { value: "zh", label: "中文" },
  { value: "zh-en", label: "中英双语" },
  { value: "zh-es", label: "中西双语" },
  { value: "en", label: "英文" },
];

function publicUrl(token) {
  return `${window.location.origin}/performance-eval/${token}`;
}

function fmtExpiry(expiresAt) {
  if (!expiresAt) return "永久有效";
  const d = new Date(expiresAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return "已过期";
  if (days === 0) return "今日过期";
  return `${days} 天后过期`;
}

function LinkPanel({ title, hint, token, onRegen, busy }) {
  const url = token ? publicUrl(token) : "";
  return (
    <div className="rounded-xl border border-[#E9ECEF] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-navy-700">{title}</div>
          <div className="text-[11px] text-[#707EAE] mt-0.5">{hint}</div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !token}
          onClick={onRegen}
          title="重新生成链接"
        >
          <I name="refresh-cw" size={14} /> 重生成
        </Button>
      </div>
      {token ? (
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="bg-white p-2 rounded-lg border border-[#E9ECEF]">
            <QRCodeSVG value={url} size={112} />
          </div>
          <div className="flex-1 w-full space-y-2">
            <code className="block text-[11px] break-all bg-lightPrimary rounded-lg px-3 py-2 text-navy-700">
              {url}
            </code>
            <Button
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(url).then(() => toast("链接已复制", "success"));
              }}
            >
              <I name="copy" size={14} /> 复制链接
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#A0AEC0]">尚未创建评价</p>
      )}
    </div>
  );
}

/**
 * 绩效评价分享 Modal — 自评链接 + 主管链接 + 导出四语种
 */
export default function PerformanceShareModal({
  open,
  onClose,
  employee,
  evaluation,
  onUpdated,
}) {
  const [duration, setDuration] = useState("30d");
  const [busy, setBusy] = useState(false);
  const [exportLang, setExportLang] = useState("zh-en");
  const ev = evaluation;

  useEffect(() => {
    if (open) setDuration("30d");
  }, [open, ev?.id]);

  async function patch(body) {
    if (!ev?.id) return;
    setBusy(true);
    try {
      const { evaluation: updated } = await resources.performance.updateEvaluation(ev.id, body);
      onUpdated?.(updated);
      toast("已更新", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!ev?.id) return;
    setBusy(true);
    try {
      const res = await api.get(`/performance/evaluations/${ev.id}/export.xlsx`, {
        params: { lang: exportLang },
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `绩效评价_${employee?.name || "员工"}_${exportLang}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("已开始下载", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message || "导出失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    if (!ev?.id) return;
    if (!confirm("确定撤销此评价链接？撤销后公开页将无法访问。")) return;
    setBusy(true);
    try {
      const { evaluation: updated } = await resources.performance.revokeEvaluation(ev.id);
      onUpdated?.(updated);
      toast("已撤销", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
              <I name="share-2" size={20} className="text-brand" />
              分享绩效评价
            </h3>
            <p className="text-xs text-[#707EAE] mt-1">
              {employee?.name || ev?.employeeName}
              {ev?.reviewPeriod ? ` · ${ev.reviewPeriod}` : ""}
              {ev?.expiresAt !== undefined ? ` · ${fmtExpiry(ev.expiresAt)}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#A0AEC0] hover:text-navy-700">
            <I name="x" size={20} />
          </button>
        </div>

        {!ev ? (
          <p className="text-sm text-[#707EAE]">请先为此员工发起绩效评价。</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#707EAE]">链接有效期</span>
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDuration(d.value);
                    patch({ duration: d.value });
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                    duration === d.value
                      ? "bg-brand-gradient text-white"
                      : "bg-lightPrimary text-[#707EAE] hover:text-navy-700"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <LinkPanel
              title="自评链接 / Self-assessment"
              hint="发给被评价员工填写自评分数（E 列）"
              token={ev.selfToken}
              busy={busy}
              onRegen={() => patch({ regenerateSelfToken: true })}
            />
            <LinkPanel
              title="主管评价链接 / Manager"
              hint="发给直属主管填写主管评分（F 列）；主管提交后整单锁定"
              token={ev.managerToken}
              busy={busy}
              onRegen={() => patch({ regenerateManagerToken: true })}
            />

            <div className="rounded-xl border border-[#E9ECEF] p-4 space-y-3">
              <div className="text-sm font-bold text-navy-700">导出 Excel</div>
              <div className="flex flex-wrap gap-2">
                {EXPORT_LANGS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setExportLang(l.value)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      exportLang === l.value
                        ? "bg-brand-gradient text-white"
                        : "bg-lightPrimary text-[#707EAE]"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={onExport}>
                  <I name="download" size={14} /> 下载 {EXPORT_LANGS.find((x) => x.value === exportLang)?.label}
                </Button>
                {ev.status !== "revoked" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={onRevoke}>
                    <I name="ban" size={14} /> 撤销评价
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** 发起评价表单 */
export function CreatePerformanceEvalModal({ open, onClose, employee, onCreated }) {
  const [reviewPeriod, setReviewPeriod] = useState("");
  const [lineManager, setLineManager] = useState("");
  const [duration, setDuration] = useState("30d");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const y = new Date().getFullYear();
    setReviewPeriod(`${y}H1`);
    setLineManager(employee?.directManager || "");
    setDuration("30d");
  }, [open, employee]);

  async function onSubmit() {
    if (!reviewPeriod.trim()) return toast("请填写评价周期", "error");
    setBusy(true);
    try {
      const { evaluation } = await resources.performance.createEvaluation({
        employeeId: employee.id,
        reviewPeriod: reviewPeriod.trim(),
        lineManager: lineManager.trim() || undefined,
        duration,
      });
      toast("评价已创建", "success");
      onCreated?.(evaluation);
      onClose();
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700">发起绩效评价</h3>
        <p className="text-xs text-[#707EAE]">{employee?.name}</p>
        <label className="block text-xs font-bold text-navy-700">
          评价周期 / Review Period <RequiredMark />
          <Input
            className="mt-1"
            value={reviewPeriod}
            onChange={(e) => setReviewPeriod(e.target.value)}
            placeholder="例如 2026H1 / 2026Q2"
          />
        </label>
        <label className="block text-xs font-bold text-navy-700">
          直属主管 / Line Manager
          <Input
            className="mt-1"
            value={lineManager}
            onChange={(e) => setLineManager(e.target.value)}
            placeholder="主管姓名"
          />
        </label>
        <div>
          <div className="text-xs font-bold text-navy-700 mb-2">链接有效期</div>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDuration(d.value)}
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  duration === d.value ? "bg-brand-gradient text-white" : "bg-lightPrimary text-[#707EAE]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={busy} onClick={onSubmit}>
            {busy ? "创建中…" : "创建并生成链接"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Portal 到 body + fixed，避免 Modal overflow 裁切；mousedown preventDefault 防 blur 抢先关菜单 */
function ComboboxMenu({ open, anchorRef, items, activeId, onPick, renderItem }) {
  const [box, setBox] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) {
      setBox(null);
      return;
    }
    const update = () => {
      const r = anchorRef.current.getBoundingClientRect();
      setBox({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, items.length]);

  if (!open || !box || items.length === 0) return null;

  return createPortal(
    <ul
      className="fixed z-[120] max-h-48 overflow-y-auto rounded-xl border border-[#E9ECEF] bg-white shadow-card py-1"
      style={{ top: box.top, left: box.left, width: box.width }}
      role="listbox"
    >
      {items.map((item) => (
        <li key={item.id} role="option">
          <button
            type="button"
            className={`w-full text-left px-3 py-2 text-xs hover:bg-lightPrimary ${
              activeId === item.id ? "bg-brand/5 text-brand font-bold" : "text-navy-700"
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
          >
            {renderItem(item)}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}

function filterByQuery(list, query, fields) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return list.slice(0, 12);
  return list
    .filter((item) => fields.some((f) => String(item[f] || "").toLowerCase().includes(q)))
    .slice(0, 12);
}

/** 新建人员 — 岗位/部门/主管/电话/邮箱均可关联或手输 */
export function CreatePerformancePersonModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    position: "",
    jobId: "",
    department: "",
    departmentId: "",
    level: "",
    lineManager: "",
    lineManagerId: "",
    employeeNo: "",
    phone: "",
    email: "",
  });
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [people, setPeople] = useState([]);
  const [menu, setMenu] = useState(null); // job | dept | manager | phone | email
  const [busy, setBusy] = useState(false);
  const blurTimer = useRef(null);
  const jobAnchorRef = useRef(null);
  const deptAnchorRef = useRef(null);
  const managerAnchorRef = useRef(null);
  const phoneAnchorRef = useRef(null);
  const emailAnchorRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: "", position: "", jobId: "", department: "", departmentId: "",
      level: "", lineManager: "", lineManagerId: "", employeeNo: "", phone: "", email: "",
    });
    setMenu(null);
    let cancelled = false;
    Promise.all([
      resources.jobs.list({ take: 200 }).then((d) => d.items || []).catch(() => []),
      resources.departments.list().then((d) => d.items || []).catch(() => []),
      resources.performance.listPeople().then((d) => d.items || []).catch(() => []),
    ]).then(([jobItems, deptItems, peopleItems]) => {
      if (cancelled) return;
      setJobs(jobItems);
      setDepartments(deptItems);
      setPeople(peopleItems);
    });
    return () => {
      cancelled = true;
      clearTimeout(blurTimer.current);
    };
  }, [open]);

  function set(k, v) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function openMenu(key) {
    clearTimeout(blurTimer.current);
    setMenu(key);
  }

  function scheduleCloseMenu() {
    clearTimeout(blurTimer.current);
    // 切字段时：旧字段 blur 会排队关菜单，需被新字段 focus 取消
    blurTimer.current = setTimeout(() => setMenu(null), 180);
  }

  const filteredJobs = filterByQuery(jobs, form.position, ["title", "dept"]);
  const filteredDepts = filterByQuery(departments, form.department, ["name", "code", "head"]);
  const filteredManagers = filterByQuery(people, form.lineManager, ["name", "appliedFor", "dept"]);
  const filteredPhonePeople = filterByQuery(people, form.phone, ["name", "phone", "appliedFor"]);
  const filteredEmailPeople = filterByQuery(people, form.email, ["name", "email", "appliedFor"]);

  function pickJob(job) {
    setForm((s) => ({
      ...s,
      jobId: job.id,
      position: job.title || "",
      // 未选手动部门时，用 JD 上的部门名预填（不自动挂 departmentId）
      department: s.departmentId ? s.department : (s.department || job.dept || ""),
    }));
    setMenu(null);
  }

  function onPositionChange(value) {
    setForm((s) => {
      const matched = jobs.find((j) => j.id === s.jobId);
      const stillLinked = matched && matched.title === value;
      return { ...s, position: value, jobId: stillLinked ? s.jobId : "" };
    });
    openMenu("job");
  }

  function pickDept(dept) {
    setForm((s) => ({ ...s, departmentId: dept.id, department: dept.name || "" }));
    setMenu(null);
  }

  function onDepartmentChange(value) {
    setForm((s) => {
      const matched = departments.find((d) => d.id === s.departmentId);
      const stillLinked = matched && matched.name === value;
      return { ...s, department: value, departmentId: stillLinked ? s.departmentId : "" };
    });
    openMenu("dept");
  }

  function pickManager(person) {
    setForm((s) => ({
      ...s,
      lineManagerId: person.id,
      lineManager: person.name || "",
    }));
    setMenu(null);
  }

  function onLineManagerChange(value) {
    setForm((s) => {
      const matched = people.find((p) => p.id === s.lineManagerId);
      const stillLinked = matched && matched.name === value;
      return { ...s, lineManager: value, lineManagerId: stillLinked ? s.lineManagerId : "" };
    });
    openMenu("manager");
  }

  function pickPhoneFromPerson(person) {
    set("phone", person.phone || "");
    setMenu(null);
  }

  function pickEmailFromPerson(person) {
    set("email", person.email || "");
    setMenu(null);
  }

  async function onSubmit() {
    if (!form.name.trim()) return toast("请填写姓名", "error");
    setBusy(true);
    try {
      const { employee } = await resources.performance.createPerson({
        name: form.name.trim(),
        position: form.position.trim() || undefined,
        jobId: form.jobId || undefined,
        department: form.department.trim() || undefined,
        departmentId: form.departmentId || undefined,
        level: form.level.trim() || undefined,
        lineManager: form.lineManager.trim() || undefined,
        employeeNo: form.employeeNo.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      toast("已新建人员（试用期 · 现有人员可见）", "success");
      onCreated?.(employee);
      onClose();
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-navy-700">新建已入职人员</h3>
        <p className="text-xs text-[#707EAE]">
          将写入「现有人员」列表，阶段默认试用期，来源：绩效评价新建。岗位 / 部门 / 主管 / 电话 / 邮箱均可搜索已有数据或手输。
        </p>
        <label className="block text-xs font-bold text-navy-700">
          姓名 / Name <RequiredMark />
          <Input className="mt-1" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 不用 label 包 button 列表，避免点选抢焦点把下拉关掉 */}
          <div className="block text-xs font-bold text-navy-700">
            <div>
              岗位 / Position
              <span className="ml-1 font-normal text-[10px] text-[#A0AEC0]">
                {form.jobId ? "已关联岗位模块" : "可搜索关联或手输"}
              </span>
            </div>
            <div ref={jobAnchorRef} className="mt-1">
              <Input
                value={form.position}
                onChange={(e) => onPositionChange(e.target.value)}
                onFocus={() => openMenu("job")}
                onBlur={scheduleCloseMenu}
                placeholder="输入或从岗位列表选择"
                autoComplete="off"
              />
            </div>
            <ComboboxMenu
              open={menu === "job"}
              anchorRef={jobAnchorRef}
              items={filteredJobs}
              activeId={form.jobId}
              onPick={pickJob}
              renderItem={(j) => (
                <>
                  <div className="font-bold">{j.title}</div>
                  {j.dept && <div className="text-[10px] text-[#A0AEC0] mt-0.5">{j.dept}</div>}
                </>
              )}
            />
          </div>
          <div className="block text-xs font-bold text-navy-700">
            <div>
              部门 / Department
              <span className="ml-1 font-normal text-[10px] text-[#A0AEC0]">
                {form.departmentId ? "已关联部门模块" : "可搜索关联或手输"}
              </span>
            </div>
            <div ref={deptAnchorRef} className="mt-1">
              <Input
                value={form.department}
                onChange={(e) => onDepartmentChange(e.target.value)}
                onFocus={() => openMenu("dept")}
                onBlur={scheduleCloseMenu}
                placeholder="输入或从部门列表选择"
                autoComplete="off"
              />
            </div>
            <ComboboxMenu
              open={menu === "dept"}
              anchorRef={deptAnchorRef}
              items={filteredDepts}
              activeId={form.departmentId}
              onPick={pickDept}
              renderItem={(d) => (
                <>
                  <div className="font-bold">{d.name}</div>
                  {(d.code || d.head) && (
                    <div className="text-[10px] text-[#A0AEC0] mt-0.5">
                      {[d.code, d.head].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </>
              )}
            />
          </div>
          <label className="block text-xs font-bold text-navy-700">
            职级 / Level
            <Input className="mt-1" value={form.level} onChange={(e) => set("level", e.target.value)} />
          </label>
          <label className="block text-xs font-bold text-navy-700">
            工号 / ID
            <Input className="mt-1" value={form.employeeNo} onChange={(e) => set("employeeNo", e.target.value)} />
          </label>
          <div className="block text-xs font-bold text-navy-700">
            <div>
              直属主管 / Line Manager
              <span className="ml-1 font-normal text-[10px] text-[#A0AEC0]">
                {form.lineManagerId ? "已关联现有人员" : "可搜索关联或手输"}
              </span>
            </div>
            <div ref={managerAnchorRef} className="mt-1">
              <Input
                value={form.lineManager}
                onChange={(e) => onLineManagerChange(e.target.value)}
                onFocus={() => openMenu("manager")}
                onBlur={scheduleCloseMenu}
                placeholder="输入或从现有人员选择"
                autoComplete="off"
              />
            </div>
            <ComboboxMenu
              open={menu === "manager"}
              anchorRef={managerAnchorRef}
              items={filteredManagers}
              activeId={form.lineManagerId}
              onPick={pickManager}
              renderItem={(p) => (
                <>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-[10px] text-[#A0AEC0] mt-0.5">
                    {[p.appliedFor, p.dept].filter(Boolean).join(" · ") || "现有人员"}
                  </div>
                </>
              )}
            />
          </div>
          <div className="block text-xs font-bold text-navy-700">
            <div>
              电话 / Phone
              <span className="ml-1 font-normal text-[10px] text-[#A0AEC0]">可从现有人员带入或手输</span>
            </div>
            <div ref={phoneAnchorRef} className="mt-1">
              <Input
                value={form.phone}
                onChange={(e) => { set("phone", e.target.value); openMenu("phone"); }}
                onFocus={() => openMenu("phone")}
                onBlur={scheduleCloseMenu}
                placeholder="输入或选择人员带入电话"
                autoComplete="off"
              />
            </div>
            <ComboboxMenu
              open={menu === "phone"}
              anchorRef={phoneAnchorRef}
              items={filteredPhonePeople}
              activeId={null}
              onPick={pickPhoneFromPerson}
              renderItem={(p) => (
                <>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-[10px] text-[#A0AEC0] mt-0.5">
                    {p.phone || "无电话"}
                    {p.dept ? ` · ${p.dept}` : ""}
                  </div>
                </>
              )}
            />
          </div>
          <div className="block text-xs font-bold text-navy-700 sm:col-span-2">
            <div>
              邮箱 / Email
              <span className="ml-1 font-normal text-[10px] text-[#A0AEC0]">可从现有人员带入或手输</span>
            </div>
            <div ref={emailAnchorRef} className="mt-1">
              <Input
                value={form.email}
                onChange={(e) => { set("email", e.target.value); openMenu("email"); }}
                onFocus={() => openMenu("email")}
                onBlur={scheduleCloseMenu}
                placeholder="输入或选择人员带入邮箱"
                autoComplete="off"
              />
            </div>
            <ComboboxMenu
              open={menu === "email"}
              anchorRef={emailAnchorRef}
              items={filteredEmailPeople}
              activeId={null}
              onPick={pickEmailFromPerson}
              renderItem={(p) => (
                <>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-[10px] text-[#A0AEC0] mt-0.5">
                    {p.email || "无邮箱"}
                    {p.dept ? ` · ${p.dept}` : ""}
                  </div>
                </>
              )}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button disabled={busy} onClick={onSubmit}>{busy ? "保存中…" : "创建"}</Button>
        </div>
      </div>
    </Modal>
  );
}
