// Sending email (sign-in codes, password reset links).
// Off until a provider is connected, so nothing changes before that:
//   - Cloudflare Email Service: a `send_email` binding named EMAIL (Workers Paid, domain onboarded), or
//   - Resend: the RESEND_API_KEY secret (domain verified at resend.com).
// MAIL_FROM sets the sender, e.g. "Perkly <no-reply@perkly.shop>".
// MAIL_DEV_LOG=1 (local development only) prints emails to the log instead of sending them.

export type MailEnv = {
  EMAIL?: { send(message: Record<string, unknown>): Promise<unknown> };
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_DEV_LOG?: string;
};

export type Mail = { to: string; subject: string; text: string; html: string };

const DEFAULT_FROM = "Perkly <no-reply@perkly.shop>";

export function mailReady(env: MailEnv): boolean {
  return !!(env.EMAIL || env.RESEND_API_KEY || env.MAIL_DEV_LOG === "1");
}

/** "Name <a@b.c>" → { name, email }. */
function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || "Perkly", email: m[2] } : { name: "Perkly", email: from.trim() };
}

/** Sends one email. Returns false (never throws) when no provider is connected or the provider refuses. */
export async function sendMail(env: MailEnv, mail: Mail): Promise<boolean> {
  const from = env.MAIL_FROM?.trim() || DEFAULT_FROM;
  try {
    if (env.EMAIL) {
      await env.EMAIL.send({ to: mail.to, from: parseFrom(from), subject: mail.subject, text: mail.text, html: mail.html });
      return true;
    }
    if (env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      });
      if (!r.ok) console.warn(`mail failed: HTTP ${r.status}`);
      return r.ok;
    }
    if (env.MAIL_DEV_LOG === "1") {
      console.log(`[dev mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
      return true;
    }
  } catch (e) {
    console.warn(`mail failed: ${(e as Error).message}`);
  }
  return false;
}

/** "ronit@gmail.com" → "r***t@gmail.com", so the screen says where the code went without showing it all. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const shown = name.length <= 2 ? name[0] + "*" : `${name[0]}${"*".repeat(Math.min(3, name.length - 2))}${name[name.length - 1]}`;
  return `${shown}@${domain}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A short, plain email in Hebrew with English below. `lines` are paragraphs; `big` is shown large (a code). */
export function simpleMail(to: string, subject: string, he: string[], en: string[], big?: { text: string; href?: string }): Mail {
  const block = big
    ? big.href
      ? `<p style="margin:24px 0"><a href="${esc(big.href)}" style="background:#7558E8;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">${esc(big.text)}</a></p>`
      : `<p style="margin:24px 0;font-size:32px;font-weight:800;letter-spacing:6px;direction:ltr;text-align:center">${esc(big.text)}</p>`
    : "";
  const para = (l: string) => `<p style="margin:0 0 10px;line-height:1.6">${esc(l)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f7f7fa;font-family:Arial,sans-serif;color:#242334">
<div style="max-width:480px;margin:0 auto;padding:28px 20px">
<p style="font-size:20px;font-weight:800;margin:0 0 18px">Perkly</p>
<div dir="rtl" style="background:#fff;border:1px solid #ecebf1;border-radius:14px;padding:22px">${he.map(para).join("")}${block}</div>
<div dir="ltr" style="padding:16px 4px;color:#696875;font-size:13px">${en.map(para).join("")}</div>
</div></body></html>`;
  const text = [...he, big ? (big.href ? big.href : big.text) : "", "", ...en].join("\n");
  return { to, subject, text, html };
}
