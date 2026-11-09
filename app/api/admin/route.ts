import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getUser, isPlatformAdmin } from "../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { normalizeEmail } from "../../../lib/server/auth";
import { verifyPassword } from "../../../lib/server/crypto";
import { allow } from "../../../lib/server/rate-limit";
import { cancelAtPeriodEnd } from "../../../lib/server/polar";
import { applePushReady, pushTokens } from "../../../lib/server/apple-push";
import { customerForPass } from "../../../lib/server/apple-wallet";
import { passLook } from "../../../lib/server/designs";
import { debugObjects, objectSaved, updateLoyaltyObject, walletConfig } from "../../../lib/server/google-wallet";

export const dynamic = "force-dynamic";

const MAX_COMP_DAYS = 366;
/** Free access "without an end date": a date far in the future, so every check stays a date comparison. */
const FOREVER = "9999-12-31T00:00:00.000Z";

// Platform admin actions on one business. Every change is written to admin_log in the same batch.
// Actions: suspend (with reason), unsuspend, grant_comp (free access for N days, or forever: true), clear_comp,
// update_business (name, reward, target), transfer_owner (to an existing user by email), archive, restore,
// kit_sent (the yearly plan's counter kit was shipped), reset_data (delete every customer, stamp and reward, for test
// businesses; the admin types the business name and their password), apple_push_test (refresh the business's Apple Wallet passes
// now and return what Apple answered).
export async function POST(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  // Same answer as a missing route for everyone who is not an admin, checked before anything else.
  if (!user || !isPlatformAdmin(user, env)) return fail("not_found", 404);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const body = await readJson(request);
  if (!body) return fail("bad_request", 400);

  const businessId = str(body.business, 64);
  if (!businessId) return fail("bad_request", 400);
  const business = await db.prepare("SELECT id, owner, name FROM businesses WHERE id = ?").bind(businessId).first<{ id: string; owner: string; name: string }>();
  if (!business) return fail("not_found", 404, "Business not found");

  const now = new Date();
  const nowIso = now.toISOString();
  const log = (action: string, detail: string | null) =>
    db.prepare("INSERT INTO admin_log(id, admin, business, action, detail, created) VALUES(?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, businessId, action, detail, nowIso);

  switch (body.action) {
    case "google_sync_test": {
      // Pushes the current stamps to every Google Wallet pass saved for the business and returns Google's answer.
      const config = walletConfig(env);
      if (!config) return json({ ok: true, ready: false, saved: 0, results: [] });
      // Passes Google has but our flag lost (an update before the customer tapped Save): mark them again.
      const unflagged = await db
        .prepare("SELECT id FROM customers WHERE business = ? AND google_wallet IS NULL AND archived IS NULL ORDER BY created DESC LIMIT 20")
        .bind(businessId)
        .all<{ id: string }>();
      for (const { id } of unflagged.results) {
        if (await objectSaved(config, id)) await db.prepare("UPDATE customers SET google_wallet = ? WHERE id = ?").bind(nowIso, id).run();
      }
      const rows = await db
        .prepare("SELECT id FROM customers WHERE business = ? AND google_wallet IS NOT NULL AND archived IS NULL ORDER BY created DESC LIMIT 10")
        .bind(businessId)
        .all<{ id: string }>();
      const origin = new URL(request.url).origin;
      const results = [];
      for (const { id } of rows.results) {
        const c = await customerForPass(db, id);
        if (!c) continue;
        const full = await passLook(db, { id: c.business, name: c.business_name, reward: c.reward, color: c.color }, origin, { stamps: c.stamps, target: c.target }).catch(() => undefined);
        const look = full ? (({ notice: _n, ...rest }) => rest)(full) : undefined;
        const detail: { status?: number; text?: string } = {};
        const result = await updateLoyaltyObject(config, { customerId: c.id, businessId: c.business, stamps: c.stamps, target: c.target, scanCode: c.scan_code, rewards: c.rewards, look: look as typeof full }, null, detail);
        results.push({ name: c.name, stamps: `${c.stamps}/${c.target}`, result, status: detail.status ?? 0, text: detail.text ?? "" });
      }
      return json({ ok: true, ready: true, saved: rows.results.length, results });
    }
    case "google_debug": {
      const config = walletConfig(env);
      if (!config) return json({ ok: true, ready: false });
      const rows = await db
        .prepare("SELECT id FROM customers WHERE business = ? AND archived IS NULL ORDER BY created DESC LIMIT 5")
        .bind(businessId)
        .all<{ id: string }>();
      return json({ ok: true, ready: true, ...(await debugObjects(config, businessId, rows.results.map((r) => r.id))) });
    }
    case "apple_push_test": {
      const rows = await db
        .prepare("SELECT r.push_token FROM apple_registrations r JOIN customers c ON c.id = r.serial WHERE c.business = ? LIMIT 20")
        .bind(businessId)
        .all<{ push_token: string }>();
      const results = applePushReady() ? await pushTokens(db, rows.results.map((r) => r.push_token)) : [];
      return json({ ok: true, ready: applePushReady(), devices: rows.results.length, results });
    }
    case "owner_designs": {
      // Lets this business's owner edit their own card design (Perkly designs by default).
      const on = body.on === true ? 1 : 0;
      await db.batch([
        db.prepare("UPDATE businesses SET owner_designs = ? WHERE id = ?").bind(on, businessId),
        log("owner_designs", on ? "on" : "off"),
      ]);
      return json({ ok: true, on: !!on });
    }
    case "kit_sent": {
      // Yearly plan: marks the included counter kit as shipped. Only for a business that is owed one.
      const r = await db.prepare("UPDATE businesses SET kit_sent = ? WHERE id = ? AND kit_due IS NOT NULL AND kit_sent IS NULL").bind(nowIso, businessId).run();
      if (r.meta.changes !== 1) return fail("no_kit", 400, "No kit is owed");
      await db.batch([log("kit_sent", null)]);
      return json({ ok: true });
    }
    case "suspend": {
      const reason = str(body.reason, 200);
      if (!reason) return fail("reason_required", 400, "A reason is required");
      await db.batch([
        // Keeps the original "suspended since" time if it is already suspended; the reason is updated.
        db.prepare("UPDATE businesses SET suspended = COALESCE(suspended, ?), suspend_reason = ? WHERE id = ?").bind(nowIso, reason, businessId),
        log("suspend", reason),
      ]);
      return json({ ok: true });
    }
    case "unsuspend": {
      await db.batch([
        db.prepare("UPDATE businesses SET suspended = NULL, suspend_reason = NULL WHERE id = ?").bind(businessId),
        log("unsuspend", null),
      ]);
      return json({ ok: true });
    }
    case "grant_comp": {
      // Free access without an end date (until the admin cancels it).
      if (body.forever === true) {
        await db.batch([
          db.prepare("UPDATE businesses SET comp_until = ? WHERE id = ?").bind(FOREVER, businessId),
          log("grant_comp", "no end date"),
        ]);
        return json({ ok: true, until: FOREVER });
      }
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_COMP_DAYS) return fail("bad_details", 400, "Days must be 1–366");
      // Extends from the current grant if it is still running, otherwise from now. One statement,
      // so two grants at the same time both count. The result keeps the toISOString format.
      const [updated] = await db.batch([
        db.prepare(
          `UPDATE businesses SET comp_until = strftime('%Y-%m-%dT%H:%M:%fZ', MAX(COALESCE(comp_until, ?1), ?1), '+' || ?2 || ' days')
           WHERE id = ?3 RETURNING comp_until`,
        ).bind(nowIso, days, businessId),
        log("grant_comp", `${days} days`),
      ]);
      const until = (updated.results?.[0] as { comp_until?: string } | undefined)?.comp_until ?? null;
      return json({ ok: true, until });
    }
    case "clear_comp": {
      await db.batch([
        db.prepare("UPDATE businesses SET comp_until = NULL WHERE id = ?").bind(businessId),
        log("clear_comp", null),
      ]);
      return json({ ok: true });
    }
    case "update_business": {
      const name = str(body.name, 80);
      const reward = str(body.reward, 160);
      const target = Number(body.target);
      if (!name || !reward || !Number.isInteger(target) || target < 2 || target > 30) return fail("bad_details", 400, "Invalid details");
      // Same rule as the owner's settings: a new target applies to new cards and to existing cards from their next round.
      await db.batch([
        db.prepare("UPDATE businesses SET name = ?, reward = ?, target = ? WHERE id = ?").bind(name, reward, target, businessId),
        log("update_business", `name="${name}", target=${target}`),
      ]);
      return json({ ok: true });
    }
    case "transfer_owner": {
      const email = normalizeEmail(body.email);
      if (!email) return fail("bad_details", 400, "Invalid email");
      const next = await db.prepare("SELECT id, email, blocked FROM users WHERE email = ?").bind(email).first<{ id: string; email: string; blocked: string | null }>();
      if (!next) return fail("user_not_found", 404, "No account with this email. They must sign up first.");
      if (next.blocked) return fail("user_blocked", 409, "This user is blocked");
      if (next.id === business.owner) return fail("already_owner", 409, "Already the owner");
      await db.batch([
        // The previous owner stays on the team as staff; the new owner can remove them.
        db.prepare("UPDATE memberships SET role = 'staff' WHERE business = ? AND role = 'owner' AND user != ?").bind(businessId, next.id),
        db.prepare("INSERT OR IGNORE INTO memberships(id, business, user, role, created) VALUES(?, ?, ?, 'owner', ?)")
          .bind(crypto.randomUUID(), businessId, next.id, nowIso),
        db.prepare("UPDATE memberships SET role = 'owner', revoked = NULL, branch = NULL WHERE business = ? AND user = ?").bind(businessId, next.id),
        db.prepare("UPDATE businesses SET owner = ? WHERE id = ?").bind(next.id, businessId),
        log("transfer_owner", `to ${next.email}`),
      ]);
      return json({ ok: true });
    }
    case "archive": {
      const reason = str(body.reason, 200);
      if (!reason) return fail("reason_required", 400, "A reason is required");
      // Closing a business also stops its subscription from renewing (it ends with the paid period),
      // so the owner is not charged again for a business that is closed.
      const sub = await db
        .prepare("SELECT external_subscription, status FROM subscriptions WHERE business = ?")
        .bind(businessId)
        .first<{ external_subscription: string | null; status: string }>();
      const live = !!sub?.external_subscription && ["active", "trialing", "past_due"].includes(sub.status);
      const stopped = live ? await cancelAtPeriodEnd(env, sub!.external_subscription!) : null;
      await db.batch([
        db.prepare("UPDATE businesses SET archived = COALESCE(archived, ?) WHERE id = ?").bind(nowIso, businessId),
        log("archive", `${reason}${live ? (stopped ? " · subscription set to end" : " · SUBSCRIPTION NOT STOPPED") : ""}`),
      ]);
      // billing: "stopped" | "not_stopped" | "none"; the admin page warns when the subscription could not be stopped.
      return json({ ok: true, billing: live ? (stopped ? "stopped" : "not_stopped") : "none" });
    }
    case "reset_data": {
      // Starts a business over without customers: deletes for good every customer, stamp, reward, wallet registration and
      // special-day message of the business. The design, logo, team, subscription and join link stay.
      // Platform admins only (owners cannot: removed customers count toward the free limit, and this would reset it).
      // Two confirmations: the business name, and the admin's own password (5 tries an hour).
      if (str(body.confirm, 80) !== business.name) return fail("confirm_mismatch", 400, "Type the business name to confirm");
      if (!(await allow(db, `reset-data:${user.id}`, 5, 3600))) return fail("rate_limited", 429, "Too many attempts");
      const me = await db.prepare("SELECT pass_hash FROM users WHERE id = ?").bind(user.id).first<{ pass_hash: string }>();
      const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
      if (!me || !(await verifyPassword(password, me.pass_hash))) return fail("bad_login", 401, "Wrong password");
      const before = await db
        .prepare("SELECT (SELECT COUNT(*) FROM customers WHERE business = ?1) AS customers, (SELECT COUNT(*) FROM events WHERE business = ?1) AS events")
        .bind(businessId)
        .first<{ customers: number; events: number }>();
      // One batch (a transaction), children before customers because of the foreign keys.
      await db.batch([
        db.prepare("DELETE FROM apple_registrations WHERE serial IN (SELECT id FROM customers WHERE business = ?)").bind(businessId),
        db.prepare("DELETE FROM wallet_outbox WHERE business = ?").bind(businessId),
        db.prepare("DELETE FROM rewards WHERE business = ?").bind(businessId),
        db.prepare("DELETE FROM events WHERE business = ?").bind(businessId),
        db.prepare("DELETE FROM special_days WHERE business = ?").bind(businessId),
        db.prepare("DELETE FROM customers WHERE business = ?").bind(businessId),
        log("reset_data", `${before?.customers ?? 0} customers, ${before?.events ?? 0} stamp/reward events deleted`),
      ]);
      return json({ ok: true, deleted: before });
    }
    case "restore": {
      await db.batch([
        db.prepare("UPDATE businesses SET archived = NULL WHERE id = ?").bind(businessId),
        log("restore", null),
      ]);
      return json({ ok: true });
    }
    default:
      return fail("bad_request", 400, "Unknown action");
  }
}
