// The clinic's calendar: working hours, slots and dates (Israel dates as "YYYY-MM-DD", times as "HH:MM").
// No imports, so tests can load it directly.

/** Working hours per weekday, Sunday first; null = closed. */
export type WorkHours = ([string, string] | null)[];

/** Sunday to Thursday 9:00-18:00, Friday 9:00-13:00, Saturday closed. */
export const DEFAULT_HOURS: WorkHours = [["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "13:00"], null];
export const SLOT_CHOICES = [10, 15, 20, 30, 45, 60, 90];

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseHours(json: string | null | undefined): WorkHours {
  try {
    const v = JSON.parse(json ?? "");
    if (Array.isArray(v) && v.length === 7 && v.every((d) => d === null || (Array.isArray(d) && d.length === 2 && HM.test(d[0]) && HM.test(d[1]) && d[0] < d[1]))) return v;
  } catch {}
  return DEFAULT_HOURS;
}

export function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function toHM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Sunday that starts the date's week. */
export function weekStart(date: string): string {
  return addDays(date, -weekdayOf(date));
}

/** The slots of a day: start times from opening to the last slot that ends by closing. */
export function slotsOf(hours: WorkHours, date: string, slot: number): string[] {
  const day = hours[weekdayOf(date)];
  if (!day) return [];
  const out: string[] = [];
  for (let m = toMin(day[0]); m + slot <= toMin(day[1]); m += slot) out.push(toHM(m));
  return out;
}

/** The slot an appointment at `hm` falls in (the slot that contains it), or null when outside the hours. */
export function slotOf(slots: string[], hm: string, slot: number): string | null {
  const t = toMin(hm);
  return slots.find((s) => t >= toMin(s) && t < toMin(s) + slot) ?? null;
}

/** The weeks shown for a month: Sunday-first rows of dates, padded with the neighbouring months' days. */
export function monthGrid(ym: string): string[][] {
  const first = `${ym}-01`;
  let d = weekStart(first);
  const weeks: string[][] = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
    d = addDays(d, 7);
  } while (d.slice(0, 7) === ym);
  return weeks;
}

/** A service the clinic offers: its name and how long it takes. */
export type Service = { id: string; name: string; min: number };
export const SERVICE_MAX = 30;

export function parseServices(json: string | null | undefined): Service[] {
  try {
    const v = JSON.parse(json ?? "");
    if (Array.isArray(v)) {
      return v.filter((s) => s && typeof s.id === "string" && typeof s.name === "string" && s.name.trim() && Number.isInteger(s.min) && s.min >= 5 && s.min <= 480).slice(0, SERVICE_MAX);
    }
  } catch {}
  return [];
}

/** "45 דק׳" / "1:30 ש׳" style labels are made by the screens; this is the end time of a start plus minutes. */
export function endOf(hm: string, min: number): string {
  return toHM(toMin(hm) + min);
}

/**
 * Start times on a day when an appointment of `min` minutes fits: inside the working hours, every `step` minutes,
 * not overlapping `busy` ([start, end) in minutes), and (today) not before `notBefore`.
 */
export function freeStarts(hours: WorkHours, date: string, step: number, min: number, busy: [number, number][], notBefore = -1): string[] {
  const day = hours[weekdayOf(date)];
  if (!day) return [];
  const open = toMin(day[0]);
  const close = toMin(day[1]);
  const out: string[] = [];
  for (let t = open; t + min <= close; t += step) {
    if (t < notBefore) continue;
    if (busy.some(([s, e]) => t < e && t + min > s)) continue;
    out.push(toHM(t));
  }
  return out;
}
