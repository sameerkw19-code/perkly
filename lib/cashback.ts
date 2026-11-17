// The balance card (cashback): shared helpers for the server, the station and the customer's card.
// Amounts are integers in minor units (agorot or cents), so sums never drift.

export type Program = "stamps" | "cashback" | "average";
export type CashbackCurrency = "ILS" | "USD";

/** Basis points allowed for the percentage back: 0.1% to 50%. */
export const BP_MIN = 10;
export const BP_MAX = 5000;
/** One purchase or one use of the balance: at most 100,000 in major units. */
/** Longest round on the average card (a supermarket: 40 baskets, the 41st free). Stamp cards stop at 30. */
export const AVG_TARGET_MAX = 50;
export const AMOUNT_MAX = 10_000_000;

/** The credit a purchase earns, rounded to the nearest minor unit. */
export function earnFor(amount: number, bp: number): number {
  return Math.round((amount * bp) / 10_000);
}

/** "12.4" / "12,40" / "₪12" → 1240. Null when it is not a positive amount with at most two decimals. */
export function parseAmount(input: unknown): number | null {
  if (typeof input === "number") return Number.isInteger(input) && input > 0 && input <= AMOUNT_MAX ? input : null;
  if (typeof input !== "string") return null;
  const clean = input.replace(/[₪$\s]/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
  const minor = Math.round(parseFloat(clean) * 100);
  return minor > 0 && minor <= AMOUNT_MAX ? minor : null;
}

/** 1240 → "12.40 ₪" (Hebrew, Arabic), "₪12.40" (English), "$12.40". Whole amounts drop the decimals. */
export function formatMoney(minor: number, currency: CashbackCurrency, lang: string): string {
  const major = minor / 100;
  const n = Number.isInteger(major) ? String(major) : major.toFixed(2);
  if (currency === "USD") return `$${n}`;
  return lang === "en" ? `₪${n}` : `${n} ₪`;
}

/** 200 → "2%", 250 → "2.5%". */
export function pctLabel(bp: number): string {
  const v = bp / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(v * 10 === Math.round(v * 10) ? 1 : 2)}%`;
}

/** The "average" card: the free purchase is worth the average of the round's purchases, capped by the owner (0 = no cap). */
export function averageReward(total: number, purchases: number, cap: number): number {
  const avg = purchases > 0 ? Math.round(total / purchases) : 0;
  return cap > 0 ? Math.min(avg, cap) : avg;
}
