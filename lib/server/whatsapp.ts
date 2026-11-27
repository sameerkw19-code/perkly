// WhatsApp reminders on the server: queuing a reminder for a client (once, only where the admin switched WhatsApp on for
// the business and the client didn't opt out), and sending the queue through Meta's WhatsApp Cloud API from the
// 2-minute job. Without the token and phone number id nothing is sent, and reminders past their time expire unsent.

import { env } from "cloudflare:workers";
import { waRetryAfter, waTo, WA_TEMPLATES, type WaTemplate, waLang } from "../whatsapp.ts";
import { sameText } from "./crypto";

export type WaConfig = { token: string; phoneId: string; version: string; base: string };

export function waConfig(e: { WHATSAPP_TOKEN?: string; WHATSAPP_PHONE_ID?: string; WHATSAPP_API_VERSION?: string; WHATSAPP_API_BASE?: string } = env): WaConfig | null {
  if (!e.WHATSAPP_TOKEN || !e.WHATSAPP_PHONE_ID) return null;
  // WHATSAPP_API_BASE: only for local tests (a stand-in for Meta).
  return { token: e.WHATSAPP_TOKEN, phoneId: e.WHATSAPP_PHONE_ID, version: e.WHATSAPP_API_VERSION || "v21.0", base: e.WHATSAPP_API_BASE || "https://graph.facebook.com" };
}

/** The site's address for links in messages. */
export function publicOrigin(): string {
  return (env as unknown as { PUBLIC_ORIGIN?: string }).PUBLIC_ORIGIN || "https://perkly.shop";
}

/**
 * Queues one reminder (the id makes it go out once). Skipped when the business has WhatsApp off, the client opted out
 * or has no usable number. `expires`: after this it is no longer worth sending.
 */
export async function queueWhatsApp(db: D1Database, m: {
  id: string; business: string; customer: string; template: WaTemplate; lang: string; params: string[]; nowIso: string; expires: string;
}): Promise<boolean> {
  const row = await db
    .prepare("SELECT c.phone, c.wa_off, b.wa_on FROM customers c JOIN businesses b ON b.id = c.business WHERE c.id = ? AND b.id = ?")
    .bind(m.customer, m.business)
    .first<{ phone: string; wa_off: string | null; wa_on: number | null }>();
  if (!row || row.wa_on !== 1 || row.wa_off || !waTo(row.phone)) return false;
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO wa_outbox(id, business, customer, phone, template, lang, params, not_before, expires, created)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(m.id, m.business, m.customer, row.phone, WA_TEMPLATES[m.template], waLang(m.lang), JSON.stringify(m.params), m.nowIso, m.expires, m.nowIso)
    .run();
  return !!r.meta.changes;
}

export type WaResult = { ok: true; id: string | null } | { ok: false; status: number; error: string };

/** Sends one template message. */
export async function sendTemplate(cfg: WaConfig, phone: string, template: string, lang: string, params: string[]): Promise<WaResult> {
  const to = waTo(phone);
  if (!to) return { ok: false, status: 400, error: "invalid phone" };
  try {
    const r = await fetch(`${cfg.base}/${cfg.version}/${encodeURIComponent(cfg.phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
        template: { name: template, language: { code: lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.slice(0, 900) })) }] },
      }),
    });
    const j = (await r.json().catch(() => null)) as { messages?: { id: string }[]; error?: { code?: number; message?: string } } | null;
    if (r.ok) return { ok: true, id: j?.messages?.[0]?.id ?? null };
    return { ok: false, status: r.status, error: `${r.status} ${j?.error?.code ?? ""} ${j?.error?.message ?? ""}`.trim().slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 503, error: String(e).slice(0, 300) };
  }
}

type Row = { id: string; phone: string; template: string; lang: string; params: string; tries: number };

/** Sends what's waiting (up to `batch`), retrying rate limits and Meta errors a few times. Returns how many went out. */
export async function drainWhatsApp(db: D1Database, cfg: WaConfig | null, nowIso: string, batch = 40): Promise<number> {
  const now = Date.parse(nowIso);
  await db.prepare("UPDATE wa_outbox SET status = 'expired' WHERE status = 'queued' AND expires <= ?").bind(nowIso).run();
  if (!cfg) return 0;
  // A send that never finished (the run was cut off) goes back to the queue after 10 minutes.
  await db.prepare("UPDATE wa_outbox SET status = 'queued' WHERE status = 'sending' AND not_before <= ?").bind(new Date(now - 600_000).toISOString()).run();
  const { results } = await db
    .prepare("SELECT id, phone, template, lang, params, tries FROM wa_outbox WHERE status = 'queued' AND not_before <= ? ORDER BY not_before LIMIT ?")
    .bind(nowIso, batch)
    .all<Row>();
  let sent = 0;
  for (const m of results ?? []) {
    // Claimed first (only if still queued), so two overlapping runs never both send it.
    const claim = await db.prepare("UPDATE wa_outbox SET status = 'sending', tries = tries + 1, not_before = ? WHERE id = ? AND status = 'queued'").bind(nowIso, m.id).run();
    if (!claim.meta.changes) continue;
    const r = await sendTemplate(cfg, m.phone, m.template, m.lang, JSON.parse(m.params) as string[]);
    if (r.ok) {
      sent++;
      await db.prepare("UPDATE wa_outbox SET status = 'sent', wa_id = ?, sent_at = ?, error = NULL WHERE id = ?").bind(r.id, nowIso, m.id).run();
      continue;
    }
    const wait = waRetryAfter(r.status, m.tries + 1);
    await db
      .prepare("UPDATE wa_outbox SET status = ?, error = ?, not_before = ? WHERE id = ?")
      .bind(wait === null ? "failed" : "queued", r.error, new Date(now + (wait ?? 0)).toISOString(), m.id)
      .run();
  }
  if (sent) console.log(`whatsapp: ${sent} sent`);
  return sent;
}

/** Checks Meta's webhook signature ("sha256=<hex>" of the raw body, keyed with the app secret). */
export async function verifyMetaSignature(secret: string, raw: string, header: string | null): Promise<boolean> {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header ?? "");
  if (!m) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sameText(hex, m[1].toLowerCase());
}

/** A plain text reply (allowed within 24 hours of the client writing to us). */
export async function sendText(cfg: WaConfig, phone: string, text: string): Promise<boolean> {
  const to = waTo(phone);
  if (!to) return false;
  const r = await fetch(`${cfg.base}/${cfg.version}/${encodeURIComponent(cfg.phoneId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  }).catch(() => null);
  return !!r?.ok;
}

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/** Delivery news from Meta: a message delivered, read or failed. Never moves a message back (read stays read). */
export async function applyWaStatus(db: D1Database, waId: string, status: string, error: string | null): Promise<void> {
  if (status === "failed") {
    await db.prepare("UPDATE wa_outbox SET status = 'failed', error = ? WHERE wa_id = ?").bind(error, waId).run();
    return;
  }
  const rank = RANK[status];
  if (!rank) return;
  const lower = Object.keys(RANK).filter((k) => RANK[k] < rank);
  await db.prepare(`UPDATE wa_outbox SET status = ? WHERE wa_id = ? AND status IN (${lower.map(() => "?").join(",")})`).bind(status, waId, ...lower).run();
}

/** A client stopped (or restarted) WhatsApp reminders: for every business where this number is a client. */
export async function setWaOptOut(db: D1Database, phone: string, stop: boolean, nowIso: string): Promise<number> {
  const r = await db.prepare(stop ? "UPDATE customers SET wa_off = ? WHERE phone = ? AND wa_off IS NULL" : "UPDATE customers SET wa_off = NULL WHERE phone = ? AND wa_off IS NOT NULL")
    .bind(...(stop ? [nowIso, phone] : [phone]))
    .run();
  if (stop) await db.prepare("UPDATE wa_outbox SET status = 'cancelled' WHERE phone = ? AND status = 'queued'").bind(phone).run();
  return r.meta.changes ?? 0;
}
