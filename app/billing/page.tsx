import { redirect } from "next/navigation";
import { getD1 } from "../../db";
import { currentUser } from "../../lib/server/page-session";
import { getMemberships } from "../../lib/server/auth";
import { env } from "cloudflare:workers";
import { polarConfigured, trialDaysFor, yearlyConfigured } from "../../lib/server/polar";
import { planOf, TRIAL_DAYS } from "../../lib/server/billing";
import BillingView, { type BillingBusiness } from "./billing-view";
import { asCurrency } from "../../lib/pricing";

export const dynamic = "force-dynamic";

/** When a subscription started now would first charge: after the trial, or after the free access. */
function firstChargeOf(firstTime: boolean, compUntil: string | null): string {
  const now = Date.now();
  return new Date(now + trialDaysFor(firstTime, compUntil, TRIAL_DAYS, now) * 86_400_000).toISOString();
}

// Owner's subscription page. Shows each business the owner runs and its subscription status.
// Owners can subscribe through Polar once POLAR_* secrets are set.
export default async function BillingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = getD1();
  const memberships = (await getMemberships(db, user.id)).filter((m) => m.role === "owner");
  const subs = await db
    .prepare(
      `SELECT b.id, b.name, b.currency, s.status, s.plan, s.current_period_end AS periodEnd, s.external_subscription AS sub, b.comp_until AS compUntil, b.kit_due AS kitDue, b.kit_sent AS kitSent
       FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id
       WHERE b.id IN (${memberships.map(() => "?").join(",") || "''"})`,
    )
    .bind(...memberships.map((m) => m.business))
    .all<{ id: string; name: string; currency: string; status: string | null; plan: string | null; periodEnd: string | null; sub: string | null; compUntil: string | null; kitDue: string | null; kitSent: string | null }>();
  const businesses: BillingBusiness[] = subs.results.map((b) => ({
    id: b.id,
    name: b.name,
    status: b.status ?? "none",
    periodEnd: b.periodEnd,
    compUntil: b.compUntil && b.compUntil > new Date().toISOString() ? b.compUntil : null,
    plan: b.status ? planOf(b.plan, env) : null,
    kit: b.kitSent ? "sent" : b.kitDue ? "due" : null,
    manage: !!b.sub,
    // The same rule as the checkout: the trial runs through the free access.
    firstCharge: firstChargeOf(!b.sub, b.compUntil),
  }));
  // Prices in the owner's currency (the first business; an owner's businesses share a market).
  const currency = asCurrency(subs.results[0]?.currency);
  return <BillingView businesses={businesses} configured={polarConfigured(env)} yearly={yearlyConfigured(env, currency)} currency={currency} />;
}
