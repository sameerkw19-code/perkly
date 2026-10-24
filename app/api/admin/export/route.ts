import { fail } from "../../../../lib/server/http";
import { adminLog, adminRequest } from "../../../../lib/server/admin-api";
import { liveDesign } from "../../../../lib/server/designs";
import { maskPhone } from "../../../../lib/phone";

export const dynamic = "force-dynamic";

// GET ?business=<id> — one business's data as a JSON file, for support or a handover.
// Customer phone numbers are masked (last 4 digits). Every export is logged.
export async function GET(request: Request) {
  const a = await adminRequest(request, { mutate: false });
  if ("error" in a) return a.error;
  const { db, user } = a;
  const id = new URL(request.url).searchParams.get("business") ?? "";
  if (!id || id.length > 64) return fail("bad_request", 400);
  const b = await db
    .prepare(
      `SELECT id, name, reward, target, color, created, reward_mode, reward_expiry_days, staff_adjust, birthdays,
         suspended, suspend_reason, comp_until, archived FROM businesses WHERE id = ?`,
    )
    .bind(id)
    .first<Record<string, unknown> & { id: string; name: string; reward: string; color: string }>();
  if (!b) return fail("not_found", 404);

  const [team, customers, events, sub, design] = await Promise.all([
    db.prepare(
      `SELECT u.name, u.email, m.role, m.created, m.revoked, br.name AS branch FROM memberships m
       JOIN users u ON u.id = m.user LEFT JOIN branches br ON br.id = m.branch WHERE m.business = ? ORDER BY m.created`,
    ).bind(id).all(),
    db.prepare(
      `SELECT id, name, phone, stamps, target, created, source, birthday, consent_marketing, archived
       FROM customers WHERE business = ? ORDER BY created`,
    ).bind(id).all<{ phone: string } & Record<string, unknown>>(),
    db.prepare("SELECT kind, COUNT(*) AS n, MIN(created) AS first, MAX(created) AS last FROM events WHERE business = ? GROUP BY kind").bind(id).all(),
    db.prepare("SELECT status, plan, current_period_end, updated FROM subscriptions WHERE business = ?").bind(id).first(),
    liveDesign(db, { id: b.id, name: b.name, reward: b.reward, color: b.color }),
  ]);

  await adminLog(db, user.email, id, "export", `${customers.results.length} customers`).run();

  const data = {
    exported: new Date().toISOString(),
    exportedBy: user.email,
    note: "Customer phone numbers are masked.",
    business: b,
    subscription: sub ?? null,
    design,
    team: team.results,
    customers: customers.results.map(({ phone, ...c }) => ({ ...c, phone: maskPhone(phone) })),
    activity: events.results,
  };
  const safeName = b.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "business";
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''perkly-${encodeURIComponent(safeName)}-${new Date().toISOString().slice(0, 10)}.json`,
      "Cache-Control": "no-store",
    },
  });
}
