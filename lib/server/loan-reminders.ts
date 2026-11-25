// The library card: reminders a week before the return date, the day before, and on the day.
// Run by the 2-minute job. Each reminder goes out once: the iPhone gets the pass again with the reminder (shown as
// a notification), and Google Wallet gets it as a message. The latest reminder is kept in customers.appt_msg,
// the same place as the appointments card's reminders (a business has one kind of card).

import { cardLang, textsFor } from "../design";
import { addDays, dueLoanStage, israelDate, loanReminder, parseLoanSent, type LoanStage } from "../library.ts";
import { liveDesign } from "./designs";
import { pushAppleCustomersNow } from "./apple-push";

/** Books handled per run. */
const PER_RUN = 300;

type Row = {
  id: string; customer: string; business: string; title: string; due: string; extensions: number; sent: string | null;
  google_wallet: string | null; b_name: string; reward: string; color: string; loan_max_ext: number;
};

export async function sendLoanReminders(db: D1Database, nowIso: string): Promise<number> {
  const now = new Date(nowIso);
  const today = israelDate(now);
  // Books due from today to a week ahead (the week-before reminder is the earliest).
  const { results } = await db
    .prepare(
      `SELECT l.id, l.customer, l.business, l.title, l.due, l.extensions, l.sent, c.google_wallet, b.name AS b_name, b.reward, b.color, b.loan_max_ext
       FROM loans l JOIN customers c ON c.id = l.customer JOIN businesses b ON b.id = l.business
       WHERE l.returned IS NULL AND l.due >= ? AND l.due <= ? AND c.archived IS NULL
         AND b.program = 'library' AND b.archived IS NULL AND b.suspended IS NULL
       ORDER BY l.due LIMIT ?`,
    )
    .bind(today, addDays(today, 7), PER_RUN)
    .all<Row>();
  // What is due now, per reader: one notification even when several books are due.
  const byCustomer = new Map<string, { row: Row; stage: LoanStage; nextSent: string }[]>();
  for (const l of results ?? []) {
    const sent = parseLoanSent(l.sent);
    const due = dueLoanStage(l.due, sent, now);
    if (!due) continue;
    const list = byCustomer.get(l.customer) ?? [];
    list.push({ row: l, stage: due.stage, nextSent: [...sent, ...due.skip, due.stage].join(",") });
    byCustomer.set(l.customer, list);
  }
  const titles = new Map<string, { title: string; lang: string }>();
  const pushed: string[] = [];
  for (const [customer, items] of byCustomer) {
    // Marked first (only if unchanged), so two overlapping runs never both send.
    const marked: typeof items = [];
    for (const it of items) {
      const r = await db.prepare("UPDATE loans SET sent = ? WHERE id = ? AND due = ? AND returned IS NULL AND sent IS ?")
        .bind(it.nextSent, it.row.id, it.row.due, it.row.sent).run();
      if (r.meta.changes) marked.push(it);
    }
    if (!marked.length) continue;
    const first = marked[0].row;
    let t = titles.get(first.business);
    if (!t) {
      const design = await liveDesign(db, { id: first.business, name: first.b_name, reward: first.reward, color: first.color });
      const lang = cardLang(design);
      t = { title: textsFor(design, lang).title || first.b_name, lang };
      titles.set(first.business, t);
    }
    // Books with the same date and reminder share a sentence.
    const groups = new Map<string, typeof marked>();
    for (const it of marked) groups.set(`${it.stage}|${it.row.due}`, [...(groups.get(`${it.stage}|${it.row.due}`) ?? []), it]);
    const msg = [...groups.values()]
      .map((g) => loanReminder(g[0].stage, t!.lang, t!.title, g.map((x) => x.row.title), g[0].row.due, g.some((x) => x.row.extensions < x.row.loan_max_ext)))
      .join(" ")
      .slice(0, 500);
    await db.prepare("UPDATE customers SET appt_msg = ?, appt_updated = ? WHERE id = ?").bind(msg, nowIso, customer).run();
    if (first.google_wallet) {
      await db
        .prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'appt', ?, ?)")
        .bind(`loan:${customer}:${nowIso.slice(0, 16)}`, first.business, customer, nowIso, nowIso)
        .run();
    }
    pushed.push(customer);
  }
  if (pushed.length) {
    await pushAppleCustomersNow(db, pushed);
    console.log(`library reminders: ${pushed.length}`);
  }
  return pushed.length;
}
