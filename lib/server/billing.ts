// Subscription status rules. The payment provider is not connected yet; only the server writes
// the subscriptions table, from the provider's callbacks.

/** Whether a business may keep using paid features. Trialing and active count; everything else does not. */
export function isEntitled(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export const MONTHLY_PRICE_ILS = 99;
/** Free trial at checkout: the card is taken up front and first charged when the trial ends. */
export const TRIAL_DAYS = 3;

export type Access = { ok: true } | { ok: false; code: "business_suspended" | "subscription_required" };

/**
 * Whether a business may stamp and accept new customers right now.
 * Order: admin suspension blocks; admin free access allows; otherwise the subscription decides.
 * A business with no subscription row is still allowed (pilot businesses from before billing).
 */
export async function businessAccess(db: D1Database, businessId: string, now = new Date().toISOString()): Promise<Access> {
  const row = await db
    .prepare(
      `SELECT b.suspended, b.comp_until, s.status FROM businesses b
       LEFT JOIN subscriptions s ON s.business = b.id WHERE b.id = ?`,
    )
    .bind(businessId)
    .first<{ suspended: string | null; comp_until: string | null; status: string | null }>();
  if (!row) return { ok: false, code: "subscription_required" };
  if (row.suspended) return { ok: false, code: "business_suspended" };
  if (row.comp_until && row.comp_until > now) return { ok: true };
  if (row.status !== null && !isEntitled(row.status)) return { ok: false, code: "subscription_required" };
  return { ok: true };
}
