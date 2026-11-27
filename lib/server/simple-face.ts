// The face of the six simpler cards for one customer, read from the database: the same on the web card,
// the Apple pass and the Google pass.
import { formatMoney } from "../cashback.ts";
import { isSimple, simpleFace, type Face } from "../programs.ts";
import { israelTime } from "../appointment.ts";
import { israelDate } from "../library.ts";
import { formatAppt } from "../appointment.ts";
import { shortDate } from "../programs.ts";
import { kindName } from "../vet.ts";

export async function simpleFaceFor(db: D1Database, customerId: string, lang: string): Promise<Face | null> {
  const row = await db
    .prepare(
      `SELECT c.pass_left, c.pass_until, c.balance, c.due_date, c.due_label, c.coupon_used, b.program, b.club_pct, b.coupon_until, b.reward, b.currency, b.vet_on
       FROM customers c JOIN businesses b ON b.id = c.business WHERE c.id = ?`,
    )
    .bind(customerId)
    .first<{ pass_left: number; pass_until: string | null; balance: number; due_date: string | null; due_label: string | null; coupon_used: string | null;
      program: string; club_pct: number; coupon_until: string | null; reward: string; currency: string; vet_on: number }>();
  if (!row || !isSimple(row.program)) return null;
  // A vet on the periodic-treatment card with the pet file on: the front shows the nearest thing from the pet file
  // (an appointment or a vaccine/treatment due), not an empty "next treatment".
  if (row.program === "service" && !row.due_date && row.vet_on) {
    const vet = await vetFace(db, customerId, lang);
    if (vet) return vet;
  }
  const currency = row.currency === "USD" ? "USD" : "ILS";
  const month_count = row.program === "attendance" ? await monthAttendance(db, customerId) : undefined;
  return simpleFace(row.program, { ...row, month_count }, { club_pct: row.club_pct, coupon_until: row.coupon_until, reward: row.reward }, lang, (m) => formatMoney(m, currency, lang));
}

/** Lessons a customer attended this month (Israel time). */
export async function monthAttendance(db: D1Database, customerId: string): Promise<number> {
  const today = israelDate(new Date());
  const start = israelTime(today.slice(0, 8) + "01", "0:00")!.toISOString();
  const row = await db.prepare("SELECT COUNT(*) AS n FROM events WHERE customer = ? AND kind = 'attend' AND created >= ?").bind(customerId, start).first<{ n: number }>();
  return row?.n ?? 0;
}


/** The nearest item in a client's pet file: the next appointment (with the animal and what it's for), else the next vaccine or treatment due. */
async function vetFace(db: D1Database, customerId: string, lang: string): Promise<Face | null> {
  const l = lang === "en" ? "en" : lang === "ar" ? "ar" : "he";
  const label = { he: "הטיפול הבא", ar: "العلاج القادم", en: "Next visit" }[l];
  const appt = await db
    .prepare("SELECT name, appt_at, appt_kind FROM pets WHERE customer = ? AND archived IS NULL AND appt_at > ? ORDER BY appt_at LIMIT 1")
    .bind(customerId, new Date(Date.now() - 3_600_000).toISOString())
    .first<{ name: string; appt_at: string; appt_kind: string | null }>();
  if (appt) return { label, value: formatAppt(appt.appt_at, l), sub: `${appt.name} · ${kindName(appt.appt_kind ?? "visit", l)}` };
  const today = israelDate(new Date());
  const care = await db
    .prepare(
      `SELECT p.name AS pet, c.name, c.next FROM pet_care c JOIN pets p ON p.id = c.pet
       WHERE p.customer = ? AND p.archived IS NULL AND c.archived IS NULL AND c.next IS NOT NULL ORDER BY c.next < ? DESC, c.next LIMIT 1`,
    )
    .bind(customerId, today)
    .first<{ pet: string; name: string; next: string }>();
  return care ? { label, value: shortDate(care.next, today), sub: `${care.pet} · ${care.name}` } : null;
}
