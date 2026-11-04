import { env, waitUntil } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getMemberships, getRole, getUser, isPlatformAdmin } from "../../../lib/server/auth";
import { businessAccess, freeLimitReached, hasPaidDesign } from "../../../lib/server/billing";
import { sendMemberPass, newMemberSecret, type MemberRow } from "../../../lib/server/club";
import { walletConfig } from "../../../lib/server/google-wallet";
import { fail, json, readJson, sameOrigin, str } from "../../../lib/server/http";
import { clubPlanConfigured } from "../../../lib/server/polar";
import { allow } from "../../../lib/server/rate-limit";
import { getSettings } from "../../../lib/server/settings";
import { validDate } from "../../../lib/club";
import { normalizePhone } from "../../../lib/phone";

export const dynamic = "force-dynamic";

const COLOR = /^#[0-9a-fA-F]{6}$/;
const ASSET_ID = /^[0-9a-f-]{36}$/;
/** A club's list is sent whole and searched in the browser. */
const MAX_MEMBERS = 2000;

type Club = { id: string; name: string; color: string; club_logo: string | null };

/** The club, only if this user owns it and it really is a club. Stamp businesses never pass. */
async function ownedClub(db: D1Database, userId: string, id: unknown): Promise<Club | null> {
  if ((await getRole(db, userId, id)) !== "owner") return null;
  return db.prepare("SELECT id, name, color, club_logo FROM businesses WHERE id = ? AND product = 'club'").bind(id).first<Club>();
}

function cardLink(origin: string, secret: string) {
  return `${origin}/m/${secret}`;
}

/** The member's details as they go to the browser. The card hash never leaves the server. */
function publicMember(m: MemberRow) {
  return { id: m.id, memberNo: m.member_no, name: m.name, phone: m.phone, plan: m.plan, validUntil: m.valid_until, wallet: !!m.google_wallet };
}

// Owner only: the clubs this user owns, and the members of one of them.
export async function GET(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  const memberships = await getMemberships(db, user.id);
  const clubs = memberships.filter((m) => m.product === "club" && m.role === "owner").map((m) => ({ id: m.business, name: m.businessName }));
  const hasStamps = memberships.some((m) => m.product !== "club");
  const me = { name: user.name };
  const wanted = new URL(request.url).searchParams.get("business");
  const id = clubs.find((c) => c.id === wanted)?.id ?? clubs[0]?.id;
  if (!id) return json({ me, clubs, hasStamps, club: null });

  const club = (await ownedClub(db, user.id, id))!;
  const rows = await db
    .prepare("SELECT * FROM club_members WHERE business = ? AND archived IS NULL ORDER BY member_no DESC LIMIT ?")
    .bind(id, MAX_MEMBERS)
    .all<MemberRow>();
  const access = await businessAccess(db, id);
  const sub = await db.prepare("SELECT status FROM subscriptions WHERE business = ?").bind(id).first<{ status: string }>();
  return json({
    me,
    clubs,
    hasStamps,
    club: { id: club.id, name: club.name, color: club.color, logo: club.club_logo },
    members: rows.results.map(publicMember),
    access,
    subscribed: sub?.status === "active" || sub?.status === "trialing",
    canSubscribe: clubPlanConfigured(env),
  });
}

export async function POST(request: Request) {
  const p = await readJson(request);
  if (!sameOrigin(request)) return fail("bad_origin", 403, "Invalid origin");
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  if (!p) return fail("bad_request", 400, "Invalid request");
  const sys = await getSettings(db);
  if (sys.maintenance && !isPlatformAdmin(user, env)) return fail("maintenance", 503, "Maintenance");
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();

  if (p.action === "create_club") {
    if (!sys.signupsOpen && !isPlatformAdmin(user, env)) return fail("signups_closed", 403, "New businesses are closed");
    if (!(await allow(db, `create-business:${user.id}`, 10, 86_400))) return fail("rate_limited", 429);
    const name = str(p.name, 80);
    if (!name || typeof p.color !== "string" || !COLOR.test(p.color)) return fail("bad_details", 400, "Invalid club details");
    const id = crypto.randomUUID();
    // The free trial is for an owner's first business only, same as stamp businesses.
    const earlier = await db.prepare("SELECT COUNT(*) AS n FROM businesses WHERE owner = ?").bind(user.id).first<{ n: number }>();
    const trialDays = earlier?.n ? 0 : sys.trialDays;
    await db.batch([
      // No join code: members are added by the club. reward and target belong to the stamp card.
      db.prepare("INSERT INTO businesses(id, owner, name, reward, target, color, created, product) VALUES(?, ?, ?, '', 1, ?, ?, 'club')")
        .bind(id, user.id, name, p.color, now),
      db.prepare("INSERT INTO memberships(id, business, user, role, created) VALUES(?, ?, ?, 'owner', ?)")
        .bind(crypto.randomUUID(), id, user.id, now),
      ...(sys.requireSubscription
        ? [
            db.prepare("INSERT OR IGNORE INTO subscriptions(business, status, updated) VALUES(?, 'none', ?)").bind(id, now),
            db.prepare("UPDATE businesses SET comp_until = ? WHERE id = ?")
              .bind(trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000).toISOString() : null, id),
          ]
        : []),
    ]);
    return json({ id });
  }

  const club = await ownedClub(db, user.id, p.business);
  if (!club) return fail("not_found", 404, "Club not found");
  if (!(await allow(db, `club-write:${user.id}`, 600, 3600))) return fail("rate_limited", 429);
  const access = await businessAccess(db, club.id);
  if (!access.ok && access.code === "business_suspended" && p.action !== "archive_member") return fail(access.code, 402, "Club is suspended");

  /** Marks a saved pass as out of date and sends it in the background. */
  const refreshPass = async (memberId: string) => {
    await db.prepare("UPDATE club_members SET wallet_dirty = ? WHERE id = ? AND google_wallet IS NOT NULL").bind(now, memberId).run();
    if (walletConfig(env)) waitUntil(sendMemberPass(db, env, memberId).catch((e) => console.warn(`club pass: ${(e as Error).message}`)));
  };
  const member = async () => {
    if (typeof p.member !== "string") return null;
    return db.prepare("SELECT * FROM club_members WHERE id = ? AND business = ? AND archived IS NULL").bind(p.member, club.id).first<MemberRow>();
  };
  /** Name, phone, plan and date from the form. A string is the error code. */
  const details = () => {
    const name = str(p.name, 80);
    if (!name) return "bad_name";
    const phone = p.phone === "" || p.phone === null || p.phone === undefined ? null : normalizePhone(p.phone);
    if ((p.phone ?? "") !== "" && !phone) return "bad_phone";
    const plan = p.plan === "" || p.plan === null || p.plan === undefined ? null : str(p.plan, 40);
    if (!validDate(p.validUntil)) return "bad_date";
    return { name, phone, plan, validUntil: p.validUntil };
  };

  switch (p.action) {
    case "update_club": {
      const name = str(p.name, 80);
      if (!name || typeof p.color !== "string" || !COLOR.test(p.color)) return fail("bad_details", 400, "Invalid club details");
      let logo = club.club_logo;
      if (p.logo === null) logo = null;
      else if (typeof p.logo === "string") {
        if (!ASSET_ID.test(p.logo)) return fail("bad_details", 400);
        const asset = await db.prepare("SELECT mime FROM assets WHERE id = ? AND business = ?").bind(p.logo, club.id).first<{ mime: string }>();
        if (!asset) return fail("bad_details", 400);
        logo = p.logo;
      }
      if (logo !== club.club_logo && !hasPaidDesign(access)) return fail("paid_feature", 402, "Available with a subscription");
      await db.prepare("UPDATE businesses SET name = ?, color = ?, club_logo = ? WHERE id = ?").bind(name, p.color, logo, club.id).run();
      return json({ ok: true });
    }
    case "add_member": {
      if (!access.ok) return fail(access.code, 402, "A subscription is needed");
      if (freeLimitReached(access)) return fail("subscription_required", 402, "A subscription is needed");
      const d = details();
      if (typeof d === "string") return fail(d, 400, "Invalid member details");
      const { secret, hash } = await newMemberSecret();
      const id = crypto.randomUUID();
      // The number is set inside the insert, so two additions at once can't take the same one.
      await db
        .prepare(
          `INSERT INTO club_members(id, business, member_no, name, phone, plan, valid_until, card_hash, created, updated)
           SELECT ?, ?, COALESCE(MAX(member_no), 0) + 1, ?, ?, ?, ?, ?, ?, ? FROM club_members WHERE business = ?`,
        )
        .bind(id, club.id, d.name, d.phone, d.plan, d.validUntil, hash, now, now, club.id)
        .run();
      const row = (await db.prepare("SELECT * FROM club_members WHERE id = ?").bind(id).first<MemberRow>())!;
      return json({ member: publicMember(row), link: cardLink(origin, secret) });
    }
    case "update_member": {
      if (!access.ok) return fail(access.code, 402, "A subscription is needed");
      const m = await member();
      if (!m) return fail("not_found", 404, "Member not found");
      const d = details();
      if (typeof d === "string") return fail(d, 400, "Invalid member details");
      await db.prepare("UPDATE club_members SET name = ?, phone = ?, plan = ?, valid_until = ?, updated = ? WHERE id = ?")
        .bind(d.name, d.phone, d.plan, d.validUntil, now, m.id)
        .run();
      await refreshPass(m.id);
      return json({ ok: true });
    }
    case "new_link": {
      const m = await member();
      if (!m) return fail("not_found", 404, "Member not found");
      const { secret, hash } = await newMemberSecret();
      await db.prepare("UPDATE club_members SET card_hash = ?, updated = ? WHERE id = ?").bind(hash, now, m.id).run();
      return json({ link: cardLink(origin, secret) });
    }
    case "archive_member": {
      const m = await member();
      if (!m) return fail("not_found", 404, "Member not found");
      await db.prepare("UPDATE club_members SET archived = ?, card_hash = NULL, updated = ? WHERE id = ?").bind(now, now, m.id).run();
      await refreshPass(m.id);
      return json({ ok: true });
    }
    default:
      return fail("bad_request", 400, "Unknown action");
  }
}
