// Dated reminders of the simpler cards, run by the 2-minute job:
//   service    — a month and a week before the next service date
//   attendance — the day before the next payment date
//   pass       — a week before the pass expires (while entries are left)
// Each goes out once, as a notification on the wallet pass (Apple: the pass's reminder field; Google: a message).
// The latest reminder is kept in customers.appt_msg, like the appointment and library reminders.

import { cardLang, textsFor } from "../design";
import { addDays, israelDate } from "../library.ts";
import { dueStageNow, parseDueSent, simpleReminder, type SimpleProgram } from "../programs.ts";
import { liveDesign } from "./designs";
import { pushAppleCustomersNow } from "./apple-push";

const PER_RUN = 300;

type Row = {
  id: string; business: string; program: SimpleProgram; date: string; due_label: string | null; due_sent: string | null; pass_left: number;
  google_wallet: string | null; b_name: string; reward: string; color: string;
};

export async function sendDueReminders(db: D1Database, nowIso: string): Promise<number> {
  const now = new Date(nowIso);
  const today = israelDate(now);
  const { results } = await db
    .prepare(
      `SELECT c.id, c.business, b.program, c.due_date AS date, c.due_label, c.due_sent, c.pass_left, c.google_wallet, b.name AS b_name, b.reward, b.color
       FROM customers c JOIN businesses b ON b.id = c.business
       WHERE b.program IN ('service', 'attendance') AND c.due_date >= ?1 AND c.due_date <= ?2
         AND c.archived IS NULL AND b.archived IS NULL AND b.suspended IS NULL
       UNION ALL
       SELECT c.id, c.business, b.program, c.pass_until AS date, NULL, c.due_sent, c.pass_left, c.google_wallet, b.name, b.reward, b.color
       FROM customers c JOIN businesses b ON b.id = c.business
       WHERE b.program = 'pass' AND c.pass_left > 0 AND c.pass_until >= ?1 AND c.pass_until <= ?3
         AND c.archived IS NULL AND b.archived IS NULL AND b.suspended IS NULL
       LIMIT ?4`,
    )
    .bind(today, addDays(today, 31), addDays(today, 8), PER_RUN)
    .all<Row>();
  const titles = new Map<string, { title: string; lang: string }>();
  const pushed: string[] = [];
  for (const r of results ?? []) {
    const sent = parseDueSent(r.due_sent);
    const due = dueStageNow(r.program, r.date, sent, now);
    if (!due) continue;
    // Marked first, only if unchanged, so overlapping runs never both send.
    const next = [...sent, ...due.skip, due.stage].join(",");
    const col = r.program === "pass" ? "pass_until" : "due_date";
    const m = await db.prepare(`UPDATE customers SET due_sent = ? WHERE id = ? AND ${col} = ? AND due_sent IS ?`).bind(next, r.id, r.date, r.due_sent).run();
    if (!m.meta.changes) continue;
    let t = titles.get(r.business);
    if (!t) {
      const design = await liveDesign(db, { id: r.business, name: r.b_name, reward: r.reward, color: r.color });
      const lang = cardLang(design);
      t = { title: textsFor(design, lang).title || r.b_name, lang };
      titles.set(r.business, t);
    }
    const msg = simpleReminder(r.program, due.stage, t.lang, t.title, r.date, { label: r.due_label, left: r.pass_left });
    await db.prepare("UPDATE customers SET appt_msg = ?, appt_updated = ? WHERE id = ?").bind(msg, nowIso, r.id).run();
    if (r.google_wallet) {
      await db
        .prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'appt', ?, ?)")
        .bind(`due:${r.id}:${nowIso.slice(0, 16)}`, r.business, r.id, nowIso, nowIso)
        .run();
    }
    pushed.push(r.id);
  }
  if (pushed.length) {
    await pushAppleCustomersNow(db, pushed);
    console.log(`dated reminders: ${pushed.length}`);
  }
  return pushed.length;
}
