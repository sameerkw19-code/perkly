import { env, waitUntil } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getMembership, getMemberships, getUser, isPlatformAdmin, normalizeEmail } from "../../../lib/server/auth";
import { randomCode, randomToken, sha256 } from "../../../lib/server/crypto";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { formatPhone, maskPhone, normalizePhone } from "../../../lib/phone";
import { assetIds, defaultDesign, designChecks, is3d, sanitizeDesign } from "../../../lib/design";
import { assetMeta, liveDesign, ownsAssets, passLook, publishedDesign } from "../../../lib/server/designs";
import { originalPhone, releaseArchivedPhone } from "../../../lib/server/customers";
import { AMOUNT_MAX, AVG_TARGET_MAX, BP_MAX, BP_MIN, type Program } from "../../../lib/cashback.ts";
import { START_DAYS, businessAccess, freeLimitReached, hasPaidDesign } from "../../../lib/server/billing";
import { formatBirthday, parseBirthday, upcomingKeys } from "../../../lib/birthday";
import { pushAppleBusiness } from "../../../lib/server/apple-push";
import { resolvePlace } from "../../../lib/server/geo";
import { NEAR_TEXT_MAX } from "../../../lib/near-text";
import { ensureBusinessClass, walletConfig } from "../../../lib/server/google-wallet";
import { getSettings } from "../../../lib/server/settings";
import { normalizeSocial, parseSocial } from "../../../lib/social";
import { regionFrom } from "../../../lib/server/region";
import { isKind, startDesign } from "../../../lib/start-design";
import { activeBranches, cardAction, cardState, type Business, type Customer } from "../../../lib/server/card-actions";

export const dynamic = "force-dynamic";


const COLOR = /^#[0-9a-fA-F]{6}$/;


/** Stamps for a reward: 2 to 30. The average card allows longer rounds (a supermarket: 40 baskets, the 41st free). */
function validTarget(v: unknown, program?: string): v is number {
  return Number.isInteger(v) && (v as number) >= 2 && (v as number) <= (program === "average" ? AVG_TARGET_MAX : 30);
}

async function loadBusiness(db: D1Database, id: string) {
  const row = await db
    .prepare("SELECT id, name, reward, target, color, join_code, staff_adjust, reward_mode, reward_expiry_days, birthdays, social, owner_designs, program, cashback_bp, cashback_min, currency, avg_cap, pos_only, near_text FROM businesses WHERE id = ?")
    .bind(id)
    .first<Omit<Business, "social"> & { social: string | null }>();
  return row ? { ...row, social: parseSocial(row.social) } : null;
}

/** A platform admin opening a business they are not a member of: owner permissions (plus the admin-only actions). */
async function adminMembership(db: D1Database, businessId: unknown) {
  if (typeof businessId !== "string" || !businessId) return null;
  const b = await db.prepare("SELECT id, name FROM businesses WHERE id = ? AND archived IS NULL").bind(businessId).first<{ id: string; name: string }>();
  return b ? { business: b.id, businessName: b.name, role: "owner" as const, branch: null as string | null } : null;
}

/**
 * Every saved card of the business gets the new content: Google Wallet passes through the background job
 * (a batch at a time), iPhones by a push that makes them fetch the pass again.
 */
async function refreshPasses(db: D1Database, businessId: string, origin: string, now: string) {
  await db
    .prepare(
      `INSERT INTO wallet_outbox(id, business, customer, kind, not_before, created, origin)
       SELECT 'sync:' || id, business, id, 'sync', ?1, ?1, ?2 FROM customers WHERE business = ?3 AND google_wallet IS NOT NULL AND archived IS NULL
       ON CONFLICT(id) DO UPDATE SET done = NULL, result = NULL, attempts = 0, not_before = excluded.not_before, origin = excluded.origin`,
    )
    .bind(now, origin, businessId)
    .run();
  pushAppleBusiness(db, businessId);
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
  // A platform admin can open any business (from the control center) to manage its card, settings and team.
  const admin = isPlatformAdmin(user, env);
  // An admin who is also on a business's team (say, as staff after handing it over) still manages it in full.
  const managed = admin && wanted && !memberships.some((m) => m.business === wanted && m.role === "owner") ? await adminMembership(db, wanted) : null;
  if (managed) {
    const own = memberships.findIndex((m) => m.business === wanted);
    if (own >= 0) memberships.splice(own, 1);
    memberships.push(managed);
  }
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
  // A light check the open dashboard makes every 30 seconds: who joined since the last check.
  // Without a valid time it only returns the server's time, to start counting from now.
  const joinedSince = url.searchParams.get("joinedSince");
  if (joinedSince !== null) {
    const checked = new Date().toISOString();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(joinedSince)) return json({ joined: [], next: checked });
    const rows = await db
      .prepare("SELECT id, name, created FROM customers WHERE business = ? AND archived IS NULL AND created > ? ORDER BY created LIMIT 20")
      .bind(business!.id, joinedSince)
      .all<{ id: string; name: string; created: string }>();
    const joined = rows.results;
    return json({ joined: joined.map((c) => ({ id: c.id, name: c.name })), next: joined.length ? joined[joined.length - 1].created : checked });
  }
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
  // No QR or join link until the business may accept customers (paid, free access, or not suspended).
  if (!access.ok) business!.join_code = null;
  // Setup period: free access from Perkly (or the sign-up trial) while the card is prepared, and no subscription yet.
  // The owner sees until when, and a button to start the subscription. Not for free access with no end date.
  const comp = await db
    .prepare("SELECT b.comp_until, s.status FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id WHERE b.id = ?")
    .bind(business!.id)
    .first<{ comp_until: string | null; status: string | null }>();
  const setup =
    comp?.comp_until && comp.comp_until > new Date().toISOString() && !comp.comp_until.startsWith("9999") && !["active", "trialing"].includes(comp.status ?? "")
      ? { until: comp.comp_until }
      : null;
  const base = { me, memberships, role, manage: admin, ownsBusiness: membership !== managed, business, branches, myBranch: membership.branch, design: await liveDesign(db, business!), access, setup, birthdays, system, googleWallet: walletConfig(env) !== null };

  if (role === "staff") {
    const mine = await db
      .prepare(
        `SELECT e.kind, e.delta, e.amount, e.created, c.name AS customer, br.name AS branch_name FROM events e
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
  // Summary: the last day, week and month, each against the same length before it
  // (whole business, not the range or branch filter).
  const periodSummary = (days: number) => {
    const mid = new Date(Date.now() - days * 86_400_000).toISOString();
    const start = new Date(Date.now() - 2 * days * 86_400_000).toISOString();
    return db.prepare(
      // Returning: customers who came in the period and had joined before it started.
      `SELECT
         COALESCE(SUM(CASE WHEN e.kind = 'stamp' AND e.created >= ?2 THEN e.delta ELSE 0 END), 0) AS stamps_now,
         COALESCE(SUM(CASE WHEN e.kind = 'stamp' AND e.created < ?2 THEN e.delta ELSE 0 END), 0) AS stamps_prev,
         COALESCE(SUM(e.kind = 'redeem' AND e.created >= ?2), 0) AS redeemed_now,
         COALESCE(SUM(e.kind = 'redeem' AND e.created < ?2), 0) AS redeemed_prev,
         COUNT(DISTINCT CASE WHEN e.created >= ?2 THEN e.customer END) AS visitors_now,
         COUNT(DISTINCT CASE WHEN e.created < ?2 THEN e.customer END) AS visitors_prev,
         COUNT(DISTINCT CASE WHEN e.created >= ?2 AND c.created < ?2 THEN e.customer END) AS returning_now,
         COUNT(DISTINCT CASE WHEN e.created < ?2 AND c.created < ?3 THEN e.customer END) AS returning_prev,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND created >= ?2) AS joined_now,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND created >= ?3 AND created < ?2) AS joined_prev,
         -- Balance card: purchases, their total, the credit given and the balance used (minor units).
         COALESCE(SUM(e.kind = 'earn' AND e.created >= ?2), 0) AS purchases_now,
         COALESCE(SUM(e.kind = 'earn' AND e.created < ?2), 0) AS purchases_prev,
         COALESCE(SUM(CASE WHEN e.kind IN ('earn', 'stamp') AND e.created >= ?2 THEN e.amount ELSE 0 END), 0) AS sales_now,
         COALESCE(SUM(CASE WHEN e.kind IN ('earn', 'stamp') AND e.created < ?2 THEN e.amount ELSE 0 END), 0) AS sales_prev,
         -- The "average" card: the value of the free purchases given.
         COALESCE(SUM(CASE WHEN e.kind = 'redeem' AND e.created >= ?2 THEN e.amount ELSE 0 END), 0) AS given_now,
         COALESCE(SUM(CASE WHEN e.kind = 'redeem' AND e.created < ?2 THEN e.amount ELSE 0 END), 0) AS given_prev,
         COALESCE(SUM(CASE WHEN e.kind = 'earn' AND e.created >= ?2 THEN e.delta ELSE 0 END), 0) AS credit_now,
         COALESCE(SUM(CASE WHEN e.kind = 'earn' AND e.created < ?2 THEN e.delta ELSE 0 END), 0) AS credit_prev,
         COALESCE(SUM(CASE WHEN e.kind = 'spend' AND e.created >= ?2 THEN e.amount ELSE 0 END), 0) AS used_now,
         COALESCE(SUM(CASE WHEN e.kind = 'spend' AND e.created < ?2 THEN e.amount ELSE 0 END), 0) AS used_prev
       FROM events e JOIN customers c ON c.id = e.customer
       WHERE e.business = ?1 AND e.created >= ?3 AND e.kind IN ('stamp', 'redeem', 'earn', 'spend')`,
    ).bind(business!.id, mid, start);
  };
  // Stamps and rewards per staff member and per branch, for the last day, week and month (the reports).
  const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const breakdown = (by: "actor" | "branch") =>
    db.prepare(
      `SELECT e.${by} AS id, ${by === "actor" ? "COALESCE(u.name, pk.label)" : "br.name"} AS name,
         COALESCE(SUM(CASE WHEN e.kind = 'stamp' AND e.created >= ?2 THEN e.delta ELSE 0 END), 0) AS stamps_day,
         COALESCE(SUM(e.kind = 'redeem' AND e.created >= ?2), 0) AS redeemed_day,
         COALESCE(SUM(CASE WHEN e.kind = 'stamp' AND e.created >= ?3 THEN e.delta ELSE 0 END), 0) AS stamps_week,
         COALESCE(SUM(e.kind = 'redeem' AND e.created >= ?3), 0) AS redeemed_week,
         COALESCE(SUM(CASE WHEN e.kind = 'stamp' THEN e.delta ELSE 0 END), 0) AS stamps_month,
         COALESCE(SUM(e.kind = 'redeem'), 0) AS redeemed_month,
         COALESCE(SUM(e.kind = 'earn' AND e.created >= ?2), 0) AS purchases_day,
         COALESCE(SUM(CASE WHEN e.kind = 'earn' AND e.created >= ?2 THEN e.amount ELSE 0 END), 0) AS sales_day,
         COALESCE(SUM(e.kind = 'earn' AND e.created >= ?3), 0) AS purchases_week,
         COALESCE(SUM(CASE WHEN e.kind = 'earn' AND e.created >= ?3 THEN e.amount ELSE 0 END), 0) AS sales_week,
         COALESCE(SUM(e.kind = 'earn'), 0) AS purchases_month,
         COALESCE(SUM(CASE WHEN e.kind = 'earn' THEN e.amount ELSE 0 END), 0) AS sales_month
       FROM events e ${by === "actor" ? "LEFT JOIN users u ON u.id = e.actor LEFT JOIN pos_keys pk ON 'pos:' || pk.id = e.actor" : "LEFT JOIN branches br ON br.id = e.branch"}
       WHERE e.business = ?1 AND e.created >= ?4 AND e.kind IN ('stamp', 'redeem', 'earn', 'spend')
       GROUP BY e.${by} ORDER BY stamps_month DESC, purchases_month DESC LIMIT 50`,
    ).bind(business!.id, ago(1), ago(7), ago(30));
  const [customers, events, stats, team, invites, busyCustomers, busyStaff, perBranch, staffFixes, sumDay, sumWeek, sumMonth, byStaff, byBranch] = await db.batch([
    db.prepare(
      `SELECT c.id, c.name, c.phone, c.stamps, c.target, c.balance, c.created, c.source, c.consent_marketing, c.birthday, c.card_hash IS NOT NULL AS has_link,
         (SELECT COUNT(*) FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2))
           + (CASE WHEN ?3 = 'block' AND c.stamps >= c.target THEN 1 ELSE 0 END) AS rewards,
         -- Last visit: the latest stamp or reward use, read per customer through events(customer, created).
         -- (Three times faster than grouping all of a big business's events.)
         (SELECT MAX(e.created) FROM events e WHERE e.customer = c.id AND e.kind IN ('stamp', 'redeem', 'earn', 'spend')) AS last_visit
       FROM customers c
       WHERE c.business = ?1 AND c.archived IS NULL ORDER BY c.created DESC LIMIT 5000`,
    ).bind(business!.id, new Date().toISOString(), business!.reward_mode),
    db.prepare(
      `SELECT e.id, e.kind, e.delta, e.amount, e.balance_after, e.created, e.actor_role, e.stamps_after, e.note, c.name AS customer, COALESCE(u.name, pk.label) AS actor_name, br.name AS branch_name,
         (SELECT COUNT(*) FROM rewards r WHERE r.earned_event = e.id) AS rewards_earned
       FROM events e JOIN customers c ON c.id = e.customer LEFT JOIN users u ON u.id = e.actor LEFT JOIN pos_keys pk ON 'pos:' || pk.id = e.actor LEFT JOIN branches br ON br.id = e.branch
       WHERE e.business = ?1 AND (?2 = '' OR e.branch = ?2) ORDER BY e.created DESC LIMIT 50`,
    ).bind(business!.id, branchFilter),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND archived IS NULL) AS customers,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND archived IS NULL AND created >= ?2) AS new_customers,
         (SELECT COUNT(*) FROM rewards WHERE business = ?1 AND redeemed IS NULL AND (expires IS NULL OR expires > ?4))
           + (CASE WHEN ?5 = 'block' THEN (SELECT COUNT(*) FROM customers WHERE business = ?1 AND stamps >= target) ELSE 0 END) AS rewards_ready,
         (SELECT COALESCE(SUM(delta), 0) FROM events WHERE business = ?1 AND kind = 'stamp' AND created >= ?2 AND (?3 = '' OR branch = ?3)) AS stamps,
         (SELECT COUNT(*) FROM events WHERE business = ?1 AND kind = 'redeem' AND created >= ?2 AND (?3 = '' OR branch = ?3)) AS redemptions,
         (SELECT COALESCE(SUM(balance), 0) FROM customers WHERE business = ?1 AND archived IS NULL) AS open_balance`,
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
      // Stamps given to one customer in the last hour (one action can give several, so the sum counts).
      `SELECT c.name, SUM(e.delta) AS n FROM events e JOIN customers c ON c.id = e.customer
       WHERE e.business = ? AND e.kind = 'stamp' AND e.created >= ? GROUP BY e.customer HAVING n >= 4`,
    ).bind(business!.id, hourAgo),
    db.prepare(
      `SELECT u.name, COUNT(*) AS n FROM events e JOIN users u ON u.id = e.actor
       WHERE e.business = ? AND e.created >= ? GROUP BY e.actor HAVING n >= 40`,
    ).bind(business!.id, hourAgo),
    db.prepare(
      `SELECT e.branch, br.name AS branch_name,
         SUM(CASE WHEN e.kind = 'stamp' THEN e.delta ELSE 0 END) AS stamps, SUM(e.kind = 'redeem') AS redemptions
       FROM events e LEFT JOIN branches br ON br.id = e.branch
       WHERE e.business = ? AND e.created >= ? GROUP BY e.branch ORDER BY stamps DESC`,
    ).bind(business!.id, since),
    db.prepare(
      `SELECT u.name, COUNT(*) AS n FROM events e JOIN users u ON u.id = e.actor
       WHERE e.business = ? AND e.kind = 'adjust' AND e.actor_role = 'staff' AND e.created >= ? GROUP BY e.actor`,
    ).bind(business!.id, dayAgo),
    periodSummary(1),
    periodSummary(7),
    periodSummary(30),
    breakdown("actor"),
    breakdown("branch"),
  ]);

  // Card editor data (Perkly only): draft, live version and uploaded images.
  const canDesign = admin || !!business!.owner_designs;
  const published = canDesign ? await publishedDesign(db, business!.id) : null;
  let editor = null;
  if (canDesign) {
    const draftRow = await db.prepare("SELECT design_draft FROM businesses WHERE id = ?").bind(business!.id).first<{ design_draft: string | null }>();
    const draft = (draftRow?.design_draft && sanitizeDesign(JSON.parse(draftRow.design_draft))) || published?.design || defaultDesign(business!);
    const images = await db.prepare("SELECT id, kind, width, height FROM assets WHERE business = ? AND kind NOT IN ('banner', 'apple_banner', 'wallet_logo') ORDER BY created DESC LIMIT 60").bind(business!.id).all();
    editor = {
      draft,
      publishedVersion: published?.version ?? 0,
      publishedAt: published?.published ?? null,
      hasUnpublished: !!draftRow?.design_draft && draftRow.design_draft !== JSON.stringify(published?.design ?? null),
      images: images.results,
    };
  }

  return json({
    ...base,
    canDesign,
    editor,
    range: days ?? "all",
    branchFilter,
    perBranch: perBranch.results,
    customers: (customers.results as { phone: string; has_link: unknown }[]).map((c) => ({ ...c, phone: formatPhone(c.phone), has_link: !!c.has_link })),
    events: events.results,
    stats: stats.results[0],
    summary: { day: sumDay.results[0], week: sumWeek.results[0], month: sumMonth.results[0] },
    breakdown: { staff: byStaff.results, branches: byBranch.results },
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
    // Perkly can build a business for a client from the control center: it starts owned by the admin, with a free
    // setup period, the market and card language picked by hand. The owner takes it over with an owner link later.
    const forClient = p.forClient === true && isPlatformAdmin(user, env);
    if (!(await allow(db, `create-business:${user.id}`, forClient ? 100 : 10, 86_400))) return fail("rate_limited", 429);
    const name = str(p.name, 80);
    const reward = str(p.reward, 160);
    const asAverage = forClient && p.program === "average" ? "average" : undefined;
    if (!name || !reward || !validTarget(p.target, asAverage) || typeof p.color !== "string" || !COLOR.test(p.color)) {
      return fail("bad_details", 400, "Invalid business details");
    }
    // New businesses collect rewards by default (customers keep earning while a reward waits).
    const mode = p.rewardMode === "block" ? "block" : "bank";
    const id = crypto.randomUUID();
    // The free trial is for an owner's first business only (a second business would otherwise reset it).
    const earlier = await db.prepare("SELECT COUNT(*) AS n FROM businesses WHERE owner = ?").bind(user.id).first<{ n: number }>();
    const setupDays = Number.isInteger(p.setupDays) && (p.setupDays as number) >= 0 && (p.setupDays as number) <= 90 ? (p.setupDays as number) : 30;
    // An owner's first business works with everything (own design, logo and pictures, any number of customers)
    // for at least START_DAYS before a subscription is needed; the admin setting can make it longer.
    const trialDays = forClient ? setupDays : earlier?.n ? 0 : Math.max(sys.trialDays, START_DAYS);
    const region = regionFrom(request.headers);
    const currency = forClient ? (p.market === "intl" ? "USD" : "ILS") : region.currency;
    const cardLang = forClient || region.israel ? (p.lang === "en" ? "en" : "he") : "en";
    // The kind of card: stamps (default) or a balance card with a percentage back (Perkly picks it for a client).
    const program: Program = forClient && (p.program === "cashback" || p.program === "average") ? p.program : "stamps";
    const avgCap = program === "average" && Number.isInteger(p.avgCap) && (p.avgCap as number) >= 0 && (p.avgCap as number) <= AMOUNT_MAX ? (p.avgCap as number) : 0;
    const bp = program === "cashback" && Number.isInteger(p.cashbackBp) && (p.cashbackBp as number) >= BP_MIN && (p.cashbackBp as number) <= BP_MAX ? (p.cashbackBp as number) : 200;
    const minUse = program === "cashback" && Number.isInteger(p.cashbackMin) && (p.cashbackMin as number) >= 0 && (p.cashbackMin as number) <= AMOUNT_MAX ? (p.cashbackMin as number) : 0;
    await db.batch([
      // The currency follows where the owner signs up: shekels in Israel, dollars abroad.
      // Owners design their own card (owner_designs = 1); Perkly can switch that off per business.
      db.prepare("INSERT INTO businesses(id, owner, name, reward, target, color, created, join_code, reward_mode, currency, program, cashback_bp, cashback_min, avg_cap, owner_designs) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)")
        .bind(id, user.id, name, reward, p.target, p.color, now, randomCode(10), program === "average" ? "bank" : mode, currency, program, bp, minUse, avgCap),
      // The starting card: the example look for the business type, in the sign-up language (English abroad).
      // After this the owner (and Perkly) edit it in the design screen.
      db.prepare("INSERT INTO card_designs(id, business, version, data, published, published_by) VALUES(?, ?, 1, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, JSON.stringify(isKind(p.kind) ? startDesign(p.kind, name, reward, cardLang) : defaultDesign({ name, reward, color: p.color }, cardLang)), now, user.id),
      db.prepare("INSERT INTO memberships(id, business, user, role, created) VALUES(?, ?, ?, 'owner', ?)")
        .bind(crypto.randomUUID(), id, user.id, now),
      // Every business starts with its first branch: a name (the business name when none is given) and an address.
      db.prepare("INSERT INTO branches(id, business, name, address, created) VALUES(?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, str(p.branchName, 60) || name, str(p.branchAddress, 160) || null, now),
      // With "require subscription": a free trial, then a subscription is needed (status 'none' is not entitled).
      ...(sys.requireSubscription
        ? [
            db.prepare("INSERT OR IGNORE INTO subscriptions(business, status, updated) VALUES(?, 'none', ?)").bind(id, now),
            db.prepare("UPDATE businesses SET comp_until = ? WHERE id = ?")
              .bind(trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000).toISOString() : null, id),
          ]
        : []),
      // The start period (a business Perkly builds: its setup period) applies whether or not subscriptions are required.
      ...(!sys.requireSubscription && trialDays > 0
        ? [db.prepare("UPDATE businesses SET comp_until = ? WHERE id = ?").bind(new Date(Date.now() + trialDays * 86_400_000).toISOString(), id)]
        : []),
    ]);
    return json({ id });
  }

  for (const key of ["business", "customer", "user", "invite", "branch", "requestId"]) {
    if (p[key] !== undefined && p[key] !== null && typeof p[key] !== "string") return fail("bad_request", 400, "Invalid request");
  }

  // Every other action: the server checks the user's role in this business.
  // A platform admin (Perkly) manages every business with the owner's permissions and more.
  const admin = isPlatformAdmin(user, env);
  const own = await getMembership(db, user.id, p.business);
  // Never less than an owner for an admin, even when they are also on the team as staff.
  const membership = admin && own?.role !== "owner" ? ((await adminMembership(db, p.business)) ?? own) : own;
  if (!membership) return fail("not_found", 404, "Business not found");
  const role = membership.role;
  const business = (await loadBusiness(db, p.business as string))!;
  const ownerOnly = () => (role === "owner" ? null : fail("forbidden", 403, "Owner permission required"));
  // The card design, business settings, team, branches and the join code are managed by Perkly only.
  const adminOnly = () => (admin ? null : fail("admin_only", 403, "Managed by Perkly"));
  // The design, by Perkly, or by the owner when Perkly turned that on for this business.
  const designOnly = () => (admin || (role === "owner" && !!business.owner_designs) ? null : fail("admin_only", 403, "Managed by Perkly"));
  // Access rules. Redeeming a reward a customer already earned is always allowed.
  // - No subscription: free up to FREE_CUSTOMERS customers; beyond that no new stamps, adjustments or customers.
  // - Suspended by a platform admin: nothing changes except redeeming, looking up and removing customers.
  const action = String(p.action);
  const SUB_GATED = ["stamp", "adjust", "register_customer", "purchase", "adjust_balance"];
  const ALLOWED_WHILE_SUSPENDED = ["lookup", "redeem", "spend", "archive_customer"];
  if (action !== "redeem" && action !== "spend") {
    const access = await businessAccess(db, business.id);
    if (!access.ok && access.code === "business_suspended" && !ALLOWED_WHILE_SUSPENDED.includes(action)) {
      return fail(access.code, 402, "Business is suspended");
    }
    if (!access.ok && access.code === "subscription_required" && SUB_GATED.includes(action)) {
      return fail(access.code, 402, "Subscription is not active");
    }
    // Without a subscription: up to FREE_CUSTOMERS customers, then a subscription is needed for more.
    if (action === "register_customer" && freeLimitReached(access)) {
      return fail("free_limit", 402, "Free customer limit reached");
    }
  }

  switch (p.action) {
    case "update_business": {
      const denied = adminOnly(); if (denied) return denied;
      const name = str(p.name, 80);
      const reward = str(p.reward, 160);
      const nextProgram = p.program === "cashback" || p.program === "stamps" || p.program === "average" ? p.program : business.program;
      if (!name || !reward || !validTarget(p.target, nextProgram) || typeof p.color !== "string" || !COLOR.test(p.color)) {
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
      // The kind of card, the percentage back and the minimum balance to use it (the balance card).
      const program: Program = p.program === "cashback" || p.program === "stamps" || p.program === "average" ? p.program : business.program;
      const avgCap = p.avgCap === undefined ? business.avg_cap : p.avgCap;
      if (!Number.isInteger(avgCap) || (avgCap as number) < 0 || (avgCap as number) > AMOUNT_MAX) return fail("bad_details", 400, "Invalid cap");
      const bp = p.cashbackBp === undefined ? business.cashback_bp : p.cashbackBp;
      if (!Number.isInteger(bp) || (bp as number) < BP_MIN || (bp as number) > BP_MAX) return fail("bad_details", 400, "Invalid percentage");
      const minUse = p.cashbackMin === undefined ? business.cashback_min : p.cashbackMin;
      if (!Number.isInteger(minUse) || (minUse as number) < 0 || (minUse as number) > AMOUNT_MAX) return fail("bad_details", 400, "Invalid minimum");
      const statements = [
        db.prepare("UPDATE businesses SET name = ?, reward = ?, target = ?, color = ?, staff_adjust = ?, reward_mode = ?, reward_expiry_days = ?, birthdays = ?, social = ?, program = ?, cashback_bp = ?, cashback_min = ?, avg_cap = ? WHERE id = ?")
          .bind(name, reward, p.target, p.color, staffAdjust, program === "average" ? "bank" : mode, expiry, birthdaysOn, socialJson, program, bp, minUse, avgCap, business.id),
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
    case "adjust":
    case "purchase":
    case "spend":
    case "adjust_balance":
      return cardAction({ db, p, business, actorId: user.id, role, memberBranch: membership.branch, now, origin });

    case "new_card_link": {
      const denied = ownerOnly(); if (denied) return denied;
      const card = await newCardSecret();
      const r = await db.prepare("UPDATE customers SET card_hash = ? WHERE id = ? AND business = ?").bind(card.hash, p.customer ?? "", business.id).run();
      if (!r.meta.changes) return fail("unknown_card", 404, "Customer not found");
      return json({ cardUrl: `${origin}/c/${card.secret}` });
    }

    case "invite_staff": {
      const denied = adminOnly(); if (denied) return denied;
      if (!(await allow(db, `invite-create:${user.id}`, 30, 86_400))) return fail("rate_limited", 429);
      const label = str(p.label, 60);
      // The invite works only for this email, so a forwarded or leaked link is useless to anyone else.
      const email = normalizeEmail(p.email);
      if (!email) return fail("invite_email", 400, "The staff member's email is required");
      const branch = typeof p.branch === "string" && p.branch ? p.branch : null;
      if (branch && !(await activeBranches(db, business.id)).some((b) => b.id === branch)) return fail("branch_invalid", 400);
      const token = randomToken(24);
      const expires = new Date(Date.now() + 2 * 86_400_000).toISOString();
      await db.prepare("INSERT INTO invites(id, business, role, label, created_by, created, expires, branch, email) VALUES(?, ?, 'staff', ?, ?, ?, ?, ?, ?)")
        .bind(await sha256(token), business.id, label, user.id, now, expires, branch, email).run();
      return json({ inviteUrl: `${origin}/invite/${token}`, expires });
    }

    // The owner sends a staff-station link to a worker's phone: it works once, for whoever opens it first,
    // and lasts 3 days. The worker signs up with name, email and password and gets a personal worker code.
    // (Removing a worker stays with Perkly.)
    case "staff_link": {
      const denied = ownerOnly(); if (denied) return denied;
      if (!(await allow(db, `invite-create:${user.id}`, 30, 86_400))) return fail("rate_limited", 429);
      const label = str(p.label, 60) || "";
      // Workers belong to a branch: the owner picks it when there are several; a single branch is automatic.
      const list = await activeBranches(db, business.id);
      let branch: string | null = list.length === 1 ? list[0].id : null;
      if (list.length > 1) {
        if (typeof p.branch !== "string" || !list.some((b) => b.id === p.branch)) return fail("branch_required", 400, "Choose a branch");
        branch = p.branch;
      }
      const token = randomToken(24);
      const expires = new Date(Date.now() + 3 * 86_400_000).toISOString();
      await db.prepare("INSERT INTO invites(id, business, role, label, created_by, created, expires, branch, email) VALUES(?, ?, 'staff', ?, ?, ?, ?, ?, NULL)")
        .bind(await sha256(token), business.id, label, user.id, now, expires, branch).run();
      return json({ inviteUrl: `${origin}/invite/${token}`, expires });
    }

    case "revoke_invite": {
      const denied = adminOnly(); if (denied) return denied;
      await db.prepare("UPDATE invites SET revoked = ? WHERE id = ? AND business = ? AND used IS NULL").bind(now, p.invite ?? "", business.id).run();
      return json({ ok: true });
    }

    case "archive_customer": {
      const denied = ownerOnly(); if (denied) return denied;
      // By default nothing is deleted: the history stays, but the customer disappears from lists and their card link stops working.
      // With erase: the personal details are removed for good (a deletion request). The stamp history stays,
      // without anything that identifies the person.
      const r = p.erase === true
        ? await db
            .prepare(
              `UPDATE customers SET archived = COALESCE(archived, ?1), erased = ?1, card_hash = NULL, google_wallet = NULL,
                 name = '—', phone = 'erased:' || id, birthday = NULL, consent_marketing = 0
               WHERE id = ?2 AND business = ?3 AND erased IS NULL`,
            )
            .bind(now, p.customer ?? "", business.id).run()
        : await db
            .prepare("UPDATE customers SET archived = ?, card_hash = NULL WHERE id = ? AND business = ? AND archived IS NULL")
            .bind(now, p.customer ?? "", business.id).run();
      if (!r.meta.changes) return fail("unknown_card", 404, "Customer not found");
      return json({ ok: true });
    }

    case "removed_customers": {
      const denied = ownerOnly(); if (denied) return denied;
      // Removed but not erased: these can come back. The newest removals first.
      const rows = await db
        .prepare(
          `SELECT id, name, phone, stamps, target, archived FROM customers
           WHERE business = ? AND archived IS NOT NULL AND erased IS NULL ORDER BY archived DESC LIMIT 300`,
        )
        .bind(business.id)
        .all<{ id: string; name: string; phone: string; stamps: number; target: number; archived: string }>();
      return json({ customers: rows.results.map((c) => ({ ...c, phone: formatPhone(originalPhone(c.phone)) })) });
    }

    case "update_customer_phone": {
      // The owner (or Perkly) fixes a customer's number, for example after the customer changed phones.
      // The card, stamps and history stay; only the number changes. Another active card with that number blocks it.
      const denied = ownerOnly(); if (denied) return denied;
      const phone = normalizePhone(p.phone);
      if (!phone) return fail("bad_phone", 400, "Invalid phone");
      const c = await db
        .prepare("SELECT id, phone FROM customers WHERE id = ? AND business = ? AND archived IS NULL AND erased IS NULL")
        .bind(p.customer ?? "", business.id)
        .first<{ id: string; phone: string }>();
      if (!c) return fail("unknown_card", 404, "Customer not found");
      if (c.phone === phone) return json({ ok: true, phone: formatPhone(phone) });
      if (await db.prepare("SELECT 1 FROM customers WHERE business = ? AND phone = ? AND archived IS NULL").bind(business.id, phone).first()) {
        return fail("phone_in_use", 409, "Another card in this business has this phone");
      }
      // A removed card may still hold the number: rename it first, in the same batch.
      const [, r] = await db.batch([
        releaseArchivedPhone(db, business.id, phone),
        db.prepare("UPDATE customers SET phone = ? WHERE id = ? AND business = ? AND archived IS NULL AND erased IS NULL").bind(phone, c.id, business.id),
      ]);
      if (!r.meta.changes) return fail("unknown_card", 404, "Customer not found");
      return json({ ok: true, phone: formatPhone(phone) });
    }

    case "restore_customer": {
      const denied = ownerOnly(); if (denied) return denied;
      const c = await db
        .prepare("SELECT id, phone FROM customers WHERE id = ? AND business = ? AND archived IS NOT NULL AND erased IS NULL")
        .bind(p.customer ?? "", business.id)
        .first<{ id: string; phone: string }>();
      if (!c) return fail("unknown_card", 404, "Customer not found");
      // If the number joined again after the removal, that newer card stays and this one cannot come back.
      const phone = originalPhone(c.phone);
      const taken = await db.prepare("SELECT 1 FROM customers WHERE business = ? AND phone = ? AND archived IS NULL").bind(business.id, phone).first();
      if (taken) return fail("phone_exists", 409, "This phone is already registered in this business");
      // The old card link stopped working at removal; the customer gets a new one. Stamps and wallet passes stay as they were.
      const card = await newCardSecret();
      // Another removed card may still hold the number (removed, joined again, removed again): rename it first, in the same batch.
      const [, r] = await db.batch([
        releaseArchivedPhone(db, business.id, phone),
        db
          .prepare("UPDATE customers SET archived = NULL, phone = ?, card_hash = ? WHERE id = ? AND business = ? AND archived IS NOT NULL AND erased IS NULL")
          .bind(phone, card.hash, c.id, business.id),
      ]);
      if (!r.meta.changes) return fail("unknown_card", 404, "Customer not found");
      return json({ cardUrl: `${origin}/c/${card.secret}` });
    }

    case "revoke_member": {
      const denied = adminOnly(); if (denied) return denied;
      // Owners cannot be removed here, so a business never loses its last owner by mistake.
      const r = await db
        .prepare("UPDATE memberships SET revoked = ? WHERE business = ? AND user = ? AND role = 'staff' AND revoked IS NULL")
        .bind(now, business.id, p.user ?? "").run();
      if (!r.meta.changes) return fail("not_found", 404, "Staff member not found");
      // Unused invites to the same email stop working too, so a removed person cannot come back with one.
      await db
        .prepare("UPDATE invites SET revoked = ? WHERE business = ? AND used IS NULL AND revoked IS NULL AND email = (SELECT email FROM users WHERE id = ?)")
        .bind(now, business.id, p.user ?? "").run();
      // End that person's sessions too, so access stops immediately on every device.
      const others = await db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE user = ? AND revoked IS NULL").bind(p.user ?? "").first<{ n: number }>();
      if (!others?.n) await db.prepare("DELETE FROM sessions WHERE user = ?").bind(p.user ?? "").run();
      return json({ ok: true });
    }

    case "set_near_text": {
      // The business's own lock-screen line near a branch; empty goes back to the automatic one.
      const denied = ownerOnly(); if (denied) return denied;
      const text = typeof p.text === "string" ? p.text.replace(/\s+/g, " ").trim().slice(0, NEAR_TEXT_MAX) : "";
      if ((business.near_text ?? "") === text) return json({ ok: true });
      await db.prepare("UPDATE businesses SET near_text = ?, near_updated = ? WHERE id = ?").bind(text || null, now, business.id).run();
      pushAppleBusiness(db, business.id);
      return json({ ok: true });
    }
    case "create_branch": {
      const denied = adminOnly(); if (denied) return denied;
      const name = str(p.name, 60);
      if (!name) return fail("bad_details", 400);
      const address = str(p.address, 160) || null;
      const count = await db.prepare("SELECT COUNT(*) AS n FROM branches WHERE business = ?").bind(business.id).first<{ n: number }>();
      if ((count?.n ?? 0) >= 50) return fail("rate_limited", 429, "Too many branches");
      const place = typeof p.location === "string" && p.location.trim() ? await resolvePlace(p.location.slice(0, 2000)) : null;
      if (typeof p.location === "string" && p.location.trim() && !place) return fail("location_invalid", 400, "Could not read the place");
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO branches(id, business, name, address, created, lat, lng, located) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, business.id, name, address, now, place?.lat ?? null, place?.lng ?? null, place ? now : null).run();
      if (place) await refreshPasses(db, business.id, new URL(request.url).origin, now);
      return json({ id });
    }

    case "rename_branch": {
      const denied = adminOnly(); if (denied) return denied;
      const name = str(p.name, 60);
      if (!name) return fail("bad_details", 400);
      const address = str(p.address, 160) || null;
      const r = await db.prepare("UPDATE branches SET name = ?, address = ? WHERE id = ? AND business = ? AND archived IS NULL").bind(name, address, p.branch ?? "", business.id).run();
      if (!r.meta.changes) return fail("branch_invalid", 404);
      // The place on the map: a Google Maps link or coordinates; empty clears it; left out keeps it.
      if (typeof p.location === "string") {
        const text = p.location.trim();
        const place = text ? await resolvePlace(text.slice(0, 2000)) : null;
        if (text && !place) return fail("location_invalid", 400, "Could not read the place");
        const was = await db.prepare("SELECT lat, lng FROM branches WHERE id = ?").bind(p.branch).first<{ lat: number | null; lng: number | null }>();
        if (was?.lat !== (place?.lat ?? null) || was?.lng !== (place?.lng ?? null)) {
          await db.prepare("UPDATE branches SET lat = ?, lng = ?, located = ? WHERE id = ?").bind(place?.lat ?? null, place?.lng ?? null, now, p.branch).run();
          await refreshPasses(db, business.id, new URL(request.url).origin, now);
        }
      }
      return json({ ok: true });
    }

    case "archive_branch": {
      const denied = adminOnly(); if (denied) return denied;
      // History keeps the branch name; staff tied to it must be moved before they can act again.
      const r = await db.prepare("UPDATE branches SET archived = ?, located = CASE WHEN lat IS NULL THEN located ELSE ? END WHERE id = ? AND business = ? AND archived IS NULL").bind(now, now, p.branch ?? "", business.id).run();
      if (!r.meta.changes) return fail("branch_invalid", 404);
      // A closed branch with a place on the map: the cards stop showing it.
      const placed = await db.prepare("SELECT lat FROM branches WHERE id = ?").bind(p.branch).first<{ lat: number | null }>();
      if (placed?.lat != null) await refreshPasses(db, business.id, new URL(request.url).origin, now);
      return json({ ok: true });
    }

    case "set_member_branch": {
      const denied = adminOnly(); if (denied) return denied;
      const branch = typeof p.branch === "string" && p.branch ? p.branch : null;
      if (branch && !(await activeBranches(db, business.id)).some((b) => b.id === branch)) return fail("branch_invalid", 400);
      const r = await db.prepare("UPDATE memberships SET branch = ? WHERE business = ? AND user = ? AND role = 'staff' AND revoked IS NULL")
        .bind(branch, business.id, p.user ?? "").run();
      return r.meta.changes ? json({ ok: true }) : fail("not_found", 404);
    }

    case "save_design": {
      const denied = designOnly(); if (denied) return denied;
      const design = sanitizeDesign(p.design);
      if (!design) return fail("bad_details", 400, "Invalid design");
      if (!(await ownsAssets(db, business.id, design))) return fail("not_found", 404, "Image not found");
      // The bright stamp style, the stamp banner in the wallet, the pizza progress and 3D stamps are subscription features.
      if ((design.look.stampStyle === "bright" || design.walletBanner === "stamps" || design.look.progress === "pizza" || is3d(design.stamp.icon)) && !hasPaidDesign(await businessAccess(db, business.id))) {
        return fail("paid_feature", 402, "Available with a subscription");
      }
      // Without a subscription: no new logo, background image or stamp image (ones already on the card may stay).
      if (!hasPaidDesign(await businessAccess(db, business.id))) {
        const kept = new Set(assetIds((await publishedDesign(db, business.id))?.design ?? defaultDesign(business)));
        const draftRow = await db.prepare("SELECT design_draft FROM businesses WHERE id = ?").bind(business.id).first<{ design_draft: string | null }>();
        const draft = draftRow?.design_draft ? sanitizeDesign(JSON.parse(draftRow.design_draft)) : null;
        if (draft) assetIds(draft).forEach((id) => kept.add(id));
        if (assetIds(design).some((id) => !kept.has(id))) return fail("paid_feature", 402, "Available with a subscription");
      }
      await db.prepare("UPDATE businesses SET design_draft = ? WHERE id = ?").bind(JSON.stringify(design), business.id).run();
      return json({ ok: true });
    }

    case "publish_design": {
      const denied = designOnly(); if (denied) return denied;
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
      // Every customer who saved the card to Google Wallet gets the new look: the background job
      // refreshes the passes a batch at a time (see lib/server/customer-messages.ts).
      const origin = new URL(request.url).origin;
      const queued = await db
        .prepare(
          `INSERT INTO wallet_outbox(id, business, customer, kind, not_before, created, origin)
           SELECT 'sync:' || id, business, id, 'sync', ?1, ?1, ?2 FROM customers WHERE business = ?3 AND google_wallet IS NOT NULL AND archived IS NULL
           ON CONFLICT(id) DO UPDATE SET done = NULL, result = NULL, attempts = 0, not_before = excluded.not_before, origin = excluded.origin`,
        )
        .bind(now, origin, business.id)
        .run();
      pushAppleBusiness(db, business.id);
      // Google Wallet: the business's class carries its logo and color; refresh it with the new design.
      const google = walletConfig(env);
      if (google) {
        waitUntil(
          passLook(db, business, origin)
            .then((look) => ensureBusinessClass(google, business.id, look.classLook))
            .catch((e) => console.log("google wallet class refresh error", String(e))),
        );
      }
      return json({ ok: true, version: live?.version, walletUpdates: queued.meta.changes ?? 0 });
    }

    case "new_join_code": {
      const denied = adminOnly(); if (denied) return denied;
      await db.prepare("UPDATE businesses SET join_code = ? WHERE id = ?").bind(randomCode(10), business.id).run();
      return json({ ok: true });
    }

    default:
      return fail("bad_request", 400, "Unknown action");
  }
}

