import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { subscriptionRow, verifyWebhook } from "../../../../lib/server/polar";

export const dynamic = "force-dynamic";

// Polar calls this with subscription events. Only a valid signature is accepted.
export async function POST(request: Request) {
  if (!env.POLAR_WEBHOOK_SECRET) return new Response("not configured", { status: 503 });
  const raw = await request.text();
  const valid = await verifyWebhook(
    env.POLAR_WEBHOOK_SECRET,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    raw,
  );
  if (!valid) return new Response("bad signature", { status: 403 });
  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const row = subscriptionRow(event);
  if (row) {
    const sent = Number(request.headers.get("webhook-timestamp"));
    const changedAt = row.changedAt ?? new Date(sent * 1000).toISOString();
    try {
      // Same subscription: only a newer change applies. Another subscription (the owner subscribed
      // again) takes over only when it is live, or when the stored one is no longer live; so a late
      // "canceled" for an old subscription never ends a new paid one.
      await getD1()
        .prepare(
          `INSERT INTO subscriptions(business, status, plan, external_customer, external_subscription, current_period_end, updated, changed_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(business) DO UPDATE SET status = excluded.status, plan = excluded.plan,
             external_customer = excluded.external_customer, external_subscription = excluded.external_subscription,
             current_period_end = excluded.current_period_end, updated = excluded.updated, changed_at = excluded.changed_at
           WHERE (subscriptions.external_subscription IS excluded.external_subscription
                  AND (subscriptions.changed_at IS NULL OR excluded.changed_at >= subscriptions.changed_at))
              OR (subscriptions.external_subscription IS NOT excluded.external_subscription
                  AND (excluded.status IN ('active', 'trialing') OR subscriptions.status NOT IN ('active', 'trialing')))`,
        )
        .bind(row.business, row.status, row.plan, row.externalCustomer, row.externalSubscription, row.currentPeriodEnd, new Date().toISOString(), changedAt)
        .run();
    } catch (error) {
      // An unknown business (or a subscription already tied to another one) can never succeed,
      // so it is acknowledged instead of being retried forever.
      if (/constraint/i.test(String(error))) {
        console.warn("polar webhook ignored", event.type);
        return new Response("", { status: 202 });
      }
      throw error;
    }
  }
  return new Response("", { status: 202 });
}
