// Prices by market: Israel pays in shekels, everyone else in dollars (the visitor's country decides
// for new visitors, lib/server/region.ts; a business keeps the currency it signed up with).
// Texts write prices as placeholders and get them filled for the visitor:
//   {$m} monthly · {$was} monthly before the discount · {$k} counter kit · {$0} zero
//   (yearly: {$y} · {$ym} · {$save} — the yearly plan is not sold at the moment)

export type Currency = "ILS" | "USD";

// "was": the price shown struck through next to the monthly price.
export const PRICES: Record<Currency, { monthly: number; was: number; yearly: number; yearlyMonthly: number; kit: number }> = {
  ILS: { monthly: 199, was: 300, yearly: 1990, yearlyMonthly: 166, kit: 99 },
  USD: { monthly: 59, was: 89, yearly: 590, yearlyMonthly: 49, kit: 29 },
};

/** The yearly plan is not sold at the moment (only monthly). */
export const YEARLY_SOLD = false;

/** "99 ₪" in Hebrew and Arabic, "₪99" in English, "$29" everywhere. */
export function money(amount: number, currency: Currency, lang: string): string {
  if (currency === "USD") return `$${amount}`;
  return lang === "en" ? `₪${amount}` : `${amount} ₪`;
}

/** How much the yearly plan saves against 12 monthly payments, in whole percent (16 in shekels, 17 in dollars). */
export function yearlySaving(currency: Currency): number {
  const p = PRICES[currency];
  return Math.round((1 - p.yearly / (12 * p.monthly)) * 100);
}

/** Fills the price placeholders in one text. */
export function fillPrices(text: string, currency: Currency, lang: string): string {
  if (!text.includes("{$")) return text;
  const p = PRICES[currency];
  const values: Record<string, number> = { m: p.monthly, was: p.was, y: p.yearly, ym: p.yearlyMonthly, k: p.kit, "0": 0 };
  return text
    .replace(/\{\$save\}/g, String(yearlySaving(currency)))
    .replace(/\{\$(was|ym|m|y|k|0)\}/g, (_, key: string) => money(values[key], currency, lang));
}

/** The same object with every price placeholder filled (strings inside objects, arrays and functions' results stay as they are). */
export function withPrices<T>(value: T, currency: Currency, lang: string): T {
  if (typeof value === "string") return fillPrices(value, currency, lang) as T;
  if (Array.isArray(value)) return value.map((v) => withPrices(v, currency, lang)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = withPrices(v, currency, lang);
    return out as T;
  }
  return value;
}

/** Old businesses and anything unknown are in shekels. */
export function asCurrency(value: unknown): Currency {
  return value === "USD" ? "USD" : "ILS";
}
