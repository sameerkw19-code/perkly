import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getMemberships, getUser, isPlatformAdmin, type User } from "../../../lib/server/auth";
import { fail, json, readJson, sameOrigin } from "../../../lib/server/http";
import { allow } from "../../../lib/server/rate-limit";
import { mailReady, sendMail } from "../../../lib/server/mailer";
import { lastMonth, monthlyReport, monthStart, nextMonth, prevMonth, reportMail, validMonth } from "../../../lib/server/monthly-report";

export const dynamic = "force-dynamic";

/** The owner's own businesses, plus (for a platform admin) the one asked for. */
async function reportBusiness(db: D1Database, user: User, wanted: string | null) {
  const owned = (await getMemberships(db, user.id)).filter((m) => m.role === "owner").map((m) => ({ id: m.business, name: m.businessName }));
  let pick = wanted ? owned.find((b) => b.id === wanted) : owned[0];
  if (!pick && wanted && isPlatformAdmin(user, env)) {
    const b = await db.prepare("SELECT id, name FROM businesses WHERE id = ? AND archived IS NULL").bind(wanted).first<{ id: string; name: string }>();
    if (b) { pick = b; owned.push(b); }
  }
  return { owned, pick };
}

/** Months with a report: from the business's first month to last month, newest first (at most 12). */
async function months(db: D1Database, business: string): Promise<string[]> {
  const row = await db.prepare("SELECT created FROM businesses WHERE id = ?").bind(business).first<{ created: string }>();
  const out: string[] = [];
  let m = lastMonth();
  while (out.length < 12 && row && monthStart(nextMonth(m)) > row.created) { out.push(m); m = prevMonth(m); }
  return out;
}

// GET /api/report?business=…&month=2026-10 → last month's report (or the month asked for).
export async function GET(request: Request) {
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  const q = new URL(request.url).searchParams;
  const { owned, pick } = await reportBusiness(db, user, q.get("business"));
  if (!pick) return fail("forbidden", 403, "Owner permission required");
  const list = await months(db, pick.id);
  const month = validMonth(q.get("month")) ? q.get("month")! : list[0] ?? lastMonth();
  const report = await monthlyReport(db, pick.id, month);
  if (!report) return fail("not_found", 404);
  const b = await db.prepare("SELECT report_email FROM businesses WHERE id = ?").bind(pick.id).first<{ report_email: number }>();
  return json({ report, months: list, businesses: owned, email: { on: b?.report_email !== 0, ready: mailReady(env) }, to: user.email });
}

// POST { action: "send_me", business, month } → the report to the signed-in user's own email (to see it before the 1st).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("forbidden", 403);
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401, "Sign in required");
  const p = await readJson(request);
  if (!p || p.action !== "send_me") return fail("bad_request", 400);
  const { pick } = await reportBusiness(db, user, typeof p.business === "string" ? p.business : null);
  if (!pick) return fail("forbidden", 403, "Owner permission required");
  if (!(await allow(db, `report:${user.id}`, 5, 3600))) return fail("rate_limited", 429, "Too many attempts");
  if (!mailReady(env)) return fail("mail_unavailable", 503, "Email is not connected");
  const report = await monthlyReport(db, pick.id, validMonth(p.month) ? p.month : lastMonth());
  if (!report) return fail("not_found", 404);
  const ok = await sendMail(env, reportMail(report, user.email, new URL(request.url).origin));
  return ok ? json({ ok: true, to: user.email }) : fail("mail_failed", 502, "The email was not sent");
}
