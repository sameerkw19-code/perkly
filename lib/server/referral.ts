// "Bring a friend": a customer shares an invite link; the friend joins through it, and on the friend's first
// visit (the first stamp from the staff) both get the business's bonus stamps. Paying at the first visit, not at
// joining, means a made-up phone number earns nothing. An inviter is rewarded at most REFERRER_MAX times a month.
import { randomToken } from "./crypto";
import { pushAppleCustomer } from "./apple-push";

export const REFERRAL_MAX_STAMPS = 3;
const REFERRER_MAX = 10;

type Biz = { id: string; target: number; reward_mode: string; reward_expiry_days: number; referral_stamps?: number; program: string };

/** The customer's invite code (made the first time it is needed). */
export async function refCode(db: D1Database, customerId: string): Promise<string | null> {
  const row = await db.prepare("SELECT ref_code FROM customers WHERE id = ?").bind(customerId).first<{ ref_code: string | null }>();
  if (row?.ref_code) return row.ref_code;
  for (let i = 0; i < 3; i++) {
    const code = randomToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || randomToken(6);
    const r = await db.prepare("UPDATE customers SET ref_code = ? WHERE id = ? AND ref_code IS NULL").bind(code, customerId).run().catch(() => null);
    if (r?.meta.changes) return code;
    const again = await db.prepare("SELECT ref_code FROM customers WHERE id = ?").bind(customerId).first<{ ref_code: string | null }>();
    if (again?.ref_code) return again.ref_code;
  }
  return null;
}

/** The inviting customer behind an invite code, in this business. */
export async function referrerFor(db: D1Database, businessId: string, code: unknown): Promise<string | null> {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{4,16}$/.test(code)) return null;
  const row = await db.prepare("SELECT id FROM customers WHERE business = ? AND ref_code = ? AND archived IS NULL").bind(businessId, code).first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Adds bonus stamps to one card, as the stamp action would (a full card saves a reward in collect mode; a
 * block-mode card stops at its target). Recorded as a "referral" event. Returns whether it was added.
 */
async function addBonus(db: D1Database, b: Biz, customerId: string, n: number, now: string, eventId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const c = await db.prepare("SELECT stamps, target FROM customers WHERE id = ? AND archived IS NULL").bind(customerId).first<{ stamps: number; target: number }>();
    if (!c) return false;
    let total = c.stamps + n;
    let target = c.target;
    let earned = 0;
    if (b.reward_mode === "block") total = Math.min(total, c.target);
    else while (total >= target) { total -= target; earned++; target = b.target; }
    if (total === c.stamps && !earned) return false;
    const expires = b.reward_expiry_days > 0 ? new Date(Date.parse(now) + b.reward_expiry_days * 86_400_000).toISOString() : null;
    const ids = Array.from({ length: earned }, (_, i) => `${eventId}:${i}`);
    const result = await db.batch([
      db.prepare("UPDATE customers SET stamps = ?, target = ? WHERE id = ? AND stamps = ? AND target = ? AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)")
        .bind(total, target, customerId, c.stamps, c.target, eventId),
      db.prepare(
        `INSERT INTO events(id, customer, actor, kind, delta, created, business, branch, actor_role, stamps_after, note)
         SELECT ?, ?, 'perkly', 'referral', ?, ?, ?, NULL, 'system', (SELECT stamps FROM customers WHERE id = ?), NULL WHERE changes() = 1`,
      ).bind(eventId, customerId, n, now, b.id, customerId),
      ...(earned
        ? [db.prepare(
            `INSERT OR IGNORE INTO rewards(id, business, customer, earned, earned_event, expires)
             SELECT v.column1, ?, ?, ?, ?, ? FROM (VALUES ${ids.map(() => "(?)").join(",")}) v WHERE EXISTS(SELECT 1 FROM events WHERE id = ?)`,
          ).bind(b.id, customerId, now, eventId, expires, ...ids, eventId)]
        : []),
    ]);
    if (result[0].meta.changes) return true;
    if (await db.prepare("SELECT 1 FROM events WHERE id = ?").bind(eventId).first()) return false;
  }
  return false;
}

/**
 * After a stamp: if this customer was invited and it's their first rewarded visit, both get the bonus.
 * Never throws (a stamp must not fail because of a bonus). Returns the stamps given to the friend.
 */
export async function payReferral(db: D1Database, b: Biz, friendId: string, now: string): Promise<number> {
  try {
    const n = Math.min(REFERRAL_MAX_STAMPS, b.referral_stamps ?? 0);
    if (n < 1 || b.program !== "stamps") return 0;
    const friend = await db.prepare("SELECT invited_by, referral_paid FROM customers WHERE id = ?").bind(friendId).first<{ invited_by: string | null; referral_paid: string | null }>();
    if (!friend?.invited_by || friend.referral_paid) return 0;
    const claimed = await db.prepare("UPDATE customers SET referral_paid = ? WHERE id = ? AND referral_paid IS NULL").bind(now, friendId).run();
    if (!claimed.meta.changes) return 0;
    const given = await addBonus(db, b, friendId, n, now, `ref:${friendId}:friend`);
    // The inviter: at most REFERRER_MAX rewards in 30 days.
    const monthAgo = new Date(Date.parse(now) - 30 * 86_400_000).toISOString();
    const recent = await db
      .prepare("SELECT COUNT(*) AS n FROM customers WHERE invited_by = ? AND referral_paid > ?")
      .bind(friend.invited_by, monthAgo)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) <= REFERRER_MAX && (await addBonus(db, b, friend.invited_by, n, now, `ref:${friendId}:inviter`))) {
      // The inviter's wallet passes: iPhones fetch the pass again; Google passes are refreshed by the background job.
      pushAppleCustomer(db, friend.invited_by);
      await db
        .prepare(
          `INSERT INTO wallet_outbox(id, business, customer, kind, not_before, created)
           SELECT 'sync:' || id, business, id, 'sync', ?1, ?1 FROM customers WHERE id = ?2 AND google_wallet IS NOT NULL
           ON CONFLICT(id) DO UPDATE SET done = NULL, result = NULL, attempts = 0, not_before = excluded.not_before`,
        )
        .bind(now, friend.invited_by)
        .run();
    }
    return given ? n : 0;
  } catch (e) {
    console.warn("referral bonus failed", String(e));
    return 0;
  }
}

