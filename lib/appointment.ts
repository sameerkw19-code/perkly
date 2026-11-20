// The appointments card: when each reminder goes out and what it says. Israel time.
// No imports, so tests can load it directly.

/** Reminders: the day before (24 hours), that morning at 8:00, and an hour before. */
export type ApptStage = "d1" | "am" | "h1";
export const APPT_STAGES: ApptStage[] = ["d1", "am", "h1"];
/** The morning reminder goes out at this hour, only for appointments from APPT_MORNING_MIN on (else the hour-before one is enough). */
export const APPT_MORNING_HOUR = 8;
const APPT_MORNING_MIN = 10;
/** How far ahead an appointment can be set. */
export const APPT_MAX_DAYS = 400;

const TZ = "Asia/Jerusalem";

function israelParts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute) };
}

/** A local Israel date and time ("2026-11-25", "10:30") as an exact moment, or null when invalid. */
export function israelTime(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Israel is UTC+2 or +3: correct by the offset at that moment.
  const local = israelParts(new Date(guess));
  const offset = Date.UTC(local.y, local.m - 1, local.d, local.h, local.min) - guess;
  const at = new Date(guess - offset);
  const check = israelParts(at);
  return check.y === y && check.m === mo && check.d === d && check.h === h && check.min === mi ? at : null;
}

/** The moment each reminder is due, for an appointment at `appt`. The morning one only when it makes sense. */
export function stageTimes(appt: Date): Partial<Record<ApptStage, number>> {
  const t = appt.getTime();
  const local = israelParts(appt);
  const out: Partial<Record<ApptStage, number>> = { d1: t - 24 * 3_600_000, h1: t - 3_600_000 };
  if (local.h >= APPT_MORNING_MIN) {
    const morning = israelTime(`${local.y}-${String(local.m).padStart(2, "0")}-${String(local.d).padStart(2, "0")}`, `${APPT_MORNING_HOUR}:00`);
    if (morning) out.am = morning.getTime();
  }
  return out;
}

/** Reminders whose time has passed (for a new appointment: these are skipped, never sent late). */
export function passedStages(appt: Date, now: Date): ApptStage[] {
  const times = stageTimes(appt);
  return APPT_STAGES.filter((s) => times[s] !== undefined && times[s]! <= now.getTime());
}

/**
 * The reminder to send now, if any: the latest one that is due and not sent. Earlier ones that were missed
 * (the job was down) are not sent late; `skip` lists them so they are marked too.
 */
export function dueStage(appt: Date, sent: ApptStage[], now: Date): { stage: ApptStage; skip: ApptStage[] } | null {
  if (now.getTime() >= appt.getTime()) return null;
  const due = passedStages(appt, now).filter((s) => !sent.includes(s));
  if (!due.length) return null;
  const stage = due[due.length - 1];
  return { stage, skip: due.slice(0, -1) };
}

export function parseSent(v: string | null | undefined): ApptStage[] {
  return (v ?? "").split(",").filter((s): s is ApptStage => (APPT_STAGES as string[]).includes(s));
}

type L = "he" | "ar" | "en";
const langOf = (lang: string): L => (lang === "he" || lang === "ar" ? lang : "en");

/** "יום ג׳, 25.11 · 10:30" — the appointment as the card and the station show it. */
export function formatAppt(iso: string, lang: string, withDay = true): string {
  const d = new Date(iso);
  const l = langOf(lang);
  const locale = l === "he" ? "he-IL" : l === "ar" ? "ar" : "en-GB";
  const day = withDay ? new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "short" }).format(d) : "";
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "numeric" }).format(d).replace("/", ".");
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${day ? day + ", " : ""}${date} · ${time}`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const REMIND: Record<L, Record<ApptStage, string>> = {
  he: {
    d1: "🗓️ תזכורת: מחר יש לך תור ב{business}, בשעה {time}",
    am: "☀️ בוקר טוב! היום יש לך תור ב{business}, בשעה {time}",
    h1: "⏰ בעוד שעה התור שלך ב{business} ({time}). נתראה!",
  },
  ar: {
    d1: "🗓️ تذكير: غداً لديك موعد في {business}، الساعة {time}",
    am: "☀️ صباح الخير! اليوم لديك موعد في {business}، الساعة {time}",
    h1: "⏰ بعد ساعة موعدك في {business} ({time}). نراك قريباً!",
  },
  en: {
    d1: "🗓️ Reminder: you have an appointment at {business} tomorrow at {time}",
    am: "☀️ Good morning! You have an appointment at {business} today at {time}",
    h1: "⏰ Your appointment at {business} is in an hour ({time}). See you soon!",
  },
};

/** The reminder's text. Only the business, the day and the time: never what the appointment is for. */
export function reminderText(stage: ApptStage, lang: string, business: string, apptIso: string): string {
  return REMIND[langOf(lang)][stage].replace("{business}", business).replace("{time}", formatTime(apptIso));
}

/** The label for the next appointment on a pass, in the card's language. */
export function apptLabel(lang: string): string {
  return { he: "התור הבא", ar: "الموعد القادم", en: "Next appointment" }[langOf(lang)];
}

export function noApptText(lang: string): string {
  return { he: "אין תור כרגע", ar: "لا يوجد موعد حالياً", en: "No appointment yet" }[langOf(lang)];
}
