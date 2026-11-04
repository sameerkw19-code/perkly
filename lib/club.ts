// Perkly for Clubs: dates and membership status. No imports, so tests can load it directly.
// A membership date is a plain calendar day (YYYY-MM-DD). The last valid day counts in full, Israel time.

const TZ = "Asia/Jerusalem";
/** Warn this many days before a membership ends. */
export const EXPIRING_DAYS = 7;

export type MemberStatus = "active" | "expiring" | "expired";

/** True for a real calendar day, so "2026-02-31" is refused. */
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today in Israel. */
export function israelToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function memberStatus(validUntil: string, today: string): MemberStatus {
  const left = daysBetween(today, validUntil);
  if (left < 0) return "expired";
  return left <= EXPIRING_DAYS ? "expiring" : "active";
}

/** Adds months to a day. The 31st moves to the last day of a shorter month. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The day a renewal counts from: the end of the current membership, or today if it already ended. */
export function renewFrom(validUntil: string | null | undefined, today: string): string {
  return validUntil && validUntil > today ? validUntil : today;
}

/** The moment a membership ends: the end of its last day in Israel, with the right summer or winter offset. */
export function endOfDay(date: string): string {
  const noon = new Date(`${date}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(noon).find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  const hours = Number(/GMT([+-]\d+)/.exec(zone)?.[1] ?? 2);
  const sign = hours < 0 ? "-" : "+";
  return `${date}T23:59:59${sign}${String(Math.abs(hours)).padStart(2, "0")}:00`;
}

/** 2026-12-31 → 31/12/2026, the way dates are written in Israel. */
export function showDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** Black or white text, whichever reads better on a background color. */
export function readableOn(hex: string): "#FFFFFF" | "#17132B" {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const [r, g, b] = m.slice(1).map((v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (light + 0.05)) >= ((light + 0.05) / 0.0587) ? "#FFFFFF" : "#17132B";
}
