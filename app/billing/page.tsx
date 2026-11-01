import { redirect } from "next/navigation";
import { getD1 } from "../../db";
import { currentUser } from "../../lib/server/page-session";
import { getMemberships } from "../../lib/server/auth";
import { env } from "cloudflare:workers";
import { polarConfigured, yearlyConfigured } from "../../lib/server/polar";
import { planOf } from "../../lib/server/billing";
import BillingView, { type BillingBusiness } from "./billing-view";

export const dynamic = "force-dynamic";

// Owner's subscription page. Shows each business the owner runs and its subscription status.
// Owners can subscribe through Polar once POLAR_* secrets are set.
export default async function BillingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = getD1();
  const memberships = (await getMemberships(db, user.id)).filter((m) => m.role === "owner");
  const subs = await db
    .prepare(
      `SELECT b.id, b.name, s.status, s.plan, s.current_period_end AS periodEnd, b.comp_until AS compUntil, b.kit_due AS kitDue, b.kit_sent AS kitSent
       FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id
       WHERE b.id IN (${memberships.map(() => "?").join(",") || "''"})`,
    )
    .bind(...memberships.map((m) => m.business))
    .all<{ id: string; name: string; status: string | null; plan: string | null; periodEnd: string | null; compUntil: string | null; kitDue: string | null; kitSent: string | null }>();
  const businesses: BillingBusiness[] = subs.results.map((b) => ({
    id: b.id,
    name: b.name,
    status: b.status ?? "none",
    periodEnd: b.periodEnd,
    compUntil: b.compUntil && b.compUntil > new Date().toISOString() ? b.compUntil : null,
    plan: b.status ? planOf(b.plan, env) : null,
    kit: b.kitSent ? "sent" : b.kitDue ? "due" : null,
  }));
  return <BillingView businesses={businesses} configured={polarConfigured(env)} yearly={yearlyConfigured(env)} />;
}
