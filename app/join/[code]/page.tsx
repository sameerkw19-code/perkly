import { getD1 } from "../../../db";
import { liveDesign } from "../../../lib/server/designs";
import JoinForm from "./join-form";
import { isSimple, sampleFace } from "../../../lib/programs";
import { cardLang } from "../../../lib/design";
import { formatMoney } from "../../../lib/cashback";
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
          .prepare("SELECT id, name, reward, target, color, birthdays, program, cashback_bp, cashback_min, currency, referral_stamps, club_pct, coupon_until FROM businesses WHERE join_code = ? AND archived IS NULL")
          .bind(code)
          .first<{ id: string; name: string; reward: string; target: number; color: string; birthdays: number; program: string; cashback_bp: number; cashback_min: number; currency: string; referral_stamps: number; club_pct: number; coupon_until: string | null }>()
      : null;
  // Invited by a friend (a valid invite code while the business runs "bring a friend").
  const invited = business && business.referral_stamps > 0 && business.program === "stamps" && (await referrerFor(db, business.id, ref)) ? business.referral_stamps : 0;
  const design = business ? await liveDesign(db, business) : null;
  return <JoinForm code={code} invite={invited ? { ref: ref!, stamps: invited } : null} business={business && design ? { name: business.name, target: business.target, design, birthdays: !!business.birthdays,
    average: business.program === "average",
    appointments: business.program === "appointments",
    library: business.program === "library",
    face: isSimple(business.program)
      ? sampleFace(business.program, cardLang(design), (m) => formatMoney(m, business.currency === "USD" ? "USD" : "ILS", cardLang(design)), { club_pct: business.club_pct, coupon_until: business.coupon_until, reward: business.reward })
      : undefined,
    cashback: business.program === "cashback" ? { bp: business.cashback_bp, min: business.cashback_min, currency: business.currency === "USD" ? "USD" : "ILS" } : null } : null} />;
}
