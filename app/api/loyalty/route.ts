import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getMembership, getMemberships, getUser, isPlatformAdmin } from "../../../lib/server/auth";
import { randomCode, randomToken, sha256 } from "../../../lib/server/crypto";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { formatPhone, maskPhone, normalizePhone } from "../../../lib/phone";
import { assetIds, defaultDesign, designChecks, sanitizeDesign } from "../../../lib/design";
import { assetMeta, liveDesign, ownsAssets, publishedDesign } from "../../../lib/server/designs";
import { releaseArchivedPhone } from "../../../lib/server/customers";
import { businessAccess } from "../../../lib/server/billing";
import { formatBirthday, parseBirthday, upcomingKeys } from "../../../lib/birthday";
import { syncGoogleWallet } from "../../../lib/server/wallet-sync";
import { getSettings } from "../../../lib/server/settings";
import { normalizeSocial, parseSocial, type Social } from "../../../lib/social";

export const dynamic = "force-dynamic";

type Business = { id: string; name: string; reward: string; target: number; color: string; join_code: string | null; staff_adjust: number; reward_mode: "bank" | "block"; reward_expiry_days: number; birthdays: number; social: Social };
type Customer = { id: string; business: string; name: string; phone: string; stamps: number; target: number; scan_code: string; google_wallet?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

function validTarget(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 2 && (v as number) <= 30;
}

async function loadBusiness(db: D1Database, id: string) {
  const row = await db
    .prepare("SELECT id, name, reward, target, color, join_code, staff_adjust, reward_mode, reward_expiry_days, birthdays, social FROM businesses WHERE id = ?")
    .bind(id)
    .first<Omit<Business, "social"> & { social: string | null }>();
  return row ? { ...row, social: parseSocial(row.social) } : null;
}

/** Saved rewards that can be used now, and the nearest expiry. */
async function savedRewards(db: D1Database, customerId: string) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n, MIN(expires) AS next_expiry FROM rewards WHERE customer = ? AND redeemed IS NULL AND (expires IS NULL OR expires > ?)")
    .bind(customerId, new Date().toISOString())
    .first<{ n: number; next_expiry: string | null }>();
  return { n: row?.n ?? 0, nextExpiry: row?.next_expiry ?? null };
}

async function cardState(db: D1Database, c: Customer, mode: Business["reward_mode"]) {
  const saved = await savedRewards(db, c.id);
  const rewards = saved.n + (mode === "block" && c.stamps >= c.target ? 1 : 0);
  return { id: c.id, name: c.name, stamps: c.stamps, target: c.target, rewards, rewardReady: rewards > 0, nextExpiry: saved.nextExpiry, mode };
}

type Branch = { id: string; name: string };
async function activeBranches(db: D1Database, businessId: string) {
  return (await db.prepare("SELECT id, name FROM branches WHERE business = ? AND archived IS NULL ORDER BY created").bind(businessId).all<Branch>()).results;
}

async function newCardSecret() {
  const secret = randomToken(24);
  return { secret, hash: await sha256(secret) };
}

// ---------- GET: everything the current screen needs, filtered by role ----------
export async function GET(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");

  const url = new URL(request.url);
  const memberships = await getMemberships(db, user.id);
  const wanted = url.searchParams.get("business");
  const membership = memberships.find((m) => m.business === wanted) ?? memberships[0];
  // The admin control center is not linked from the site, so nothing here says who is an admin.
  const me = { name: user.name, email: user.email };
  const settingsNow = await getSettings(db);
  const system = {
    maintenance: settingsNow.maintenance, maintenanceMessage: settingsNow.maintenanceMessage,
    announcement: settingsNow.announcement, signupsOpen: settingsNow.signupsOpen,
  };
  if (!membership) return json({ me, memberships, business: null, role: null, system });

  const business = await loadBusiness(db, membership.business);
  const role = membership.role;
  const branches = await activeBranches(db, business!.id);
  // Whether stamping and new customers are allowed now (subscription, admin suspension or free access).
  const access = await businessAccess(db, business!.id);
  // Birthdays today and in the next 6 days (Israel time). Names only, for owner and staff.
  // Only when the business has birthdays turned on.
  const upcoming = upcomingKeys(new Date());
  const keys = [...upcoming.keys()];
  const bdays = business!.birthdays
    ? await db
        .prepare(`SELECT id, name, birthday FROM customers WHERE business = ? AND archived IS NULL AND birthday IN (${keys.map(() => "?").join(",")})`)
        .bind(business!.id, ...keys)
        .all<{ id: string; name: string; birthday: string }>()
    : { results: [] as { id: string; name: string; birthday: string }[] };
  const birthdays = bdays.results
    .map((c) => ({ id: c.id, name: c.name, date: formatBirthday(c.birthday), inDays: upcoming.get(c.birthday) ?? 0 }))
    .sort((a, b) => a.inDays - b.inDays);
  const base = { me, memberships, role, business, branches, myBranch: membership.branch, design: await liveDesign(db, business!), access, birthdays, system };

  if (role === "staff") {
    const mine = await db
      .prepare(
        `SELECT e.kind, e.delta, e.created, c.name AS customer, br.name AS branch_name FROM events e
         JOIN customers c ON c.id = e.customer LEFT JOIN branches br ON br.id = e.branch
         WHERE e.business = ? AND e.actor = ? ORDER BY e.created DESC LIMIT 10`,
      )
      .bind(business!.id, user.id)
      .all();
    return json({ ...base, myRecent: mine.results });
  }

  // Owner view
  const daysParam = url.searchParams.get("days");
  const days = daysParam === "all" ? null : [7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30;
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : "0000";
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  // Optional branch filter for activity and stamp/redemption counts ("" = all branches).
  const branchParam = url.searchParams.get("branch") || "";
  const branchFilter = branches.some((b) => b.id === branchParam) ? branchParam : "";

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [customers, events, stats, team, invites, busyCustomers, busyStaff, perBranch, staffFixes] = await db.batch([
    db.prepare(
      `SELECT c.id, c.name, c.phone, c.stamps, c.target, c.created, c.source, c.consent_marketing, c.birthday, c.card_hash IS NOT NULL AS has_link,
         (SELECT COUNT(*) FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2))
           + (CASE WHEN ?3 = 'block' AND c.stamps >= c.target THEN 1 ELSE 0 END) AS rewards
       FROM customers c WHERE c.business = ?1 AND c.archived IS NULL ORDER BY c.created DESC LIMIT 5000`,
    ).bind(business!.id, new Date().toISOString(), business!.reward_mode),
    db.prepare(
      `SELECT e.id, e.kind, e.delta, e.created, e.actor_role, e.stamps_after, e.note, c.name AS customer, u.name AS actor_name, br.name AS branch_name,
         (SELECT COUNT(*) FROM rewards r WHERE r.earned_event = e.id) AS rewards_earned
       FROM events e JOIN customers c ON c.id = e.customer LEFT JOIN users u ON u.id = e.actor LEFT JOIN branches br ON br.id = e.branch
       WHERE e.business = ?1 AND (?2 = '' OR e.branch = ?2) ORDER BY e.created DESC LIMIT 50`,
    ).bind(business!.id, branchFilter),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND archived IS NULL) AS customers,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND archived IS NULL AND created >= ?2) AS new_customers,
         (SELECT COUNT(*) FROM rewards WHERE business = ?1 AND redeemed IS NULL AND (expires IS NULL OR expires > ?4))
           + (CASE WHEN ?5 = 'block' THEN (SELECT COUNT(*) FROM customers WHERE business = ?1 AND stamps >= target) ELSE 0 END) AS rewards_ready,
         (SELECT COUNT(*) FROM events WHERE business = ?1 AND kind = 'stamp' AND created >= ?2 AND (?3 = '' OR branch = ?3)) AS stamps,
         (SELECT COUNT(*) FROM events WHERE business = ?1 AND kind = 'redeem' AND created >= ?2 AND (?3 = '' OR branch = ?3)) AS redemptions`,
    ).bind(business!.id, since, branchFilter, new Date().toISOString(), business!.reward_mode),
    db.prepare(
      `SELECT u.id, u.name, u.email, m.role, m.created, m.revoked, m.branch,
         (SELECT COUNT(*) FROM customers c WHERE c.business = m.business AND c.referred_by = m.user AND c.archived IS NULL) AS brought
       FROM memberships m JOIN users u ON u.id = m.user
       WHERE m.business = ? ORDER BY m.role, m.created`,
    ).bind(business!.id),
    db.prepare(
      `SELECT id, label, role, created, expires, branch FROM invites
       WHERE business = ? AND used IS NULL AND revoked IS NULL AND expires > ? ORDER BY created DESC`,
    ).bind(business!.id, new Date().toISOString()),
    db.prepare(
      `SELECT c.name, COUNT(*) AS n FROM events e JOIN customers c ON c.id = e.customer
       WHERE e.business = ? AND e.kind = 'stamp' AND e.created >= ? GROUP BY e.customer HAVING n >= 4`,
    ).bind(business!.id, hourAgo),
    db.prepare(
      `SELECT u.name, COUNT(*) AS n FROM events e JOIN users u ON u.id = e.actor
       WHERE e.business = ? AND e.created >= ? GROUP BY e.actor HAVING n >= 40`,
    ).bind(business!.id, hourAgo),
    db.prepare(
      `SELECT e.branch, br.name AS branch_name,
         SUM(e.kind = 'stamp') AS stamps, SUM(e.kind = 'redeem') AS redemptions
       FROM events e LEFT JOIN branches br ON br.id = e.branch
       WHERE e.business = ? AND e.created >= ? GROUP BY e.branch ORDER BY stamps DESC`,
    ).bind(business!.id, since),
    db.prepare(
      `SELECT u.name, COUNT(*) AS n FROM events e JOIN users u ON u.id = e.actor
       WHERE e.business = ? AND e.kind = 'adjust' AND e.actor_role = 'staff' AND e.created >= ? GROUP BY e.actor`,
    ).bind(business!.id, dayAgo),
  ]);

  // Card editor data (owner only): draft, live version and uploaded images.
  const published = await publishedDesign(db, business!.id);
  const draftRow = await db.prepare("SELECT design_draft FROM businesses WHERE id = ?").bind(business!.id).first<{ design_draft: string | null }>();
  const draft = (draftRow?.design_draft && sanitizeDesign(JSON.parse(draftRow.design_draft))) || published?.design || defaultDesign(business!);
  const images = await db.prepare("SELECT id, kind, width, height FROM assets WHERE business = ? ORDER BY created DESC LIMIT 60").bind(business!.id).all();

  return json({
    ...base,
    editor: {
      draft,
      publishedVersion: published?.version ?? 0,
      publishedAt: published?.published ?? null,
      hasUnpublished: !!draftRow?.design_draft && draftRow.design_draft !== JSON.stringify(published?.design ?? null),
      images: images.results,
    },
    range: days ?? "all",
    branchFilter,
    perBranch: perBranch.results,
    customers: (customers.results as { phone: string; has_link: unknown }[]).map((c) => ({ ...c, phone: formatPhone(c.phone), has_link: !!c.has_link })),
    events: events.results,
    stats: stats.results[0],
    team: team.results,
    invites: invites.results,
    alerts: [
      ...(busyCustomers.results as { name: string; n: number }[]).map((r) => ({ type: "customer", name: r.name, count: r.n })),
      ...(busyStaff.results as { name: string; n: number }[]).map((r) => ({ type: "staff", name: r.name, count: r.n })),
      ...(staffFixes.results as { name: string; n: number }[]).map((r) => ({ type: "staffFix", name: r.name, count: r.n })),
    ],
  });
}

// ---------- POST: actions ----------
export async function POST(request: Request) {
  const p = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  if (!p) return fail("bad_request", 400, "Invalid request");
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();
  const sys = await getSettings(db);
  // Maintenance: nothing changes, except for platform admins (so they can test).
  if (sys.maintenance && !isPlatformAdmin(user, env)) return fail("maintenance", 503, "Maintenance");

  // Creating a business is the only action that does not need an existing membership.
  if (p.action === "create_business") {
    if (!sys.signupsOpen && !isPlatformAdmin(user, env)) return fail("signups_closed", 403, "New businesses are closed");
    if (!(await allow(db, `create-business:${user.id}`, 10, 86_400))) return fail("rate_limited", 429);
    const name = str(p.name, 80);
    const reward = str(p.reward, 160);
    if (!name || !reward || !validTarget(p.target) || typeof p.color !== "string" || !COLOR.test(p.color)) {
      return fail("bad_details", 400, "Invalid business details");
    }
    // New businesses collect rewards by default (customers keep earning while a reward waits).
    const mode = p.rewardMode === "block" ? "block" : "bank";
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO businesses(id, owner, name, reward, target, color, created, join_code, reward_mode) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, user.id, name, reward, p.target, p.color, now, randomCode(10), mode),
      db.prepare("INSERT INTO memberships(id, business, user, role, created) VALUES(?, ?, ?, 'owner', ?)")
        .bind(crypto.randomUUID(), id, user.id, now),
      // With "require subscription": a free trial, then a subscription is needed (status 'none' is not entitled).
      ...(sys.requireSubscription
        ? [
            db.prepare("INSERT OR IGNORE INTO subscriptions(business, status, updated) VALUES(?, 'none', ?)").bind(id, now),
            db.prepare("UPDATE businesses SET comp_until = ? WHERE id = ?")
              .bind(sys.trialDays > 0 ? new Date(Date.now() + sys.trialDays * 86_400_000).toISOString() : null, id),
          ]
        : []),
    ]);
    return json({ id });
  }

  // Every other action: the server checks the user's role in this business.
  const membership = await getMembership(db, user.id, p.business);
  if (!membership) return fail("not_found", 404, "Business not found");
  const role = membership.role;
  const business = (await loadBusiness(db, p.business as string))!;
  const ownerOnly = () => (role === "owner" ? null : fail("forbidden", 403, "Owner permission required"));
  // Access rules. Redeeming a reward a customer already earned is always allowed.
  // - Inactive subscription: no new stamps, adjustments or customers. Everything else still works.
  // - Suspended by a platform admin: nothing changes except redeeming, looking up and removing customers.
  const action = String(p.action);
  const SUB_GATED = ["stamp", "adjust", "register_customer"];
  const ALLOWED_WHILE_SUSPENDED = ["lookup", "redeem", "archive_customer"];
  if (action !== "redeem") {
    const access = await businessAccess(db, business.id);
    if (!access.ok && access.code === "business_suspended" && !ALLOWED_WHILE_SUSPENDED.includes(action)) {
      return fail(access.code, 402, "Business is suspended");
    }
    if (!access.ok && access.code === "subscription_required" && SUB_GATED.includes(action)) {
      return fail(access.code, 402, "Subscription is not active");
    }
  }

  switch (p.action) {
    case "update_business": {
      const denied = ownerOnly(); if (denied) return denied;
      const name = str(p.name, 80);
      const reward = str(p.reward, 160);
      if (!name || !reward || !validTarget(p.target) || typeof p.color !== "string" || !COLOR.test(p.color)) {
        return fail("bad_details", 400, "Invalid business details");
      }
      // A new target applies to new cards and to existing cards from their next round (after redemption).
      const staffAdjust = typeof p.staffAdjust === "boolean" ? (p.staffAdjust ? 1 : 0) : business.staff_adjust;
      const birthdaysOn = typeof p.birthdays === "boolean" ? (p.birthdays ? 1 : 0) : business.birthdays;
      const mode = p.rewardMode === "bank" || p.rewardMode === "block" ? p.rewardMode : business.reward_mode;
      const expiry = p.rewardExpiryDays === undefined ? business.reward_expiry_days : p.rewardExpiryDays;
      if (![0, 30, 60, 90, 180, 365].includes(expiry as number)) return fail("bad_details", 400, "Invalid expiry");
      // Social links are optional; when sent, the whole set is replaced (an empty field removes that link).
      let social = business.social;
      if (p.social !== undefined) {
        const checked = normalizeSocial(p.social);
        if (!checked.ok) return fail("bad_social", 400, checked.field);
        social = checked.value;
      }
      const socialJson = Object.keys(social).length ? JSON.stringify(social) : null;
      const statements = [
        db.prepare("UPDATE businesses SET name = ?, reward = ?, target = ?, color = ?, staff_adjust = ?, reward_mode = ?, reward_expiry_days = ?, birthdays = ?, social = ? WHERE id = ?")
          .bind(name, reward, p.target, p.color, staffAdjust, mode, expiry, birthdaysOn, socialJson, business.id),
      ];
      if (business.reward_mode === "block" && mode === "bank") {
        // Switching to collect mode: cards that are full now become a saved reward and start a new round.
        const expires = (expiry as number) > 0 ? new Date(Date.now() + (expiry as number) * 86_400_000).toISOString() : null;
        statements.push(
          db.prepare(
            `INSERT OR IGNORE INTO rewards(id, business, customer, earned, earned_event, expires)
             SELECT 'switch:' || id || ':' || ?, business, id, ?, 'mode-switch', ? FROM customers WHERE business = ? AND stamps >= target`,
          ).bind(now, now, expires, business.id),
          db.prepare("UPDATE customers SET stamps = stamps - target, target = ? WHERE business = ? AND stamps >= target").bind(p.target, business.id),
        );
      }
      await db.batch(statements);
      return json({ ok: true });
    }

    case "register_customer": {
      if (!(await allow(db, `register:${user.id}`, 60, 3600))) return fail("rate_limited", 429);
      const name = str(p.name, 80);
      const phone = normalizePhone(p.phone);
      if (!name || !phone) return fail("bad_details", 400, "Invalid name or phone");
      // Ignored when the business has birthdays turned off.
      const birthday = business.birthdays ? parseBirthday(p.birthday) : null;
      if (birthday === "invalid") return fail("bad_details", 400, "Invalid birthday");
      const id = crypto.randomUUID();
      const scan = randomToken(16);
      const card = await newCardSecret();
      const insert = db
        .prepare(
          `INSERT OR IGNORE INTO customers(id, business, name, phone, token, stamps, target, created, card_hash, scan_code, source, consent_marketing, birthday, referred_by)
           VALUES(?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(id, business.id, name, phone, scan, business.target, now, card.hash, scan, role, birthday, user.id);
      const [, r] = await db.batch([releaseArchivedPhone(db, business.id, phone), insert]);
      if (!r.meta.changes) return fail("phone_exists", 409, "Phone already registered");
      return json({ id, cardUrl: `${origin}/c/${card.secret}` });
    }

    case "lookup": {
      if (!(await allow(db, `lookup:${user.id}`, 90, 60))) return fail("rate_limited", 429);
      if (typeof p.scan === "string") {
        const code = p.scan.replace(/^perkly:/, "").slice(0, 100);
        const c = await db.prepare("SELECT * FROM customers WHERE business = ? AND scan_code = ? AND archived IS NULL").bind(business.id, code).first<Customer>();
        if (!c) return fail("unknown_card", 404, "Card not found in this business");
        return json({ results: [{ ...(await cardState(db, c, business.reward_mode)), phone: role === "owner" ? formatPhone(c.phone) : maskPhone(c.phone) }] });
      }
      const q = typeof p.query === "string" ? p.query.trim().slice(0, 60) : "";
      const digits = q.replace(/\D/g, "");
      if (q.length < 2) return json({ results: [] });
      const phoneTail = digits.length >= 4 ? "%" + digits.replace(/^0/, "") + "%" : null;
      const rows = await db
        .prepare(
          `SELECT * FROM customers WHERE business = ? AND archived IS NULL AND (name LIKE ? ESCAPE '\\' ${phoneTail ? "OR phone LIKE ?" : ""})
           ORDER BY name LIMIT 8`,
        )
        .bind(business.id, "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%", ...(phoneTail ? [phoneTail] : []))
        .all<Customer>();
      return json({
        results: await Promise.all(rows.results.map(async (c) => ({ ...(await cardState(db, c, business.reward_mode)), phone: role === "owner" ? formatPhone(c.phone) : maskPhone(c.phone) }))),
      });
    }

    case "stamp":
    case "redeem":
    case "adjust": {
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
      } else if (list.length) {
        return fail("branch_required", 400, "Choose a branch");
      }

      const event = (kind: string, delta: number, note: string | null) =>
        db.prepare(
          `INSERT INTO events(id, customer, actor, kind, delta, created, business, branch, actor_role, stamps_after, note)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT stamps FROM customers WHERE id = ?), ? WHERE changes() = 1`,
        ).bind(requestId, c!.id, user.id, kind, delta, now, business.id, branch, role, c!.id, note);
      const replayed = async () => !!(await db.prepare("SELECT id FROM events WHERE id = ? AND customer = ?").bind(requestId, c!.id).first());
      const done = async (extra: Record<string, unknown> = {}) => {
        const fresh = (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c!.id).first<Customer>())!;
        const card = await cardState(db, fresh, business.reward_mode);
        syncGoogleWallet(db, fresh, card.rewards);
        return json({ ok: true, card, ...extra });
      };
      const refuse = async (code: string) => {
        const fresh = (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c!.id).first<Customer>())!;
        return json({ error: code, code, card: await cardState(db, fresh, business.reward_mode) }, 409);
      };

      if (p.action === "stamp") {
        // Several purchases at once (e.g. 3 coffees) are one action and one history entry.
        const count = p.count === undefined ? 1 : p.count;
        if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > 10) return fail("bad_request", 400, "Count must be 1-10");
        const n = count as number;

        if (business.reward_mode === "block") {
          const result = await db.batch([
            db.prepare(
              "UPDATE customers SET stamps = stamps + ? WHERE id = ? AND business = ? AND stamps + ? <= target AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)",
            ).bind(n, c.id, business.id, n, requestId),
            event("stamp", n, null),
          ]);
          if (result[0].meta.changes) return done();
          if (await replayed()) return done({ replayed: true });
          return refuse(c.stamps >= c.target ? "reward_ready" : "too_many");
        }

        // Collect mode: a full card saves a reward and the next round starts right away.
        // Optimistic update on the exact count we read; retried if another device changed the card meanwhile.
        for (let attempt = 0; attempt < 8; attempt++) {
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
          if (result[0].meta.changes) return done({ earned });
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
        if (result[0].meta.changes) return done();
        if (await replayed()) return done({ replayed: true });
        if (business.reward_mode === "block") {
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

    case "new_card_link": {
      const denied = ownerOnly(); if (denied) return denied;
      const card = await newCardSecret();
      const r = await db.prepare("UPDATE customers SET card_hash = ? WHERE id = ? AND business = ?").bind(card.hash, p.customer ?? "", business.id).run();
      if (!r.meta.changes) return fail("unknown_card", 404, "Customer not found");
      return json({ cardUrl: `${origin}/c/${card.secret}` });
    }

    case "invite_staff": {
      const denied = ownerOnly(); if (denied) return denied;
      if (!(await allow(db, `invite-create:${user.id}`, 30, 86_400))) return fail("rate_limited", 429);
      const label = str(p.label, 60);
      const branch = typeof p.branch === "string" && p.branch ? p.branch : null;
      if (branch && !(await activeBranches(db, business.id)).some((b) => b.id === branch)) return fail("branch_invalid", 400);
      const token = randomToken(24);
      const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await db.prepare("INSERT INTO invites(id, business, role, label, created_by, created, expires, branch) VALUES(?, ?, 'staff', ?, ?, ?, ?, ?)")
        .bind(await sha256(token), business.id, label, user.id, now, expires, branch).run();
      return json({ inviteUrl: `${origin}/invite/${token}`, expires });
    }

    case "revoke_invite": {
      const denied = ownerOnly(); if (denied) return denied;
      await db.prepare("UPDATE invites SET revoked = ? WHERE id = ? AND business = ? AND used IS NULL").bind(now, p.invite ?? "", business.id).run();
      return json({ ok: true });
    }

    case "archive_customer": {
      const denied = ownerOnly(); if (denied) return denied;
      // Nothing is deleted: the history stays, but the customer disappears from lists and their card link stops working.
      const r = await db
        .prepare("UPDATE customers SET archived = ?, card_hash = NULL WHERE id = ? AND business = ? AND archived IS NULL")
        .bind(now, p.customer ?? "", business.id).run();
      if (!r.meta.changes) return fail("unknown_card", 404, "Customer not found");
      return json({ ok: true });
    }

    case "revoke_member": {
      const denied = ownerOnly(); if (denied) return denied;
      // Owners cannot be removed here, so a business never loses its last owner by mistake.
      const r = await db
        .prepare("UPDATE memberships SET revoked = ? WHERE business = ? AND user = ? AND role = 'staff' AND revoked IS NULL")
        .bind(now, business.id, p.user ?? "").run();
      if (!r.meta.changes) return fail("not_found", 404, "Staff member not found");
      // End that person's sessions too, so access stops immediately on every device.
      const others = await db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE user = ? AND revoked IS NULL").bind(p.user ?? "").first<{ n: number }>();
      if (!others?.n) await db.prepare("DELETE FROM sessions WHERE user = ?").bind(p.user ?? "").run();
      return json({ ok: true });
    }

    case "create_branch": {
      const denied = ownerOnly(); if (denied) return denied;
      const name = str(p.name, 60);
      if (!name) return fail("bad_details", 400);
      const count = await db.prepare("SELECT COUNT(*) AS n FROM branches WHERE business = ?").bind(business.id).first<{ n: number }>();
      if ((count?.n ?? 0) >= 50) return fail("rate_limited", 429, "Too many branches");
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO branches(id, business, name, created) VALUES(?, ?, ?, ?)").bind(id, business.id, name, now).run();
      return json({ id });
    }

    case "rename_branch": {
      const denied = ownerOnly(); if (denied) return denied;
      const name = str(p.name, 60);
      if (!name) return fail("bad_details", 400);
      const r = await db.prepare("UPDATE branches SET name = ? WHERE id = ? AND business = ? AND archived IS NULL").bind(name, p.branch ?? "", business.id).run();
      return r.meta.changes ? json({ ok: true }) : fail("branch_invalid", 404);
    }

    case "archive_branch": {
      const denied = ownerOnly(); if (denied) return denied;
      // History keeps the branch name; staff tied to it must be moved before they can act again.
      const r = await db.prepare("UPDATE branches SET archived = ? WHERE id = ? AND business = ? AND archived IS NULL").bind(now, p.branch ?? "", business.id).run();
      return r.meta.changes ? json({ ok: true }) : fail("branch_invalid", 404);
    }

    case "set_member_branch": {
      const denied = ownerOnly(); if (denied) return denied;
      const branch = typeof p.branch === "string" && p.branch ? p.branch : null;
      if (branch && !(await activeBranches(db, business.id)).some((b) => b.id === branch)) return fail("branch_invalid", 400);
      const r = await db.prepare("UPDATE memberships SET branch = ? WHERE business = ? AND user = ? AND role = 'staff' AND revoked IS NULL")
        .bind(branch, business.id, p.user ?? "").run();
      return r.meta.changes ? json({ ok: true }) : fail("not_found", 404);
    }

    case "save_design": {
      const denied = ownerOnly(); if (denied) return denied;
      const design = sanitizeDesign(p.design);
      if (!design) return fail("bad_details", 400, "Invalid design");
      if (!(await ownsAssets(db, business.id, design))) return fail("not_found", 404, "Image not found");
      await db.prepare("UPDATE businesses SET design_draft = ? WHERE id = ?").bind(JSON.stringify(design), business.id).run();
      return json({ ok: true });
    }

    case "publish_design": {
      const denied = ownerOnly(); if (denied) return denied;
      const row = await db.prepare("SELECT design_draft FROM businesses WHERE id = ?").bind(business.id).first<{ design_draft: string | null }>();
      const design = row?.design_draft ? sanitizeDesign(JSON.parse(row.design_draft)) : null;
      if (!design) return fail("nothing_to_publish", 400, "Save a draft first");
      if (!(await ownsAssets(db, business.id, design))) return fail("not_found", 404, "Image not found");
      const checks = designChecks(design, await assetMeta(db, business.id, assetIds(design)));
      if (checks.some((c) => c.level === "bad")) return json({ error: "design_checks", code: "design_checks", checks }, 409);
      // New immutable version. Stamps and rewards are not touched.
      await db
        .prepare(
          `INSERT INTO card_designs(id, business, version, data, published, published_by)
           SELECT ?, ?, COALESCE(MAX(version), 0) + 1, ?, ?, ? FROM card_designs WHERE business = ?`,
        )
        .bind(crypto.randomUUID(), business.id, JSON.stringify(design), now, user.id, business.id)
        .run();
      const live = await publishedDesign(db, business.id);
      return json({ ok: true, version: live?.version });
    }

    case "new_join_code": {
      const denied = ownerOnly(); if (denied) return denied;
      await db.prepare("UPDATE businesses SET join_code = ? WHERE id = ?").bind(randomCode(10), business.id).run();
      return json({ ok: true });
    }

    default:
      return fail("bad_request", 400, "Unknown action");
  }
}

