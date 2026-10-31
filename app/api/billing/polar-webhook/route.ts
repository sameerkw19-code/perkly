import { env, waitUntil } from "cloudflare:workers";
import { mailReady, sendMail, simpleMail } from "../../../../lib/server/mailer";
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
    const before = await getD1()
      .prepare("SELECT s.status, b.name FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id WHERE b.id = ?")
      .bind(row.business)
      .first<{ status: string | null; name: string }>();
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
      const bad = ["past_due", "unpaid", "canceled", "revoked"];
      if (before && bad.includes(row.status) && before.status !== row.status) {
        const now = await getD1().prepare("SELECT status FROM subscriptions WHERE business = ?").bind(row.business).first<{ status: string }>();
        // Only when this event actually changed the stored status (an old or out-of-order event does not).
        if (now?.status === row.status) waitUntil(tellAboutPayment(row.business, before.name, row.status, new URL(request.url).origin));
      }
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

/** Payment trouble is told by email to the business's owners and to the platform admins, not only shown on a screen. */
async function tellAboutPayment(business: string, name: string, status: string, origin: string) {
  if (!mailReady(env)) return;
  const db = getD1();
  const owners = await db
    .prepare("SELECT u.email FROM memberships m JOIN users u ON u.id = m.user WHERE m.business = ? AND m.role = 'owner' AND m.revoked IS NULL")
    .bind(business)
    .all<{ email: string }>();
  const admins = (env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const failed = status === "past_due" || status === "unpaid";
  const he = failed
    ? [`התשלום על המנוי של ${name} ב-Perkly לא עבר.`, "כדי שהכרטיסים ימשיכו לעבוד בלי הפסקה, כדאי לעדכן את אמצעי התשלום."]
    : [`המנוי של ${name} ב-Perkly הסתיים.`, "אפשר לחדש אותו בכל רגע מדף המנוי."];
  const en = failed
    ? [`The payment for ${name}'s Perkly subscription did not go through. Update the payment method to keep the cards running.`]
    : [`${name}'s Perkly subscription has ended. You can renew it any time from the billing page.`];
  const subject = failed ? `התשלום ל-Perkly לא עבר (${name})` : `המנוי ל-Perkly הסתיים (${name})`;
  const to = new Set([...(owners.results ?? []).map((o) => o.email), ...admins]);
  await Promise.all([...to].map((email) => sendMail(env, simpleMail(email, subject, he, en, { text: "לדף המנוי", href: `${origin}/billing` }))));
}
