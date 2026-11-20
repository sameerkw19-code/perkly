// How many customers a message to customers brought in.

/** How long after a message a visit counts as one it brought. */
export const RESULT_DAYS = 7;

/**
 * The message's result: how many customers who had the card in a wallet (Google: sent through this message;
 * Apple: a registered iPhone) visited the business (a stamp, reward, purchase or use of balance) within
 * RESULT_DAYS after it went out.
 */
export async function visitedAfter(db: D1Database, business: string, s: { id: string; queued: string | null }): Promise<number> {
  if (!s.queued) return 0;
  const until = new Date(Date.parse(s.queued) + RESULT_DAYS * 86_400_000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM customers c
       WHERE c.business = ?1
         AND (EXISTS (SELECT 1 FROM wallet_outbox o WHERE o.campaign = ?2 AND o.customer = c.id)
              OR EXISTS (SELECT 1 FROM apple_registrations r WHERE r.serial = c.id))
         AND EXISTS (SELECT 1 FROM events e WHERE e.customer = c.id AND e.created > ?3 AND e.created <= ?4
                     AND e.kind IN ('stamp', 'redeem', 'earn', 'spend'))`,
    )
    .bind(business, s.id, s.queued, until)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
