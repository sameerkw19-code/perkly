// Customer birthdays: day and month only, stored as "MM-DD". The year is never collected.
// Shared by the server (validation, upcoming list) and the browser (form fields, display).

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "MM-DD" with a real calendar day. 02-29 is allowed because the year is unknown. */
export function validMonthDay(value: string): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const days = DAYS_IN_MONTH[month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

/** Reads an optional birthday from a request body. Returns null (none), the value, or "invalid". */
export function parseBirthday(input: unknown): string | null | "invalid" {
  if (input == null || input === "") return null;
  const v = String(input);
  return validMonthDay(v) ? v : "invalid";
}

/** From two form selects (day, month) to "MM-DD", or "" when either is empty. */
export function birthdayFromParts(day: unknown, month: unknown): string {
  const d = typeof day === "string" ? day : "";
  const m = typeof month === "string" ? month : "";
  if (!d || !m) return "";
  return `${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "MM-DD" → "DD/MM" for display. */
export function formatBirthday(value: string | null | undefined): string {
  if (!value || !validMonthDay(value)) return "";
  return `${value.slice(3, 5)}/${value.slice(0, 2)}`;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The next `days` calendar days in Israel time, as "MM-DD" keys, with how many days away each is.
 * In a non-leap year, 02-29 birthdays are celebrated on 02-28.
 */
export function upcomingKeys(now: Date, days = 7, timeZone = "Asia/Jerusalem"): Map<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const base = Date.UTC(get("year"), get("month") - 1, get("day"));
  const out = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(base + i * 86_400_000);
    const key = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    out.set(key, i);
    if (key === "02-28" && !isLeap(d.getUTCFullYear())) out.set("02-29", i);
  }
  return out;
}

/** Today's date and hour in Israel, where the businesses are. */
export function israelNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, md: `${parts.month}-${parts.day}`, hour: Number(parts.hour), year };
}

/** Birthdays to greet today: Feb 29 birthdays are greeted on Feb 28 in other years. */
export function birthdayKeys(md: string, year: number): string[] {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return md === "02-28" && !leap ? ["02-28", "02-29"] : [md];
}
