import { getD1 } from "../../../db";
import { randomToken, sha256 } from "../../../lib/server/crypto";
import { clientIp, fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { normalizePhone } from "../../../lib/phone";
import { releaseArchivedPhone } from "../../../lib/server/customers";
import { isEntitled } from "../../../lib/server/billing";

export const dynamic = "force-dynamic";

/** "MM-DD" with a real calendar day. 02-29 is allowed because the year is unknown. */
function validMonthDay(value: string): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

// Public: a customer joins a business by scanning the business's join QR.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const db = getD1();
  if (!body) return fail("bad_request", 400);

  const ip = clientIp(request);
  if (!(await allow(db, `join-ip:${ip}`, 10, 600))) return fail("rate_limited", 429, "Too many attempts");

  const code = typeof body.code === "string" ? body.code.slice(0, 40) : "";
  const business = await db.prepare("SELECT id, target FROM businesses WHERE join_code = ?").bind(code).first<{ id: string; target: number }>();
  if (!code || !business) return fail("join_invalid", 404, "This join link is not active");
  if (!(await allow(db, `join-business:${business.id}`, 300, 3600))) return fail("rate_limited", 429);
  const sub = await db.prepare("SELECT status FROM subscriptions WHERE business = ?").bind(business.id).first<{ status: string }>();
  if (sub && !isEntitled(sub.status)) return fail("subscription_required", 402, "This business is not accepting new customers right now");

  const name = str(body.name, 80);
  const phone = normalizePhone(body.phone);
  if (!name || !phone) return fail("bad_details", 400, "Invalid name or phone");
  if (body.terms !== true) return fail("terms_required", 400, "Terms must be accepted");
  const marketing = body.marketing === true ? 1 : 0;
  // Optional day and month only ("MM-DD"). The year is never collected.
  const birthday = body.birthday == null || body.birthday === "" ? null : String(body.birthday);
  if (birthday !== null && !validMonthDay(birthday)) return fail("bad_details", 400, "Invalid birthday");

  const now = new Date().toISOString();
  const secret = randomToken(24);
  const scan = randomToken(16);
  const insert = db
    .prepare(
      `INSERT OR IGNORE INTO customers(id, business, name, phone, token, stamps, target, created, card_hash, scan_code, consent_terms, consent_marketing, source, birthday)
       VALUES(?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'self', ?)`,
    )
    .bind(crypto.randomUUID(), business.id, name, phone, scan, business.target, now, await sha256(secret), scan, now, marketing, birthday);
  // A removed customer's phone may join again: free it first, in the same batch as the insert.
  const [, r] = await db.batch([releaseArchivedPhone(db, business.id, phone), insert]);
  // Never hand out an existing card to someone who only knows the phone number.
  if (!r.meta.changes) return fail("phone_exists", 409, "This phone is already registered here. Ask the staff for your card link.");
  return json({ cardPath: `/c/${secret}` });
}
