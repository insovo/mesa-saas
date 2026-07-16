/**
 * 本机签名缓存 — 同一人再次填写时可一键复用上次手写签名。
 * 识别规则（localStorage，仅当前浏览器）：
 * - 自评：工号优先，否则姓名 → self:{id}
 * - 主管：直属主管姓名 → manager:{name}；未填则用本机设备 ID
 * - HR：登录用户 id → hr:{userId}
 */

const STORAGE_KEY = "mesa.perf.signature.v1";
const DEVICE_KEY = "mesa.perf.signer.device.v1";

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function signerKeySelf(employeeNo, employeeName) {
  const id = norm(employeeNo) || norm(employeeName);
  return id ? `self:${id}` : `self:device:${getDeviceId()}`;
}

export function signerKeyManager(lineManager) {
  const id = norm(lineManager);
  return id ? `manager:${id}` : `manager:device:${getDeviceId()}`;
}

export function signerKeyHr(userId) {
  return userId ? `hr:${userId}` : `hr:device:${getDeviceId()}`;
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writeStore(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota — fail soft */
  }
}

/** @returns {{ dataUrl: string, savedAt: number } | null} */
export function loadCachedSignature(signerKey) {
  if (!signerKey) return null;
  const entry = readStore()[signerKey];
  if (!entry?.dataUrl || typeof entry.dataUrl !== "string") return null;
  return { dataUrl: entry.dataUrl, savedAt: entry.savedAt || 0 };
}

export async function saveCachedSignature(signerKey, blob) {
  if (!signerKey || !blob) return;
  const dataUrl = await blobToDataUrl(blob);
  const store = readStore();
  store[signerKey] = { dataUrl, savedAt: Date.now() };
  writeStore(store);
}

export async function cachedSignatureToBlob(signerKey) {
  const cached = loadCachedSignature(signerKey);
  if (!cached) return null;
  return dataUrlToBlob(cached.dataUrl);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
