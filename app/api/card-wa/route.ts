import { getD1 } from "../../../db";
import { sha256 } from "../../../lib/server/crypto";
import { clientIp, fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";

export const dynamic = "force-dynamic";

// The client (with their card's secret link) turns WhatsApp reminders off or back on for their number at this business.
export async function POST(request: Request) {
  const body = await readJson(request, 2_000);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const secret = str(body?.secret, 100);
  if (!secret || typeof body?.on !== "boolean") return fail("bad_request", 400);
  const db = getD1();
  if (!(await allow(db, `card-wa:${clientIp(request)}`, 30, 600))) return fail("rate_limited", 429);
  const c = await db
    .prepare("SELECT c.id, c.phone, b.wa_on FROM customers c JOIN businesses b ON b.id = c.business WHERE c.card_hash = ? AND c.archived IS NULL")
    .bind(await sha256(secret))
    .first<{ id: string; phone: string; wa_on: number | null }>();
  if (!c || c.wa_on !== 1) return fail("not_found", 404);
  const nowIso = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE customers SET wa_off = ? WHERE id = ?").bind(body.on ? null : nowIso, c.id),
    ...(body.on ? [] : [db.prepare("UPDATE wa_outbox SET status = 'cancelled' WHERE customer = ? AND status = 'queued'").bind(c.id)]),
  ]);
  return json({ ok: true, on: body.on });
}
