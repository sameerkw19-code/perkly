import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getUser, isPlatformAdmin } from "../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";

export const dynamic = "force-dynamic";

const MAX_COMP_DAYS = 366;

// Platform admin actions on one business. Every change is written to admin_log in the same batch.
// Actions: suspend (with reason), unsuspend, grant_comp (free access for N days), clear_comp.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const body = await readJson(request);
  if (!body) return fail("bad_request", 400);
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("unauthorized", 401);
  // Same answer as a missing route, so the endpoint does not reveal itself.
  if (!isPlatformAdmin(user, env.PLATFORM_ADMIN_EMAILS)) return fail("not_found", 404);

  const businessId = str(body.business, 64);
  if (!businessId) return fail("bad_request", 400);
  const business = await db.prepare("SELECT id, comp_until FROM businesses WHERE id = ?").bind(businessId).first<{ id: string; comp_until: string | null }>();
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
        db.prepare("UPDATE businesses SET suspended = ?, suspend_reason = ? WHERE id = ?").bind(nowIso, reason, businessId),
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
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_COMP_DAYS) return fail("bad_details", 400, "Days must be 1–366");
      // Extends from the current grant if it is still running, otherwise from now.
      const from = business.comp_until && business.comp_until > nowIso ? new Date(business.comp_until) : now;
      const until = new Date(from.getTime() + days * 86_400_000).toISOString();
      await db.batch([
        db.prepare("UPDATE businesses SET comp_until = ? WHERE id = ?").bind(until, businessId),
        log("grant_comp", `${days} days, until ${until}`),
      ]);
      return json({ ok: true, until });
    }
    case "clear_comp": {
      await db.batch([
        db.prepare("UPDATE businesses SET comp_until = NULL WHERE id = ?").bind(businessId),
        log("clear_comp", null),
      ]);
      return json({ ok: true });
    }
    default:
      return fail("bad_request", 400, "Unknown action");
  }
}
