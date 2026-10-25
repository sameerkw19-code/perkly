import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { getMembership, getUser } from "../../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../../lib/server/http";
import { createCheckoutUrl, polarConfigured } from "../../../../lib/server/polar";

export const dynamic = "force-dynamic";

// Owner only: starts a Polar checkout for one business and returns its URL.
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
  try {
    const url = await createCheckoutUrl(env, business, new URL(request.url).origin, user.email);
    return json({ url });
  } catch {
    return fail("checkout_failed", 502, "Could not open the payment page");
  }
}
