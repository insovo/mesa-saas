// 邮件发送 — Resend API 直调,无 key 时降级到 console + 调用方拿到 devCode
//
// 环境变量:
//   RESEND_API_KEY    — Resend 的 API key(re_xxx)
//   RESEND_FROM       — 发件人(必须是 Resend 已验证的域名邮箱),如 "noreply@insovo.top"
//   APP_BASE_URL      — 邮件正文里的链接前缀,默认 https://insovo.top
//
// 安全:不写明文 key 到日志;失败 fallback 也不暴露 key

const API_URL = "https://api.resend.com/emails";

function getCfg() {
  return {
    apiKey: process.env.RESEND_API_KEY || "",
    from: process.env.RESEND_FROM || "MESA Recruit <noreply@insovo.top>",
    baseUrl: process.env.APP_BASE_URL || "https://insovo.top",
  };
}

export function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

// 发送邮件 — 返回 { ok, devCode? }。devCode 仅在未配置 Resend 时(开发模式)返回
export async function sendEmail({ to, subject, html, text }) {
  const cfg = getCfg();
  if (!cfg.apiKey) {
    // dev fallback:不真发,只把内容打到日志,调用方仍能拿到验证码完成测试
    console.log(`[email/dev] to=${to} subject="${subject}"`);
    console.log(`[email/dev] body=${(text || html || "").replace(/<[^>]+>/g, "").slice(0, 200)}`);
    return { ok: true, mode: "dev" };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [to],
        subject,
        html: html || `<pre>${text}</pre>`,
        text: text || html?.replace(/<[^>]+>/g, ""),
      }),
      signal: ac.signal,
    });
    if (!resp.ok) {
      const body = await resp.text();
      const safe = body.slice(0, 200);
      console.error("[email/resend] failed", resp.status, safe);
      throw Object.assign(new Error(`resend_failed:${resp.status}`), { statusCode: 502, code: "email_send_failed" });
    }
    return { ok: true, mode: "resend" };
  } catch (err) {
    if (err.name === "AbortError") {
      throw Object.assign(new Error("email_timeout"), { statusCode: 504, code: "email_timeout" });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 渲染验证码邮件模板
export function renderVerificationEmail({ code, purpose, expiresMinutes = 5 }) {
  const purposeLabel = {
    CHANGE_EMAIL: "修改邮箱",
    CHANGE_EMAIL_NEW: "确认新邮箱",
    CHANGE_PASSWORD: "修改密码",
    RESET_PASSWORD: "重置密码",
  }[purpose] || "邮箱验证";
  const subject = `【MESA Recruit】${purposeLabel}验证码 ${code}`;
  const html = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1B254B;background:#F4F7FE;">
      <h2 style="color:#422AFB;margin:0 0 16px;">MESA Recruit · ${purposeLabel}</h2>
      <p style="font-size:14px;line-height:1.6;">您正在进行<strong>${purposeLabel}</strong>操作,请在 ${expiresMinutes} 分钟内输入以下验证码:</p>
      <div style="margin:24px 0;padding:20px;background:white;border-radius:12px;text-align:center;">
        <code style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#422AFB;">${code}</code>
      </div>
      <p style="font-size:12px;color:#707EAE;line-height:1.6;">
        如果不是您本人操作,请忽略此邮件并尽快修改密码。<br/>
        本邮件由系统自动发送,请勿直接回复。
      </p>
    </div>
  `;
  const text = `【MESA Recruit】${purposeLabel}\n您的验证码:${code}\n该验证码 ${expiresMinutes} 分钟内有效。\n如非本人操作请忽略。`;
  return { subject, html, text };
}
