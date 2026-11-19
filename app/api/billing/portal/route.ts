import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { getMembership, getUser } from "../../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../../lib/server/http";
import { allow } from "../../../../lib/server/rate-limit";
import { customerPortalUrl, getSubscription, liveCheckoutAllowed, polarConfigured } from "../../../../lib/server/polar";

export const dynamic = "force-dynamic";

// Owner only: a sign-in link to Polar's customer portal for the business's subscription
// (change the card, invoices, cancel). Returns { url }.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const body = await readJson(request);
  if (!body) return fail("bad_request", 400);
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("unauthorized", 401);
  const business = str(body.business, 64);
  if (!business) return fail("bad_request", 400);
  const membership = await getMembership(db, user.id, business);
  if (!membership || membership.role !== "owner") return fail("forbidden", 403, "Owner permission required");
  if (!polarConfigured(env)) return fail("billing_off", 503, "Billing is not set up yet");
  if (!liveCheckoutAllowed(env, new URL(request.url).host)) return fail("billing_test_site", 409, "Payments are managed only on perkly.shop");
  if (!(await allow(db, `portal:${user.id}`, 20, 3600))) return fail("rate_limited", 429);
  const sub = await db
    .prepare("SELECT external_customer, external_subscription FROM subscriptions WHERE business = ?")
    .bind(business)
    .first<{ external_customer: string | null; external_subscription: string | null }>();
  if (!sub?.external_subscription) return fail("no_subscription", 404, "No subscription yet");
  try {
    // Older rows may lack the customer id: read it from the subscription.
    const customer = sub.external_customer ?? (await getSubscription(env, sub.external_subscription))?.externalCustomer ?? null;
    if (!customer) return fail("no_subscription", 404, "No subscription yet");
    const url = await customerPortalUrl(env, customer, `${new URL(request.url).origin}/billing`);
    return json({ url });
  } catch (e) {
    const reason = String((e as Error).message ?? e).slice(0, 80);
    console.warn("polar portal failed", reason);
    // The reason (e.g. polar_customer_session_403: the access token lacks customer_sessions:write) helps support.
    return fail("portal_failed", 502, `Could not open the subscription page (${reason})`);
  }
}
