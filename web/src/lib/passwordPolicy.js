// 密码强度策略 — 前后端共享(前端拷贝在 web/src/lib/passwordPolicy.js)
// 规则:
//   1. 长度 ≥ 10
//   2. 至少包含 数字 + 字母 两种字符;推荐含特殊字符
//   3. 不能包含 email local-part 或 name(>= 3 字符的子串)
//   4. 不能命中弱密码 Top 列表
//
// 输出 { ok, score: 0-4, errors: string[] }
//   ok:    true 表示通过所有硬规则
//   score: 0=极弱 / 1=弱 / 2=中 / 3=强 / 4=非常强

const WEAK_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwertyui", "qwerty123", "iloveyou", "admin", "admin1234", "letmein",
  "welcome", "welcome1", "monkey123", "abc12345", "11111111", "00000000",
  "mesa-recruit", "mesa12345", "mesarecruit",
]);

export const MIN_LENGTH = 10;

export function validatePassword(password, { email = "", name = "" } = {}) {
  const errors = [];
  if (typeof password !== "string") {
    return { ok: false, score: 0, errors: ["密码不能为空"] };
  }

  if (password.length < MIN_LENGTH) {
    errors.push(`密码至少 ${MIN_LENGTH} 位`);
  }

  const hasDigit = /[0-9]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (!hasDigit) errors.push("必须包含至少 1 个数字");
  if (!(hasLower || hasUpper)) errors.push("必须包含至少 1 个字母");

  const lowered = password.toLowerCase();
  if (WEAK_PASSWORDS.has(lowered)) {
    errors.push("此密码在常用弱密码列表中,请换一个");
  }

  // 邮箱 local-part / 姓名 不能作为密码主体
  const emailLocal = String(email).split("@")[0].toLowerCase();
  if (emailLocal && emailLocal.length >= 3 && lowered.includes(emailLocal)) {
    errors.push("密码不能包含您的邮箱用户名");
  }
  const lname = String(name).toLowerCase();
  if (lname && lname.length >= 3 && lowered.includes(lname)) {
    errors.push("密码不能包含您的姓名");
  }

  // 连续重复字符过多
  if (/(.)\1{3,}/.test(password)) {
    errors.push("不能连续出现 4 个以上相同字符");
  }
  // 顺序数字串
  if (/0123|1234|2345|3456|4567|5678|6789/.test(password)) {
    errors.push("不能包含连续递增数字串(如 1234)");
  }

  // 评分
  let score = 0;
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (hasDigit && (hasLower || hasUpper)) score += 1;
  if (hasUpper && hasLower) score += 1;
  if (hasSymbol) score += 1;
  if (score > 4) score = 4;
  if (errors.length > 0 && score > 2) score = 2;

  return { ok: errors.length === 0, score, errors };
}
