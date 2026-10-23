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
    await getD1()
      .prepare(
        `INSERT INTO subscriptions(business, status, plan, external_customer, external_subscription, current_period_end, updated)
         VALUES(?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(business) DO UPDATE SET status = excluded.status, plan = excluded.plan,
           external_customer = excluded.external_customer, external_subscription = excluded.external_subscription,
           current_period_end = excluded.current_period_end, updated = excluded.updated`,
      )
      .bind(row.business, row.status, row.plan, row.externalCustomer, row.externalSubscription, row.currentPeriodEnd, new Date().toISOString())
      .run();
  }
  return new Response("", { status: 202 });
}
