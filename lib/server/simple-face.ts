// The face of the six simpler cards for one customer, read from the database: the same on the web card,
// the Apple pass and the Google pass.
import { formatMoney } from "../cashback.ts";
import { isSimple, simpleFace, type Face } from "../programs.ts";
import { israelTime } from "../appointment.ts";
import { israelDate } from "../library.ts";

export async function simpleFaceFor(db: D1Database, customerId: string, lang: string): Promise<Face | null> {
  const row = await db
    .prepare(
      `SELECT c.pass_left, c.pass_until, c.balance, c.due_date, c.due_label, c.coupon_used, b.program, b.club_pct, b.coupon_until, b.reward, b.currency
       FROM customers c JOIN businesses b ON b.id = c.business WHERE c.id = ?`,
    )
    .bind(customerId)
    .first<{ pass_left: number; pass_until: string | null; balance: number; due_date: string | null; due_label: string | null; coupon_used: string | null;
      program: string; club_pct: number; coupon_until: string | null; reward: string; currency: string }>();
  if (!row || !isSimple(row.program)) return null;
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

