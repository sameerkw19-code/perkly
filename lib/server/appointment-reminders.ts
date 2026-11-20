// The appointments card: reminders the day before, that morning and an hour before.
// Run by the 2-minute job. Each reminder goes out once: the iPhone gets the pass again with the reminder
// (shown as a notification), and Google Wallet gets it as a message.

import { cardLang, textsFor } from "../design";
import { dueStage, parseSent, reminderText } from "../appointment";
import { liveDesign } from "./designs";
import { pushAppleCustomersNow } from "./apple-push";

/** Customers handled per run. */
const PER_RUN = 200;

type Row = { id: string; business: string; appt_at: string; appt_sent: string | null; google_wallet: string | null; b_name: string; reward: string; color: string };

export async function sendApptReminders(db: D1Database, nowIso: string): Promise<number> {
  const now = new Date(nowIso);
  // Appointments in the next 25 hours (the day-before reminder is the earliest).
  const until = new Date(now.getTime() + 25 * 3_600_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT c.id, c.business, c.appt_at, c.appt_sent, c.google_wallet, b.name AS b_name, b.reward, b.color
       FROM customers c JOIN businesses b ON b.id = c.business
       WHERE c.appt_at > ? AND c.appt_at <= ? AND c.archived IS NULL
         AND b.program = 'appointments' AND b.archived IS NULL AND b.suspended IS NULL
       ORDER BY c.appt_at LIMIT ?`,
    )
    .bind(nowIso, until, PER_RUN)
    .all<Row>();
  const titles = new Map<string, { title: string; lang: string }>();
  const pushed: string[] = [];
  for (const c of results ?? []) {
    const sent = parseSent(c.appt_sent);
    const due = dueStage(new Date(c.appt_at), sent, now);
    if (!due) continue;
    let t = titles.get(c.business);
    if (!t) {
      const design = await liveDesign(db, { id: c.business, name: c.b_name, reward: c.reward, color: c.color });
      const lang = cardLang(design);
      t = { title: textsFor(design, lang).title || c.b_name, lang };
      titles.set(c.business, t);
    }
    const msg = reminderText(due.stage, t.lang, t.title, c.appt_at);
    const nextSent = [...sent, ...due.skip, due.stage].join(",");
    // Marked first (only if unchanged), so two overlapping runs never both send.
    const r = await db
      .prepare("UPDATE customers SET appt_sent = ?, appt_msg = ?, appt_updated = ? WHERE id = ? AND appt_at = ? AND appt_sent IS ?")
      .bind(nextSent, msg, nowIso, c.id, c.appt_at, c.appt_sent)
      .run();
    if (!r.meta.changes) continue;
    if (c.google_wallet) {
      await db
        .prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'appt', ?, ?)")
        .bind(`appt:${c.id}:${c.appt_at}:${due.stage}`, c.business, c.id, nowIso, nowIso)
        .run();
    }
    pushed.push(c.id);
  }
  if (pushed.length) {
    await pushAppleCustomersNow(db, pushed);
    console.log(`appointment reminders: ${pushed.length}`);
  }
  return pushed.length;
}
