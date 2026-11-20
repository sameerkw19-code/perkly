import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { getUser, isPlatformAdmin } from "../../../../lib/server/auth";
import { fail, json, readJson, sameOrigin } from "../../../../lib/server/http";
import { getClassStatus, listClassIds, submitClassForReview, walletConfig } from "../../../../lib/server/google-wallet";
import { appleHealth } from "../../../../lib/server/apple-check";
import { applePushReady, pushAppleBusiness } from "../../../../lib/server/apple-push";
import { ensureBusinessClass } from "../../../../lib/server/google-wallet";
import { passLook } from "../../../../lib/server/designs";

export const dynamic = "force-dynamic";

async function admin(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  return user && isPlatformAdmin(user, env) ? { db, user } : null;
}

// GET: the Google Wallet class status and the Apple Wallet health check. POST {action:"submit_review"}: ask Google to review the class.
export async function GET(request: Request) {
  if (!(await admin(request))) return fail("not_found", 404);
  const health = await appleHealth(env);
  const apple = { ...health, pushReady: applePushReady() };
  const config = walletConfig(env);
  if (!config) return json({ configured: false, apple });
  try {
    const status = await getClassStatus(config);
    // When our class id is not found, list what Google has, to spot an id mismatch.
    const classes = status.status === "missing" ? await listClassIds(config).catch((e) => [`(${(e as Error).message})`]) : undefined;
    return json({ configured: true, ...status, classes, apple });
  } catch (e) {
    return json({ configured: true, status: "error", error: (e as Error).message, apple });
  }
}

export async function POST(request: Request) {
  const a = await admin(request);
  if (!a) return fail("not_found", 404);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const body = await readJson(request);
  if (body?.action === "refresh_all") return refreshAll(a.db, a.user.email, new URL(request.url).origin);
  if (body?.action !== "submit_review") return fail("bad_request", 400);
  const config = walletConfig(env);
  if (!config) return fail("wallet_off", 503, "Google Wallet is not configured");
  try {
    const before = await getClassStatus(config);
    if (before.status !== "draft" && before.status !== "rejected") return fail("wrong_state", 409, `Class is ${before.status}`);
    const after = await submitClassForReview(config);
    await a.db
      .prepare("INSERT INTO admin_log(id, admin, business, action, detail, created) VALUES(?, ?, NULL, 'wallet_submit_review', ?, ?)")
      .bind(crypto.randomUUID(), a.user.email, `${before.status} -> ${after.status}`, new Date().toISOString())
      .run();
    return json({ ok: true, ...after });
  } catch (e) {
    return json({ error: (e as Error).message, code: "google_error" }, 502);
  }
}

/**
 * Every open business's cards get the current name, logo, notification icon and design at once: Google Wallet
 * classes are updated now, every saved Google pass is queued for a refresh (the background job sends them a
 * batch at a time) and every iPhone is pushed to fetch its pass again.
 */
async function refreshAll(db: D1Database, adminEmail: string, origin: string) {
  const businesses = (await db
    .prepare("SELECT id, name, reward, color FROM businesses WHERE archived IS NULL")
    .all<{ id: string; name: string; reward: string; color: string }>()).results;
  const config = walletConfig(env);
  const now = new Date().toISOString();
  let classes = 0;
  let cards = 0;
  for (const b of businesses) {
    if (config) {
      const look = await passLook(db, b, origin).catch(() => null);
      if (look?.classLook && (await ensureBusinessClass(config, b.id, look.classLook))) classes++;
      const queued = await db
        .prepare(
          `INSERT INTO wallet_outbox(id, business, customer, kind, not_before, created, origin)
           SELECT 'sync:' || id, business, id, 'sync', ?1, ?1, ?2 FROM customers WHERE business = ?3 AND google_wallet IS NOT NULL AND archived IS NULL
           ON CONFLICT(id) DO UPDATE SET done = NULL, result = NULL, attempts = 0, not_before = excluded.not_before, origin = excluded.origin`,
        )
        .bind(now, origin, b.id)
        .run();
      cards += queued.meta.changes ?? 0;
    }
    pushAppleBusiness(db, b.id);
  }
  const iphones = await db
    .prepare("SELECT COUNT(*) AS n FROM apple_registrations r JOIN customers c ON c.id = r.serial JOIN businesses b ON b.id = c.business WHERE c.archived IS NULL AND b.archived IS NULL")
    .first<{ n: number }>();
  await db
    .prepare("INSERT INTO admin_log(id, admin, business, action, detail, created) VALUES(?, ?, NULL, 'wallet_refresh_all', ?, ?)")
    .bind(crypto.randomUUID(), adminEmail, `${businesses.length} businesses, ${classes} classes, ${cards} google cards, ${iphones?.n ?? 0} iphones`, now)
    .run();
  return json({ ok: true, businesses: businesses.length, classes, google: cards, apple: iphones?.n ?? 0 });
}
