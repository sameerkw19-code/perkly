// The vet's pet file: species, ages, weights, vaccines and periodic treatments with reminders a month, a week and a day
// before they are due, and what the next appointment is for. Israel dates. Imports with .ts, so tests can load it.
import { israelTime } from "./appointment.ts";
import { addDays } from "./library.ts";
import { addMonths, shortDate } from "./programs.ts";

export const SPECIES = ["dog", "cat", "rabbit", "bird", "rodent", "reptile", "other"] as const;
export type Species = (typeof SPECIES)[number];
export const CARE_KINDS = ["vaccine", "treatment"] as const;
export type CareKind = (typeof CARE_KINDS)[number];
export const APPT_KINDS = ["vaccine", "treatment", "visit"] as const;
export type ApptKind = (typeof APPT_KINDS)[number];
export const PETS_MAX = 20;
export const CARE_MAX = 40;

export const SPECIES_ICON: Record<Species, string> = { dog: "🐕", cat: "🐈", rabbit: "🐇", bird: "🦜", rodent: "🐹", reptile: "🦎", other: "🐾" };

type L = "he" | "ar" | "en";
const langOf = (lang: string): L => (lang === "he" || lang === "ar" ? lang : "en");

const NAMES: Record<L, Record<Species | CareKind | ApptKind | "age_y" | "age_m" | "age_ym" | "kg", string>> = {
  he: { dog: "כלב", cat: "חתול", rabbit: "ארנב", bird: "ציפור", rodent: "מכרסם", reptile: "זוחל", other: "אחר", vaccine: "חיסון", treatment: "טיפול", visit: "ביקור", age_y: "{y} שנים", age_m: "{m} חודשים", age_ym: "{y} שנים ו־{m} חודשים", kg: "{n} ק״ג" },
  ar: { dog: "كلب", cat: "قطة", rabbit: "أرنب", bird: "طائر", rodent: "قارض", reptile: "زاحف", other: "آخر", vaccine: "تطعيم", treatment: "علاج", visit: "زيارة", age_y: "{y} سنوات", age_m: "{m} أشهر", age_ym: "{y} سنوات و{m} أشهر", kg: "{n} كغ" },
  en: { dog: "Dog", cat: "Cat", rabbit: "Rabbit", bird: "Bird", rodent: "Rodent", reptile: "Reptile", other: "Other", vaccine: "Vaccine", treatment: "Treatment", visit: "Visit", age_y: "{y} yrs", age_m: "{m} mos", age_ym: "{y} yrs {m} mos", kg: "{n} kg" },
};

export function speciesName(s: string, lang: string): string {
  return NAMES[langOf(lang)][(SPECIES as readonly string[]).includes(s) ? (s as Species) : "other"];
}
export function kindName(k: string, lang: string): string {
  return NAMES[langOf(lang)][(APPT_KINDS as readonly string[]).includes(k) ? (k as ApptKind) : "visit"];
}

/** A birth date "2023-04-10" or "2023-04" (day unknown). */
export function validBirth(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1980 && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** The age on `today`: "3 שנים ו־2 חודשים", "5 חודשים". Null without a birth date or when it's in the future. */
export function ageText(birth: string | null | undefined, today: string, lang: string): string | null {
  if (!birth || !validBirth(birth)) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm) - (bd && td < bd ? 1 : 0);
  if (months < 0) return null;
  const l = langOf(lang);
  const y = Math.floor(months / 12);
  months %= 12;
  if (l === "he") {
    // Hebrew says one and two differently: שנה, שנתיים, חודש, חודשיים.
    const ys = y === 1 ? "שנה" : y === 2 ? "שנתיים" : `${y} שנים`;
    const ms = months === 1 ? "חודש" : months === 2 ? "חודשיים" : `${months} חודשים`;
    return y && months ? `${ys} ו${months > 2 ? "־" : ""}${ms}` : y ? ys : ms;
  }
  if (l === "en") {
    const ys = `${y} yr${y === 1 ? "" : "s"}`;
    const ms = `${months} mo${months === 1 ? "" : "s"}`;
    return y && months ? `${ys} ${ms}` : y ? ys : ms;
  }
  const w = NAMES[l];
  return y && months ? w.age_ym.replace("{y}", String(y)).replace("{m}", String(months)) : y ? w.age_y.replace("{y}", String(y)) : w.age_m.replace("{m}", String(months));
}

/** Grams as "12.4 ק״ג". */
export function kgText(grams: number, lang: string): string {
  const n = Math.round(grams / 100) / 10;
  return NAMES[langOf(lang)].kg.replace("{n}", String(n));
}

/** A weight typed in kilograms ("12.4", "12,4") as grams, or null. Up to 200 kg. */
export function parseKg(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.replace(",", ".").trim() : "";
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(s)) return null;
  const g = Math.round(Number(s) * 1000);
  return g > 0 && g <= 200_000 ? g : null;
}

/** When a vaccine or treatment is due next: the date given plus its months, or a date set by hand. */
export function nextDue(last: string | null, months: number | null, manual?: string | null): string | null {
  if (manual) return manual;
  return last && months ? addMonths(last, months) : null;
}

/** Reminders before a due date: a month, a week and the day before, at 10:00. */
export const CARE_STAGES = [{ key: "m30", days: -30 }, { key: "d7", days: -7 }, { key: "d1", days: -1 }] as const;

export function parseSent(v: string | null | undefined): string[] {
  return (v ?? "").split(",").filter(Boolean);
}

/**
 * Reminders whose time already passed for this due date (a new date skips them: never sent late). With `given` (the day
 * it was last given), also those falling on or before that day: a monthly treatment given today gets no "in a month" today.
 */
export function passedCareStages(due: string, now: Date, given?: string | null): string[] {
  const until = Math.max(now.getTime(), given ? israelTime(addDays(given, 1), "0:00")!.getTime() - 1 : 0);
  return CARE_STAGES.filter((s) => israelTime(addDays(due, s.days), "10:00")!.getTime() <= until).map((s) => s.key);
}

/** The reminder to send now, if any: the latest one due and unsent (missed ones are marked, not sent). None after the date. */
export function careStageNow(due: string, sent: string[], now: Date): { stage: string; skip: string[] } | null {
  if (now.getTime() >= israelTime(addDays(due, 1), "0:00")!.getTime()) return null;
  const pending = passedCareStages(due, now).filter((k) => !sent.includes(k));
  if (!pending.length) return null;
  return { stage: pending[pending.length - 1], skip: pending.slice(0, -1) };
}

const REMIND: Record<L, Record<string, string>> = {
  he: { m30: "🐾 בעוד חודש ({d}): {what} ל{pet} ב{business}", d7: "🐾 בעוד שבוע ({d}): {what} ל{pet} ב{business}", d1: "🐾 מחר ({d}): {what} ל{pet} ב{business}. נתראה!" },
  ar: { m30: "🐾 بعد شهر ({d}): {what} لـ{pet} في {business}", d7: "🐾 بعد أسبوع ({d}): {what} لـ{pet} في {business}", d1: "🐾 غداً ({d}): {what} لـ{pet} في {business}. نراكم!" },
  en: { m30: "🐾 In a month ({d}): {pet}'s {what} at {business}", d7: "🐾 In a week ({d}): {pet}'s {what} at {business}", d1: "🐾 Tomorrow ({d}): {pet}'s {what} at {business}. See you!" },
};

/** The reminder's text: the animal, what is due (the vaccine or treatment's name) and the date. */
export function careReminder(stage: string, lang: string, business: string, pet: string, what: string, due: string): string {
  return (REMIND[langOf(lang)][stage] ?? REMIND[langOf(lang)].d7)
    .replace("{d}", shortDate(due)).replace("{what}", what).replace("{pet}", pet).replace("{business}", business);
}

/** Days from today to a due date (negative: overdue). */
export function daysTo(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

/** Common vaccines and treatments to pick from (the clinic edits the months). */
export const CARE_PRESETS: Record<CareKind, { he: string; ar: string; en: string; months: number }[]> = {
  vaccine: [
    { he: "כלבת", ar: "داء الكلب", en: "Rabies", months: 12 },
    { he: "משושה", ar: "السداسي", en: "DHPPi+L", months: 12 },
    { he: "שעלת מכלאות", ar: "سعال الكلاب", en: "Kennel cough", months: 12 },
    { he: "מרובע (חתולים)", ar: "الرباعي (قطط)", en: "FVRCP (cats)", months: 12 },
  ],
  treatment: [
    { he: "תילוע", ar: "طارد الديدان", en: "Deworming", months: 3 },
    { he: "קרציות ופרעושים", ar: "القراد والبراغيث", en: "Ticks and fleas", months: 1 },
    { he: "ספירוצרקה", ar: "سبيروسيركا", en: "Spirocerca", months: 1 },
  ],
};

/** A microchip number: digits (and letters for older chips), 6 to 20, spaces and dashes dropped. Null when empty, undefined when invalid. */
export function cleanChip(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-Z]{6,20}$/.test(s) ? s : undefined;
}

/** A vaccine's batch (Lot) number: letters, digits and - / . up to 30. Null when empty, undefined when invalid. */
export function cleanLot(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return /^[0-9A-Za-z./-]{1,30}$/.test(s) ? s : undefined;
}

/** A microchip number in groups of three, easier to read and compare. */
export function chipText(chip: string): string {
  return /^\d+$/.test(chip) ? chip.replace(/(\d{3})(?=\d)/g, "$1 ") : chip;
}
