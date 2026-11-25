// The library card: books on loan, their return dates, reminders and extensions. Israel time.
// Only an import with its extension, so tests can load it directly.
import { israelTime } from "./appointment.ts";

/** Reminders: a week before (10:00), the day before (10:00), and on the return day in the morning (9:00). */
export type LoanStage = "w" | "d1" | "d0";
export const LOAN_STAGES: LoanStage[] = ["w", "d1", "d0"];
const STAGE_AT: Record<LoanStage, { days: number; time: string }> = { w: { days: -7, time: "10:00" }, d1: { days: -1, time: "10:00" }, d0: { days: 0, time: "9:00" } };

/** The librarian's settings: loan length, how much one extension adds, how many extensions a book may get. */
export const LOAN_DAYS_MAX = 120;
export const LOAN_EXT_DAYS_MAX = 60;
export const LOAN_MAX_EXT_MAX = 10;
/** Books one reader may have at once, and the longest title. */
export const LOANS_MAX = 20;
export const TITLE_MAX = 80;

export type Loan = { id: string; title: string; due: string; extensions: number };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-11-25" is a real calendar date. */
export function validDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** The date `n` days after `date` ("2026-11-25" + 7 → "2026-12-02"). */
export function addDays(date: string, n: number): string {
  const m = DATE.exec(date)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)).toISOString().slice(0, 10);
}

/** Today's date in Israel. */
export function israelDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Days from `today` to `due` (0 = today, negative = late). */
export function daysLeft(due: string, today: string): number {
  return Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}

/** A book title as typed: one line, no control characters or angle brackets, at most TITLE_MAX. */
export function cleanTitle(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX) : "";
}

/** When each reminder is due, for a book due back on `due`. */
export function loanStageTimes(due: string): Record<LoanStage, number> {
  const out = {} as Record<LoanStage, number>;
  for (const s of LOAN_STAGES) out[s] = israelTime(addDays(due, STAGE_AT[s].days), STAGE_AT[s].time)!.getTime();
  return out;
}

/** Reminders whose time has passed: for a new loan or a new date they are skipped, never sent late. */
export function passedLoanStages(due: string, now: Date): LoanStage[] {
  const t = loanStageTimes(due);
  return LOAN_STAGES.filter((s) => t[s] <= now.getTime());
}

export function parseLoanSent(v: string | null | undefined): LoanStage[] {
  return (v ?? "").split(",").filter((s): s is LoanStage => (LOAN_STAGES as string[]).includes(s));
}

/**
 * The reminder to send now for one book, if any: the latest one due and not sent. Missed earlier ones (the job was
 * down) are not sent late; `skip` lists them so they are marked too. Nothing after the return day.
 */
export function dueLoanStage(due: string, sent: LoanStage[], now: Date): { stage: LoanStage; skip: LoanStage[] } | null {
  if (now.getTime() >= israelTime(addDays(due, 1), "0:00")!.getTime()) return null;
  const pending = passedLoanStages(due, now).filter((s) => !sent.includes(s));
  if (!pending.length) return null;
  return { stage: pending[pending.length - 1], skip: pending.slice(0, -1) };
}

/** The new return date after an extension: `days` more, counted from today when the book is already late. */
export function extendedDue(due: string, today: string, days: number): string {
  return addDays(due < today ? today : due, days);
}

type L = "he" | "ar" | "en";
const langOf = (lang: string): L => (lang === "he" || lang === "ar" ? lang : "en");

/** "יום ד׳, 3.12" — a return date as the card and the station show it. */
export function formatDue(date: string, lang: string, withDay = true): string {
  const m = DATE.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const l = langOf(lang);
  const day = new Intl.DateTimeFormat(l === "he" ? "he-IL" : l === "ar" ? "ar" : "en-GB", { weekday: l === "en" ? "short" : "long", timeZone: "UTC" }).format(d);
  const short = `${Number(m[3])}.${Number(m[2])}`;
  return withDay ? `${day}, ${short}` : short;
}

const W = {
  he: { label: "להחזרה עד", books: "ספרים אצלך", none: "אין ספרים בהשאלה", late: "באיחור", today: "היום", ext: "הארכה", renew: "להארכת ההשאלה", mine: "הספרים שלי" },
  ar: { label: "الإرجاع حتى", books: "كتب لديك", none: "لا توجد كتب مستعارة", late: "متأخر", today: "اليوم", ext: "تمديد", renew: "لتمديد الإعارة", mine: "كتبي" },
  en: { label: "Return by", books: "Books with you", none: "No books on loan", late: "Late", today: "Today", ext: "Extend", renew: "Extend your loan", mine: "My books" },
};
export const loanWords = (lang: string) => W[langOf(lang)];

/** The titles in one line: one title, two titles, or the first and how many more. */
function titlesLine(titles: string[], l: L): string {
  const q = (t: string) => `"${t}"`;
  if (titles.length === 1) return q(titles[0]);
  if (titles.length === 2) return l === "he" ? `${q(titles[0])} ו־${q(titles[1])}` : l === "ar" ? `${q(titles[0])} و${q(titles[1])}` : `${q(titles[0])} and ${q(titles[1])}`;
  const more = titles.length - 1;
  return l === "he" ? `${q(titles[0])} ועוד ${more}` : l === "ar" ? `${q(titles[0])} و${more} أخرى` : `${q(titles[0])} and ${more} more`;
}

/** The reminder a reader gets (a notification on the wallet pass). */
export function loanReminder(stage: LoanStage, lang: string, library: string, titles: string[], due: string, canExtend: boolean): string {
  const l = langOf(lang);
  const books = titlesLine(titles, l);
  const date = formatDue(due, lang);
  const one = titles.length === 1;
  const ext = canExtend ? { he: " אפשר להאריך מהכרטיס.", ar: " يمكن التمديد من البطاقة.", en: " You can extend it from the card." }[l] : "";
  if (l === "he") {
    const verb = one ? "צריך לחזור" : "צריכים לחזור";
    if (stage === "w") return `${library}: ${books} ${verb} בעוד שבוע, ${date}.${ext}`;
    if (stage === "d1") return `${library}: ${books} ${verb} מחר, ${date}.${ext}`;
    return `${library}: היום יום ההחזרה של ${books}.${ext}`;
  }
  if (l === "ar") {
    if (stage === "w") return `${library}: يجب إرجاع ${books} بعد أسبوع، ${date}.${ext}`;
    if (stage === "d1") return `${library}: يجب إرجاع ${books} غداً، ${date}.${ext}`;
    return `${library}: اليوم موعد إرجاع ${books}.${ext}`;
  }
  if (stage === "w") return `${library}: ${books} ${one ? "is" : "are"} due back in a week, ${date}.${ext}`;
  if (stage === "d1") return `${library}: ${books} ${one ? "is" : "are"} due back tomorrow, ${date}.${ext}`;
  return `${library}: ${books} ${one ? "is" : "are"} due back today.${ext}`;
}

/** The pass's main line: the nearest return date, or that there are no books. */
export function nextDue(loans: Loan[]): Loan | null {
  return loans.length ? [...loans].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.title.localeCompare(b.title)))[0] : null;
}
