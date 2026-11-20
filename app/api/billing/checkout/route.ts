import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { getMembership, getUser } from "../../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../../lib/server/http";
import { createCheckoutUrl, liveCheckoutAllowed, polarConfigured, trialDaysFor, yearlyConfigured } from "../../../../lib/server/polar";
import { TRIAL_DAYS } from "../../../../lib/server/billing";
import { asCurrency } from "../../../../lib/pricing";

export const dynamic = "force-dynamic";

// Owner only: starts a Polar checkout for one business and returns its URL.
// `plan`: "monthly" (default) or "yearly" (999 ILS a year, counter kit included).
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
  // A test site (staging) with real Polar keys would take real payments for businesses perkly.shop never sees.
  if (!liveCheckoutAllowed(env, new URL(request.url).host)) return fail("billing_test_site", 409, "Payments are taken only on perkly.shop");
  const plan = body.plan === "yearly" ? "yearly" : "monthly";
  const row = await db.prepare("SELECT currency, comp_until FROM businesses WHERE id = ?").bind(business).first<{ currency: string; comp_until: string | null }>();
  const currency = asCurrency(row?.currency);
  if (plan === "yearly" && !yearlyConfigured(env, currency)) return fail("plan_unavailable", 400, "The yearly plan is not available yet");
  try {
    // The standard trial only for a business that never had a subscription (not one that lapsed or was canceled);
    // a business with free access is first charged when that ends.
    const sub = await db.prepare("SELECT status, external_subscription FROM subscriptions WHERE business = ?").bind(business).first<{ status: string; external_subscription: string | null }>();
    const firstTime = !sub?.external_subscription;
    const trial = trialDaysFor(firstTime, row?.comp_until ?? null, TRIAL_DAYS);
    const url = await createCheckoutUrl(env, business, new URL(request.url).origin, user.email, body.from === "start" ? "start" : "billing", trial, plan, currency);
    return json({ url });
  } catch {
    return fail("checkout_failed", 502, "Could not open the payment page");
  }
}
