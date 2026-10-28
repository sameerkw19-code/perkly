import { getD1 } from "../../../db";
import { getMemberships, getUser } from "../../../lib/server/auth";
import { fail, json } from "../../../lib/server/http";
import { maskPhone } from "../../../lib/phone";
import { formatBirthday, upcomingKeys } from "../../../lib/birthday";

/**
 * Owner-only list of customers who may receive a marketing text message.
 * Only customers who said yes to marketing are included. Phone numbers are sent
 * as-is because the owner needs them for the sending service; the screen shows them masked.
 *
 * GET /api/messages?business=<id>&audience=all|birthdays&days=<1-14>
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

  const audience = url.searchParams.get("audience") === "birthdays" ? "birthdays" : "all";
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7));

  const rows = await db
    .prepare(
      `SELECT id, name, phone, birthday FROM customers
       WHERE business = ? AND archived IS NULL AND consent_marketing = 1 AND phone IS NOT NULL AND phone != ''
       ORDER BY name`,
    )
    .bind(membership.business)
    .all<{ id: string; name: string; phone: string; birthday: string | null }>();

  // Birthdays are matched in Israel time, the same way the dashboard shows them.
  const upcoming = upcomingKeys(new Date(), days);
  const recipients = (rows.results ?? [])
    .filter((c) => audience === "all" || (c.birthday && upcoming.has(c.birthday)))
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      masked: maskPhone(c.phone),
      birthday: c.birthday ? formatBirthday(c.birthday) : null,
      inDays: c.birthday ? (upcoming.get(c.birthday) ?? null) : null,
    }))
    .sort((a, b) => (a.inDays ?? 999) - (b.inDays ?? 999) || a.name.localeCompare(b.name));

  return json({ audience, days, count: recipients.length, recipients });
}
