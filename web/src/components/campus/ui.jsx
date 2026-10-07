// 校招模块共用小组件 / 工具(后台三 tab 共用;学生端页面 Phase 1 可复用 Pill 类)
import axios from "axios";
import { api } from "../../lib/api.js";
import { I, RequiredMark } from "../Primitives.jsx";
import {
  CAMPUS_APP_STATUS_LABEL, CAMPUS_APP_STATUS_TONE, CAMPUS_JOB_KIND_LABEL, CAMPUS_JOB_KIND_TONE,
  CAMPUS_SESSION_STATUS_LABEL, CAMPUS_SESSION_STATUS_TONE, CAMPUS_PARSE_STATUS_LABEL, CAMPUS_SOURCE_LABEL,
} from "../../lib/constants.js";

export const SELECT_CLS = "h-12 w-full px-4 rounded-xl border border-gray-200 bg-white text-sm text-navy-700 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all";
export const SELECT_SM_CLS = "h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs text-navy-700 outline-none focus:border-brand";

export function Field({ label, required, children, hint, className = "" }) {
  return (
    <div className={className}>
      {label && (
        <label className="text-sm text-navy-700 font-bold ml-3 block mb-2">
          {label}{required && <RequiredMark />}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-gray-500 ml-3 mt-1">{hint}</p>}
    </div>
  );
}

export function Select({ value, onChange, children, className = "", small = false, ...rest }) {
  return (
    <select value={value} onChange={onChange} className={`${small ? SELECT_SM_CLS : SELECT_CLS} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className={`inline-flex items-center gap-2 text-xs font-medium text-navy-700 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-brand" : "bg-gray-300"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

function Pill({ tone, children, size = "sm" }) {
  const sz = size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold whitespace-nowrap ${sz}`} style={{ background: tone.bg, color: tone.fg }}>
      {tone.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }} />}
      {children}
    </span>
  );
}
export function AppStatusPill({ status, size }) {
  return <Pill tone={CAMPUS_APP_STATUS_TONE[status] || CAMPUS_APP_STATUS_TONE.applied} size={size}>{CAMPUS_APP_STATUS_LABEL[status] || status}</Pill>;
}
export function KindTag({ kind }) {
  const tone = CAMPUS_JOB_KIND_TONE[kind] || CAMPUS_JOB_KIND_TONE.onsite;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{CAMPUS_JOB_KIND_LABEL[kind] || kind}</span>;
}
export function SessionStatusPill({ status }) {
  return <Pill tone={CAMPUS_SESSION_STATUS_TONE[status] || CAMPUS_SESSION_STATUS_TONE.draft}>{CAMPUS_SESSION_STATUS_LABEL[status] || status}</Pill>;
}
const PARSE_TONE = {
  done: "bg-green-100 text-green-700",
  running: "bg-blue-100 text-blue-700",
  pending: "bg-lightPrimary text-gray-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-amber-100 text-amber-700",
  cancelled: "bg-gray-100 text-gray-600",
};
export function ParseTag({ status }) {
  if (!status) return <span className="text-[11px] text-gray-400">无简历</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${PARSE_TONE[status] || PARSE_TONE.pending}`}>
      {status === "running" && <I name="loader" size={10} className="animate-spin" />}
      {CAMPUS_PARSE_STATUS_LABEL[status] || status}
    </span>
  );
}
export function sourceLabel(s) { return CAMPUS_SOURCE_LABEL[s] || s; }

export function fmtDateTime(d) {
  if (!d) return "—";
  const t = new Date(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}
export function fmtDate(d) { return d ? fmtDateTime(d).slice(0, 10) : "—"; }
export function fmtSize(n) {
  if (!n && n !== 0) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
export function errMsg(e, fallback = "操作失败") { return e?.response?.data?.message || e?.message || fallback; }

// 简历 → R2(presigned PUT,与 Upload 页同流程)。返回 { key, filename, size, contentType }
export async function uploadResumeToR2(file) {
  const contentType = file.type || "application/octet-stream";
  const { data } = await api.post("/storage/presigned-url", { filename: file.name, contentType, expectedSize: file.size });
  await axios.put(data.uploadUrl, file, { headers: { "Content-Type": contentType } });
  await api.post("/storage/confirm", { key: data.key });
  return { key: data.key, filename: file.name, size: file.size, contentType };
}

export const RESUME_ACCEPT = ".pdf,.doc,.docx";
export const DEGREE_OPTIONS = ["大专", "本科", "硕士", "博士"];
