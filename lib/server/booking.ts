// Online booking on the server: the business's booking settings, free times, making and changing appointments,
// and keeping the customer's card in step (the next confirmed appointment shows on the wallet card, with reminders).

import { cardLang } from "../design";
import { formatAppt, formatTime, israelTime, passedStages } from "../appointment";
import { addDays, israelDate } from "../library";
import { parseHours } from "../calendar";
import {
  earliestOn, freeTimes, hoursOn, inWindow, parseBookServices, pickStaff, staffServes, toMin, unionTimes,
  type BookingRules, type BookService, type SpecialDay, type StaffRow,
} from "../booking";
import { randomToken, sha256 } from "./crypto";
import { releaseArchivedPhone } from "./customers";
import { liveDesign } from "./designs";
import { pushAppleCustomersNow } from "./apple-push";

export type BookingBusiness = {
  id: string; name: string; reward: string; color: string; target: number; currency: string; program: string;
  booking_on: number; booking_key: string | null; booking_auto: number; booking_days: number; booking_notice: number;
  booking_cancel_hours: number; booking_prices: number; booking_note: string | null;
  work_hours: string | null; appt_slot: number; services: string | null; archived?: string | null; suspended?: string | null;
};

const COLS = `id, name, reward, color, target, currency, program, booking_on, booking_key, booking_auto, booking_days, booking_notice,
  booking_cancel_hours, booking_prices, booking_note, work_hours, appt_slot, services, archived, suspended`;

export type Booking = {
  id: string; business: string; customer: string; staff: string; services: string; start: string; end: string; minutes: number;
  price: number; status: "pending" | "confirmed" | "cancelled" | "declined"; source: string; note: string | null; created: string; updated: string;
  cancelled_by: string | null;
};

/** Live statuses: they hold their time in the calendar. */
export const HOLDING = "('pending','confirmed')";

export async function bookingBusinessById(db: D1Database, id: string): Promise<BookingBusiness | null> {
  return db.prepare(`SELECT ${COLS} FROM businesses WHERE id = ?`).bind(id).first<BookingBusiness>();
}

/** The business behind a public booking link, only while booking is on. */
export async function bookingBusinessByKey(db: D1Database, key: string): Promise<BookingBusiness | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(key)) return null;
  return db.prepare(`SELECT ${COLS} FROM businesses WHERE booking_key = ? AND booking_on = 1 AND archived IS NULL`).bind(key).first<BookingBusiness>();
}

export function rulesOf(b: BookingBusiness): BookingRules {
  return { auto: !!b.booking_auto, days: b.booking_days, notice: b.booking_notice, cancelHours: b.booking_cancel_hours, prices: !!b.booking_prices };
}

export async function activeStaff(db: D1Database, businessId: string): Promise<StaffRow[]> {
  const { results } = await db
    .prepare("SELECT id, name, hours, services FROM booking_staff WHERE business = ? AND archived IS NULL ORDER BY sort, created")
    .bind(businessId)
    .all<StaffRow>();
  return results ?? [];
}

export async function specialsBetween(db: D1Database, businessId: string, from: string, to: string): Promise<SpecialDay[]> {
  const { results } = await db
    .prepare("SELECT staff, date, hours, note FROM booking_days WHERE business = ? AND date >= ? AND date <= ? ORDER BY date")
    .bind(businessId, from, to)
    .all<SpecialDay>();
  return results ?? [];
}

/** UTC bounds of an Israel date. */
export function dayBounds(date: string): { from: string; to: string } {
  return { from: israelTime(date, "0:00")!.toISOString(), to: israelTime(addDays(date, 1), "0:00")!.toISOString() };
}

type Ctx = { staff: StaffRow[]; specials: SpecialDay[]; rows: { id: string; staff: string; start: string; end: string }[] };

/** Everything the free times of dates `from`..`to` depend on, in three queries. */
async function loadCtx(db: D1Database, businessId: string, from: string, to: string): Promise<Ctx> {
  const a = dayBounds(from).from;
  const z = dayBounds(to).to;
  const [staff, specials, rows] = await Promise.all([
    activeStaff(db, businessId),
    specialsBetween(db, businessId, from, to),
    db.prepare(`SELECT id, staff, start, "end" FROM bookings WHERE business = ? AND status IN ${HOLDING} AND start < ? AND "end" > ?`)
      .bind(businessId, z, a).all<{ id: string; staff: string; start: string; end: string }>().then((r) => r.results ?? []),
  ]);
  return { staff, specials, rows };
}

export type FreeQuery = {
  business: BookingBusiness; date: string; minutes: number; serviceIds: string[];
  /** A person's id, or "" for anyone who gives these services. */
  staff: string;
  now: Date;
  /** The business itself books: no notice and no window (past times today stay closed). */
  asBusiness?: boolean;
  /** Moving an appointment: its own time is not busy. */
  skipBooking?: string;
};
type Free = { times: string[]; free: Map<string, string[]>; load: Map<string, number>; order: string[] };

function freeFrom(ctx: Ctx, q: FreeQuery): Free {
  const empty: Free = { times: [], free: new Map(), load: new Map(), order: [] };
  const today = israelDate(q.now);
  const rules = rulesOf(q.business);
  if (!q.asBusiness && !inWindow(q.date, today, rules.days)) return empty;
  if (q.asBusiness && q.date < today) return empty;
  const nowMin = toMin(formatTime(q.now.toISOString()));
  const notBefore = q.asBusiness ? (q.date === today ? nowMin : -1) : earliestOn(q.date, today, nowMin, rules.notice);
  if (notBefore === null) return empty;
  const people = ctx.staff.filter((s) => (q.staff ? s.id === q.staff : true) && staffServes(s, q.serviceIds));
  if (!people.length) return empty;
  // The day's appointments, by person, as [start, end) minutes since that midnight.
  const { from, to } = dayBounds(q.date);
  const base = Date.parse(from);
  const busy = new Map<string, [number, number][]>();
  const load = new Map<string, number>();
  for (const r of ctx.rows) {
    if (r.id === q.skipBooking || r.start >= to || r.end <= from) continue;
    busy.set(r.staff, [...(busy.get(r.staff) ?? []), [Math.round((Date.parse(r.start) - base) / 60_000), Math.round((Date.parse(r.end) - base) / 60_000)]]);
    load.set(r.staff, (load.get(r.staff) ?? 0) + 1);
  }
  const hours = parseHours(q.business.work_hours);
  const step = q.business.appt_slot || 30;
  const free = new Map<string, string[]>();
  for (const s of people) free.set(s.id, freeTimes(hoursOn(q.date, s, hours, ctx.specials), step, q.minutes, busy.get(s.id) ?? [], notBefore));
  return { times: unionTimes(free), free, load, order: people.map((p) => p.id) };
}

/** Free start times on a date, and who is free at each. */
export async function freeOn(db: D1Database, q: FreeQuery): Promise<Free> {
  return freeFrom(await loadCtx(db, q.business.id, q.date, q.date), q);
}

/** Which of `count` days from `from` have any free time (the day strip on the booking page). */
export async function openDays(db: D1Database, q: Omit<FreeQuery, "date">, from: string, count: number): Promise<string[]> {
  const to = addDays(from, count - 1);
  const ctx = await loadCtx(db, q.business.id, from, to);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(from, i);
    if (freeFrom(ctx, { ...q, date }).times.length) out.push(date);
  }
  return out;
}

export type NewBooking = {
  business: BookingBusiness; customer: string; date: string; time: string; services: BookService[]; minutes: number; price: number;
  /** A person, or "" for anyone free then. */
  staff: string;
  status: "pending" | "confirmed"; source: "online" | "staff"; note: string | null; actor: string | null; now: Date;
  asBusiness?: boolean; manageHash?: string | null; id?: string;
};

/**
 * Books a time. Checked against the free times, then written only if nothing overlaps it for that person
 * (one statement, so two clients can't take the same time). Null when the time is not free.
 */
export async function createBooking(db: D1Database, n: NewBooking): Promise<{ id: string; staff: string; start: string } | null> {
  const f = await freeOn(db, { business: n.business, date: n.date, minutes: n.minutes, serviceIds: n.services.map((s) => s.id), staff: n.staff, now: n.now, asBusiness: n.asBusiness });
  const staff = n.staff ? (f.free.get(n.staff)?.includes(n.time) ? n.staff : null) : pickStaff(n.time, f.free, f.load, f.order);
  if (!staff) return null;
  const at = israelTime(n.date, n.time);
  if (!at) return null;
  const start = at.toISOString();
  const end = new Date(at.getTime() + n.minutes * 60_000).toISOString();
  const id = n.id ?? crypto.randomUUID();
  const iso = n.now.toISOString();
  const r = await db
    .prepare(
      `INSERT INTO bookings(id, business, customer, staff, services, start, "end", minutes, price, status, source, note, manage_hash, created, updated, actor)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, ?15
       WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE business = ?2 AND staff = ?4 AND status IN ${HOLDING} AND start < ?7 AND "end" > ?6)`,
    )
    .bind(id, n.business.id, n.customer, staff, JSON.stringify(n.services), start, end, n.minutes, n.price, n.status, n.source, n.note, n.manageHash ?? null, iso, n.actor)
    .run();
  return r.meta.changes ? { id, staff, start } : null;
}

/** Moves an appointment to another time (and maybe person). Null when the new time is not free. */
export async function moveBooking(db: D1Database, b: BookingBusiness, booking: Booking, date: string, time: string, staff: string, now: Date, asBusiness: boolean, status: Booking["status"]): Promise<{ staff: string; start: string } | null> {
  const services = JSON.parse(booking.services) as BookService[];
  const f = await freeOn(db, { business: b, date, minutes: booking.minutes, serviceIds: services.map((s) => s.id), staff, now, asBusiness, skipBooking: booking.id });
  const who = staff ? (f.free.get(staff)?.includes(time) ? staff : null) : pickStaff(time, f.free, f.load, f.order);
  if (!who) return null;
  const at = israelTime(date, time);
  if (!at) return null;
  const start = at.toISOString();
  const end = new Date(at.getTime() + booking.minutes * 60_000).toISOString();
  const r = await db
    .prepare(
      `UPDATE bookings SET staff = ?1, start = ?2, "end" = ?3, status = ?4, updated = ?5
       WHERE id = ?6 AND updated = ?7 AND status IN ${HOLDING}
         AND NOT EXISTS (SELECT 1 FROM bookings o WHERE o.business = ?8 AND o.staff = ?1 AND o.id != ?6 AND o.status IN ${HOLDING} AND o.start < ?3 AND o."end" > ?2)`,
    )
    .bind(who, start, end, status, now.toISOString(), booking.id, booking.updated, b.id)
    .run();
  return r.meta.changes ? { staff: who, start } : null;
}

/** Changes a booking's status (only from a live one). False when it already changed. */
export async function setStatus(db: D1Database, id: string, from: Booking["status"][], to: Booking["status"], now: string, by: string | null): Promise<boolean> {
  const r = await db
    .prepare(`UPDATE bookings SET status = ?, updated = ?, cancelled_by = ? WHERE id = ? AND status IN (${from.map(() => "?").join(",")})`)
    .bind(to, now, to === "cancelled" || to === "declined" ? by : null, id, ...from)
    .run();
  return !!r.meta.changes;
}

const WORDS = {
  he: { booked: "✅ התור נקבע: {when}", pending: "⏳ הבקשה לתור נשלחה ({when}). נעדכן כשהעסק יאשר.", moved: "🔁 התור הועבר ל{when}", cancelled: "❌ התור ב{when} בוטל", declined: "❌ לא ניתן לקבוע את התור ב{when}. אפשר לבחור זמן אחר." },
  ar: { booked: "✅ تم تحديد الموعد: {when}", pending: "⏳ تم إرسال طلب الموعد ({when}). سنبلغك عند موافقة المحل.", moved: "🔁 تم نقل الموعد إلى {when}", cancelled: "❌ تم إلغاء الموعد {when}", declined: "❌ لا يمكن تحديد الموعد {when}. يمكنك اختيار وقت آخر." },
  en: { booked: "✅ Appointment booked: {when}", pending: "⏳ Appointment request sent ({when}). We'll let you know when it's confirmed.", moved: "🔁 Appointment moved to {when}", cancelled: "❌ Your appointment on {when} was cancelled", declined: "❌ The appointment on {when} could not be booked. Please pick another time." },
};
export type CardNotice = keyof typeof WORDS.he;

export function noticeText(kind: CardNotice, lang: string, startIso: string): string {
  const l = lang === "en" ? "en" : lang === "ar" ? "ar" : "he";
  return WORDS[l][kind].replace("{when}", formatAppt(startIso, l));
}

/**
 * Puts the customer's next confirmed appointment on their card (customers.appt_at, which the wallet pass and the
 * reminders read). Reminders already due for that time are marked sent, so none goes out late. With `notice`,
 * the card also gets a one-line message (a notification on the phone).
 */
export async function syncCard(db: D1Database, customerId: string, now: Date, notice?: { kind: CardNotice; start: string }): Promise<void> {
  const iso = now.toISOString();
  const next = await db
    .prepare(`SELECT start, minutes, services FROM bookings WHERE customer = ? AND status = 'confirmed' AND start > ? ORDER BY start LIMIT 1`)
    .bind(customerId, new Date(now.getTime() - 3_600_000).toISOString())
    .first<{ start: string; minutes: number; services: string }>();
  const c = await db
    .prepare("SELECT c.id, c.business, c.appt_at, c.google_wallet, b.name AS b_name, b.reward, b.color FROM customers c JOIN businesses b ON b.id = c.business WHERE c.id = ?")
    .bind(customerId)
    .first<{ id: string; business: string; appt_at: string | null; google_wallet: string | null; b_name: string; reward: string; color: string }>();
  if (!c) return;
  const at = next?.start ?? null;
  const service = next ? (JSON.parse(next.services) as BookService[]).map((s) => s.name).join(" + ").slice(0, 120) : null;
  const sent = at ? passedStages(new Date(at), now).join(",") || null : null;
  let msg: string | null = null;
  if (notice) {
    const design = await liveDesign(db, { id: c.business, name: c.b_name, reward: c.reward, color: c.color });
    msg = noticeText(notice.kind, cardLang(design), notice.start);
  }
  if (at === c.appt_at && !msg) return;
  await db
    .prepare(
      `UPDATE customers SET appt_at = ?1, appt_service = ?2, appt_min = ?3,
         appt_sent = CASE WHEN appt_at IS ?1 THEN appt_sent ELSE ?4 END,
         appt_msg = COALESCE(?5, CASE WHEN appt_at IS ?1 THEN appt_msg ELSE NULL END), appt_updated = ?6
       WHERE id = ?7`,
    )
    .bind(at, service, next?.minutes ?? null, sent, msg, iso, customerId)
    .run();
  if (msg && c.google_wallet) {
    await db
      .prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'appt', ?, ?)")
      .bind(`book:${customerId}:${iso}`, c.business, customerId, iso, iso)
      .run();
  }
  await pushAppleCustomersNow(db, [customerId]);
}

/**
 * The customer with this phone at the business, or a new one (with a new card link, returned only then).
 * A removed customer's number starts a new card.
 */
export async function customerForPhone(db: D1Database, b: { id: string; target: number }, name: string, phone: string, consents: { terms: boolean; marketing: boolean }, source: "booking" | "staff"): Promise<{ id: string; created: boolean; secret?: string }> {
  const existing = await db.prepare("SELECT id FROM customers WHERE business = ? AND phone = ? AND archived IS NULL").bind(b.id, phone).first<{ id: string }>();
  if (existing) return { id: existing.id, created: false };
  const id = crypto.randomUUID();
  const secret = randomToken(24);
  const scan = randomToken(16);
  const now = new Date().toISOString();
  const [, r] = await db.batch([
    releaseArchivedPhone(db, b.id, phone),
    db.prepare(
      `INSERT OR IGNORE INTO customers(id, business, name, phone, token, stamps, target, created, card_hash, scan_code, consent_terms, consent_marketing, source)
       VALUES(?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, b.id, name, phone, scan, b.target, now, await sha256(secret), scan, consents.terms ? now : null, consents.marketing ? 1 : 0, source),
  ]);
  if (r.meta.changes) return { id, created: true, secret };
  // Someone else just added the same number.
  const again = await db.prepare("SELECT id FROM customers WHERE business = ? AND phone = ? AND archived IS NULL").bind(b.id, phone).first<{ id: string }>();
  return { id: again!.id, created: false };
}

/** A new secret for a client's manage link, and its hash for the booking row. */
export async function manageSecret(): Promise<{ secret: string; hash: string }> {
  const secret = randomToken(24);
  return { secret, hash: await sha256(secret) };
}

export async function bookingByManage(db: D1Database, secret: string): Promise<Booking | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(secret)) return null;
  return db.prepare("SELECT * FROM bookings WHERE manage_hash = ?").bind(await sha256(secret)).first<Booking>();
}

/** Turns booking on: a booking link and a first calendar (named after the business) when there is none yet. */
export async function ensureBookingSetup(db: D1Database, b: { id: string; name: string }): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE businesses SET booking_key = ? WHERE id = ? AND booking_key IS NULL").bind(randomToken(9), b.id),
    db.prepare(
      `INSERT INTO booking_staff(id, business, name, sort, created)
       SELECT ?, ?, ?, 0, ? WHERE NOT EXISTS (SELECT 1 FROM booking_staff WHERE business = ? AND archived IS NULL)`,
    ).bind(crypto.randomUUID(), b.id, b.name.slice(0, 60), now, b.id),
  ]);
}

/** The Israel date and "HH:MM" of a moment. */
export function israelDateTime(iso: string): { date: string; time: string } {
  return { date: israelDate(new Date(iso)), time: formatTime(iso) };
}

export { parseBookServices };
