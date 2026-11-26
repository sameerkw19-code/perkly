// The vet's reminders, run by the 2-minute job: a month, a week and the day before a vaccine or periodic treatment is due.
// Each goes out once, as a notification on the client's wallet card (Apple: the pass's reminder field; Google: a message).

import { cardLang, textsFor } from "../design";
import { addDays, israelDate } from "../library.ts";
import { careReminder, careStageNow, parseSent } from "../vet.ts";
import { liveDesign } from "./designs";
import { pushAppleCustomersNow } from "./apple-push";

const PER_RUN = 300;

type Row = {
  id: string; customer: string; business: string; next: string; sent: string | null; name: string; pet: string;
  google_wallet: string | null; b_name: string; reward: string; color: string;
};

export async function sendVetReminders(db: D1Database, nowIso: string): Promise<number> {
  const now = new Date(nowIso);
  const today = israelDate(now);
  const { results } = await db
    .prepare(
      `SELECT c.id, p.customer, c.business, c.next, c.sent, c.name, p.name AS pet, u.google_wallet, b.name AS b_name, b.reward, b.color
       FROM pet_care c JOIN pets p ON p.id = c.pet JOIN customers u ON u.id = p.customer JOIN businesses b ON b.id = c.business
       WHERE c.archived IS NULL AND p.archived IS NULL AND u.archived IS NULL AND c.next >= ?1 AND c.next <= ?2
         AND b.vet_on = 1 AND b.archived IS NULL AND b.suspended IS NULL
       ORDER BY c.next LIMIT ?3`,
    )
    .bind(today, addDays(today, 31), PER_RUN)
    .all<Row>();
  const titles = new Map<string, { title: string; lang: string }>();
  const pushed = new Set<string>();
  for (const r of results ?? []) {
    const sent = parseSent(r.sent);
    const due = careStageNow(r.next, sent, now);
    if (!due) continue;
    // Marked first, only if unchanged, so overlapping runs never both send.
    const next = [...sent, ...due.skip, due.stage].join(",");
    const m = await db.prepare("UPDATE pet_care SET sent = ? WHERE id = ? AND next = ? AND sent IS ?").bind(next, r.id, r.next, r.sent).run();
    if (!m.meta.changes) continue;
    let t = titles.get(r.business);
    if (!t) {
      const design = await liveDesign(db, { id: r.business, name: r.b_name, reward: r.reward, color: r.color });
      const lang = cardLang(design);
      t = { title: textsFor(design, lang).title || r.b_name, lang };
      titles.set(r.business, t);
    }
    const msg = careReminder(due.stage, t.lang, t.title, r.pet, r.name, r.next);
    await db.prepare("UPDATE customers SET appt_msg = ?, appt_updated = ? WHERE id = ?").bind(msg, nowIso, r.customer).run();
    if (r.google_wallet) {
      await db
        .prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'appt', ?, ?)")
        .bind(`vet:${r.id}:${r.next}:${due.stage}`, r.business, r.customer, nowIso, nowIso)
        .run();
    }
    pushed.add(r.customer);
  }
  if (pushed.size) {
    await pushAppleCustomersNow(db, [...pushed]);
    console.log(`vet reminders: ${pushed.size}`);
  }
  return pushed.size;
}
