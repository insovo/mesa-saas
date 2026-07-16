import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { resources } from "../lib/api.js";
import { Modal, Button, Input, I, toast, RequiredMark } from "./Primitives.jsx";
import HrSignatureManager, { blobErrorMessage } from "./HrSignatureManager.jsx";

const DURATIONS = [
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
  { value: "forever", label: "永久" },
];

function publicUrl(token) {
  return `${window.location.origin}/performance-eval/${token}`;
}

/**
 * 链接 + 密钥，行内中文(English)格式，供一键复制发给对方。
 * @param {"self"|"manager"} role
 * employeeNo 缺失时写入字面量 "null"
 */
function buildLinkKeyClipboardText({ role, url, accessKey, employeeName, employeeNo }) {
  const name = employeeName || "";
  const no = employeeNo == null || employeeNo === "" ? "null" : String(employeeNo);
  const privacy =
    "涉及个人绩效，请妥善保管个人链接和密钥(This link contains personal performance data. Please keep the URL and access key confidential).";
  if (role === "manager") {
    return [
      "主管评价(Manager Evaluation)",
      `姓名(Name): ${name}`,
      `工号(Employee ID): ${no}`,
      privacy,
      "主管链接(Manager evaluation link):",
      url,
      `访问密钥(Access Key): ${accessKey}`,
    ].join("\n");
  }
  return [
    "绩效自评(Self-assessment)",
    `姓名(Name): ${name}`,
    `工号(Employee ID): ${no}`,
    privacy,
    "自评链接(Self-assessment link):",
    url,
    `访问密钥(Access Key): ${accessKey}`,
  ].join("\n");
}

/** @returns {{ kind: 'revoked'|'expired'|'today'|'soon'|'ok'|'forever', label: string, invalid: boolean }} */
function getLinkValidity(ev) {
  if (!ev) return { kind: "ok", label: "", invalid: false };
  if (ev.status === "revoked") {
    return { kind: "revoked", label: "已撤销", invalid: true };
  }
  if (!ev.expiresAt) {
    return { kind: "forever", label: "永久有效", invalid: false };
  }
  const ms = new Date(ev.expiresAt).getTime() - Date.now();
  if (ms < 0) {
    return { kind: "expired", label: "已过期 · 链接失效", invalid: true };
  }
  const days = Math.ceil(ms / 86400000);
  if (days === 0) return { kind: "today", label: "今日过期", invalid: false };
  if (days <= 3) return { kind: "soon", label: `${days} 天后过期`, invalid: false };
  return { kind: "ok", label: `${days} 天后过期`, invalid: false };
}

const VALIDITY_CHIP = {
  revoked: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  expired: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  today: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  soon: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  ok: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  forever: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

function ValidityChip({ validity }) {
  if (!validity?.label) return null;
  const icon = validity.invalid ? "ban" : validity.kind === "forever" ? "check-circle" : "clock";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${VALIDITY_CHIP[validity.kind] || VALIDITY_CHIP.ok}`}
    >
      <I name={icon} size={12} />
      {validity.label}
    </span>
  );
}

function LinkPanel({
  title,
  hint,
  role,
  token,
  accessKey,
  employeeName,
  employeeNo,
  onRegen,
  onRefreshKey,
  onSetKey,
  busy,
  invalid,
  invalidReason,
  maxEdits,
  editCount,
  onMaxEditsChange,
}) {
  const url = token ? publicUrl(token) : "";
  const unlimited = maxEdits == null;
  const used = editCount || 0;
  const remaining = unlimited ? null : Math.max(0, maxEdits - used);
  const exhausted = !unlimited && used >= maxEdits;
  const [setMode, setSetMode] = useState(false);
  const [setKeyValue, setSetKeyValue] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);

  useEffect(() => {
    setKeyVisible(false);
  }, [accessKey]);

  const EDIT_PRESETS = [
    { value: null, label: "不限" },
    { value: 3, label: "3 次" },
    { value: 5, label: "5 次" },
    { value: 10, label: "10 次" },
  ];

  const exitSetMode = () => {
    setSetMode(false);
    setSetKeyValue("");
  };

  const confirmSetKey = async () => {
    const next = setKeyValue.trim();
    if (!next) return;
    await onSetKey?.(next);
    exitSetMode();
  };

  const keyDisplay = accessKey
    ? keyVisible
      ? accessKey
      : "•".repeat(accessKey.length)
    : "••••••••";

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 relative ${
        invalid || exhausted ? "border-rose-300 bg-rose-50/40" : "border-[#E9ECEF] bg-white"
      }`}
    >
      {invalid && (
        <div className="absolute -top-2.5 left-4">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold shadow-sm">
            <I name="ban" size={11} /> 已失效
          </span>
        </div>
      )}
      <div>
        <div className={`text-sm font-bold ${invalid ? "text-rose-800" : "text-navy-700"}`}>{title}</div>
        <div className="text-[11px] text-[#707EAE] mt-0.5">{hint}</div>
        {invalid && invalidReason && (
          <div className="text-[11px] text-rose-600 font-medium mt-1 flex items-center gap-1">
            <I name="alert-triangle" size={12} />
            {invalidReason}
          </div>
        )}
      </div>

      {onMaxEditsChange && (
        <div className="rounded-lg bg-lightPrimary/50 px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-navy-700">可修改次数</span>
            <span
              className={`text-[10px] font-bold ${
                exhausted ? "text-rose-600" : "text-[#707EAE]"
              }`}
            >
              {unlimited
                ? `已手动保存 ${used} 次 · 不限`
                : exhausted
                  ? `已用尽 ${used}/${maxEdits}`
                  : `已用 ${used}/${maxEdits} · 剩 ${remaining}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EDIT_PRESETS.map((p) => {
              const active = (p.value == null && maxEdits == null) || p.value === maxEdits;
              return (
                <button
                  key={String(p.value)}
                  type="button"
                  disabled={busy || invalid}
                  onClick={() => onMaxEditsChange(p.value)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                    active
                      ? "bg-brand-gradient text-white"
                      : "bg-white border border-[#E9ECEF] text-[#707EAE] hover:border-brand/40"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-[#A0AEC0]">
            仅「保存草稿 / 提交」计入；自动保存不占次数。重生成链接会清零计数。
          </p>
        </div>
      )}

      {token ? (
        <div className={`flex flex-col sm:flex-row gap-4 items-stretch ${invalid ? "opacity-50 grayscale" : ""}`}>
          <div className="bg-white p-2 rounded-lg border border-[#E9ECEF] relative shrink-0 self-center sm:self-stretch flex items-center">
            <QRCodeSVG value={url} size={112} />
            {invalid && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
                <span className="text-[11px] font-bold text-rose-700 px-2 py-1 rounded bg-rose-100">不可用</span>
              </div>
            )}
          </div>
          <div className="flex-1 w-full min-w-0 flex flex-col justify-between gap-2">
            <code
              title={url}
              className={`block text-[11px] truncate rounded-lg px-3 py-2 ${
                invalid
                  ? "bg-rose-100/60 text-rose-800 line-through decoration-rose-400"
                  : "bg-lightPrimary text-navy-700"
              }`}
            >
              {url}
            </code>

            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5 h-9 text-[11px] font-bold text-amber-800">
                <I name="key-round" size={13} className="shrink-0" />
                <span className="shrink-0">访问密钥:</span>
                {setMode ? (
                  <>
                    <Input
                      containerClassName="flex-1 min-w-0"
                      className="!h-9 text-xs font-mono w-full"
                      placeholder="6–10 位，含大小写+数字"
                      value={setKeyValue}
                      autoFocus
                      onChange={(e) => setSetKeyValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          exitSetMode();
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          confirmSetKey();
                        }
                      }}
                    />
                    <Button size="sm" disabled={busy || !setKeyValue.trim()} onClick={confirmSetKey}>
                      确认
                    </Button>
                  </>
                ) : (
                  <>
                    <code className="inline-flex items-center h-9 font-mono text-sm font-bold tracking-wider text-navy-700 bg-white px-2 rounded border border-amber-100 min-w-0">
                      {keyDisplay}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        if (!accessKey) {
                          toast("当前无密钥明文，请先刷新随机密钥或设置密钥", "error");
                          return;
                        }
                        setKeyVisible((v) => !v);
                      }}
                      title={
                        !accessKey
                          ? "当前无密钥明文，请先刷新或设置"
                          : keyVisible
                            ? "隐藏密钥"
                            : "显示密钥"
                      }
                      className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-lg border border-amber-100 bg-white text-amber-800 hover:bg-amber-50 transition"
                    >
                      <I name={keyVisible ? "eye-off" : "eye"} size={14} />
                    </button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto shrink-0"
                  disabled={busy || !token || invalid}
                  onClick={onRegen}
                  title={
                    invalid
                      ? "请先恢复有效期后再重生成"
                      : "重新生成链接（重置已用次数，不更换访问密钥）"
                  }
                >
                  <I name="refresh-cw" size={14} /> 重新生成链接
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || invalid}
                  onClick={() => {
                    if (setMode) exitSetMode();
                    onRefreshKey?.();
                  }}
                >
                  <I name="refresh-cw" size={13} /> 刷新随机密钥
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || invalid}
                  onClick={() => {
                    if (setMode) {
                      exitSetMode();
                      return;
                    }
                    setSetKeyValue("");
                    setSetMode(true);
                  }}
                >
                  <I name="pencil" size={13} /> 设置密钥
                </Button>
                <Button
                  size="sm"
                  variant={invalid ? "ghost" : "primary"}
                  className="ml-auto"
                  disabled={invalid}
                  onClick={() => {
                    if (!accessKey) {
                      toast("当前未展示密钥明文，请先刷新随机密钥或设置密钥后再复制", "error");
                      return;
                    }
                    navigator.clipboard
                      .writeText(
                        buildLinkKeyClipboardText({
                          role,
                          url,
                          accessKey,
                          employeeName,
                          employeeNo,
                        }),
                      )
                      .then(() => toast("链接与密钥已复制", "success"));
                  }}
                >
                  <I name={invalid ? "ban" : "copy"} size={13} />
                  {invalid ? "链接已失效" : "复制链接密钥"}
                </Button>
              </div>
            </div>
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
  onNewEvaluation,
  initialAccessKeys,
}) {
  const [duration, setDuration] = useState("30d");
  const [busy, setBusy] = useState(false);
  const [embedHr, setEmbedHr] = useState(false);
  const [hasHrStamp, setHasHrStamp] = useState(false);
  const [hrSealOpen, setHrSealOpen] = useState(false);
  const [selfAccessKey, setSelfAccessKey] = useState(null);
  const [managerAccessKey, setManagerAccessKey] = useState(null);
  const ev = evaluation;
  const validity = getLinkValidity(ev);
  const employeeName = employee?.name || ev?.employeeName || "";
  const employeeNo = ev?.employeeNo || employee?.externalId || null;

  // 有效期 UI 与密钥 state 拆开：改 expiresAt（恢复/延长）时不要把已持有的明文刷掉
  useEffect(() => {
    if (!open) return;
    if (!ev?.expiresAt) setDuration("forever");
    else setDuration("30d");
    setEmbedHr(false);
  }, [open, ev?.id, ev?.expiresAt]);

  useEffect(() => {
    if (!open) {
      setSelfAccessKey(null);
      setManagerAccessKey(null);
      return;
    }
    setSelfAccessKey(initialAccessKeys?.selfAccessKey || null);
    setManagerAccessKey(initialAccessKeys?.managerAccessKey || null);
  }, [open, ev?.id, initialAccessKeys?.selfAccessKey, initialAccessKeys?.managerAccessKey]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await resources.performance.getHrSignature();
        if (cancelled) return;
        setHasHrStamp(!!data?.hasSignature);
        if (!data?.hasSignature) setEmbedHr(false);
      } catch {
        if (!cancelled) {
          setHasHrStamp(false);
          setEmbedHr(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 旧评价补齐缺失密钥（每个评价打开 Modal 只跑一次）
  const ensuredIdRef = useRef(null);
  useEffect(() => {
    if (!open || !ev?.id || validity.kind === "revoked") return undefined;
    if (ensuredIdRef.current === ev.id) return undefined;
    ensuredIdRef.current = ev.id;
    let cancelled = false;
    (async () => {
      try {
        const data = await resources.performance.ensureAccessKeys(ev.id);
        if (cancelled) return;
        // ensure 会解密 enc 回传明文；旧 hash-only 行仍为 null，需用户刷新一次
        if (data.selfAccessKey) setSelfAccessKey(data.selfAccessKey);
        if (data.managerAccessKey) setManagerAccessKey(data.managerAccessKey);
        if (data.evaluation) onUpdated?.(data.evaluation);
        if (data.generated?.length) {
          toast("已自动生成访问密钥，请立即复制", "success");
        } else if (
          (data.evaluation?.hasSelfAccessKey && !data.selfAccessKey) ||
          (data.evaluation?.hasManagerAccessKey && !data.managerAccessKey)
        ) {
          // 旧数据仅有 hash、无 enc：提示一次性刷新以写入可回显密文
          toast("部分密钥为旧格式，请点「刷新随机密钥」一次以便下次可回显", "info");
        }
      } catch {
        ensuredIdRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line
  }, [open, ev?.id]);

  useEffect(() => {
    if (!open) ensuredIdRef.current = null;
  }, [open]);

  async function refreshRoleKey(role) {
    if (!ev?.id) return;
    setBusy(true);
    try {
      const data = await resources.performance.bulkAccessKeys({
        evaluationIds: [ev.id],
        targets: [role],
        mode: "generate",
      });
      const item = data.items?.[0];
      if (role === "self" && item?.selfAccessKey) setSelfAccessKey(item.selfAccessKey);
      if (role === "manager" && item?.managerAccessKey) setManagerAccessKey(item.managerAccessKey);
      toast("已刷新随机密钥，请立即复制", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function setRoleKey(role, accessKey) {
    if (!ev?.id) return;
    setBusy(true);
    try {
      const data = await resources.performance.bulkAccessKeys({
        evaluationIds: [ev.id],
        targets: [role],
        mode: "set",
        accessKey,
      });
      const item = data.items?.[0];
      if (role === "self" && item?.selfAccessKey) setSelfAccessKey(item.selfAccessKey);
      if (role === "manager" && item?.managerAccessKey) setManagerAccessKey(item.managerAccessKey);
      toast("访问密钥已更新", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

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

  async function regenerateRoleToken(role) {
    if (!ev?.id) return;
    setBusy(true);
    try {
      const flag = role === "self" ? "regenerateSelfToken" : "regenerateManagerToken";
      const { evaluation: updated } = await resources.performance.updateEvaluation(ev.id, {
        [flag]: true,
      });
      // 公网 token 与访问密钥是独立凭证；忽略响应中的任何密钥字段并保留当前明文 state。
      onUpdated?.(updated);
      toast("链接已重新生成，访问密钥保持不变", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function renewAndRegen() {
    if (!ev?.id) return;
    setBusy(true);
    try {
      const { evaluation: updated } = await resources.performance.updateEvaluation(ev.id, {
        duration,
        regenerateSelfToken: true,
        regenerateManagerToken: true,
      });
      onUpdated?.(updated);
      toast("已恢复有效期并重生成链接", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!ev?.id) return;
    if (embedHr && !hasHrStamp) {
      toast("请先上传 HR 电子章", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await resources.performance.exportEvaluation(ev.id, {
        lang: "zh-en",
        embedHrSignature: embedHr ? "1" : undefined,
      });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `属地人员月度绩效评价表_${employee?.name || "员工"}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("已开始下载", "success");
    } catch (err) {
      toast(await blobErrorMessage(err), "error");
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
    <>
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 min-w-0">
            <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
              <I name="share-2" size={20} className="text-brand" />
              分享绩效评价
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#707EAE]">
              <span>
                {employee?.name || ev?.employeeName}
                {ev?.reviewPeriod ? ` · ${ev.reviewPeriod}` : ""}
              </span>
              {ev && <ValidityChip validity={validity} />}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#A0AEC0] hover:text-navy-700 shrink-0">
            <I name="x" size={20} />
          </button>
        </div>

        {!ev ? (
          <p className="text-sm text-[#707EAE]">请先为此员工发起绩效评价。</p>
        ) : (
          <>
            {validity.invalid && (
              <div
                className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                  validity.kind === "revoked"
                    ? "border-rose-300 bg-rose-50"
                    : "border-rose-300 bg-rose-50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-rose-800 flex items-center gap-1.5">
                    <I name="ban" size={16} />
                    {validity.kind === "revoked" ? "评价已撤销，公开链接不可用" : "链接已过期，公开页无法访问"}
                  </div>
                  <p className="text-[11px] text-rose-700/80 mt-1">
                    {validity.kind === "revoked"
                      ? "如需继续收集评分，请重新发起评价。"
                      : "请先选择有效期并点「恢复并重生成」，再发给员工 / 主管。"}
                  </p>
                </div>
                {validity.kind === "expired" && (
                  <Button size="sm" disabled={busy} onClick={renewAndRegen}>
                    <I name="refresh-cw" size={14} /> 恢复并重生成
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#707EAE]">链接有效期</span>
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  disabled={busy || validity.kind === "revoked"}
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
              role="self"
              token={ev.selfToken}
              accessKey={selfAccessKey}
              employeeName={employeeName}
              employeeNo={employeeNo}
              busy={busy}
              invalid={validity.invalid}
              invalidReason={
                validity.kind === "revoked"
                  ? "评价已撤销"
                  : validity.kind === "expired"
                    ? "已过期，对方扫码将提示链接失效"
                    : null
              }
              maxEdits={ev.selfMaxEdits}
              editCount={ev.selfEditCount}
              onMaxEditsChange={(v) => patch({ selfMaxEdits: v })}
              onRegen={() => regenerateRoleToken("self")}
              onRefreshKey={() => refreshRoleKey("self")}
              onSetKey={(k) => setRoleKey("self", k)}
            />
            <LinkPanel
              title="主管评价链接 / Manager"
              hint="发给直属主管填写主管评分（F 列）；主管提交后整单锁定"
              role="manager"
              token={ev.managerToken}
              accessKey={managerAccessKey}
              employeeName={employeeName}
              employeeNo={employeeNo}
              busy={busy}
              invalid={validity.invalid}
              invalidReason={
                validity.kind === "revoked"
                  ? "评价已撤销"
                  : validity.kind === "expired"
                    ? "已过期，对方扫码将提示链接失效"
                    : null
              }
              maxEdits={ev.managerMaxEdits}
              editCount={ev.managerEditCount}
              onMaxEditsChange={(v) => patch({ managerMaxEdits: v })}
              onRegen={() => regenerateRoleToken("manager")}
              onRefreshKey={() => refreshRoleKey("manager")}
              onSetKey={(k) => setRoleKey("manager", k)}
            />

            <div className="rounded-xl border border-[#E9ECEF] p-4 space-y-3">
              <div className="text-sm font-bold text-navy-700">导出 Excel（中英双语）</div>
              <label className={`flex items-center gap-2 text-xs ${hasHrStamp ? "text-navy-700" : "text-[#A0AEC0]"}`}>
                <input
                  type="checkbox"
                  checked={embedHr}
                  disabled={!hasHrStamp || busy}
                  onChange={(e) => setEmbedHr(e.target.checked)}
                  className="rounded border-[#E9ECEF] text-brand focus:ring-brand"
                />
                嵌入 HR 签名
                {!hasHrStamp && (
                  <span className="text-[10px] text-[#A0AEC0]">
                    （请先点「HR电子章」上传）
                  </span>
                )}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={onExport}>
                  <I name="download" size={14} /> 下载 Excel
                </Button>
                {ev.status !== "revoked" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={onRevoke}>
                    <I name="ban" size={14} /> 撤销评价
                  </Button>
                )}
                {onNewEvaluation && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      onClose();
                      onNewEvaluation();
                    }}
                  >
                    <I name="clipboard-plus" size={14} /> 发起新周期评价
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setHrSealOpen(true)}>
                  <I name="file-signature" size={14} /> HR电子章
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
    <Modal open={hrSealOpen} onClose={() => setHrSealOpen(false)} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
            <I name="file-signature" size={20} className="text-brand" />
            HR 电子章管理
          </h3>
          <button
            type="button"
            onClick={() => setHrSealOpen(false)}
            className="text-[#A0AEC0] hover:text-navy-700 shrink-0"
          >
            <I name="x" size={20} />
          </button>
        </div>
        <HrSignatureManager
          key={hrSealOpen ? "hr-seal-open" : "hr-seal-closed"}
          onChange={(d) => {
            setHasHrStamp(!!d?.hasSignature);
            if (!d?.hasSignature) setEmbedHr(false);
          }}
        />
      </div>
    </Modal>
    </>
  );
}

const SCORE_DIM_LABELS = {
  goals_product: "业绩与目标达成 · 4P（产品）",
  goals_adapt: "业绩与目标达成 · 4P（适应性验证）",
  goals_reg: "业绩与目标达成 · 4P（法规认证）",
  goals_localize: "业绩与目标达成 · 4P（地产化）",
  culture: "文化认同与沟通协作 / 属地团队建设",
  local_capability: "海外属地能力体系建设",
  compliance: "合规·安全·数据保护",
};

/** 评价周期单位：默认季度，自动落到当前 Q/H/年 */
const PERIOD_UNITS = [
  { value: "quarter", label: "季度" },
  { value: "half", label: "半年" },
  { value: "year", label: "年度" },
  { value: "custom", label: "自定义" },
];

function currentPeriodParts(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;
  const half = month < 6 ? 1 : 2;
  return { year, quarter, half };
}

function buildPeriodLabel(unit, year, part) {
  if (unit === "quarter") return `${year}Q${part}`;
  if (unit === "half") return `${year}H${part}`;
  if (unit === "year") return String(year);
  return "";
}

function defaultPeriodForUnit(unit, date = new Date()) {
  const { year, quarter, half } = currentPeriodParts(date);
  if (unit === "quarter") return buildPeriodLabel("quarter", year, quarter);
  if (unit === "half") return buildPeriodLabel("half", year, half);
  if (unit === "year") return buildPeriodLabel("year", year);
  return buildPeriodLabel("quarter", year, quarter);
}

function periodOptionsForUnit(unit, date = new Date()) {
  const { year } = currentPeriodParts(date);
  const years = [year - 1, year, year + 1];
  if (unit === "quarter") {
    return years.flatMap((y) => [1, 2, 3, 4].map((q) => buildPeriodLabel("quarter", y, q)));
  }
  if (unit === "half") {
    return years.flatMap((y) => [1, 2].map((h) => buildPeriodLabel("half", y, h)));
  }
  if (unit === "year") {
    return years.map((y) => buildPeriodLabel("year", y));
  }
  return [];
}

/**
 * 查看绩效评价详情（已完成 / 已撤销等历史记录）
 */
export function PerformanceEvalViewModal({ open, onClose, employee, evaluationId, onShare }) {
  const [loading, setLoading] = useState(true);
  const [ev, setEv] = useState(null);

  useEffect(() => {
    if (!open || !evaluationId) return;
    let cancelled = false;
    setLoading(true);
    setEv(null);
    resources.performance
      .getEvaluation(evaluationId)
      .then((d) => {
        if (!cancelled) setEv(d.evaluation || d);
      })
      .catch((err) => {
        if (!cancelled) toast(err.response?.data?.message || err.message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, evaluationId]);

  const validity = getLinkValidity(ev);
  const scores = Array.isArray(ev?.scores) ? ev.scores : [];

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 min-w-0">
            <h3 className="text-lg font-bold text-navy-700 flex items-center gap-2">
              <I name="eye" size={20} className="text-brand" />
              查看绩效评价
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#707EAE]">
              <span>
                {employee?.name || ev?.employeeName}
                {ev?.reviewPeriod ? ` · ${ev.reviewPeriod}` : ""}
              </span>
              {ev && <ValidityChip validity={validity} />}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#A0AEC0] hover:text-navy-700 shrink-0">
            <I name="x" size={20} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[#707EAE] py-8 text-center">加载中…</p>
        ) : !ev ? (
          <p className="text-sm text-[#707EAE]">未找到评价记录</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { k: "岗位", v: ev.position },
                { k: "部门", v: ev.department },
                { k: "主管", v: ev.lineManager },
                { k: "职级", v: ev.level },
              ].map((x) => (
                <div key={x.k} className="rounded-xl bg-lightPrimary/60 px-3 py-2">
                  <div className="text-[10px] text-[#A0AEC0] font-bold">{x.k}</div>
                  <div className="text-xs text-navy-700 font-medium mt-0.5 truncate">{x.v || "—"}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#E9ECEF] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-lightPrimary/50 text-[#707EAE] text-left">
                    <th className="px-3 py-2 font-bold">维度</th>
                    <th className="px-3 py-2 font-bold w-14">权重</th>
                    <th className="px-3 py-2 font-bold w-16">自评</th>
                    <th className="px-3 py-2 font-bold w-16">主管</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s) => (
                    <tr key={s.key} className="border-t border-[#F4F7FE]">
                      <td className="px-3 py-2 text-navy-700 font-medium">
                        {SCORE_DIM_LABELS[s.key] || s.name || s.key}
                      </td>
                      <td className="px-3 py-2 font-mono text-[#707EAE]">{s.weight ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{s.selfScore ?? "—"}</td>
                      <td className="px-3 py-2 font-mono font-bold text-navy-700">
                        {s.managerScore ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl bg-brand/5 border border-brand/15 px-4 py-3">
                <div className="text-[10px] text-[#707EAE] font-bold">主管总分</div>
                <div className="text-lg font-bold text-brand">
                  {ev.managerTotal != null ? ev.managerTotal : "—"}
                </div>
              </div>
              <div className="rounded-xl bg-lightPrimary px-4 py-3">
                <div className="text-[10px] text-[#707EAE] font-bold">自评参考</div>
                <div className="text-lg font-bold text-navy-700">
                  {ev.selfTotal != null ? ev.selfTotal : "—"}
                </div>
              </div>
              {ev.rating && (
                <div className="rounded-xl bg-lightPrimary px-4 py-3 flex-1 min-w-[140px]">
                  <div className="text-[10px] text-[#707EAE] font-bold">等级</div>
                  <div className="text-sm font-bold text-navy-700 mt-0.5">{ev.rating}</div>
                </div>
              )}
            </div>

            {(ev.areasForImprovement || ev.developmentPlan) && (
              <div className="space-y-3 text-xs">
                {ev.areasForImprovement && (
                  <div>
                    <div className="font-bold text-[#707EAE] mb-1">不足及待提升部分</div>
                    <p className="text-navy-700 whitespace-pre-wrap">{ev.areasForImprovement}</p>
                  </div>
                )}
                {ev.developmentPlan && (
                  <div>
                    <div className="font-bold text-[#707EAE] mb-1">改进与发展计划</div>
                    <p className="text-navy-700 whitespace-pre-wrap">{ev.developmentPlan}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>关闭</Button>
              {onShare && (
                <Button
                  onClick={() => {
                    onShare(ev);
                    onClose();
                  }}
                >
                  <I name="share-2" size={14} /> 分享 / 导出
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const EDIT_PRESETS = [
  { value: null, label: "不限" },
  { value: 3, label: "3 次" },
  { value: 5, label: "5 次" },
  { value: 10, label: "10 次" },
];

function MaxEditChips({ value, onChange, label }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-[#707EAE] mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {EDIT_PRESETS.map((p) => {
          const active = (p.value == null && value == null) || p.value === value;
          return (
            <button
              key={String(p.value)}
              type="button"
              onClick={() => onChange(p.value)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                active
                  ? "bg-brand-gradient text-white"
                  : "bg-lightPrimary text-[#707EAE] hover:text-navy-700"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodFields({ periodUnit, reviewPeriod, onSwitchUnit, onChangePeriod }) {
  const presets = periodOptionsForUnit(periodUnit);
  const currentDefault = defaultPeriodForUnit(periodUnit === "custom" ? "quarter" : periodUnit);
  return (
    <div>
      <div className="text-xs font-bold text-navy-700 mb-2">
        评价周期 / Review Period <RequiredMark />
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {PERIOD_UNITS.map((u) => (
          <button
            key={u.value}
            type="button"
            onClick={() => onSwitchUnit(u.value)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              periodUnit === u.value
                ? "bg-brand-gradient text-white"
                : "bg-lightPrimary text-[#707EAE] hover:text-navy-700"
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>

      {periodUnit !== "custom" ? (
        <select
          value={reviewPeriod}
          onChange={(e) => onChangePeriod(e.target.value)}
          className="mt-0 flex h-12 w-full items-center rounded-xl border border-gray-200 bg-white/40 px-3 text-sm text-navy-700 outline-none transition-all duration-200 focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {p === currentDefault ? `${p}（当前）` : p}
            </option>
          ))}
        </select>
      ) : (
        <Input
          value={reviewPeriod}
          onChange={(e) => onChangePeriod(e.target.value)}
          placeholder="例如 2026Q2 / 2026H1 / 2026 全年"
        />
      )}
      <p className="text-[11px] text-[#A0AEC0] mt-1">
        默认按当前季度自动匹配；可切换半年 / 年度，或自定义文案。
      </p>
    </div>
  );
}

/** 发起评价表单 */
export function CreatePerformanceEvalModal({ open, onClose, employee, onCreated }) {
  const [periodUnit, setPeriodUnit] = useState("quarter");
  const [reviewPeriod, setReviewPeriod] = useState("");
  const [lineManager, setLineManager] = useState("");
  const [duration, setDuration] = useState("30d");
  const [selfMaxEdits, setSelfMaxEdits] = useState(null);
  const [managerMaxEdits, setManagerMaxEdits] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPeriodUnit("quarter");
    setReviewPeriod(defaultPeriodForUnit("quarter"));
    setLineManager(employee?.directManager || "");
    setDuration("30d");
    setSelfMaxEdits(null);
    setManagerMaxEdits(null);
  }, [open, employee]);

  function switchUnit(unit) {
    setPeriodUnit(unit);
    if (unit === "custom") {
      if (!reviewPeriod.trim()) setReviewPeriod(defaultPeriodForUnit("quarter"));
      return;
    }
    setReviewPeriod(defaultPeriodForUnit(unit));
  }

  async function onSubmit() {
    if (!reviewPeriod.trim()) return toast("请填写评价周期", "error");
    setBusy(true);
    try {
      const { evaluation, selfAccessKey, managerAccessKey } = await resources.performance.createEvaluation({
        employeeId: employee.id,
        reviewPeriod: reviewPeriod.trim(),
        lineManager: lineManager.trim() || undefined,
        duration,
        selfMaxEdits,
        managerMaxEdits,
      });
      toast("评价已创建，请复制访问密钥发给对方", "success");
      onCreated?.(evaluation, { selfAccessKey, managerAccessKey });
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

        <PeriodFields
          periodUnit={periodUnit}
          reviewPeriod={reviewPeriod}
          onSwitchUnit={switchUnit}
          onChangePeriod={setReviewPeriod}
        />

        <label className="block text-xs font-bold text-navy-700">
          直属主管 / Line Manager
          <Input
            className="mt-1"
            value={lineManager}
            onChange={(e) => setLineManager(e.target.value)}
            placeholder="主管姓名"
          />
        </label>

        <div className="rounded-xl border border-[#E9ECEF] p-3 space-y-3">
          <div className="text-xs font-bold text-navy-700">可修改次数</div>
          <MaxEditChips label="自评链接" value={selfMaxEdits} onChange={setSelfMaxEdits} />
          <MaxEditChips label="主管评价链接" value={managerMaxEdits} onChange={setManagerMaxEdits} />
          <p className="text-[10px] text-[#A0AEC0]">自动保存不占次数；「保存草稿 / 提交」会计入。</p>
        </div>

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

/** 批量发起新周期评价（共用周期 / 有效期 / 修改次数；主管取各员工档案） */
export function BulkCreatePerformanceEvalModal({
  open,
  onClose,
  employees = [],
  initialPeriod,
  onCreated,
}) {
  const [periodUnit, setPeriodUnit] = useState("quarter");
  const [reviewPeriod, setReviewPeriod] = useState("");
  const [duration, setDuration] = useState("30d");
  const [selfMaxEdits, setSelfMaxEdits] = useState(null);
  const [managerMaxEdits, setManagerMaxEdits] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seed = (initialPeriod || "").trim() || defaultPeriodForUnit("quarter");
    const looksCustom = !/^\d{4}(Q[1-4]|H[12])?$/.test(seed) && !/^\d{4}$/.test(seed);
    setPeriodUnit(looksCustom ? "custom" : seed.includes("H") ? "half" : seed.length === 4 ? "year" : "quarter");
    setReviewPeriod(seed);
    setDuration("30d");
    setSelfMaxEdits(null);
    setManagerMaxEdits(null);
  }, [open, initialPeriod]);

  function switchUnit(unit) {
    setPeriodUnit(unit);
    if (unit === "custom") {
      if (!reviewPeriod.trim()) setReviewPeriod(defaultPeriodForUnit("quarter"));
      return;
    }
    setReviewPeriod(defaultPeriodForUnit(unit));
  }

  async function onSubmit() {
    if (!employees.length) return toast("请先勾选员工", "error");
    if (!reviewPeriod.trim()) return toast("请填写评价周期", "error");
    setBusy(true);
    try {
      const data = await resources.performance.bulkCreateEvaluations({
        employeeIds: employees.map((e) => e.id),
        reviewPeriod: reviewPeriod.trim(),
        duration,
        selfMaxEdits,
        managerMaxEdits,
      });
      toast(`已为 ${data.count} 人发起新周期评价`, "success");
      onCreated?.(data);
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
        <h3 className="text-lg font-bold text-navy-700">批量发起评价</h3>
        <p className="text-xs text-[#707EAE]">
          将为选中的 {employees.length} 人创建新周期评价；直属主管沿用各员工档案，链接默认 30 天有效。
        </p>

        <PeriodFields
          periodUnit={periodUnit}
          reviewPeriod={reviewPeriod}
          onSwitchUnit={switchUnit}
          onChangePeriod={setReviewPeriod}
        />

        <div className="rounded-xl border border-[#E9ECEF] p-3 space-y-3">
          <div className="text-xs font-bold text-navy-700">可修改次数</div>
          <MaxEditChips label="自评链接" value={selfMaxEdits} onChange={setSelfMaxEdits} />
          <MaxEditChips label="主管评价链接" value={managerMaxEdits} onChange={setManagerMaxEdits} />
          <p className="text-[10px] text-[#A0AEC0]">自动保存不占次数；「保存草稿 / 提交」会计入。</p>
        </div>

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
          <Button disabled={busy || employees.length === 0} onClick={onSubmit}>
            {busy ? "创建中…" : `为 ${employees.length} 人创建`}
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
