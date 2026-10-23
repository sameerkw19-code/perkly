import { getD1 } from "../../../../db";
import { fail, json } from "../../../../lib/server/http";
import { subscriptionFromEvent, verifyStripeSignature } from "../../../../lib/server/billing";

export const dynamic = "force-dynamic";

// Stripe calls this. Only a correctly signed request can change a subscription.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return fail("billing_off", 503, "Billing is not set up yet");
  const raw = await request.text();
  if (raw.length > 500_000) return fail("too_large", 413);
  if (!(await verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret))) {
    return fail("bad_signature", 400, "Bad signature");
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return fail("bad_request", 400);
  }
  const update = subscriptionFromEvent(event);
  if (!update) return json({ ignored: true });

  const db = getD1();
  const business = await db.prepare("SELECT id FROM businesses WHERE id = ?").bind(update.business).first();
  if (!business) return json({ ignored: true });
  await db
    .prepare(
      `INSERT INTO subscriptions(business, status, plan, stripe_customer, stripe_subscription, current_period_end, updated)
       VALUES(?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(business) DO UPDATE SET status = excluded.status, plan = excluded.plan,
         stripe_customer = excluded.stripe_customer, stripe_subscription = excluded.stripe_subscription,
         current_period_end = excluded.current_period_end, updated = excluded.updated`,
    )
    .bind(
      update.business,
      update.status,
      update.plan,
      update.stripeCustomer,
      update.stripeSubscription,
      update.currentPeriodEnd,
      new Date().toISOString(),
    )
    .run();
  return json({ ok: true });
}
