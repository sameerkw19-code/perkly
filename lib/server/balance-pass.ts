import { averageReward, formatMoney, type CashbackCurrency } from "../cashback.ts";

/** The balance card on a wallet pass: the balance as text, or undefined for a stamp card. */
export function passBalance(b: { program?: string | null; currency?: string | null }, balance: number | null | undefined): string | undefined {
  if (b.program !== "cashback") return undefined;
  const currency: CashbackCurrency = b.currency === "USD" ? "USD" : "ILS";
  return formatMoney(balance ?? 0, currency, currency === "USD" ? "en" : "he");
}

/** The average card on a wallet pass: what the free purchase is worth (a reward ready, or the average so far). */
export type PassAverage = { worth?: string; ready: boolean };

export function passAverage(
  b: { program?: string | null; currency?: string | null; avg_cap?: number | null },
  c: { stamps: number; round_total?: number | null },
  /** The value of the oldest reward waiting to be used (minor units), if any. */
  readyValue: number | null | undefined,
): PassAverage | undefined {
  if (b.program !== "average") return undefined;
  const currency: CashbackCurrency = b.currency === "USD" ? "USD" : "ILS";
  const lang = currency === "USD" ? "en" : "he";
  if (readyValue != null) return { worth: formatMoney(readyValue, currency, lang), ready: true };
  if (c.stamps <= 0) return { ready: false };
  return { worth: formatMoney(averageReward(c.round_total ?? 0, c.stamps, b.avg_cap ?? 0), currency, lang), ready: false };
}

/**
 * What a wallet pass shows besides stamps, for any kind of card: the balance (balance card) or the
 * worth of the free purchase (average card). Read fresh, so every Google update shows the same thing.
 */
export async function passProgram(db: D1Database, customerId: string): Promise<{ balance?: string; average?: PassAverage }> {
  const row = await db
    .prepare(
      `SELECT c.stamps, c.balance, c.round_total, b.program, b.currency, b.avg_cap,
         (SELECT value FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2) ORDER BY earned, id LIMIT 1) AS ready_value
       FROM customers c JOIN businesses b ON b.id = c.business WHERE c.id = ?1`,
    )
    .bind(customerId, new Date().toISOString())
    .first<{ stamps: number; balance: number; round_total: number; program: string; currency: string; avg_cap: number; ready_value: number | null }>();
  if (!row) return {};
  return { balance: passBalance(row, row.balance), average: passAverage(row, row, row.ready_value) };
}
