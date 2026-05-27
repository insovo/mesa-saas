const TOKEN_KEY = "mesa.token";
const USER_KEY = "mesa.user";
// 已保存账号:用户在 Login 勾「记住」后存入,Topbar「切换账号」下拉里列出。
// 仅存 token + 必要 user 元数据(email/name/role/avatar),**永不存密码**。
const SAVED_KEY = "mesa.saved_accounts";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

// === Saved accounts =================================================

export function getSavedAccounts() {
  const raw = localStorage.getItem(SAVED_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeSaved(list) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list));
}

// 把当前 token + user 存为「记住的账号」(按 email 去重,新数据覆盖)
export function addSavedAccount(token, user) {
  if (!token || !user?.email) return;
  const slim = {
    id: user.id,
    email: user.email,
    name: user.name || null,
    role: user.role || null,
    avatar: user.avatar || null,
  };
  const list = getSavedAccounts().filter((a) => a.email !== user.email);
  list.unshift({ token, user: slim, savedAt: Date.now() });
  writeSaved(list.slice(0, 8)); // 最多保留 8 个
}

export function removeSavedAccount(email) {
  writeSaved(getSavedAccounts().filter((a) => a.email !== email));
}

// 切到已保存的账号:把对应 token+user 写到当前位
// 失败 (没找到) 返回 false,调用方应跳 Login
export function switchToSavedAccount(email) {
  const entry = getSavedAccounts().find((a) => a.email === email);
  if (!entry) return false;
  setAuth(entry.token, entry.user);
  return true;
}

// 清掉所有已保存账号
export function clearSavedAccounts() {
  localStorage.removeItem(SAVED_KEY);
}
