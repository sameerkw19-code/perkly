import { getD1 } from "../../../db";
import { liveDesign } from "../../../lib/server/designs";
import JoinForm from "./join-form";
import { referrerFor } from "../../../lib/server/referral";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function JoinPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ ref?: string }> }) {
  const { code } = await params;
  const { ref } = await searchParams;
  const db = getD1();
  const business =
    code.length <= 40
      ? await db
          .prepare("SELECT id, name, reward, target, color, birthdays, program, cashback_bp, cashback_min, currency, referral_stamps FROM businesses WHERE join_code = ? AND archived IS NULL")
          .bind(code)
          .first<{ id: string; name: string; reward: string; target: number; color: string; birthdays: number; program: string; cashback_bp: number; cashback_min: number; currency: string; referral_stamps: number }>()
      : null;
  // Invited by a friend (a valid invite code while the business runs "bring a friend").
  const invited = business && business.referral_stamps > 0 && business.program === "stamps" && (await referrerFor(db, business.id, ref)) ? business.referral_stamps : 0;
  const design = business ? await liveDesign(db, business) : null;
  return <JoinForm code={code} invite={invited ? { ref: ref!, stamps: invited } : null} business={business && design ? { name: business.name, target: business.target, design, birthdays: !!business.birthdays,
    average: business.program === "average",
    cashback: business.program === "cashback" ? { bp: business.cashback_bp, min: business.cashback_min, currency: business.currency === "USD" ? "USD" : "ILS" } : null } : null} />;
}
