// Subscription status rules. The payment provider is not connected yet; only the server writes
// the subscriptions table, from the provider's callbacks.

/** Whether a business may keep using paid features. Trialing and active count; everything else does not. */
export function isEntitled(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/** Prices are in US dollars. */
export const MONTHLY_PRICE_USD = 29;
/** Yearly plan: one payment a year, and the counter kit is included (shipped after the first payment). */
export const YEARLY_PRICE_USD = 290;
export const PRICE_CURRENCY = "USD";

export type Plan = "monthly" | "yearly";

/** Which plan a stored Polar product id is. Unknown or missing ids count as monthly. */
export function planOf(productId: string | null | undefined, env: { POLAR_PRODUCT_ID_YEARLY?: string }): Plan {
  return !!productId && !!env.POLAR_PRODUCT_ID_YEARLY && productId === env.POLAR_PRODUCT_ID_YEARLY ? "yearly" : "monthly";
}

/** What one active subscription brings in per month, for the admin estimate. */
export function monthlyValue(plan: Plan): number {
  return plan === "yearly" ? YEARLY_PRICE_USD / 12 : MONTHLY_PRICE_USD;
}
/** Free trial at checkout: the card is taken up front and first charged when the trial ends. */
export const TRIAL_DAYS = 14;

/** Customers a business may have before it subscribes (QR and stamps work up to this number). */
export const FREE_CUSTOMERS = 10;

/** `free` is set while the business has no subscription and is within the free customer limit. */
export type Access =
  | { ok: true; free?: { limit: number; used: number } }
  | { ok: false; code: "business_suspended" | "subscription_required" };

/**
 * Whether a business may stamp and accept new customers right now.
 * Order: admin suspension blocks; admin free access allows; an active or trialing subscription allows;
 * businesses from before billing (no subscription row) are allowed. Everyone else may use the card
 * free for up to FREE_CUSTOMERS customers; beyond that a subscription is needed.
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
  if (row.status === null || isEntitled(row.status)) return { ok: true };
  const count = await db
    // Every customer ever added counts, so removing customers does not free up places. The exception:
    // someone who joined by the public QR and never got a stamp (otherwise strangers could fill the places).
    .prepare(
      `SELECT COUNT(*) AS n FROM customers c WHERE c.business = ?
         AND NOT (c.source = 'self' AND c.stamps = 0 AND NOT EXISTS (SELECT 1 FROM events e WHERE e.customer = c.id))`,
    )
    .bind(businessId)
    .first<{ n: number }>();
  const used = count?.n ?? 0;
  if (used > FREE_CUSTOMERS) return { ok: false, code: "subscription_required" };
  return { ok: true, free: { limit: FREE_CUSTOMERS, used } };
}

/** True when a new customer would go over the free limit. */
export function freeLimitReached(access: Access): boolean {
  return access.ok && !!access.free && access.free.used >= access.free.limit;
}

/**
 * Design extras for paying businesses: own logo, background image and stamp image.
 * Free-tier businesses (no subscription yet) use the ready designs, colors and stamp icons.
 * Admin free access and businesses from before billing count as paid.
 */
export function hasPaidDesign(access: Access): boolean {
  return access.ok && !access.free;
}
