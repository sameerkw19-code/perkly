// Online booking: which times are free, for whom, and what a client may still change. Israel dates and times.
// Pure functions only (imports with .ts), so tests can load them directly.

import { parseHours, toHM, toMin, weekdayOf, type WorkHours } from "./calendar.ts";

/** A service on the booking page: its name, minutes and price in agorot/cents (0 = not shown). */
export type BookService = { id: string; name: string; min: number; price: number };
/** A person clients book with. `hours`/`services`: JSON from the database, null = the business's hours / every service. */
export type StaffRow = { id: string; name: string; hours: string | null; services: string | null };
/** A special day: closed (hours null) or short hours, for the whole business (staff "") or one person. */
export type SpecialDay = { staff: string; date: string; hours: string | null; note?: string | null };
/** The booking rules a business sets. */
export type BookingRules = { auto: boolean; days: number; notice: number; cancelHours: number; prices: boolean };

export const BOOK_SERVICES_MAX = 6;
export const STAFF_MAX = 20;
export const NOTE_MAX = 300;
export const RULE_LIMITS = { days: [1, 365], notice: [0, 10_080], cancelHours: [0, 336] } as const;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The services list (businesses.services), with prices. Invalid entries are dropped. */
export function parseBookServices(json: string | null | undefined): BookService[] {
  try {
    const v = JSON.parse(json ?? "");
    if (!Array.isArray(v)) return [];
    return v
      .filter((s) => s && typeof s.id === "string" && typeof s.name === "string" && s.name.trim() && Number.isInteger(s.min) && s.min >= 5 && s.min <= 480)
      .slice(0, 30)
      .map((s) => ({ id: s.id, name: String(s.name).trim().slice(0, 60), min: s.min, price: Number.isInteger(s.price) && s.price > 0 && s.price <= 10_000_000 ? s.price : 0 }));
  } catch {
    return [];
  }
}

/** The service ids a person gives, or null for all. */
export function staffServiceIds(staff: Pick<StaffRow, "services">): string[] | null {
  try {
    const v = JSON.parse(staff.services ?? "");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : null;
  } catch {
    return null;
  }
}

/** Whether a person gives every one of these services. */
export function staffServes(staff: Pick<StaffRow, "services">, serviceIds: string[]): boolean {
  const ids = staffServiceIds(staff);
  return !ids || serviceIds.every((id) => ids.includes(id));
}

/** One day's hours ["09:00","13:00"] from JSON, or null when closed or invalid. */
export function parseDayHours(json: string | null | undefined): [string, string] | null {
  try {
    const v = JSON.parse(json ?? "");
    if (Array.isArray(v) && v.length === 2 && HM.test(v[0]) && HM.test(v[1]) && v[0] < v[1]) return [v[0], v[1]];
  } catch {}
  return null;
}

/**
 * A person's hours on a date. The most specific rule wins: their own special day, then the business's special day
 * (a holiday closes everyone), then their weekly hours, then the business's weekly hours.
 */
export function hoursOn(date: string, staff: Pick<StaffRow, "id" | "hours">, businessHours: WorkHours, specials: SpecialDay[]): [string, string] | null {
  const own = specials.find((s) => s.date === date && s.staff === staff.id);
  if (own) return parseDayHours(own.hours);
  const all = specials.find((s) => s.date === date && s.staff === "");
  if (all) return parseDayHours(all.hours);
  const weekly: WorkHours = staff.hours ? parseHours(staff.hours) : businessHours;
  return weekly[weekdayOf(date)] ?? null;
}

/**
 * Start times inside `day` (every `step` minutes) when `minutes` fit: not overlapping `busy` ([start, end) in minutes
 * since midnight) and not before `notBefore` (minutes since midnight; -1 = no limit).
 */
export function freeTimes(day: [string, string] | null, step: number, minutes: number, busy: [number, number][], notBefore = -1): string[] {
  if (!day || minutes <= 0 || step <= 0) return [];
  const open = toMin(day[0]);
  const close = toMin(day[1]);
  const out: string[] = [];
  for (let t = open; t + minutes <= close; t += step) {
    if (t < notBefore) continue;
    if (busy.some(([s, e]) => t < e && t + minutes > s)) continue;
    out.push(toHM(t));
  }
  return out;
}

/**
 * The earliest minute a client may book on `date`: today, now plus the notice; a later day, no limit (-1);
 * a day past the notice entirely, null (nothing that day).
 */
export function earliestOn(date: string, today: string, nowMin: number, notice: number): number | null {
  if (date < today) return null;
  if (date === today) return nowMin + notice;
  // A notice longer than a day can reach into the next days.
  const daysAhead = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const left = nowMin + notice - daysAhead * 1440;
  return left > 0 ? left : -1;
}

/** Whether a date is inside the booking window (today up to `days` ahead). */
export function inWindow(date: string, today: string, days: number): boolean {
  if (date < today) return false;
  const ahead = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return ahead <= days;
}

/**
 * For "anyone": who takes an appointment at `time`. Among the people free then, the one with the fewest
 * appointments that day (then the list order), so the work spreads out.
 */
export function pickStaff(time: string, free: Map<string, string[]>, load: Map<string, number>, order: string[]): string | null {
  const able = order.filter((id) => free.get(id)?.includes(time));
  if (!able.length) return null;
  return able.reduce((best, id) => ((load.get(id) ?? 0) < (load.get(best) ?? 0) ? id : best), able[0]);
}

/** The union of free times of several people, sorted. */
export function unionTimes(free: Map<string, string[]>): string[] {
  return [...new Set([...free.values()].flat())].sort();
}

/** Whether a client may still cancel or move an appointment themselves. */
export function clientMayChange(startIso: string, nowMs: number, cancelHours: number): boolean {
  return Date.parse(startIso) - nowMs >= cancelHours * 3_600_000;
}

/** The services picked, in the business's order, and their total minutes and price. Null when one is unknown or none. */
export function pickServices(all: BookService[], ids: unknown): { list: BookService[]; minutes: number; price: number } | null {
  if (!Array.isArray(ids) || !ids.length || ids.length > BOOK_SERVICES_MAX || !ids.every((x) => typeof x === "string")) return null;
  const unique = [...new Set(ids as string[])];
  const list = all.filter((s) => unique.includes(s.id));
  if (list.length !== unique.length) return null;
  return { list, minutes: list.reduce((n, s) => n + s.min, 0), price: list.reduce((n, s) => n + s.price, 0) };
}

/** Clamps the rules a business sends to their limits. */
export function cleanRules(p: Record<string, unknown>, current: BookingRules): BookingRules {
  const int = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) =>
    Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : fallback;
  return {
    auto: typeof p.auto === "boolean" ? p.auto : current.auto,
    days: int(p.days, RULE_LIMITS.days, current.days),
    notice: int(p.notice, RULE_LIMITS.notice, current.notice),
    cancelHours: int(p.cancelHours, RULE_LIMITS.cancelHours, current.cancelHours),
    prices: typeof p.prices === "boolean" ? p.prices : current.prices,
  };
}

/** Minutes since midnight of an Israel "HH:MM". */
export { toMin, toHM };

/** "45 דק׳" / "1:30 ש׳" / "45 min" / "1:30 h". */
export function durationLabel(min: number, lang: string): string {
  if (min < 60) return lang === "en" ? `${min} min` : lang === "ar" ? `${min} د` : `${min} דק׳`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const t = m ? `${h}:${String(m).padStart(2, "0")}` : String(h);
  return lang === "en" ? `${t} h` : lang === "ar" ? `${t} س` : `${t} ש׳`;
}
