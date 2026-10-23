import { getD1 } from "../../../db";
import { getMemberships, getRole, getUser } from "../../../lib/server/auth";
import { randomCode, randomToken, sha256 } from "../../../lib/server/crypto";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { formatPhone, maskPhone, normalizePhone } from "../../../lib/phone";
import { assetIds, defaultDesign, designChecks, sanitizeDesign } from "../../../lib/design";
import { assetMeta, liveDesign, ownsAssets, publishedDesign } from "../../../lib/server/designs";

export const dynamic = "force-dynamic";

type Business = { id: string; name: string; reward: string; target: number; color: string; join_code: string | null };
type Customer = { id: string; business: string; name: string; phone: string; stamps: number; target: number; scan_code: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

function validTarget(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 2 && (v as number) <= 30;
}

async function loadBusiness(db: D1Database, id: string) {
  return db.prepare("SELECT id, name, reward, target, color, join_code FROM businesses WHERE id = ?").bind(id).first<Business>();
}

function cardState(c: Customer) {
  return { id: c.id, name: c.name, stamps: c.stamps, target: c.target, rewardReady: c.stamps >= c.target };
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
  const me = { name: user.name, email: user.email };
  if (!membership) return json({ me, memberships, business: null, role: null });

  const business = await loadBusiness(db, membership.business);
  const role = membership.role;
  const base = { me, memberships, role, business, design: await liveDesign(db, business!) };

  if (role === "staff") {
    const mine = await db
      .prepare(
        `SELECT e.kind, e.delta, e.created, c.name AS customer FROM events e JOIN customers c ON c.id = e.customer
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

  const [customers, events, stats, team, invites, busyCustomers, busyStaff] = await db.batch([
    db.prepare(
      `SELECT id, name, phone, stamps, target, created, source, consent_marketing, card_hash IS NOT NULL AS has_link
       FROM customers WHERE business = ? ORDER BY created DESC LIMIT 5000`,
    ).bind(business!.id),
    db.prepare(
      `SELECT e.id, e.kind, e.delta, e.created, e.actor_role, e.stamps_after, e.note, c.name AS customer, u.name AS actor_name
       FROM events e JOIN customers c ON c.id = e.customer LEFT JOIN users u ON u.id = e.actor
       WHERE e.business = ? ORDER BY e.created DESC LIMIT 50`,
    ).bind(business!.id),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM customers WHERE business = ?1) AS customers,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND created >= ?2) AS new_customers,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND stamps >= target) AS rewards_ready,
         (SELECT COUNT(*) FROM events WHERE business = ?1 AND kind = 'stamp' AND created >= ?2) AS stamps,
         (SELECT COUNT(*) FROM events WHERE business = ?1 AND kind = 'redeem' AND created >= ?2) AS redemptions`,
    ).bind(business!.id, since),
    db.prepare(
      `SELECT u.id, u.name, u.email, m.role, m.created, m.revoked FROM memberships m JOIN users u ON u.id = m.user
       WHERE m.business = ? ORDER BY m.role, m.created`,
    ).bind(business!.id),
    db.prepare(
      `SELECT id, label, role, created, expires FROM invites
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
    customers: (customers.results as any[]).map((c) => ({ ...c, phone: formatPhone(c.phone), has_link: !!c.has_link })),
    events: events.results,
    stats: stats.results[0],
    team: team.results,
    invites: invites.results,
    alerts: [
      ...(busyCustomers.results as any[]).map((r) => ({ type: "customer", name: r.name, count: r.n })),
      ...(busyStaff.results as any[]).map((r) => ({ type: "staff", name: r.name, count: r.n })),
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

  // Creating a business is the only action that does not need an existing membership.
  if (p.action === "create_business") {
    if (!(await allow(db, `create-business:${user.id}`, 10, 86_400))) return fail("rate_limited", 429);
    const name = str(p.name, 80);
    const reward = str(p.reward, 160);
    if (!name || !reward || !validTarget(p.target) || typeof p.color !== "string" || !COLOR.test(p.color)) {
      return fail("bad_details", 400, "Invalid business details");
    }
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO businesses(id, owner, name, reward, target, color, created, join_code) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, user.id, name, reward, p.target, p.color, now, randomCode(10)),
      db.prepare("INSERT INTO memberships(id, business, user, role, created) VALUES(?, ?, ?, 'owner', ?)")
        .bind(crypto.randomUUID(), id, user.id, now),
    ]);
    return json({ id });
  }

  // Every other action: the server checks the user's role in this business.
  const role = await getRole(db, user.id, p.business);
  if (!role) return fail("not_found", 404, "Business not found");
  const business = (await loadBusiness(db, p.business as string))!;
  const ownerOnly = () => (role === "owner" ? null : fail("forbidden", 403, "Owner permission required"));

  switch (p.action) {
    case "update_business": {
      const denied = ownerOnly(); if (denied) return denied;
      const name = str(p.name, 80);
      const reward = str(p.reward, 160);
      if (!name || !reward || !validTarget(p.target) || typeof p.color !== "string" || !COLOR.test(p.color)) {
        return fail("bad_details", 400, "Invalid business details");
      }
      // A new target applies to new cards and to existing cards from their next round (after redemption).
      await db.prepare("UPDATE businesses SET name = ?, reward = ?, target = ?, color = ? WHERE id = ?")
        .bind(name, reward, p.target, p.color, business.id).run();
      return json({ ok: true });
    }

    case "register_customer": {
      if (!(await allow(db, `register:${user.id}`, 60, 3600))) return fail("rate_limited", 429);
      const name = str(p.name, 80);
      const phone = normalizePhone(p.phone);
      if (!name || !phone) return fail("bad_details", 400, "Invalid name or phone");
      const id = crypto.randomUUID();
      const scan = randomToken(16);
      const card = await newCardSecret();
      const r = await db
        .prepare(
          `INSERT OR IGNORE INTO customers(id, business, name, phone, token, stamps, target, created, card_hash, scan_code, source, consent_marketing)
           VALUES(?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)`,
        )
        .bind(id, business.id, name, phone, scan, business.target, now, card.hash, scan, role)
        .run();
      if (!r.meta.changes) return fail("phone_exists", 409, "Phone already registered");
      return json({ id, cardUrl: `${origin}/c/${card.secret}` });
    }

    case "lookup": {
      if (!(await allow(db, `lookup:${user.id}`, 90, 60))) return fail("rate_limited", 429);
      if (typeof p.scan === "string") {
        const code = p.scan.replace(/^perkly:/, "").slice(0, 100);
        const c = await db.prepare("SELECT * FROM customers WHERE business = ? AND scan_code = ?").bind(business.id, code).first<Customer>();
        if (!c) return fail("unknown_card", 404, "Card not found in this business");
        return json({ results: [{ ...cardState(c), phone: role === "owner" ? formatPhone(c.phone) : maskPhone(c.phone) }] });
      }
      const q = typeof p.query === "string" ? p.query.trim().slice(0, 60) : "";
      const digits = q.replace(/\D/g, "");
      if (q.length < 2) return json({ results: [] });
      const phoneTail = digits.length >= 4 ? "%" + digits.replace(/^0/, "") + "%" : null;
      const rows = await db
        .prepare(
          `SELECT * FROM customers WHERE business = ? AND (name LIKE ? ESCAPE '\\' ${phoneTail ? "OR phone LIKE ?" : ""})
           ORDER BY name LIMIT 8`,
        )
        .bind(business.id, "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%", ...(phoneTail ? [phoneTail] : []))
        .all<Customer>();
      return json({
        results: rows.results.map((c) => ({ ...cardState(c), phone: role === "owner" ? formatPhone(c.phone) : maskPhone(c.phone) })),
      });
    }

    case "stamp":
    case "redeem":
    case "adjust": {
      if (p.action === "adjust") { const denied = ownerOnly(); if (denied) return denied; }
      if (typeof p.requestId !== "string" || !UUID.test(p.requestId)) return fail("bad_request", 400, "Invalid request id");
      if (!(await allow(db, `act:${user.id}`, 60, 60))) return fail("rate_limited", 429, "Too many actions");
      const c = await db.prepare("SELECT * FROM customers WHERE id = ? AND business = ?").bind(p.customer ?? "", business.id).first<Customer>();
      if (!c) return fail("unknown_card", 404, "Customer not found");

      let update: D1PreparedStatement;
      let delta: number;
      let note: string | null = null;
      if (p.action === "stamp") {
        delta = 1;
        update = db.prepare(
          "UPDATE customers SET stamps = stamps + 1 WHERE id = ? AND business = ? AND stamps < target AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)",
        ).bind(c.id, business.id, p.requestId);
      } else if (p.action === "redeem") {
        delta = -c.target;
        // The next round uses the business's current target.
        update = db.prepare(
          `UPDATE customers SET stamps = stamps - target, target = (SELECT target FROM businesses WHERE id = ?)
           WHERE id = ? AND business = ? AND stamps >= target AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)`,
        ).bind(business.id, c.id, business.id, p.requestId);
      } else {
        if (p.delta !== 1 && p.delta !== -1) return fail("bad_request", 400, "Correction must be +1 or -1");
        note = str(p.note, 200);
        if (!note) return fail("note_required", 400, "A reason is required for corrections");
        delta = p.delta;
        update = db.prepare(
          "UPDATE customers SET stamps = stamps + ? WHERE id = ? AND business = ? AND stamps + ? BETWEEN 0 AND target AND NOT EXISTS(SELECT 1 FROM events WHERE id = ?)",
        ).bind(delta, c.id, business.id, delta, p.requestId);
      }

      // Balance change and history entry are written together, or not at all.
      const result = await db.batch([
        update,
        db.prepare(
          `INSERT INTO events(id, customer, actor, kind, delta, created, business, actor_role, stamps_after, note)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, (SELECT stamps FROM customers WHERE id = ?), ? WHERE changes() = 1`,
        ).bind(p.requestId, c.id, user.id, p.action, delta, now, business.id, role, c.id, note),
      ]);

      const fresh = (await db.prepare("SELECT * FROM customers WHERE id = ?").bind(c.id).first<Customer>())!;
      if (!result[0].meta.changes) {
        const previous = await db.prepare("SELECT id FROM events WHERE id = ? AND customer = ?").bind(p.requestId, c.id).first();
        if (previous) return json({ ok: true, replayed: true, card: cardState(fresh) });
        const code = p.action === "stamp" ? "reward_ready" : p.action === "redeem" ? "not_ready" : "out_of_range";
        return json({ error: code, code, card: cardState(fresh) }, 409);
      }
      return json({ ok: true, card: cardState(fresh) });
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
      const token = randomToken(24);
      const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await db.prepare("INSERT INTO invites(id, business, role, label, created_by, created, expires) VALUES(?, ?, 'staff', ?, ?, ?, ?)")
        .bind(await sha256(token), business.id, label, user.id, now, expires).run();
      return json({ inviteUrl: `${origin}/invite/${token}`, expires });
    }

    case "revoke_invite": {
      const denied = ownerOnly(); if (denied) return denied;
      await db.prepare("UPDATE invites SET revoked = ? WHERE id = ? AND business = ? AND used IS NULL").bind(now, p.invite ?? "", business.id).run();
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

