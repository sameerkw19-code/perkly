import { averageReward, formatMoney, type CashbackCurrency } from "../cashback.ts";
import { formatAppt, noApptText } from "../appointment.ts";

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
/** The appointments card on a wallet pass: the next appointment as text ("יום ג׳, 25.11 · 10:30"), or undefined for other cards. */
export function passAppointment(b: { program?: string | null; currency?: string | null }, apptAt: string | null | undefined): string | undefined {
  if (b.program !== "appointments") return undefined;
  const lang = b.currency === "USD" ? "en" : "he";
  return apptAt && Date.parse(apptAt) > Date.now() - 3_600_000 ? formatAppt(apptAt, lang) : noApptText(lang);
}

/** What the appointments card adds (the owner's choice): the visits on a gift punch card, points, or the balance. */
export type PassApptExtra = { kind: "stamps" | "points" | "cashback"; value: string };

export function passApptExtra(
  b: { program?: string | null; appt_extra?: string | null; currency?: string | null },
  c: { stamps: number; target: number; balance?: number | null },
): PassApptExtra | undefined {
  if (b.program !== "appointments") return undefined;
  if (b.appt_extra === "stamps" || b.appt_extra === "points") return { kind: b.appt_extra, value: `${Math.min(c.stamps, c.target)}/${c.target}` };
  if (b.appt_extra === "cashback") return { kind: "cashback", value: passBalance({ program: "cashback", currency: b.currency }, c.balance)! };
  return undefined;
}

export async function passProgram(db: D1Database, customerId: string): Promise<{ balance?: string; average?: PassAverage; appointment?: string; apptExtra?: PassApptExtra }> {
  const row = await db
    .prepare(
      `SELECT c.stamps, c.target, c.balance, c.round_total, c.appt_at, b.program, b.appt_extra, b.currency, b.avg_cap,
         (SELECT value FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2) ORDER BY earned, id LIMIT 1) AS ready_value
       FROM customers c JOIN businesses b ON b.id = c.business WHERE c.id = ?1`,
    )
    .bind(customerId, new Date().toISOString())
    .first<{ stamps: number; target: number; balance: number; round_total: number; appt_at: string | null; program: string; appt_extra: string | null; currency: string; avg_cap: number; ready_value: number | null }>();
  if (!row) return {};
  return { balance: passBalance(row, row.balance), average: passAverage(row, row, row.ready_value), appointment: passAppointment(row, row.appt_at), apptExtra: passApptExtra(row, row) };
}
