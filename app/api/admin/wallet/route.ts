import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { getUser, isPlatformAdmin } from "../../../../lib/server/auth";
import { fail, json, readJson, sameOrigin } from "../../../../lib/server/http";
import { getClassStatus, submitClassForReview, walletConfig } from "../../../../lib/server/google-wallet";

export const dynamic = "force-dynamic";

async function admin(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  return user && isPlatformAdmin(user, env) ? { db, user } : null;
}

// GET: the Google Wallet class status. POST {action:"submit_review"}: ask Google to review the class.
export async function GET(request: Request) {
  if (!(await admin(request))) return fail("not_found", 404);
  const config = walletConfig(env);
  if (!config) return json({ configured: false });
  try {
    return json({ configured: true, ...(await getClassStatus(config)) });
  } catch (e) {
    return json({ configured: true, status: "error", error: (e as Error).message }, 502);
  }
}

export async function POST(request: Request) {
  const a = await admin(request);
  if (!a) return fail("not_found", 404);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const body = await readJson(request);
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
