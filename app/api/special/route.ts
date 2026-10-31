import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getMemberships, getRole, getUser } from "../../../lib/server/auth";
import { fail, json, readJson, sameOrigin } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { getSettings } from "../../../lib/server/settings";
import { walletConfig } from "../../../lib/server/google-wallet";
import { SPECIAL_MAX_TEXT } from "../../../lib/design";

export const dynamic = "force-dynamic";

/** How far ahead a message can be scheduled, and how many may wait at once. */
const MAX_DAYS_AHEAD = 120;
const MAX_PENDING = 10;

type SpecialRow = { id: string; send_at: string; text: string; queued: string | null; recipients: number | null; canceled: string | null; sent: number };

/** The owner's businesses, and the chosen one (or the first). Only owners schedule messages. */
async function ownerBusiness(db: D1Database, userId: string, wanted: unknown) {
  const owned = (await getMemberships(db, userId)).filter((m) => m.role === "owner");
  const pick = typeof wanted === "string" && wanted ? owned.find((m) => m.business === wanted) : owned[0];
  return { owned, pick };
}

// GET /api/special?business=… → scheduled special-day messages, newest first, with delivery counts.
export async function GET(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  const { owned, pick } = await ownerBusiness(db, user.id, new URL(request.url).searchParams.get("business"));
  if (!pick) return fail("forbidden", 403, "Owners only");
  const [items, wallet] = await Promise.all([
    db
      .prepare(
        `SELECT s.id, s.send_at, s.text, s.queued, s.recipients, s.canceled,
           (SELECT COUNT(*) FROM wallet_outbox o WHERE o.campaign = s.id AND o.result = 'sent') AS sent
         FROM special_days s WHERE s.business = ? ORDER BY s.send_at DESC LIMIT 30`,
      )
      .bind(pick.business)
      .all<SpecialRow>(),
    db.prepare("SELECT COUNT(*) AS n FROM customers WHERE business = ? AND archived IS NULL AND google_wallet IS NOT NULL").bind(pick.business).first<{ n: number }>(),
  ]);
  return json({
    business: { id: pick.business, name: pick.businessName },
    businesses: owned.map((m) => ({ id: m.business, name: m.businessName })),
    items: items.results ?? [],
    walletCustomers: wallet?.n ?? 0,
    walletReady: walletConfig(env) !== null,
  });
}

// POST { action: "create", business, sendAt, text } | { action: "cancel", business, id }
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  if (!body) return fail("bad_request", 400);
  if ((await getRole(db, user.id, body.business)) !== "owner") return fail("forbidden", 403, "Owners only");
  const business = body.business as string;
  if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");
  if (!(await allow(db, `special:${user.id}`, 30, 3600))) return fail("rate_limited", 429, "Too many attempts");
  const now = Date.now();

  if (body.action === "cancel") {
    if (typeof body.id !== "string") return fail("bad_request", 400);
    const r = await db
      .prepare("UPDATE special_days SET canceled = ? WHERE id = ? AND business = ? AND queued IS NULL AND canceled IS NULL")
      .bind(new Date(now).toISOString(), body.id, business)
      .run();
    if (!r.meta.changes) return fail("special_sent", 409, "Already sent or canceled");
    return json({ ok: true });
  }

  if (body.action !== "create") return fail("bad_request", 400, "Unknown action");
  const text = typeof body.text === "string" ? body.text.replace(/[\u0000-\u001f]/g, " ").trim() : "";
  if (!text || text.length > SPECIAL_MAX_TEXT) return fail("special_text", 400, "Write a message (up to 160 characters)");
  const sendAt = typeof body.sendAt === "string" ? Date.parse(body.sendAt) : NaN;
  // A minute of slack for "now"; at most MAX_DAYS_AHEAD days ahead.
  if (!Number.isFinite(sendAt) || sendAt < now - 60_000 || sendAt > now + MAX_DAYS_AHEAD * 86_400_000) {
    return fail("special_time", 400, "Pick a time from now up to 120 days ahead");
  }
  const pending = await db
    .prepare("SELECT COUNT(*) AS n FROM special_days WHERE business = ? AND queued IS NULL AND canceled IS NULL")
    .bind(business)
    .first<{ n: number }>();
  if ((pending?.n ?? 0) >= MAX_PENDING) return fail("special_many", 409, "Up to 10 scheduled messages at a time");
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO special_days(id, business, send_at, text, created, created_by) VALUES(?, ?, ?, ?, ?, ?)")
    .bind(id, business, new Date(Math.max(sendAt, now)).toISOString(), text, new Date(now).toISOString(), user.id)
    .run();
  return json({ ok: true, id });
}
