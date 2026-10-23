import { redirect } from "next/navigation";
import { getD1 } from "../../db";
import { currentUser } from "../../lib/server/page-session";
import { getMemberships } from "../../lib/server/auth";
import { billingConfigured } from "../../lib/server/billing";
import BillingView, { type BillingBusiness } from "./billing-view";

export const dynamic = "force-dynamic";

// Owner's subscription page. Shows each business the owner runs and its subscription state.
export default async function BillingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = getD1();
  const memberships = (await getMemberships(db, user.id)).filter((m) => m.role === "owner");
  const subs = await db
    .prepare(
      `SELECT b.id, b.name, s.status, s.current_period_end AS periodEnd
       FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id
       WHERE b.id IN (${memberships.map(() => "?").join(",") || "''"})`,
    )
    .bind(...memberships.map((m) => m.business))
    .all<{ id: string; name: string; status: string | null; periodEnd: string | null }>();
  const businesses: BillingBusiness[] = subs.results.map((b) => ({
    id: b.id,
    name: b.name,
    status: b.status ?? "none",
    periodEnd: b.periodEnd,
  }));
  const configured = billingConfigured({
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  });
  return <BillingView businesses={businesses} configured={configured} />;
}
