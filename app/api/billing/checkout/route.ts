import { getD1 } from "../../../../db";
import { getMembership, getUser } from "../../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../../lib/server/http";
import { billingConfigured, createCheckoutUrl } from "../../../../lib/server/billing";

export const dynamic = "force-dynamic";

// Owner starts a subscription: returns a Stripe Checkout URL to open.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  };
  if (!billingConfigured(env)) return fail("billing_off", 503, "Billing is not set up yet");

  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("unauthorized", 401, "Sign in first");
  const body = await readJson(request);
  const businessId = str(body?.business, 80);
  if (!businessId) return fail("bad_request", 400);
  const membership = await getMembership(db, user.id, businessId);
  if (!membership || membership.role !== "owner") return fail("forbidden", 403, "Owner permission required");

  const url = await createCheckoutUrl(env, businessId, new URL(request.url).origin, user.email);
  return json({ url });
}
