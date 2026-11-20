import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { getMembership, getUser } from "../../../../lib/server/auth";
import { fail, json, readJson, sameOrigin, str } from "../../../../lib/server/http";
import { createSetupCheckoutUrl, liveCheckoutAllowed, setupCheckoutConfigured } from "../../../../lib/server/polar";
import { asCurrency } from "../../../../lib/pricing";

export const dynamic = "force-dynamic";

// Owner only: a Polar checkout for the one-time setup fee (businesses Perkly set up and designed).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const body = await readJson(request);
  const business = str(body?.business, 64);
  if (!business) return fail("bad_request", 400);
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("unauthorized", 401);
  const membership = await getMembership(db, user.id, business);
  if (!membership || membership.role !== "owner") return fail("forbidden", 403, "Owner permission required");
  const row = await db.prepare("SELECT currency, setup_fee, setup_paid FROM businesses WHERE id = ?").bind(business).first<{ currency: string; setup_fee: number | null; setup_paid: string | null }>();
  if (!row?.setup_fee || row.setup_paid) return fail("no_setup_fee", 400, "No setup fee is owed");
  if (!setupCheckoutConfigured(env, asCurrency(row.currency))) return fail("billing_off", 503, "Online payment of the setup fee is not set up yet");
  if (!liveCheckoutAllowed(env, new URL(request.url).host)) return fail("billing_test_site", 409, "Payments are taken only on perkly.shop");
  try {
    return json({ url: await createSetupCheckoutUrl(env, business, new URL(request.url).origin, user.email) });
  } catch {
    return fail("checkout_failed", 502, "Could not open the payment page");
  }
}
