import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getMemberships, getUser } from "../../../lib/server/auth";
import { fail, json, readJson, sameOrigin } from "../../../lib/server/http";
import { maskPhone, normalizePhone } from "../../../lib/phone";
import { formatBirthday, upcomingKeys } from "../../../lib/birthday";
import { daysSince, isAway } from "../../../lib/visits";
import { businessAccess, hasPaidDesign } from "../../../lib/server/billing";
import { getSettings } from "../../../lib/server/settings";
import { allow } from "../../../lib/server/rate-limit";
import { SMS_BATCH, sendSmsBatch, smsConfigured } from "../../../lib/server/pulseem";
import { messageFor } from "../../../lib/sms-text";

export const dynamic = "force-dynamic";

/** Text messages a business may send in one calendar month (they are paid for by Perkly). */
const MONTHLY_SMS_LIMIT = 500;
const MAX_TEXT = 300;

type Audience = "all" | "birthdays" | "away";

/**
 * Owner-only list of customers who may receive a marketing text message, and sending to them.
 * Only customers who said yes to marketing are included.
 *
 * GET  /api/messages?business=<id>&audience=all|birthdays|away&days=<1-14>
 * POST /api/messages { business, audience, days, text }            sends to the list (rebuilt here)
 * POST /api/messages { business, audience, days, text, testPhone } sends one test message to that phone
 * "away": customers who have not come back in 30+ days (see lib/visits.ts).
 */
async function owner(db: D1Database, request: Request, wanted: string | null) {
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return { error: fail("signin", 401, "Sign in required") } as const;
  const memberships = await getMemberships(db, user.id);
  const membership = memberships.find((m) => m.business === wanted) ?? memberships[0];
  if (!membership) return { error: fail("not_found", 404, "No business") } as const;
  if (membership.role !== "owner") return { error: fail("forbidden", 403, "Owners only") } as const;
  return { user, business: membership.business } as const;
}

function cleanAudience(v: unknown): Audience {
  return v === "birthdays" || v === "away" ? v : "all";
}

function cleanDays(v: unknown): number {
  return Math.min(14, Math.max(1, Number(v ?? 7) || 7));
}

async function recipients(db: D1Database, business: string, audience: Audience, days: number) {
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.birthday, c.created, lv.last_visit FROM customers c
       LEFT JOIN (SELECT customer, MAX(created) AS last_visit FROM events WHERE business = ?1 AND kind IN ('stamp', 'redeem') GROUP BY customer) lv
         ON lv.customer = c.id
       WHERE c.business = ?1 AND c.archived IS NULL AND c.consent_marketing = 1 AND c.phone IS NOT NULL AND c.phone != ''
       ORDER BY c.name`,
    )
    .bind(business)
    .all<{ id: string; name: string; phone: string; birthday: string | null; created: string; last_visit: string | null }>();

  // Birthdays are matched in Israel time, the same way the dashboard shows them.
  const upcoming = upcomingKeys(new Date(), days);
  return (rows.results ?? [])
    .filter((c) =>
      audience === "all" ? true
      : audience === "away" ? isAway(c.last_visit, c.created)
      : !!c.birthday && upcoming.has(c.birthday))
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      masked: maskPhone(c.phone),
      birthday: c.birthday ? formatBirthday(c.birthday) : null,
      inDays: audience === "birthdays" && c.birthday ? (upcoming.get(c.birthday) ?? null) : null,
      awayDays: audience === "away" ? daysSince(c.last_visit || c.created) : null,
    }))
    .sort((a, b) => (a.inDays ?? 999) - (b.inDays ?? 999) || a.name.localeCompare(b.name));
}

/** Messages sent this calendar month (not counting tests). */
async function usedThisMonth(db: D1Database, business: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const row = await db
    .prepare("SELECT COALESCE(SUM(recipients), 0) AS n FROM sms_log WHERE business = ? AND test = 0 AND status = 'sent' AND created >= ?")
    .bind(business, monthStart)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function GET(request: Request) {
  const db = getD1();
  const url = new URL(request.url);
  const who = await owner(db, request, url.searchParams.get("business"));
  if ("error" in who) return who.error;
  const audience = cleanAudience(url.searchParams.get("audience"));
  const days = cleanDays(url.searchParams.get("days"));
  const [list, used, biz, access] = await Promise.all([
    recipients(db, who.business, audience, days),
    usedThisMonth(db, who.business),
    db.prepare("SELECT name FROM businesses WHERE id = ?").bind(who.business).first<{ name: string }>(),
    businessAccess(db, who.business),
  ]);
  return json({
    audience, days, count: list.length, recipients: list,
    businessName: biz?.name ?? "",
    // Sending needs the SMS service and a subscription (or admin free access).
    canSend: smsConfigured(env) && hasPaidDesign(access),
    smsConnected: smsConfigured(env),
    used, limit: MONTHLY_SMS_LIMIT,
  });
}

export async function POST(request: Request) {
  const body = await readJson(request); // read first, always
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  if (!body) return fail("bad_request", 400);
  const db = getD1();
  const who = await owner(db, request, typeof body.business === "string" ? body.business : null);
  if ("error" in who) return who.error;
  if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");
  if (!smsConfigured(env)) return fail("sms_off", 503, "The SMS service is not connected");
  if (!hasPaidDesign(await businessAccess(db, who.business))) return fail("paid_feature", 402, "Available with a subscription");

  const text = typeof body.text === "string" ? body.text.replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim() : "";
  if (!text || text.length > MAX_TEXT) return fail("bad_details", 400, "Message must be 1–300 characters");
  const audience = cleanAudience(body.audience);
  const biz = await db.prepare("SELECT name FROM businesses WHERE id = ?").bind(who.business).first<{ name: string }>();
  const businessName = biz?.name ?? "";
  const now = new Date().toISOString();
  const log = (count: number, test: boolean, status: string, detail: string) =>
    db.prepare("INSERT INTO sms_log(id, business, created, created_by, audience, recipients, test, status, detail) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), who.business, now, who.user.email, audience, count, test ? 1 : 0, status, detail.slice(0, 300)).run();

  // Test: one message to the owner's own phone, with a sample name.
  if (body.testPhone !== undefined) {
    const phone = normalizePhone(body.testPhone);
    if (!phone) return fail("bad_phone", 400, "Invalid phone");
    if (!(await allow(db, `sms-test:${who.business}`, 10, 3600))) return fail("rate_limited", 429);
    const r = await sendSmsBatch(env, [{ to: phone, text: messageFor(businessName, text, "בדיקה"), ref: "test" }], crypto.randomUUID(), false);
    await log(1, true, r.ok ? "sent" : "failed", `${r.status} ${r.detail}`);
    if (!r.ok) return fail("sms_failed", 502, "The SMS service did not accept the message");
    return json({ ok: true, sent: 1 });
  }

  if (!(await allow(db, `sms-send:${who.business}`, 5, 3600))) return fail("rate_limited", 429);
  // The list is rebuilt here, never taken from the browser.
  const list = await recipients(db, who.business, audience, cleanDays(body.days));
  if (!list.length) return fail("no_recipients", 400, "No customers to send to");
  const used = await usedThisMonth(db, who.business);
  if (used + list.length > MONTHLY_SMS_LIMIT) {
    return json({ error: "Monthly limit", code: "sms_limit", left: Math.max(0, MONTHLY_SMS_LIMIT - used) }, 429);
  }

  const sendId = crypto.randomUUID();
  let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += SMS_BATCH) {
    const chunk = list.slice(i, i + SMS_BATCH);
    const r = await sendSmsBatch(env, chunk.map((c) => ({ to: c.phone, text: messageFor(businessName, text, c.name), ref: c.id })), `${sendId}-${i / SMS_BATCH}`, true);
    if (r.ok) sent += chunk.length; else failed += chunk.length;
    await log(chunk.length, false, r.ok ? "sent" : "failed", `${r.status} ${r.detail}`);
  }
  if (!sent) return fail("sms_failed", 502, "The SMS service did not accept the messages");
  return json({ ok: true, sent, failed });
}
