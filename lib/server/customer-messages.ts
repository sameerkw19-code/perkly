// Messages sent in the background by the cron trigger (worker/index.ts → runScheduled):
// the welcome after a customer saves the card to Google Wallet, birthday greetings (and the
// optional birthday gift), and the special-day messages businesses schedule.
// Everything goes through the wallet_outbox table, a few messages per run, so one run stays
// well inside the Worker's limits and a failed message is simply tried again later.

import { walletConfig, updateLoyaltyObject, type WalletConfig } from "./google-wallet";
import { liveDesign, passLook } from "./designs";
import { BIRTHDAY_GIFT_DAYS, noticeOn, type Design, type StampNotice } from "../design";
import { birthdayKeys, israelNow } from "../birthday";

type Env = { GOOGLE_WALLET_SA_KEY?: string; GOOGLE_WALLET_ISSUER_ID?: string; GOOGLE_WALLET_CLASS_ID?: string; WALLET_BATCH?: string };

/** Birthday messages and gifts go out from this hour (Israel time). */
export const BIRTHDAY_HOUR = 10;
/** Default number of wallet messages per run (each takes 2 calls to Google). */
const DEFAULT_BATCH = 12;
/** A welcome waits this long for the customer to finish saving the pass, then is retried a few times. */
export const WELCOME_DELAY_MS = 90_000;
const WELCOME_TRIES = 8;
const RETRY_MS = 3 * 60_000;
const FAIL_TRIES = 4;

/** Queues the welcome for a customer who just opened "Add to Google Wallet" (once per customer). */
export async function queueWelcome(db: D1Database, customer: { id: string; business: string }, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'welcome', ?, ?)")
    .bind(`welcome:${customer.id}`, customer.business, customer.id, new Date(now + WELCOME_DELAY_MS).toISOString(), new Date(now).toISOString())
    .run();
}

/** Special days whose time came: one outbox row per customer with the card in Google Wallet. */
async function queueSpecialDays(db: D1Database, nowIso: string): Promise<void> {
  const due = await db
    .prepare(
      `SELECT s.id, s.business FROM special_days s JOIN businesses b ON b.id = s.business
       WHERE s.queued IS NULL AND s.canceled IS NULL AND s.send_at <= ? AND b.archived IS NULL AND b.suspended IS NULL LIMIT 20`,
    )
    .bind(nowIso)
    .all<{ id: string; business: string }>();
  for (const s of due.results ?? []) {
    const [insert] = await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, campaign, not_before, created)
           SELECT 'sp:' || ? || ':' || id, business, id, 'special', ?, ?, ? FROM customers
           WHERE business = ? AND archived IS NULL AND google_wallet IS NOT NULL`,
        )
        .bind(s.id, s.id, nowIso, nowIso, s.business),
      db.prepare("UPDATE special_days SET queued = ? WHERE id = ?").bind(nowIso, s.id),
    ]);
    await db.prepare("UPDATE special_days SET recipients = ? WHERE id = ?").bind(insert.meta.changes ?? 0, s.id).run();
  }
}

/**
 * Once a day (from BIRTHDAY_HOUR): today's birthdays in businesses that collect birthdays.
 * Adds the birthday gift where the business turned it on, and queues the greeting for
 * customers with the card in Google Wallet where the business turned greetings on.
 */
export async function queueBirthdays(db: D1Database, today: { md: string; year: number }, nowIso: string): Promise<{ gifts: number; greetings: number }> {
  const keys = birthdayKeys(today.md, today.year);
  const rows = await db
    .prepare(
      `SELECT c.id, c.business, c.google_wallet, b.name, b.reward, b.color FROM customers c JOIN businesses b ON b.id = c.business
       WHERE c.birthday IN (${keys.map(() => "?").join(",")}) AND c.archived IS NULL
         AND b.birthdays = 1 AND b.archived IS NULL AND b.suspended IS NULL`,
    )
    .bind(...keys)
    .all<{ id: string; business: string; google_wallet: string | null; name: string; reward: string; color: string }>();
  const designs = new Map<string, Design>();
  let gifts = 0;
  let greetings = 0;
  for (const c of rows.results ?? []) {
    let design = designs.get(c.business);
    if (!design) {
      design = await liveDesign(db, { id: c.business, name: c.name, reward: c.reward, color: c.color });
      designs.set(c.business, design);
    }
    const statements: D1PreparedStatement[] = [];
    if (design.birthdayGift) {
      const expires = new Date(Date.parse(nowIso) + BIRTHDAY_GIFT_DAYS * 86_400_000).toISOString();
      statements.push(
        db
          .prepare("INSERT OR IGNORE INTO rewards(id, business, customer, earned, earned_event, expires) VALUES(?, ?, ?, ?, 'birthday', ?)")
          .bind(`bday:${c.id}:${today.year}`, c.business, c.id, nowIso, expires),
      );
    }
    if (design.walletBirthday && c.google_wallet) {
      statements.push(
        db
          .prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'birthday', ?, ?)")
          .bind(`bday:${c.id}:${today.year}`, c.business, c.id, nowIso, nowIso),
      );
    }
    if (!statements.length) continue;
    const results = await db.batch(statements);
    if (design.birthdayGift) gifts += results[0].meta.changes ?? 0;
    if (design.walletBirthday && c.google_wallet) greetings += results[results.length - 1].meta.changes ?? 0;
  }
  return { gifts, greetings };
}

type OutboxRow = {
  id: string; business: string; customer: string; kind: "welcome" | "birthday" | "special"; campaign: string | null; attempts: number;
  name: string; stamps: number; target: number; scan_code: string; google_wallet: string | null; archived: string | null;
  b_name: string; b_reward: string; b_color: string; reward_mode: string; b_archived: string | null; suspended: string | null;
  special_text: string | null; special_canceled: string | null;
};

/** Sends due outbox messages, oldest first. Returns how many were handled. */
export async function drainOutbox(db: D1Database, config: WalletConfig, nowIso: string, limit: number): Promise<number> {
  const due = await db
    .prepare(
      `SELECT o.id, o.business, o.customer, o.kind, o.campaign, o.attempts,
         c.name, c.stamps, c.target, c.scan_code, c.google_wallet, c.archived,
         b.name AS b_name, b.reward AS b_reward, b.color AS b_color, b.reward_mode, b.archived AS b_archived, b.suspended,
         s.text AS special_text, s.canceled AS special_canceled
       FROM wallet_outbox o JOIN customers c ON c.id = o.customer JOIN businesses b ON b.id = o.business
       LEFT JOIN special_days s ON s.id = o.campaign
       WHERE o.done IS NULL AND o.not_before <= ? ORDER BY o.not_before LIMIT ?`,
    )
    .bind(nowIso, limit)
    .all<OutboxRow>();
  const finish = (id: string, result: string) => db.prepare("UPDATE wallet_outbox SET done = ?, result = ? WHERE id = ?").bind(nowIso, result, id).run();
  const later = (id: string, ms: number) =>
    db.prepare("UPDATE wallet_outbox SET attempts = attempts + 1, not_before = ? WHERE id = ?").bind(new Date(Date.parse(nowIso) + ms).toISOString(), id).run();
  const designs = new Map<string, Design>();
  for (const o of due.results ?? []) {
    if (o.archived || o.b_archived || o.suspended || !o.google_wallet || o.special_canceled) { await finish(o.id, "skipped"); continue; }
    const business = { id: o.business, name: o.b_name, reward: o.b_reward, color: o.b_color };
    let design = designs.get(o.business);
    if (!design) { design = await liveDesign(db, business); designs.set(o.business, design); }
    const notice: StampNotice =
      o.kind === "special" ? { kind: "special", name: o.name, text: o.special_text ?? "" }
      : o.kind === "birthday" ? { kind: "birthday", name: o.name, gift: design.birthdayGift }
      : { kind: "welcome", name: o.name };
    // Turned off after it was queued (or a special day with no text): nothing to send.
    if (!noticeOn(design, notice.kind) || (notice.kind === "special" && !notice.text.trim())) { await finish(o.id, "off"); continue; }
    const look = await passLook(db, business, "", { stamps: o.stamps, target: o.target, notice });
    if (!look.notice) { await finish(o.id, "off"); continue; }
    const saved = await db
      .prepare("SELECT COUNT(*) AS n FROM rewards WHERE customer = ? AND redeemed IS NULL AND (expires IS NULL OR expires > ?)")
      .bind(o.customer, nowIso)
      .first<{ n: number }>();
    const rewards = (saved?.n ?? 0) + (o.reward_mode === "block" && o.stamps >= o.target ? 1 : 0);
    // Only the stamps and rewards are refreshed with the message; the pass keeps its look.
    const result = await updateLoyaltyObject(
      config,
      { customerId: o.customer, businessId: o.business, stamps: o.stamps, target: o.target, scanCode: o.scan_code, rewards },
      look.notice,
    );
    if (result === "updated") await finish(o.id, "sent");
    else if (result === "not_saved") {
      // A welcome may run before the customer finished saving the pass: try again in a few minutes.
      if (o.kind === "welcome" && o.attempts + 1 < WELCOME_TRIES) await later(o.id, RETRY_MS);
      else await finish(o.id, "not_saved");
    } else if (o.attempts + 1 < FAIL_TRIES) await later(o.id, 10 * 60_000);
    else await finish(o.id, "failed");
  }
  return due.results?.length ?? 0;
}

/** One cron run: queue what is due, then send a batch. */
export async function runScheduled(db: D1Database, env: Env, now = new Date()): Promise<void> {
  const nowIso = now.toISOString();
  const today = israelNow(now);
  if (today.hour >= BIRTHDAY_HOUR) {
    const ran = await db.prepare("SELECT last FROM job_runs WHERE name = 'birthdays'").first<{ last: string }>();
    if (ran?.last !== today.date) {
      // Marked first, so two overlapping runs never both do it. Queuing is idempotent anyway.
      await db.prepare("INSERT INTO job_runs(name, last) VALUES('birthdays', ?) ON CONFLICT(name) DO UPDATE SET last = excluded.last").bind(today.date).run();
      const r = await queueBirthdays(db, today, nowIso);
      console.log(`birthdays ${today.date}: ${r.gifts} gifts, ${r.greetings} greetings queued`);
    }
  }
  await queueSpecialDays(db, nowIso);
  const config = walletConfig(env);
  if (!config) return;
  const batch = Math.max(1, Math.min(100, Number(env.WALLET_BATCH) || DEFAULT_BATCH));
  const sent = await drainOutbox(db, config, nowIso, batch);
  if (sent) console.log(`wallet outbox: ${sent} handled`);
}
