// Six simpler kinds of card, sharing one shape: a face (label, value, a line under it) on the web card and the
// wallet passes, and dated reminders. Only an import with its extension, so tests can load it directly.
//   pass       — a prepaid pass: N entries bought at the counter, counted down, valid until a date
//   gift       — a gift card: an amount loaded at the counter (customers.balance), spent until it runs out
//   club       — a club card: a fixed discount on every purchase
//   service    — a periodic service: the next service date on the card, reminders a month and a week before
//   coupon     — a one-time coupon: everyone who joins from the campaign link gets it once, until a date
//   attendance — classes: lessons attended this month, and the next payment date with a reminder the day before
import { israelTime } from "./appointment.ts";
import { addDays, israelDate } from "./library.ts";

export const SIMPLE_PROGRAMS = ["pass", "gift", "club", "service", "coupon", "attendance"] as const;
export type SimpleProgram = (typeof SIMPLE_PROGRAMS)[number];
export const isSimple = (p: unknown): p is SimpleProgram => (SIMPLE_PROGRAMS as readonly string[]).includes(p as string);

/** Owner settings (businesses columns) and their limits. */
export const PASS_SIZE_MAX = 100;
export const PASS_DAYS_MAX = 730;
export const CLUB_PCT_MAX = 90;
export const SERVICE_MONTHS_MAX = 60;
/** The pass card says "N left" as a phone notification when this many entries are left. */
export const PASS_LOW = 2;

export type SimpleState = {
  pass_left?: number; pass_until?: string | null; balance?: number; due_date?: string | null; due_label?: string | null;
  coupon_used?: string | null; month_count?: number;
};
export type SimpleSettings = { club_pct?: number; coupon_until?: string | null; reward?: string };

/** "2026-11-30" + 1 month → "2026-12-30"; the 31st becomes the last day of a shorter month. */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

type L = "he" | "ar" | "en";
const langOf = (lang: string): L => (lang === "he" || lang === "ar" ? lang : "en");

/** "3.12.2026" (or "3.12" within this year): a date as cards show it. */
export function shortDate(date: string, today?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return today && today.slice(0, 4) === String(y) ? `${d}.${m}` : `${d}.${m}.${y}`;
}

const W = {
  he: {
    passLabel: "כניסות שנשארו", passNone: "אין כניסות", passUntil: "בתוקף עד {d}", passExpired: "פג תוקף {d}", passBuy: "קונים כרטיסייה בקופה",
    giftLabel: "יתרה במתנה", giftEmpty: "היתרה נוצלה", giftSub: "משתמשים בקנייה בעסק",
    clubLabel: "חבר מועדון", clubValue: "{p}% הנחה", clubSub: "מציגים את הכרטיס בכל קנייה",
    serviceLabel: "הטיפול הבא", serviceNone: "לא נקבע", serviceSub: "תזכורת חודש ושבוע לפני", serviceLate: "עבר המועד",
    couponLabel: "השובר שלך", couponUntil: "בתוקף עד {d}", couponUsed: "השובר מומש ✓", couponExpired: "השובר פג תוקף", couponOnce: "מראים בקופה, פעם אחת",
    attendLabel: "שיעורים החודש", attendPay: "התשלום הבא: {d}", attendNoPay: "תאריך התשלום ייקבע בעסק",
  },
  ar: {
    passLabel: "الدخولات المتبقية", passNone: "لا دخولات", passUntil: "صالحة حتى {d}", passExpired: "انتهت في {d}", passBuy: "اشترِ بطاقة دخولات في المتجر",
    giftLabel: "رصيد الهدية", giftEmpty: "تم استخدام الرصيد", giftSub: "يُستخدم عند الشراء في المتجر",
    clubLabel: "عضو النادي", clubValue: "خصم {p}%", clubSub: "أظهر البطاقة عند كل شراء",
    serviceLabel: "الخدمة القادمة", serviceNone: "لم تُحدد", serviceSub: "تذكير قبل شهر وقبل أسبوع", serviceLate: "فات الموعد",
    couponLabel: "قسيمتك", couponUntil: "صالحة حتى {d}", couponUsed: "تم استخدام القسيمة ✓", couponExpired: "انتهت القسيمة", couponOnce: "أظهرها عند الصندوق، مرة واحدة",
    attendLabel: "دروس هذا الشهر", attendPay: "الدفعة القادمة: {d}", attendNoPay: "يحدد المشروع موعد الدفع",
  },
  en: {
    passLabel: "Entries left", passNone: "No entries", passUntil: "Valid until {d}", passExpired: "Expired {d}", passBuy: "Buy a pass at the counter",
    giftLabel: "Gift balance", giftEmpty: "Balance used up", giftSub: "Use it when you buy here",
    clubLabel: "Club member", clubValue: "{p}% off", clubSub: "Show the card with every purchase",
    serviceLabel: "Next service", serviceNone: "Not set", serviceSub: "Reminders a month and a week before", serviceLate: "Overdue",
    couponLabel: "Your coupon", couponUntil: "Valid until {d}", couponUsed: "Coupon used ✓", couponExpired: "Coupon expired", couponOnce: "Show it at the counter, once",
    attendLabel: "Lessons this month", attendPay: "Next payment: {d}", attendNoPay: "The business sets the payment date",
  },
};
export const simpleWords = (lang: string) => W[langOf(lang)];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** Is the coupon still good (not used, not past its date)? */
export function couponState(s: SimpleState, set: SimpleSettings, today: string): "valid" | "used" | "expired" {
  if (s.coupon_used) return "used";
  return set.coupon_until && set.coupon_until < today ? "expired" : "valid";
}

/** Is the pass usable today (entries left and not expired)? */
export function passUsable(s: SimpleState, today: string): boolean {
  return (s.pass_left ?? 0) > 0 && !(s.pass_until && s.pass_until < today);
}

export type Face = { label: string; value: string; sub: string };

/**
 * What a card shows for one customer. `money` formats a balance in agorot/cents in the card's currency.
 * The same face goes on the web card, the Apple pass (primary field and the line under it) and Google's points row.
 */
export function simpleFace(program: SimpleProgram, s: SimpleState, set: SimpleSettings, lang: string, money: (cents: number) => string, now = new Date()): Face {
  const w = simpleWords(lang);
  const today = israelDate(now);
  switch (program) {
    case "pass": {
      const left = s.pass_left ?? 0;
      const expired = !!(s.pass_until && s.pass_until < today);
      return {
        label: w.passLabel,
        value: left > 0 && !expired ? String(left) : w.passNone,
        sub: s.pass_until ? fill(expired ? w.passExpired : w.passUntil, { d: shortDate(s.pass_until, today) }) : left ? "" : w.passBuy,
      };
    }
    case "gift": {
      const b = s.balance ?? 0;
      return { label: w.giftLabel, value: money(b), sub: b > 0 ? w.giftSub : w.giftEmpty };
    }
    case "club":
      return { label: w.clubLabel, value: fill(w.clubValue, { p: set.club_pct ?? 0 }), sub: w.clubSub };
    case "service":
      return {
        label: s.due_label || w.serviceLabel,
        value: s.due_date ? shortDate(s.due_date, today) : w.serviceNone,
        sub: s.due_date && s.due_date < today ? w.serviceLate : w.serviceSub,
      };
    case "coupon": {
      const st = couponState(s, set, today);
      return {
        label: w.couponLabel,
        value: (set.reward ?? "").slice(0, 40),
        sub: st === "used" ? w.couponUsed : st === "expired" ? w.couponExpired : set.coupon_until ? fill(w.couponUntil, { d: shortDate(set.coupon_until, today) }) : w.couponOnce,
      };
    }
    case "attendance":
      return {
        label: w.attendLabel,
        value: String(s.month_count ?? 0),
        sub: s.due_date ? fill(w.attendPay, { d: shortDate(s.due_date, today) }) : w.attendNoPay,
      };
  }
}

/** Dated reminders: which date they follow and when (days before, Israel time). */
export type DueStage = { key: string; days: number; time: string };
export const DUE_STAGES: Partial<Record<SimpleProgram, DueStage[]>> = {
  service: [{ key: "m30", days: -30, time: "10:00" }, { key: "d7", days: -7, time: "10:00" }],
  attendance: [{ key: "d1", days: -1, time: "10:00" }],
  pass: [{ key: "d7", days: -7, time: "10:00" }],
};

export function parseDueSent(v: string | null | undefined): string[] {
  return (v ?? "").split(",").filter(Boolean);
}

/** Reminders already past for this date (a new date skips them, never sent late). */
export function passedDueStages(program: SimpleProgram, date: string, now: Date): string[] {
  return (DUE_STAGES[program] ?? []).filter((s) => israelTime(addDays(date, s.days), s.time)!.getTime() <= now.getTime()).map((s) => s.key);
}

/** The reminder to send now, if any: the latest one due and unsent (missed ones are marked, not sent). None after the date. */
export function dueStageNow(program: SimpleProgram, date: string, sent: string[], now: Date): { stage: string; skip: string[] } | null {
  if (now.getTime() >= israelTime(addDays(date, 1), "0:00")!.getTime()) return null;
  const pending = passedDueStages(program, date, now).filter((k) => !sent.includes(k));
  if (!pending.length) return null;
  return { stage: pending[pending.length - 1], skip: pending.slice(0, -1) };
}

/** The phone notification for a dated reminder or a low pass. */
export function simpleReminder(program: SimpleProgram, stage: string, lang: string, business: string, date: string, x: { label?: string | null; left?: number } = {}): string {
  const l = langOf(lang);
  const d = shortDate(date);
  if (program === "service") {
    const what = x.label || { he: "הטיפול הבא", ar: "الخدمة القادمة", en: "Your next service" }[l];
    if (l === "he") return stage === "m30" ? `${business}: ${what} בעוד חודש, ${d}. אפשר כבר לתאם.` : `${business}: ${what} בעוד שבוע, ${d}. נתאם?`;
    if (l === "ar") return stage === "m30" ? `${business}: ${what} بعد شهر، ${d}. يمكن الحجز الآن.` : `${business}: ${what} بعد أسبوع، ${d}. نحجز؟`;
    return stage === "m30" ? `${business}: ${what} is due in a month, ${d}. You can book it now.` : `${business}: ${what} is due in a week, ${d}. Shall we book it?`;
  }
  if (program === "attendance") {
    if (l === "he") return `${business}: תזכורת, מחר (${d}) מועד התשלום הבא.`;
    if (l === "ar") return `${business}: تذكير، غداً (${d}) موعد الدفعة القادمة.`;
    return `${business}: a reminder, the next payment is due tomorrow (${d}).`;
  }
  // The pass: a week before it expires, or few entries left.
  if (stage === "low") {
    const n = x.left ?? 0;
    if (l === "he") return n === 1 ? `${business}: נשארה כניסה אחת בכרטיסייה.` : `${business}: נשארו ${n} כניסות בכרטיסייה.`;
    if (l === "ar") return `${business}: بقي ${n} دخولات في بطاقتك.`;
    return `${business}: ${n} ${n === 1 ? "entry" : "entries"} left on your pass.`;
  }
  if (l === "he") return `${business}: הכרטיסייה בתוקף עד ${d}. נשארו ${x.left ?? 0} כניסות.`;
  if (l === "ar") return `${business}: البطاقة صالحة حتى ${d}. بقي ${x.left ?? 0} دخولات.`;
  return `${business}: your pass is valid until ${d}, with ${x.left ?? 0} entries left.`;
}

/** A sample of each simpler card, for design previews and the join page. */
export function sampleFace(program: SimpleProgram, lang: string, money: (cents: number) => string, set: SimpleSettings, now = new Date()): Face {
  const today = israelDate(now);
  const state: SimpleState = {
    pass_left: 7, pass_until: addDays(today, 60), balance: 15000, due_date: program === "attendance" ? addDays(today, 12) : addMonths(today, 3),
    due_label: null, coupon_used: null, month_count: 6,
  };
  return simpleFace(program, state, set, lang, money, now);
}
