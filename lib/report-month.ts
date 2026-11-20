// Months for the monthly report, in Israel time (no imports, so tests can load it directly).

/** Midnight in Israel at the start of the given month ("2026-10"), as an ISO time. */
export function monthStart(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, 1);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(guess)).map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(guess - (local - guess)).toISOString();
}

/** The month before ("2026-01" → "2025-12"). */
export function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** The month after. */
export function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** The last full month, in Israel. */
export function lastMonth(now = new Date()): string {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
  return prevMonth(ym);
}

export function validMonth(v: unknown): v is string {
  return typeof v === "string" && /^20\d\d-(0[1-9]|1[0-2])$/.test(v);
}

const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthName(ym: string, lang: "he" | "en"): string {
  const [y, m] = ym.split("-").map(Number);
  return `${(lang === "he" ? MONTHS_HE : MONTHS_EN)[m - 1]} ${y}`;
}

/** "+12%" / "−5%" against the month before; empty when there is nothing to compare with. */
export function change(now: number, prev: number): string {
  if (!prev) return "";
  const pct = Math.round(((now - prev) / prev) * 100);
  return pct === 0 ? "=" : pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

