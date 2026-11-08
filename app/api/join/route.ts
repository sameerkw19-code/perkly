import { getD1 } from "../../../db";
import { randomToken, sha256 } from "../../../lib/server/crypto";
import { clientIp, fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { normalizePhone } from "../../../lib/phone";
import { releaseArchivedPhone } from "../../../lib/server/customers";
import { businessAccess, freeLimitReached } from "../../../lib/server/billing";
import { parseBirthday } from "../../../lib/birthday";
import { getSettings } from "../../../lib/server/settings";

export const dynamic = "force-dynamic";

// Public: a customer joins a business by scanning the business's join QR.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const db = getD1();
  if (!body) return fail("bad_request", 400);

  const ip = clientIp(request);
  if (!(await allow(db, `join-ip:${ip}`, 10, 600))) return fail("rate_limited", 429, "Too many attempts");

  const code = typeof body.code === "string" ? body.code.slice(0, 40) : "";
  const business = await db.prepare("SELECT id, target, birthdays FROM businesses WHERE join_code = ? AND archived IS NULL").bind(code).first<{ id: string; target: number; birthdays: number }>();
  if (!code || !business) return fail("join_invalid", 404, "This join link is not active");
  if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");
  if (!(await allow(db, `join-business:${business.id}`, 300, 3600))) return fail("rate_limited", 429);
  const access = await businessAccess(db, business.id);
  if (!access.ok) return fail(access.code, 402, "This business is not accepting new customers right now");
  if (freeLimitReached(access)) return fail("subscription_required", 402, "This business is not accepting new customers right now");

  const name = str(body.name, 80);
  const phone = normalizePhone(body.phone);
  if (!name || !phone) return fail("bad_details", 400, "Invalid name or phone");
  if (body.terms !== true) return fail("terms_required", 400, "Terms must be accepted");
  const marketing = body.marketing === true ? 1 : 0;
  // Optional day and month only ("MM-DD"). The year is never collected.
  // Ignored when the business has birthdays turned off.
  const birthday = business.birthdays ? parseBirthday(body.birthday) : null;
  if (birthday === "invalid") return fail("bad_details", 400, "Invalid birthday");

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
  if (r.meta.changes) return json({ cardPath: `/c/${secret}?welcome=1` });

  // The number is already here. Often the customer filled in the form and left before keeping the card link,
  // and now cannot get back in. If that card was never used (no stamps, no activity, no reward, not saved
  // to a wallet), start it over with a new link: there is nothing on it to take. The old link stops working.
  // A card that was used is never handed to someone who only knows the phone number.
  const restart = await db
    .prepare(
      `UPDATE customers SET name = ?1, token = ?2, scan_code = ?2, card_hash = ?3, consent_terms = ?4, consent_marketing = ?5, birthday = ?6
       WHERE business = ?7 AND phone = ?8 AND archived IS NULL AND stamps = 0 AND google_wallet IS NULL
         AND NOT EXISTS (SELECT 1 FROM events WHERE customer = customers.id)
         AND NOT EXISTS (SELECT 1 FROM rewards WHERE customer = customers.id)
         AND NOT EXISTS (SELECT 1 FROM apple_registrations WHERE serial = customers.id)`,
    )
    .bind(name, scan, await sha256(secret), now, marketing, birthday, business.id, phone)
    .run();
  if (restart.meta.changes) return json({ cardPath: `/c/${secret}?welcome=1` });
  return fail("phone_exists", 409, "This phone is already registered here. Ask the staff for your card link.");
}
