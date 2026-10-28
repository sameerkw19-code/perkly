import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { getD1 } from "../../db";
import { getMemberships } from "../../lib/server/auth";
import { businessAccess, isEntitled } from "../../lib/server/billing";
import { currentUser } from "../../lib/server/page-session";
import { polarConfigured } from "../../lib/server/polar";
import StartFlow, { type StartBusiness } from "./start-flow";
import SiteAnalytics from "../../components/site-analytics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Perkly | פתיחת חשבון",
  description:
    "פותחים חשבון, מעצבים כרטיס נאמנות ומתחילים לעבוד. 14 ימי ניסיון חינם, ואחר כך 99 ₪ לחודש, בלי התחייבות.",
  alternates: { canonical: "/start" },
};

// Guided setup for a new business owner: account, business and card, payment, then the QR to print.
// Signed-in owners land on the first step they have not finished.
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const user = await currentUser();
  let business: StartBusiness | null = null;
  let isStaffOnly = false;
  if (user) {
    const db = getD1();
    const memberships = await getMemberships(db, user.id);
    const owned = memberships.filter((m) => m.role === "owner");
    isStaffOnly = memberships.length > 0 && owned.length === 0;
    const wanted = one(params.b);
    const pick = owned.find((m) => m.business === wanted) ?? owned[0];
    if (pick) {
      const row = await db
        .prepare(
          `SELECT b.id, b.name, b.join_code, b.comp_until, s.status FROM businesses b
           LEFT JOIN subscriptions s ON s.business = b.id WHERE b.id = ?`,
        )
        .bind(pick.business)
        .first<{
          id: string;
          name: string;
          join_code: string | null;
          comp_until: string | null;
          status: string | null;
        }>();
      if (row) {
        const access = await businessAccess(db, row.id);
        business = {
          id: row.id,
          name: row.name,
          joinCode: row.join_code,
          paid: isEntitled(row.status) || (access.ok && !access.free),
          canWork: access.ok,
          status: row.status ?? "none",
        };
      }
    }
  }
  return (
    <>
      <SiteAnalytics />
      <StartFlow
        signedIn={!!user}
        userName={user?.name ?? ""}
        needsCode={!!env.SIGNUP_CODE}
        business={business}
        isStaffOnly={isStaffOnly}
        billingOn={polarConfigured(env)}
        paidReturn={one(params.paid) === "1"}
      />
    </>
  );
}
