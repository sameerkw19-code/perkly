import { formatMoney, type CashbackCurrency } from "../cashback.ts";

/** The balance card on a wallet pass: the balance as text, or undefined for a stamp card. */
export function passBalance(b: { program?: string | null; currency?: string | null }, balance: number | null | undefined): string | undefined {
  if (b.program !== "cashback") return undefined;
  const currency: CashbackCurrency = b.currency === "USD" ? "USD" : "ILS";
  return formatMoney(balance ?? 0, currency, currency === "USD" ? "en" : "he");
}
