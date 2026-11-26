// Messages sent in the background by the cron trigger (worker/index.ts → runScheduled):
// the welcome after a customer saves the card to Google Wallet, birthday greetings (and the
// optional birthday gift), and the special-day messages businesses schedule.
// Everything goes through the wallet_outbox table, a few messages per run, so one run stays
// well inside the Worker's limits and a failed message is simply tried again later.

import { passProgram } from "./balance-pass";
import { sendLoanReminders } from "./loan-reminders";
import { sendDueReminders } from "./due-reminders";
import { walletConfig, updateLoyaltyObject, type WalletConfig } from "./google-wallet";
import { liveDesign, passLook } from "./designs";
import { BIRTHDAY_GIFT_DAYS, MISS_YOU_DAYS, noticeOn, type Design, type StampNotice } from "../design";
import { birthdayKeys, israelNow } from "../birthday";
import { nearPhase } from "../near-text";
import { sendMonthlyReports } from "./monthly-report";
import { sendApptReminders } from "./appointment-reminders";
import type { MailEnv } from "./mailer";
import { pushAppleBusinessNow, pushAppleCustomersNow } from "./apple-push";

type Env = { GOOGLE_WALLET_SA_KEY?: string; GOOGLE_WALLET_ISSUER_ID?: string; GOOGLE_WALLET_CLASS_ID?: string; WALLET_BATCH?: string };

/** Birthday messages and gifts go out from this hour (Israel time). */
export const BIRTHDAY_HOUR = 10;
/** Default number of wallet messages per run (each takes 2 calls to Google). */
const DEFAULT_BATCH = 12;
/** A welcome waits this long for the customer to finish saving the pass, then is retried a few times. */
export const WELCOME_DELAY_MS = 90_000;
const WELCOME_TRIES = 8;
/** How long after "Add to Google Wallet" a missing pass still counts as "not saved yet". */
export const SAVE_GRACE_MS = 24 * 60 * 60_000;
const RETRY_MS = 3 * 60_000;
const FAIL_TRIES = 4;

/**
 * Queues a refresh of one customer's pass (after a failed update, or for a new card design).
 * A refresh already waiting is moved to now instead of adding another.
 */
export function queueSync(db: D1Database, customer: { id: string; business: string }, origin: string, delayMs = 0, now = Date.now()) {
  const at = new Date(now + delayMs).toISOString();
  return db
    .prepare(
      `INSERT INTO wallet_outbox(id, business, customer, kind, not_before, created, origin) VALUES(?, ?, ?, 'sync', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET done = NULL, result = NULL, attempts = 0, not_before = excluded.not_before, origin = excluded.origin`,
    )
    .bind(`sync:${customer.id}`, customer.business, customer.id, at, new Date(now).toISOString(), origin);
}

/** Queues the welcome for a customer who just opened "Add to Google Wallet" (once per customer). */
export async function queueWelcome(db: D1Database, customer: { id: string; business: string }, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'welcome', ?, ?)")
    .bind(`welcome:${customer.id}`, customer.business, customer.id, new Date(now + WELCOME_DELAY_MS).toISOString(), new Date(now).toISOString())
    .run();
}

/** Special days whose time came: one outbox row per customer with the card in Google Wallet. */
/**
 * Sends one message to the business's customers: Google Wallet passes through the outbox (a batch per run),
 * Apple Wallet passes by setting the business's latest message and pushing every iPhone, which fetches the
 * pass again and shows the message as a notification. Marked queued first, so it never goes out twice.
 */
/** How many customers have the card in Google Wallet, in Apple Wallet, and in at least one of them. */
export async function walletReach(db: D1Database, business: string): Promise<{ google: number; apple: number; total: number }> {
  const r = await db
    .prepare(
      `SELECT SUM(g) AS google, SUM(a) AS apple, SUM(CASE WHEN g + a > 0 THEN 1 ELSE 0 END) AS total FROM (
         SELECT (c.google_wallet IS NOT NULL) AS g, EXISTS(SELECT 1 FROM apple_registrations r WHERE r.serial = c.id) AS a
         FROM customers c WHERE c.business = ? AND c.archived IS NULL)`,
    )
    .bind(business)
    .first<{ google: number | null; apple: number | null; total: number | null }>();
  return { google: r?.google ?? 0, apple: r?.apple ?? 0, total: r?.total ?? 0 };
}

export async function sendSpecial(db: D1Database, s: { id: string; business: string; text: string }, nowIso: string): Promise<void> {
  const claimed = await db.prepare("UPDATE special_days SET queued = ? WHERE id = ? AND queued IS NULL AND canceled IS NULL").bind(nowIso, s.id).run();
  if (!claimed.meta.changes) return;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, campaign, not_before, created)
         SELECT 'sp:' || ? || ':' || id, business, id, 'special', ?, ?, ? FROM customers
         WHERE business = ? AND archived IS NULL AND google_wallet IS NOT NULL`,
      )
      .bind(s.id, s.id, nowIso, nowIso, s.business),
    db.prepare("UPDATE businesses SET news_text = ?, news_at = ? WHERE id = ?").bind(s.text, nowIso, s.business),
  ]);
  // Customers with the card in a wallet (Google, Apple or both), counted once.
  const reach = await walletReach(db, s.business);
  await db.prepare("UPDATE special_days SET recipients = ? WHERE id = ?").bind(reach.total, s.id).run();
  await pushAppleBusinessNow(db, s.business);
}

async function queueSpecialDays(db: D1Database, nowIso: string): Promise<void> {
  const due = await db
    .prepare(
      `SELECT s.id, s.business, s.text FROM special_days s JOIN businesses b ON b.id = s.business
       WHERE s.queued IS NULL AND s.canceled IS NULL AND s.send_at <= ? AND b.archived IS NULL AND b.suspended IS NULL LIMIT 20`,
    )
    .bind(nowIso)
    .all<{ id: string; business: string; text: string }>();
  for (const s of due.results ?? []) await sendSpecial(db, s, nowIso);
}

/**
 * Once a day (from BIRTHDAY_HOUR), in businesses that turned it on: "we miss you" to customers whose last visit
 * (or joining) was MISS_YOU_DAYS to 60 days ago, once per quiet spell (not again until they visit and go quiet
 * again). Google Wallet passes through the outbox; Apple Wallet passes show it as a message on the pass, and
 * the iPhones are pushed now. Returns how many customers it reached.
 */
export async function queueMissYou(db: D1Database, nowIso: string): Promise<number> {
  const now = Date.parse(nowIso);
  const from = new Date(now - 60 * 86_400_000).toISOString();
  const to = new Date(now - MISS_YOU_DAYS * 86_400_000).toISOString();
  const businesses = (await db
    .prepare("SELECT id, name, reward, color FROM businesses WHERE archived IS NULL AND suspended IS NULL")
    .all<{ id: string; name: string; reward: string; color: string }>()).results;
  let reached = 0;
  for (const b of businesses) {
    const design = await liveDesign(db, b);
    if (!design.walletMissYou) continue;
    const quiet = (await db
      .prepare(
        `SELECT id, google_wallet FROM (
           SELECT c.id, c.google_wallet, c.missyou_at, COALESCE((SELECT MAX(e.created) FROM events e WHERE e.customer = c.id), c.created) AS last
           FROM customers c WHERE c.business = ? AND c.archived IS NULL
         ) WHERE last > ? AND last <= ? AND (missyou_at IS NULL OR missyou_at < last) LIMIT 500`,
      )
      .bind(b.id, from, to)
      .all<{ id: string; google_wallet: string | null }>()).results;
    if (!quiet.length) continue;
    for (let i = 0; i < quiet.length; i += 50) {
      const part = quiet.slice(i, i + 50);
      await db.batch([
        db.prepare(`UPDATE customers SET missyou_at = ? WHERE id IN (${part.map(() => "?").join(",")})`).bind(nowIso, ...part.map((c) => c.id)),
        ...part.filter((c) => c.google_wallet).map((c) =>
          db.prepare("INSERT OR IGNORE INTO wallet_outbox(id, business, customer, kind, not_before, created) VALUES(?, ?, ?, 'missyou', ?, ?)")
            .bind(`miss:${c.id}:${nowIso.slice(0, 10)}`, b.id, c.id, nowIso, nowIso),
        ),
      ]);
    }
    await pushAppleCustomersNow(db, quiet.map((c) => c.id));
    reached += quiet.length;
  }
  return reached;
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
  id: string; business: string; customer: string; kind: "welcome" | "birthday" | "special" | "sync" | "missyou" | "appt"; campaign: string | null; attempts: number; origin: string | null;
  name: string; stamps: number; target: number; scan_code: string; google_wallet: string | null; archived: string | null;
  b_name: string; b_reward: string; b_color: string; reward_mode: string; b_archived: string | null; suspended: string | null;
  special_text: string | null; special_canceled: string | null; appt_msg: string | null;
};

/** Sends due outbox messages, oldest first. Returns how many were handled. */
export async function drainOutbox(db: D1Database, config: WalletConfig, nowIso: string, limit: number): Promise<number> {
  const due = await db
    .prepare(
      `SELECT o.id, o.business, o.customer, o.kind, o.campaign, o.attempts, o.origin,
         c.name, c.stamps, c.target, c.scan_code, c.google_wallet, c.archived, c.appt_msg,
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
    const rewardsNow = async () => {
      const saved = await db
        .prepare("SELECT COUNT(*) AS n FROM rewards WHERE customer = ? AND redeemed IS NULL AND (expires IS NULL OR expires > ?)")
        .bind(o.customer, nowIso)
        .first<{ n: number }>();
      return (saved?.n ?? 0) + (o.reward_mode === "block" && o.stamps >= o.target ? 1 : 0);
    };
    // A refresh: the current stamps, rewards and look, without a message (a retry, or a new design).
    if (o.kind === "sync") {
      const program = await passProgram(db, o.customer, o.origin);
      // Balance, appointment and library cards have no stamp banner.
      const stampsLook = program.balance === undefined && program.appointment === undefined && program.library === undefined && program.face === undefined ? { stamps: o.stamps, target: o.target } : undefined;
      const full = o.origin ? await passLook(db, business, o.origin, stampsLook).catch(() => null) : null;
      const { notice: _none, ...look } = full ?? { notice: null };
      const result = await updateLoyaltyObject(
        config,
        { customerId: o.customer, businessId: o.business, stamps: o.stamps, target: o.target, scanCode: o.scan_code, rewards: await rewardsNow(), ...program, look: full ? (look as typeof full) : undefined },
        null,
      );
      if (result === "updated") await finish(o.id, "sent");
      else if (result === "not_saved") {
        // Not saved yet (Google creates the pass when the customer taps Save): keep trying for a day.
        const fresh = o.google_wallet && Date.parse(nowIso) - Date.parse(o.google_wallet) < SAVE_GRACE_MS;
        if (fresh && o.attempts + 1 < 30) await later(o.id, Math.min(30, 3 * 2 ** Math.min(o.attempts, 4)) * 60_000);
        else {
          await db.prepare("UPDATE customers SET google_wallet = NULL WHERE id = ?").bind(o.customer).run();
          await finish(o.id, "not_saved");
        }
      } else if (o.attempts + 1 < FAIL_TRIES + 2) await later(o.id, Math.min(60, 5 * 2 ** o.attempts) * 60_000);
      else await finish(o.id, "failed");
      continue;
    }
    const notice: StampNotice =
      // An appointment reminder: its text was written when it was due (the business, the day and the time).
      o.kind === "appt" ? { kind: "special", name: o.name, text: o.appt_msg ?? "" }
      : o.kind === "special" ? { kind: "special", name: o.name, text: o.special_text ?? "" }
      : o.kind === "birthday" ? { kind: "birthday", name: o.name, gift: design.birthdayGift }
      : o.kind === "missyou" ? { kind: "missyou", name: o.name }
      : { kind: "welcome", name: o.name };
    // Turned off after it was queued (or a special day with no text): nothing to send.
    if (!noticeOn(design, notice.kind) || (notice.kind === "special" && !notice.text.trim())) { await finish(o.id, "off"); continue; }
    const look = await passLook(db, business, "", { stamps: o.stamps, target: o.target, notice });
    if (!look.notice) { await finish(o.id, "off"); continue; }
    const rewards = await rewardsNow();
    // Only the stamps and rewards are refreshed with the message; the pass keeps its look.
    const result = await updateLoyaltyObject(
      config,
      { customerId: o.customer, businessId: o.business, stamps: o.stamps, target: o.target, scanCode: o.scan_code, rewards, ...(await passProgram(db, o.customer, o.origin)) },
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
/**
 * Businesses with a morning and an evening lock-screen line: when the hour passes the switch,
 * the iPhones get the card again (silently) with the other line. Each switch happens once.
 */
export async function switchNearTexts(db: D1Database, hour: number, nowIso: string): Promise<number> {
  const { results } = await db
    .prepare("SELECT id, near_morning_from, near_evening_from, near_phase FROM businesses WHERE near_text_evening IS NOT NULL AND archived IS NULL AND suspended IS NULL")
    .all<{ id: string; near_morning_from: number; near_evening_from: number; near_phase: string | null }>();
  let switched = 0;
  for (const b of results) {
    const phase = nearPhase(hour, b.near_morning_from, b.near_evening_from);
    if (phase === b.near_phase) continue;
    // Marked first (and only if still the old one), so two overlapping runs never both push.
    const r = await db.prepare("UPDATE businesses SET near_phase = ?, near_updated = ? WHERE id = ? AND near_phase IS ?").bind(phase, nowIso, b.id, b.near_phase).run();
    if (!r.meta.changes) continue;
    switched++;
    await pushAppleBusinessNow(db, b.id).catch((e) => console.error("near switch push failed:", b.id, e));
  }
  if (switched) console.log(`near text: ${switched} businesses switched`);
  return switched;
}

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
    const missed = await db.prepare("SELECT last FROM job_runs WHERE name = 'missyou'").first<{ last: string }>();
    if (missed?.last !== today.date) {
      await db.prepare("INSERT INTO job_runs(name, last) VALUES('missyou', ?) ON CONFLICT(name) DO UPDATE SET last = excluded.last").bind(today.date).run();
      const n = await queueMissYou(db, nowIso);
      console.log(`missyou ${today.date}: ${n} customers`);
    }
  }
  await queueSpecialDays(db, nowIso);
  await switchNearTexts(db, today.hour, nowIso);
  await sendApptReminders(db, nowIso).catch((e) => console.error("appointment reminders failed:", e));
  await sendLoanReminders(db, nowIso).catch((e) => console.error("library reminders failed:", e));
  await sendDueReminders(db, nowIso).catch((e) => console.error("dated reminders failed:", e));
  await sendMonthlyReports(db, env as unknown as MailEnv & { REPORT_EMAILS?: string; PUBLIC_ORIGIN?: string }, now).catch((e) => console.error("monthly report failed:", e));
  const config = walletConfig(env);
  if (!config) return;
  const batch = Math.max(1, Math.min(100, Number(env.WALLET_BATCH) || DEFAULT_BATCH));
  const sent = await drainOutbox(db, config, nowIso, batch);
  if (sent) console.log(`wallet outbox: ${sent} handled`);
}
