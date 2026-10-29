import { getD1 } from "../../../db";
import { getMemberships, getUser } from "../../../lib/server/auth";
import { fail, json } from "../../../lib/server/http";
import { maskPhone } from "../../../lib/phone";
import { formatBirthday, upcomingKeys } from "../../../lib/birthday";
import { daysSince, isAway } from "../../../lib/visits";

/**
 * Owner-only list of customers who may receive a marketing text message.
 * Only customers who said yes to marketing are included. Phone numbers are sent
 * as-is because the owner needs them for the sending service; the screen shows them masked.
 *
 * GET /api/messages?business=<id>&audience=all|birthdays|away&days=<1-14>
 * "away": customers who have not come back in 30+ days (see lib/visits.ts).
 */
export async function GET(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");

  const url = new URL(request.url);
  const memberships = await getMemberships(db, user.id);
  const wanted = url.searchParams.get("business");
  const membership = memberships.find((m) => m.business === wanted) ?? memberships[0];
  if (!membership) return fail("not_found", 404, "No business");
  if (membership.role !== "owner") return fail("forbidden", 403, "Owners only");

  const asked = url.searchParams.get("audience");
  const audience = asked === "birthdays" || asked === "away" ? asked : "all";
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7));

  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.birthday, c.created, lv.last_visit FROM customers c
       LEFT JOIN (SELECT customer, MAX(created) AS last_visit FROM events WHERE business = ?1 AND kind IN ('stamp', 'redeem') GROUP BY customer) lv
         ON lv.customer = c.id
       WHERE c.business = ?1 AND c.archived IS NULL AND c.consent_marketing = 1 AND c.phone IS NOT NULL AND c.phone != ''
       ORDER BY c.name`,
    )
    .bind(membership.business)
    .all<{ id: string; name: string; phone: string; birthday: string | null; created: string; last_visit: string | null }>();

  // Birthdays are matched in Israel time, the same way the dashboard shows them.
  const upcoming = upcomingKeys(new Date(), days);
  const recipients = (rows.results ?? [])
    .filter((c) =>
      audience === "all" ? true
      : audience === "away" ? isAway(c.last_visit, c.created)
      : !!c.birthday && upcoming.has(c.birthday))
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      masked: maskPhone(c.phone),
      birthday: c.birthday ? formatBirthday(c.birthday) : null,
      inDays: audience === "birthdays" && c.birthday ? (upcoming.get(c.birthday) ?? null) : null,
      awayDays: audience === "away" ? daysSince(c.last_visit || c.created) : null,
    }))
    .sort((a, b) => (a.inDays ?? 999) - (b.inDays ?? 999) || a.name.localeCompare(b.name));

  return json({ audience, days, count: recipients.length, recipients });
}
