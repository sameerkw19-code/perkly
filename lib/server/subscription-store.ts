import type { SubscriptionRow } from "./polar";

/**
 * Stores a Polar subscription for a business. The same subscription changes only with a newer change; another
 * subscription (the owner subscribed again) takes over only when it is live, or when the stored one is not live,
 * so a late "canceled" for an old subscription never ends a new paid one. Used by the webhook and by syncs.
 */
export function storeSubscription(db: D1Database, row: SubscriptionRow, changedAt: string | null) {
  return db
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
    .bind(row.business, row.status, row.plan, row.externalCustomer, row.externalSubscription, row.currentPeriodEnd, new Date().toISOString(), changedAt);
}
