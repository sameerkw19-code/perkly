import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getUser, isPlatformAdmin } from "../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { normalizeEmail } from "../../../lib/server/auth";

export const dynamic = "force-dynamic";

const MAX_COMP_DAYS = 366;
/** Free access "without an end date": a date far in the future, so every check stays a date comparison. */
const FOREVER = "9999-12-31T00:00:00.000Z";

// Platform admin actions on one business. Every change is written to admin_log in the same batch.
// Actions: suspend (with reason), unsuspend, grant_comp (free access for N days, or forever: true), clear_comp,
// update_business (name, reward, target), transfer_owner (to an existing user by email), archive, restore.
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
      await db.batch([
        db.prepare("UPDATE businesses SET archived = COALESCE(archived, ?) WHERE id = ?").bind(nowIso, businessId),
        log("archive", reason),
      ]);
      return json({ ok: true });
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
