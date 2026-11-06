// Apple Wallet updates: tells each iPhone that saved a pass to fetch it again (APNs push with an empty
// body). The iPhone then calls the web service (app/api/wallet/apple-ws), which serves the new pass.
// The connection to Apple is authenticated with the Pass Type ID certificate, through the APPLE_APNS
// mTLS binding (wrangler.jsonc). Without that binding nothing is sent and passes refresh only when the
// customer pulls down on the pass.
import { env, waitUntil } from "cloudflare:workers";
import { appleConfig } from "./apple-token";

const APNS = "https://api.push.apple.com/3/device/";

export type PushResult = { token: string; status: number; reason?: string };

type ApnsBinding = { fetch: typeof fetch };

function binding(): ApnsBinding | null {
  const b = (env as unknown as { APPLE_APNS?: ApnsBinding }).APPLE_APNS;
  return b && typeof b.fetch === "function" ? b : null;
}

/** Whether pushes can be sent (signing key and the mTLS binding are both set). */
export function applePushReady(): boolean {
  return !!appleConfig(env) && !!binding();
}

/** Sends one update push per device token. Tokens Apple says are gone (410) are removed. */
export async function pushTokens(db: D1Database, tokens: string[]): Promise<PushResult[]> {
  const config = appleConfig(env);
  const apns = binding();
  if (!config || !apns || !tokens.length) return [];
  const results: PushResult[] = [];
  for (const token of [...new Set(tokens)].slice(0, 500)) {
    try {
      const r = await apns.fetch(APNS + token, {
        method: "POST",
        headers: { "apns-topic": config.passTypeId, "apns-push-type": "background", "apns-priority": "5", "content-type": "application/json" },
        body: "{}",
      });
      const text = r.status === 200 ? "" : await r.text().catch(() => "");
      const reason = text ? (JSON.parse(text || "{}") as { reason?: string }).reason ?? text.slice(0, 120) : undefined;
      results.push({ token: token.slice(0, 8), status: r.status, reason });
      if (r.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") {
        await db.prepare("DELETE FROM apple_registrations WHERE push_token = ?").bind(token).run();
      }
    } catch (e) {
      results.push({ token: token.slice(0, 8), status: 0, reason: String(e).slice(0, 120) });
    }
  }
  const failed = results.filter((r) => r.status !== 200);
  console.log(`apple wallet push: ${results.length - failed.length} ok, ${failed.length} failed${failed.length ? ` (${failed[0].status} ${failed[0].reason ?? ""})` : ""}`);
  return results;
}

/** Tokens of every device that saved this customer's pass. */
async function customerTokens(db: D1Database, customer: string): Promise<string[]> {
  const rows = await db.prepare("SELECT push_token FROM apple_registrations WHERE serial = ?").bind(customer).all<{ push_token: string }>();
  return rows.results.map((r) => r.push_token);
}

/** After a stamp, redemption or adjustment: refresh the customer's Apple Wallet pass in the background. */
export function pushAppleCustomer(db: D1Database, customer: string): void {
  if (!applePushReady()) return;
  waitUntil(customerTokens(db, customer).then((t) => pushTokens(db, t)).catch((e) => console.log("apple wallet push error", String(e))));
}

/** After a new card design is published: refresh every Apple Wallet pass of the business. */
export function pushAppleBusiness(db: D1Database, business: string): void {
  if (!applePushReady()) return;
  waitUntil(
    db
      .prepare("SELECT r.push_token FROM apple_registrations r JOIN customers c ON c.id = r.serial WHERE c.business = ? AND c.archived IS NULL")
      .bind(business)
      .all<{ push_token: string }>()
      .then((rows) => pushTokens(db, rows.results.map((r) => r.push_token)))
      .catch((e) => console.log("apple wallet push error", String(e))),
  );
}
