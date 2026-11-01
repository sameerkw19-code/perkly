import { env, waitUntil } from "cloudflare:workers";
import { mailReady, sendMail, simpleMail } from "../../../../lib/server/mailer";
import { getD1 } from "../../../../db";
import { subscriptionRow, verifyWebhook } from "../../../../lib/server/polar";
import { planOf } from "../../../../lib/server/billing";
import { WHATSAPP_INTL } from "../../../landing/content";

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
      // Yearly plan: the counter kit is owed once the first yearly payment went through (active, not trialing).
      // Set once per business, so renewals and repeated events never owe a second kit.
      if (before && row.status === "active" && planOf(row.plan, env) === "yearly") {
        const owed = await getD1()
          .prepare(
            `UPDATE businesses SET kit_due = ? WHERE id = ? AND kit_due IS NULL
               AND EXISTS (SELECT 1 FROM subscriptions WHERE business = ? AND external_subscription = ? AND status = 'active')`,
          )
          .bind(new Date().toISOString(), row.business, row.business, row.externalSubscription)
          .run();
        if (owed.meta.changes === 1) waitUntil(tellAboutKit(row.business, before.name, new URL(request.url).origin));
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

/** A yearly subscriber is owed a counter kit: the owners are asked for a delivery address, the admins are told to ship it. */
async function tellAboutKit(business: string, name: string, origin: string) {
  if (!mailReady(env)) return;
  const db = getD1();
  const owners = await db
    .prepare("SELECT u.email FROM memberships m JOIN users u ON u.id = m.user WHERE m.business = ? AND m.role = 'owner' AND m.revoked IS NULL")
    .bind(business)
    .all<{ email: string }>();
  const admins = (env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const wa = `https://wa.me/${WHATSAPP_INTL}?text=${encodeURIComponent(`היי, זו כתובת המשלוח לערכת הקופה של ${name}:`)}`;
  const ownerMails = (owners.results ?? []).map((o) =>
    simpleMail(
      o.email,
      `ערכת הקופה של ${name} בדרך`,
      [`תודה שבחרתם במנוי השנתי של Perkly.`, `ערכת הקופה (2 פוסטרים וסטנד QR) כלולה במנוי. שלחו לנו בוואטסאפ כתובת למשלוח, ונשלח אותה.`],
      [`Thanks for choosing the yearly Perkly plan. The counter kit (2 posters and a QR stand) is included. Send us a delivery address on WhatsApp and we'll ship it.`],
      { text: "שליחת כתובת בוואטסאפ", href: wa },
    ),
  );
  const adminMails = admins.map((email) =>
    simpleMail(email, `ערכת קופה למשלוח: ${name}`, [`${name} שילם על מנוי שנתי, ומגיעה לו ערכת קופה.`, `הבעלים התבקש לשלוח כתובת בוואטסאפ. אחרי המשלוח מסמנים "נשלחה" בדף העסק.`], [`${name} paid for a yearly plan and is owed a counter kit.`], { text: "לדף העסק", href: `${origin}/admin/b/${business}` }),
  );
  await Promise.all([...ownerMails, ...adminMails].map((m) => sendMail(env, m)));
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
