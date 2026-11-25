// The library card on the server: a reader's books, the link to extend them, and an extension.
import { randomToken } from "./crypto";
import { extendedDue, israelDate, passedLoanStages, type Loan } from "../library.ts";

export type LoanSettings = { loan_days: number; loan_ext_days: number; loan_max_ext: number };

/** The books a reader has now, nearest return date first. */
export async function openLoans(db: D1Database, customerId: string): Promise<Loan[]> {
  const { results } = await db
    .prepare("SELECT id, title, due, extensions FROM loans WHERE customer = ? AND returned IS NULL ORDER BY due, created")
    .bind(customerId)
    .all<Loan>();
  return results ?? [];
}

/** The reader's own link key (made at the first loan): opens their books and lets them extend, nothing else. */
export async function ensureLoanKey(db: D1Database, customerId: string): Promise<string> {
  const row = await db.prepare("SELECT loan_key FROM customers WHERE id = ?").bind(customerId).first<{ loan_key: string | null }>();
  if (row?.loan_key) return row.loan_key;
  const key = randomToken(18);
  await db.prepare("UPDATE customers SET loan_key = ? WHERE id = ? AND loan_key IS NULL").bind(key, customerId).run();
  return (await db.prepare("SELECT loan_key FROM customers WHERE id = ?").bind(customerId).first<{ loan_key: string }>())!.loan_key;
}

/** Titles lent in this library lately, most used first: quick picks for the librarian. */
export async function recentTitles(db: D1Database, businessId: string, limit = 24): Promise<string[]> {
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { results } = await db
    .prepare("SELECT title, COUNT(*) AS n, MAX(created) AS last FROM loans WHERE business = ? AND created > ? GROUP BY title ORDER BY n DESC, last DESC LIMIT ?")
    .bind(businessId, since, limit)
    .all<{ title: string }>();
  return (results ?? []).map((r) => r.title);
}

/**
 * Extends one book: `loan_ext_days` more (from today when late), the reminders for the new date start over.
 * `limit`: the reader's own extension counts against the library's maximum; the librarian's does not.
 * Idempotent by request id (the event); returns the new date, or why not.
 */
export async function extendLoan(
  db: D1Database,
  x: { business: { id: string } & LoanSettings; customerId: string; loanId: string; requestId: string; actor: string; role: string; now: string; limit: boolean },
): Promise<{ ok: true; due: string; replayed?: boolean } | { ok: false; code: "unknown_loan" | "ext_limit" | "busy_retry" }> {
  const loan = await db.prepare("SELECT id, title, due, extensions FROM loans WHERE id = ? AND customer = ? AND business = ? AND returned IS NULL")
    .bind(x.loanId, x.customerId, x.business.id).first<Loan>();
  if (!loan) {
    const done = await db.prepare("SELECT id FROM events WHERE id = ? AND customer = ?").bind(x.requestId, x.customerId).first();
    return done ? { ok: true, due: "", replayed: true } : { ok: false, code: "unknown_loan" };
  }
  if (x.limit && loan.extensions >= x.business.loan_max_ext) return { ok: false, code: "ext_limit" };
  const today = israelDate(new Date(x.now));
  const due = extendedDue(loan.due, today, x.business.loan_ext_days);
  const sent = passedLoanStages(due, new Date(x.now)).join(",") || null;
  const r = await db.batch([
    db.prepare(
      `UPDATE loans SET due = ?, extensions = extensions + 1, sent = ? WHERE id = ? AND due = ? AND returned IS NULL
         AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`,
    ).bind(due, sent, loan.id, loan.due, x.requestId),
    db.prepare(
      `INSERT INTO events(id, customer, actor, kind, delta, created, business, branch, actor_role, stamps_after, note)
       SELECT ?, ?, ?, 'renew', 0, ?, ?, NULL, ?, (SELECT stamps FROM customers WHERE id = ?), ? WHERE changes() = 1`,
    ).bind(x.requestId, x.customerId, x.actor, x.now, x.business.id, x.role, x.customerId, `${loan.title} → ${due}`),
  ]);
  if (r[0].meta.changes) return { ok: true, due };
  const done = await db.prepare("SELECT id FROM events WHERE id = ? AND customer = ?").bind(x.requestId, x.customerId).first();
  return done ? { ok: true, due, replayed: true } : { ok: false, code: "busy_retry" };
}
