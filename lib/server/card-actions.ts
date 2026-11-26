// The actions on a customer's card (stamps, rewards, purchases, balance), shared by the staff station and the cashier API.
// Every action is idempotent by request id: a retry after a network error never counts twice.
import { fail, json, str } from "./http";
import { payReferral } from "./referral";
import { allow } from "./rate-limit";
import { AMOUNT_MAX, averageReward, earnFor, parseAmount, type Program } from "../cashback.ts";
import { syncGoogleWallet } from "./wallet-sync";
import { APPT_MAX_DAYS, israelTime, passedStages } from "../appointment.ts";
import { parseServices } from "../calendar.ts";
import { pushAppleCustomer } from "./apple-push";
import type { Social } from "../social";
import { LOANS_MAX, LOAN_DAYS_MAX, addDays, cleanTitle, daysLeft, israelDate, passedLoanStages, validDate } from "../library.ts";
import { ensureLoanKey, extendLoan, openLoans } from "./loans";
import { monthAttendance } from "./simple-face";
import { PASS_LOW, PASS_SIZE_MAX, addMonths, couponState, passUsable, passedDueStages, simpleReminder, type SimpleProgram } from "../programs.ts";

export type Business = { id: string; name: string; reward: string; target: number; color: string; join_code: string | null; staff_adjust: number; reward_mode: "bank" | "block"; reward_expiry_days: number; birthdays: number; social: Social; owner_designs: number; program: Program; cashback_bp: number; cashback_min: number; currency: string; avg_cap: number; pos_only?: number; near_text?: string | null; near_text_evening?: string | null; near_morning_from?: number; near_evening_from?: number; referral_stamps?: number; report_email?: number; appt_extra?: string; appt_points?: number; work_hours?: string | null; appt_slot?: number; services?: string | null; loan_days?: number; loan_ext_days?: number; loan_max_ext?: number;
  pass_size?: number; pass_days?: number; club_pct?: number; service_months?: number; coupon_until?: string | null };
export type Customer = { id: string; business: string; name: string; phone: string; stamps: number; target: number; scan_code: string; google_wallet?: string | null; balance: number; round_total: number; appt_at?: string | null; appt_service?: string | null; appt_min?: number | null;
  pass_left?: number; pass_until?: string | null; due_date?: string | null; due_label?: string | null; due_sent?: string | null; coupon_used?: string | null };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Tries for one collect-mode stamp when other devices change the same card at the same time. */
const STAMP_ATTEMPTS = 14;

/** Saved rewards that can be used now, and the nearest expiry. */
export async function savedRewards(db: D1Database, customerId: string) {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(expires) AS next_expiry,
         -- The value of the reward that would be used next (oldest first), on the "average" card.
         (SELECT value FROM rewards WHERE customer = ?1 AND redeemed IS NULL AND (expires IS NULL OR expires > ?2) ORDER BY earned, id LIMIT 1) AS next_value
       FROM rewards WHERE customer = ?1 AND redeemed IS NULL AND (expires IS NULL OR expires > ?2)`,
    )
    .bind(customerId, now)
    .first<{ n: number; next_expiry: string | null; next_value: number | null }>();
  return { n: row?.n ?? 0, nextExpiry: row?.next_expiry ?? null, nextValue: row?.next_value ?? null };
}

export async function cardState(db: D1Database, c: Customer, mode: Business["reward_mode"], program?: string) {
  const saved = await savedRewards(db, c.id);
  // The library card: the books the reader has now.
  const loans = program === "library" ? await openLoans(db, c.id) : undefined;
  // Classes: lessons attended since the 1st of this month (Israel time).
  const monthCount = program === "attendance" ? await monthAttendance(db, c.id) : undefined;
  const rewards = saved.n + (mode === "block" && c.stamps >= c.target ? 1 : 0);
  return {
    id: c.id, name: c.name, stamps: c.stamps, target: c.target, rewards, rewardReady: rewards > 0, nextExpiry: saved.nextExpiry, mode, balance: c.balance ?? 0,
    // The "average" card: what this round's purchases add up to, and the value of the next reward to use.
    roundTotal: c.round_total ?? 0, rewardValue: saved.nextValue,
    // The appointments card: the next appointment (ISO), or null.
    apptAt: c.appt_at ?? null, apptService: c.appt_service ?? null, apptMin: c.appt_min ?? null,
    ...(loans ? { loans } : {}),
    passLeft: c.pass_left ?? 0, passUntil: c.pass_until ?? null, dueDate: c.due_date ?? null, dueLabel: c.due_label ?? null, couponUsed: c.coupon_used ?? null,
    ...(monthCount !== undefined ? { monthCount } : {}),
  };
}

export type Branch = { id: string; name: string; address: string | null; lat?: number | null; lng?: number | null };
export async function activeBranches(db: D1Database, businessId: string) {
  return (await db.prepare("SELECT id, name, address, lat, lng FROM branches WHERE business = ? AND archived IS NULL ORDER BY created").bind(businessId).all<Branch>()).results;
}


export type CardActionInput = {
  db: D1Database;
  /** The request body: action, customer, requestId, count, amount, delta, note, from, branch. */
  p: Record<string, unknown>;
  business: Business;
  /** Who did it: a user id, or "pos:<key id>" for the cashier API. */
  actorId: string;
  role: "owner" | "staff" | "pos";
  /** The branch a staff member is tied to (or the cashier key's branch). */
  memberBranch: string | null;
  now: string;
  /** The site address, for the wallet pass images. */
  origin: string;
};

/** stamp, redeem, adjust, purchase, spend, adjust_balance on one customer's card. */
export async function cardAction(x: CardActionInput): Promise<Response> {
  const { db, p, business, role, now } = x;
  const user = { id: x.actorId };
  const membership = { branch: x.memberBranch };
  const request = { url: x.origin };
  // A business connected to its cashier: cards change only through the cashier. Owners can still correct (with a reason).
  if (business.pos_only && role !== "pos") {
    const correction = p.action === "adjust" || p.action === "adjust_balance";
    if (!correction || role === "staff") return fail("pos_only", 409, "Cards change through the cashier");
  }
  // Each kind of card has its own actions.
  const balanceAction = p.action === "purchase" || p.action === "spend" || p.action === "adjust_balance" || p.action === "load";
  // The six simpler cards: which actions each one has.
  const SIMPLE_ACTIONS: Record<string, SimpleProgram[]> = {
    pass_sell: ["pass"], pass_use: ["pass"], checkin: ["club", "attendance"], service_done: ["service"],
    due_set: ["service", "attendance"], due_clear: ["service", "attendance"], coupon_use: ["coupon"],
  };
  const simpleAction = typeof p.action === "string" && p.action in SIMPLE_ACTIONS;
  const apptAction = p.action === "appt_set" || p.action === "appt_clear" || p.action === "visit";
  const loanAction = p.action === "lend" || p.action === "return" || p.action === "renew";
  // The appointments card can add a gift punch card, points per visit, or a balance (the owner's choice).
  const addOn = business.program === "appointments" ? (business.appt_extra ?? "none") : null;
  const stampsCard = business.program === "stamps" || business.program === "average" || addOn === "stamps" || addOn === "points";
  const balanceCard = business.program === "cashback" || business.program === "gift" || addOn === "cashback";
  // A gift card is loaded at the counter, never earned; the other balance cards earn, never load.
  const balanceOk = p.action === "load" ? business.program === "gift" : p.action === "purchase" ? balanceCard && business.program !== "gift" : balanceCard;
  const allowed = simpleAction ? SIMPLE_ACTIONS[p.action as string].includes(business.program as SimpleProgram) : loanAction ? business.program === "library" : apptAction ? business.program === "appointments" : balanceAction ? balanceOk : stampsCard;
  if (!allowed) return fail("wrong_program", 409, "This action is for the other kind of card");
  if (p.action === "adjust_balance" && role === "staff" && !business.staff_adjust) return fail("forbidden", 403, "Corrections are owner-only in this business");
  if (p.action === "adjust" && role === "staff" && !business.staff_adjust) return fail("forbidden", 403, "Corrections are owner-only in this business");
  if (typeof p.requestId !== "string" || !UUID.test(p.requestId)) return fail("bad_request", 400, "Invalid request id");
  const requestId = p.requestId;
  if (!(await allow(db, `act:${user.id}`, 60, 60))) return fail("rate_limited", 429, "Too many actions");
  let c = await db.prepare("SELECT * FROM customers WHERE id = ? AND business = ? AND archived IS NULL").bind(p.customer ?? "", business.id).first<Customer>();
  if (!c) return fail("unknown_card", 404, "Customer not found");

  // Which branch this happened in. Staff tied to a branch always record their own branch.
  const list = await activeBranches(db, business.id);
  let branch: string | null = null;
  if (role === "staff" && membership.branch) {
    if (!list.some((b) => b.id === membership.branch)) return fail("branch_invalid", 409, "Your branch is closed. Ask the owner.");
    branch = membership.branch;
  } else if (typeof p.branch === "string" && p.branch) {
    if (!list.some((b) => b.id === p.branch)) return fail("branch_invalid", 400, "Unknown branch");
    branch = p.branch;
  } else if (list.length === 1) {
    branch = list[0].id; // a single branch is always where it happened
  } else if (list.length) {
    return fail("branch_required", 400, "Choose a branch");
  }

  const event = (kind: string, delta: number, note: string | null) =>
    db.prepare(
      `INSERT INTO events(id, customer, actor, kind, delta, created, business, branch, actor_role, stamps_after, note)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT stamps FROM customers WHERE id = ?), ? WHERE changes() = 1`,
    ).bind(requestId, c!.id, user.id, kind, delta, now, business.id, branch, role, c!.id, note);
  const replayed = async () => !!(await db.prepare("SELECT id FROM events WHERE id = ? AND customer = ?").bind(requestId, c!.id).first());
  /** `added`: stamps just given (not a replay), for the customer's phone notification. */
  const done = async (extra: Record<string, unknown> = {}, added = 0, earned = 0) => {
    // An invited friend's first visit: both get the "bring a friend" bonus (before the card is read back).
    const bonus = added && p.action === "stamp" ? await payReferral(db, business, c!.id, now) : 0;
    if (bonus) extra = { ...extra, referralBonus: bonus };
    const fresh = (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c!.id).first<Customer>())!;
    const card = await cardState(db, fresh, business.reward_mode, business.program);
    const reached = business.reward_mode === "block" ? fresh.stamps >= fresh.target : earned > 0;
    const notice = added && !(addOn === "points" && !reached)
      ? reached
        ? ({ kind: "reward", name: fresh.name } as const)
        : ({ kind: "stamp", added, left: Math.max(0, fresh.target - fresh.stamps), name: fresh.name } as const)
      : undefined;
    syncGoogleWallet(db, fresh, card.rewards, new URL(request.url).origin, notice);
    // Apple Wallet: the iPhones that saved this pass fetch the new one (no-op until push is set up).
    pushAppleCustomer(db, fresh.id);
    return json({ ok: true, card, ...extra });
  };
  const refuse = async (code: string) => {
    const fresh = (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c!.id).first<Customer>())!;
    return json({ error: code, code, card: await cardState(db, fresh, business.reward_mode, business.program) }, 409);
  };

  if (simpleAction) {
    const today = israelDate(new Date(now));
    const unapplied = "AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)";
    /** Runs the change with its event; the reply and the wallets follow (or the replay, or why not). */
    const apply = async (update: D1PreparedStatement, kind: string, note: string | null, why: string, after?: D1PreparedStatement[]) => {
      const r = await db.batch([update, event(kind, 0, note), ...(after ?? [])]);
      if (r[0].meta.changes) return done();
      if (await replayed()) return done({ replayed: true });
      return refuse(why);
    };
    const program = business.program as SimpleProgram;

    if (p.action === "pass_sell") {
      // A pass sold at the counter: N entries (the owner's size unless the station says otherwise), valid for the owner's days from today.
      const count = p.count === undefined ? business.pass_size ?? 10 : p.count;
      if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > PASS_SIZE_MAX) return fail("bad_details", 400, `1-${PASS_SIZE_MAX} entries`);
      const until = (business.pass_days ?? 90) > 0 ? addDays(today, business.pass_days!) : null;
      // An expired pass starts over; otherwise the new entries are added.
      return apply(
        db.prepare(
          `UPDATE customers SET pass_left = CASE WHEN pass_until IS NOT NULL AND pass_until < ?1 THEN ?2 ELSE pass_left + ?2 END, pass_until = ?3,
             due_sent = ?4, appt_msg = NULL WHERE id = ?5 AND business = ?6 ${unapplied}`,
        ).bind(today, count, until, until ? passedDueStages("pass", until, new Date(now)).join(",") || null : null, c.id, business.id, requestId),
        "pass_sell", `+${count}${until ? ` → ${until}` : ""}`, "busy_retry",
      );
    }
    if (p.action === "pass_use") {
      if (!passUsable(c, today)) return refuse((c.pass_left ?? 0) > 0 ? "pass_expired" : "pass_empty");
      const left = (c.pass_left ?? 0) - 1;
      // Few entries left: the customer's phone says so (the pass's reminder field).
      const low = left === PASS_LOW
        ? [db.prepare("UPDATE customers SET appt_msg = ?, appt_updated = ? WHERE id = ? AND EXISTS(SELECT 1 FROM events WHERE id = ?)")
            .bind(simpleReminder("pass", "low", business.currency === "USD" ? "en" : "he", business.name, today, { left }), now, c.id, requestId)]
        : [];
      return apply(
        db.prepare(`UPDATE customers SET pass_left = pass_left - 1 WHERE id = ? AND business = ? AND pass_left = ? AND pass_left > 0 AND (pass_until IS NULL OR pass_until >= ?) ${unapplied}`)
          .bind(c.id, business.id, c.pass_left ?? 0, today, requestId),
        "pass_use", String(left), "busy_retry", low,
      );
    }
    if (p.action === "checkin") {
      // A visit (club card) or a lesson (classes): recorded for the history and the reports; attendance counts it this month.
      return apply(
        db.prepare(`UPDATE customers SET business = business WHERE id = ? AND business = ? ${unapplied}`).bind(c.id, business.id, requestId),
        program === "attendance" ? "attend" : "visit", null, "busy_retry",
      );
    }
    if (p.action === "coupon_use") {
      const st = couponState(c, { coupon_until: business.coupon_until }, today);
      if (st !== "valid") return refuse(st === "used" ? "coupon_used" : "coupon_expired");
      return apply(
        db.prepare(`UPDATE customers SET coupon_used = ? WHERE id = ? AND business = ? AND coupon_used IS NULL ${unapplied}`).bind(now, c.id, business.id, requestId),
        "coupon_use", null, "coupon_used",
      );
    }
    if (p.action === "service_done") {
      // The service was done today: the next one is the owner's months from today, reminders start over.
      const next = addMonths(today, business.service_months ?? 6);
      return apply(
        db.prepare(`UPDATE customers SET due_date = ?, due_sent = ?, appt_msg = NULL WHERE id = ? AND business = ? ${unapplied}`)
          .bind(next, passedDueStages("service", next, new Date(now)).join(",") || null, c.id, business.id, requestId),
        "service", `→ ${next}`, "busy_retry",
      );
    }
    if (p.action === "due_set") {
      // The next service or payment date, set at the station (and for a service, its name).
      if (!validDate(p.date) || daysLeft(p.date as string, today) < 0 || daysLeft(p.date as string, today) > 3 * 366) return fail("due_date", 400, "Choose a date from today on");
      const label = program === "service" ? cleanTitle(p.label) || null : null;
      return apply(
        db.prepare(`UPDATE customers SET due_date = ?, due_label = ?, due_sent = ?, appt_msg = NULL WHERE id = ? AND business = ? ${unapplied}`)
          .bind(p.date, label, passedDueStages(program, p.date as string, new Date(now)).join(",") || null, c.id, business.id, requestId),
        program === "service" ? "service_set" : "pay_set", `${label ? label + " " : ""}${p.date}`, "busy_retry",
      );
    }
    // due_clear
    return apply(
      db.prepare(`UPDATE customers SET due_date = NULL, due_label = NULL, due_sent = NULL, appt_msg = NULL WHERE id = ? AND business = ? ${unapplied}`)
        .bind(c.id, business.id, requestId),
      "due_clear", null, "busy_retry",
    );
  }

  if (loanAction) {
    // The library card: a book lent (with its return date), returned, or extended by the librarian.
    const unapplied = "AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)";
    const today = israelDate(new Date(now));
    if (p.action === "lend") {
      const title = cleanTitle(p.title);
      if (!title) return fail("bad_details", 400, "Write the book's name");
      const due = p.due === undefined || p.due === null || p.due === "" ? addDays(today, business.loan_days ?? 14) : p.due;
      if (!validDate(due) || daysLeft(due, today) < 0 || daysLeft(due, today) > LOAN_DAYS_MAX) return fail("loan_date", 400, "The return date must be from today on");
      const open = await db.prepare("SELECT COUNT(*) AS n FROM loans WHERE customer = ? AND returned IS NULL").bind(c.id).first<{ n: number }>();
      if ((open?.n ?? 0) >= LOANS_MAX) return fail("loans_max", 409, `At most ${LOANS_MAX} books at once`);
      await ensureLoanKey(db, c.id);
      // Reminders whose time already passed (a short loan) are never sent late.
      const sent = passedLoanStages(due, new Date(now)).join(",") || null;
      const r = await db.batch([
        db.prepare(`INSERT INTO loans(id, business, customer, title, due, extensions, sent, created) SELECT ?, ?, ?, ?, ?, 0, ?, ? WHERE NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`)
          .bind(requestId, business.id, c.id, title, due, sent, now, requestId),
        event("loan", 0, `${title} → ${due}`),
      ]);
      if (r[0].meta.changes) return done({ loan: { id: requestId, title, due } });
      if (await replayed()) return done({ replayed: true });
      return refuse("busy_retry");
    }
    if (typeof p.loan !== "string" || !UUID.test(p.loan)) return fail("unknown_loan", 404, "Book not found");
    if (p.action === "return") {
      const loan = await db.prepare("SELECT title FROM loans WHERE id = ? AND customer = ? AND business = ?").bind(p.loan, c.id, business.id).first<{ title: string }>();
      if (!loan) return fail("unknown_loan", 404, "Book not found");
      const r = await db.batch([
        db.prepare(`UPDATE loans SET returned = ? WHERE id = ? AND customer = ? AND returned IS NULL ${unapplied}`).bind(now, p.loan, c.id, requestId),
        event("return", 0, loan.title),
        // No books left: the last reminder leaves the pass too.
        db.prepare("UPDATE customers SET appt_msg = NULL WHERE id = ? AND NOT EXISTS(SELECT 1 FROM loans WHERE customer = ? AND returned IS NULL)").bind(c.id, c.id),
      ]);
      if (r[0].meta.changes) return done();
      if (await replayed()) return done({ replayed: true });
      return refuse("already_returned");
    }
    // The librarian extends: the reader's limit does not apply.
    const ext = await extendLoan(db, {
      business: { id: business.id, loan_days: business.loan_days ?? 14, loan_ext_days: business.loan_ext_days ?? 7, loan_max_ext: business.loan_max_ext ?? 2 },
      customerId: c.id, loanId: p.loan, requestId, actor: user.id, role, now, limit: false,
    });
    if (!ext.ok) return ext.code === "unknown_loan" ? fail("unknown_loan", 404, "Book not found") : refuse(ext.code);
    return done(ext.replayed ? { replayed: true } : { due: ext.due });
  }

  if (apptAction) {
    // The appointments card: the next appointment, set or cleared, and the customer's arrival (a visit).
    const unapplied = "AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)";
    if (p.action === "appt_set") {
      const at = typeof p.date === "string" && typeof p.time === "string" ? israelTime(p.date, p.time) : null;
      if (!at) return fail("appt_invalid", 400, "Invalid date or time");
      const t = at.getTime();
      if (t < Date.parse(now) - 5 * 60_000 || t > Date.parse(now) + APPT_MAX_DAYS * 86_400_000) return fail("appt_invalid", 400, "The appointment must be in the future");
      // The service and its length (the clinic's list), or a length given, or one slot.
      const service = typeof p.service === "string" ? parseServices(business.services).find((s) => s.id === p.service) : undefined;
      if (typeof p.service === "string" && p.service && !service) return fail("bad_details", 400, "Unknown service");
      const minutes = service?.min ?? (Number.isInteger(p.minutes) && (p.minutes as number) >= 5 && (p.minutes as number) <= 480 ? (p.minutes as number) : business.appt_slot ?? 30);
      // Reminders whose time already passed are never sent late.
      const sent = passedStages(at, new Date(now)).join(",") || null;
      const r = await db.batch([
        db.prepare(`UPDATE customers SET appt_at = ?, appt_service = ?, appt_min = ?, appt_sent = ?, appt_msg = NULL, appt_updated = ? WHERE id = ? AND business = ? ${unapplied}`)
          .bind(at.toISOString(), service?.name ?? null, minutes, sent, now, c.id, business.id, requestId),
        event("appt", 0, at.toISOString()),
      ]);
      if (r[0].meta.changes) return done({ apptAt: at.toISOString() });
      if (await replayed()) return done({ replayed: true });
      return refuse("busy_retry");
    }
    if (p.action === "appt_clear") {
      const r = await db.batch([
        db.prepare(`UPDATE customers SET appt_at = NULL, appt_service = NULL, appt_min = NULL, appt_sent = NULL, appt_msg = NULL, appt_updated = ? WHERE id = ? AND business = ? ${unapplied}`)
          .bind(now, c.id, business.id, requestId),
        event("appt_cancel", 0, null),
      ]);
      if (r[0].meta.changes) return done();
      if (await replayed()) return done({ replayed: true });
      return refuse("busy_retry");
    }
    // The customer came in: a visit. An appointment within the next 12 hours (or past) is the one they came for, so it is cleared.
    const clearAppt = db.prepare(
      `UPDATE customers SET appt_at = CASE WHEN appt_at IS NOT NULL AND appt_at < ? THEN NULL ELSE appt_at END,
         appt_updated = ? WHERE id = ? AND business = ? ${unapplied}`,
    ).bind(new Date(Date.parse(now) + 12 * 3_600_000).toISOString(), now, c.id, business.id, requestId);
    if (addOn === "stamps" || addOn === "points") {
      // The arrival is recorded as stamps (a stamp, or the visit's points), below; the appointment is cleared first.
      await clearAppt.run();
      p.action = "stamp";
      p.count = addOn === "points" ? Math.max(1, business.appt_points ?? 10) : 1;
    }
  }
  if (apptAction && p.action === "visit") {
    const r = await db.batch([
      db.prepare(
        `UPDATE customers SET appt_at = CASE WHEN appt_at IS NOT NULL AND appt_at < ? THEN NULL ELSE appt_at END,
           appt_updated = ? WHERE id = ? AND business = ? AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`,
      ).bind(new Date(Date.parse(now) + 12 * 3_600_000).toISOString(), now, c.id, business.id, requestId),
      event("visit", 1, null),
    ]);
    if (r[0].meta.changes) return done();
    if (await replayed()) return done({ replayed: true });
    return refuse("busy_retry");
  }

  if (balanceAction) {
    // The balance card. One statement changes the balance only if this request was not applied before
    // and the rule holds (enough balance, the owner's minimum); the event is written in the same batch.
    const balanceEvent = (kind: string, delta: number, amount: number | null, note: string | null) =>
      db.prepare(
        `INSERT INTO events(id, customer, actor, kind, delta, created, business, branch, actor_role, stamps_after, note, amount, balance_after)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, (SELECT balance FROM customers WHERE id = ?) WHERE changes() = 1`,
      ).bind(requestId, c!.id, user.id, kind, delta, now, business.id, branch, role, note, amount, c!.id);
    const fresh = async () => (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c!.id).first<Customer>())!;
    // The wallet pass shows the new balance (no phone message for balance changes yet).
    const finish = async (extra: Record<string, unknown> = {}) => {
      const now2 = await fresh();
      const card = await cardState(db, now2, business.reward_mode);
      syncGoogleWallet(db, now2, 0, new URL(request.url).origin);
      pushAppleCustomer(db, c!.id);
      return json({ ok: true, card, ...extra });
    };
    const refuseBalance = async (code: string) => json({ error: code, code, card: await cardState(db, await fresh(), business.reward_mode) }, 409);

    if (p.action === "purchase") {
      const amount = parseAmount(p.amount);
      if (!amount) return fail("bad_amount", 400, "Invalid amount");
      const earned = earnFor(amount, business.cashback_bp);
      const r = await db.batch([
        db.prepare("UPDATE customers SET balance = balance + ? WHERE id = ? AND business = ? AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)")
          .bind(earned, c.id, business.id, requestId),
        balanceEvent("earn", earned, amount, null),
      ]);
      if (r[0].meta.changes) return finish({ earned, amount });
      if (await replayed()) return finish({ replayed: true });
      return refuseBalance("busy_retry");
    }

    if (p.action === "load") {
      // The gift card: the amount paid at the counter goes onto the card.
      const amount = parseAmount(p.amount);
      if (!amount) return fail("bad_amount", 400, "Invalid amount");
      const r = await db.batch([
        db.prepare("UPDATE customers SET balance = balance + ? WHERE id = ? AND business = ? AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)")
          .bind(amount, c.id, business.id, requestId),
        balanceEvent("load", amount, amount, null),
      ]);
      if (r[0].meta.changes) return finish({ loaded: amount });
      if (await replayed()) return finish({ replayed: true });
      return refuseBalance("busy_retry");
    }

    if (p.action === "spend") {
      const amount = parseAmount(p.amount);
      if (!amount) return fail("bad_amount", 400, "Invalid amount");
      const r = await db.batch([
        db.prepare(
          `UPDATE customers SET balance = balance - ?1 WHERE id = ?2 AND business = ?3 AND balance >= ?1 AND balance >= ?4
           AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?5)`,
        ).bind(amount, c.id, business.id, business.cashback_min, requestId),
        balanceEvent("spend", -amount, amount, null),
      ]);
      if (r[0].meta.changes) return finish({ used: amount });
      if (await replayed()) return finish({ replayed: true });
      const left = await fresh();
      return refuseBalance(left.balance < business.cashback_min ? "below_minimum" : "not_enough_balance");
    }

    // Correction of the balance: a reason is required, nothing is deleted, the balance never goes below zero.
    const max = role === "owner" ? AMOUNT_MAX : 50_00;
    const delta = Number.isInteger(p.delta) ? (p.delta as number) : NaN;
    if (!delta || Math.abs(delta) > max) return fail("bad_request", 400, "Invalid correction");
    const note = str(p.note, 200);
    if (!note) return fail("note_required", 400, "A reason is required for corrections");
    const r = await db.batch([
      db.prepare("UPDATE customers SET balance = balance + ?1 WHERE id = ?2 AND business = ?3 AND balance + ?1 >= 0 AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?4)")
        .bind(delta, c.id, business.id, requestId),
      balanceEvent("balance_adjust", delta, null, note),
    ]);
    if (r[0].meta.changes) return finish();
    if (await replayed()) return finish({ replayed: true });
    return refuseBalance("not_enough_balance");
  }

  if (p.action === "stamp" && business.program === "average") {
    // Buy N, the next one free at the average: each purchase is one stamp with its amount. A full round saves a
    // reward worth the round's average (capped by the owner) and starts the next round.
    const amount = parseAmount(p.amount);
    if (!amount) return fail("bad_amount", 400, "Invalid amount");
    for (let attempt = 0; attempt < STAMP_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * Math.min(250, 8 * 2 ** attempt)));
      const full = c.stamps + 1 >= c.target;
      const value = full ? averageReward(c.round_total + amount, c.target, business.avg_cap) : 0;
      const expires = business.reward_expiry_days > 0 ? new Date(Date.now() + business.reward_expiry_days * 86_400_000).toISOString() : null;
      const statements = [
        db.prepare(
          `UPDATE customers SET stamps = ?, target = ?, round_total = ? WHERE id = ? AND business = ? AND stamps = ? AND target = ? AND round_total = ?
           AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`,
        ).bind(full ? 0 : c.stamps + 1, full ? business.target : c.target, full ? 0 : c.round_total + amount, c.id, business.id, c.stamps, c.target, c.round_total, requestId),
        db.prepare(
          `INSERT INTO events(id, customer, actor, kind, delta, created, business, branch, actor_role, stamps_after, note, amount)
           SELECT ?, ?, ?, 'stamp', 1, ?, ?, ?, ?, (SELECT stamps FROM customers WHERE id = ?), NULL, ? WHERE changes() = 1`,
        ).bind(requestId, c.id, user.id, now, business.id, branch, role, c.id, amount),
      ];
      if (full) {
        statements.push(
          db.prepare(
            `INSERT OR IGNORE INTO rewards(id, business, customer, earned, earned_event, expires, value)
             SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS(SELECT 1 FROM events WHERE id = ? AND created = ?)`,
          ).bind(`${requestId}:0`, business.id, c.id, now, requestId, expires, value, requestId, now),
        );
      }
      const result = await db.batch(statements);
      if (result[0].meta.changes) return done({ earned: full ? 1 : 0, rewardValue: full ? value : null }, 1, full ? 1 : 0);
      if (await replayed()) return done({ replayed: true });
      c = (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c.id).first<Customer>())!;
    }
    return refuse("busy_retry");
  }

  if (p.action === "stamp") {
    // Several purchases at once (e.g. 3 coffees) are one action and one history entry.
    const count = p.count === undefined ? 1 : p.count;
    // Points on the appointments card: up to 1,000 per visit (set by the owner); stamps: 1-10.
    const maxCount = addOn === "points" ? 1000 : 10;
    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > maxCount) return fail("bad_request", 400, `Count must be 1-${maxCount}`);
    const n = count as number;

    if (business.reward_mode === "block") {
      const result = await db.batch([
        db.prepare(
          "UPDATE customers SET stamps = stamps + ? WHERE id = ? AND business = ? AND stamps + ? <= target AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)",
        ).bind(n, c.id, business.id, n, requestId),
        event("stamp", n, null),
      ]);
      if (result[0].meta.changes) return done({}, n);
      if (await replayed()) return done({ replayed: true });
      return refuse(c.stamps >= c.target ? "reward_ready" : "too_many");
    }

    // Collect mode: a full card saves a reward and the next round starts right away.
    // Optimistic update on the exact count we read; retried if another device changed the card meanwhile.
    // Retries wait a short random time that grows each round, so stamps sent at the same moment
    // from several devices all land instead of colliding again (without it some came back "busy").
    for (let attempt = 0; attempt < STAMP_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * Math.min(250, 8 * 2 ** attempt)));
      let total = c.stamps + n;
      let target = c.target;
      let earned = 0;
      while (total >= target) {
        total -= target;
        earned++;
        target = business.target; // new rounds use the current program
      }
      const expires = business.reward_expiry_days > 0 ? new Date(Date.now() + business.reward_expiry_days * 86_400_000).toISOString() : null;
      const statements = [
        db.prepare(
          `UPDATE customers SET stamps = ?, target = ? WHERE id = ? AND business = ? AND stamps = ? AND target = ?
           AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`,
        ).bind(total, target, c.id, business.id, c.stamps, c.target, requestId),
        event("stamp", n, null),
      ];
      if (earned) {
        const ids = Array.from({ length: earned }, (_, i) => `${requestId}:${i}`);
        statements.push(
          db.prepare(
            `INSERT OR IGNORE INTO rewards(id, business, customer, earned, earned_event, expires)
             SELECT v.column1, ?, ?, ?, ?, ? FROM (VALUES ${ids.map(() => "(?)").join(",")}) v
             WHERE EXISTS(SELECT 1 FROM events WHERE id = ? AND created = ?)`,
          ).bind(business.id, c.id, now, requestId, expires, ...ids, requestId, now),
        );
      }
      const result = await db.batch(statements);
      if (result[0].meta.changes) return done({ earned }, n, earned);
      if (await replayed()) return done({ replayed: true });
      c = (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c.id).first<Customer>())!;
    }
    return refuse("busy_retry");
  }

  if (p.action === "redeem") {
    // First use the oldest saved reward that is still valid (any mode).
    const result = await db.batch([
      db.prepare(
        `UPDATE rewards SET redeemed = ?, redeem_event = ? WHERE redeemed IS NULL AND id = (
           SELECT id FROM rewards WHERE customer = ? AND business = ? AND redeemed IS NULL AND (expires IS NULL OR expires > ?)
           ORDER BY earned, id LIMIT 1)
         AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`,
      ).bind(now, requestId, c.id, business.id, now, requestId),
      event("redeem", 0, null),
    ]);
    if (result[0].meta.changes) {
      // The "average" card: the discount to give is the reward's value.
      const used = await db.prepare("SELECT value FROM rewards WHERE redeem_event = ?").bind(requestId).first<{ value: number | null }>();
      if (used?.value != null) await db.prepare("UPDATE events SET amount = ? WHERE id = ?").bind(used.value, requestId).run();
      return done({ rewardValue: used?.value ?? null });
    }
    if (await replayed()) return done({ replayed: true });
    if (business.reward_mode === "block" && business.program !== "average") {
      // Redeem-first mode: the full card itself is the reward; the next round uses the current program.
      const r2 = await db.batch([
        db.prepare(
          `UPDATE customers SET stamps = stamps - target, target = (SELECT target FROM businesses WHERE id = ?)
           WHERE id = ? AND business = ? AND stamps >= target AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`,
        ).bind(business.id, c.id, business.id, requestId),
        event("redeem", -c.target, null),
      ]);
      if (r2[0].meta.changes) return done();
      if (await replayed()) return done({ replayed: true });
    }
    return refuse("not_ready");
  }

  // Correction: staff are limited to 5; everyone must give a reason; nothing is ever deleted.
  const max = role === "owner" ? 30 : 5;
  if (!Number.isInteger(p.delta) || p.delta === 0 || Math.abs(p.delta as number) > max) return fail("bad_request", 400, `Correction must be between -${max} and ${max}`);
  const note = str(p.note, 200);
  if (!note) return fail("note_required", 400, "A reason is required for corrections");
  const delta = p.delta as number;
  // `from` = the count the person saw. If the card changed meanwhile, nothing is applied.
  const from = Number.isInteger(p.from) ? (p.from as number) : null;
  // In collect mode a card never sits full; it must stay below the target.
  const top = business.reward_mode === "bank" ? "target - 1" : "target";
  const result = await db.batch([
    db.prepare(
      `UPDATE customers SET stamps = stamps + ? WHERE id = ? AND business = ? AND stamps + ? BETWEEN 0 AND ${top}
       AND (? IS NULL OR stamps = ?) AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`,
    ).bind(delta, c.id, business.id, delta, from, from, requestId),
    event("adjust", delta, note),
  ]);
  if (result[0].meta.changes) return done();
  if (await replayed()) return done({ replayed: true });
  const fresh = (await db.prepare("SELECT stamps FROM customers WHERE id = ?").bind(c.id).first<{ stamps: number }>())!;
  return refuse(from !== null && from !== fresh.stamps ? "card_changed" : "out_of_range");
}
