import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getD1 } from "../../../db";
import { ensurePetKey, petsOf } from "../../../lib/server/vet";
import { sha256 } from "../../../lib/server/crypto";
import { liveDesign } from "../../../lib/server/designs";
import { walletConfig } from "../../../lib/server/google-wallet";
import { appleConfig } from "../../../lib/server/apple-wallet";
import { parseSocial, socialLinks } from "../../../lib/social";
import CardView from "./card-view";
import { refCode } from "../../../lib/server/referral";
import { openLoans } from "../../../lib/server/loans";
import { simpleFaceFor } from "../../../lib/server/simple-face";
import { isSimple } from "../../../lib/programs";
import { cardLang } from "../../../lib/design";

export const dynamic = "force-dynamic";
// "Add to home screen" opens this card directly.
export async function generateMetadata({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  return {
    referrer: "no-referrer",
    robots: { index: false },
    manifest: `/api/card-manifest/${encodeURIComponent(secret)}`,
    appleWebApp: { capable: true, title: "Perkly" },
  };
}

// Public customer card. The secret in the link opens this view only:
// it cannot add stamps, and the phone number is never shown.
/** The appointments card: the next appointment, until an hour after its time. */
function upcoming(iso: string | null): string | null {
  return iso && Date.parse(iso) > Date.now() - 3_600_000 ? iso : null;
}

export default async function CardPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const db = getD1();
  const row =
    secret.length <= 100
      ? await db
          .prepare(
            `SELECT c.id, c.name, c.stamps, c.target, c.scan_code, c.balance, c.round_total, c.appt_at, c.loan_key, c.pet_key, b.booking_on, b.booking_key, b.vet_on, b.loan_ext_days, b.loan_max_ext, b.program, b.appt_extra, b.avg_cap, b.cashback_bp, b.cashback_min, b.currency, b.id AS business_id, b.name AS business, b.reward, b.color, b.reward_mode, b.social, b.referral_stamps, b.join_code,
               (SELECT COUNT(*) FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2)) AS saved,
               (SELECT MIN(expires) FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2)) AS next_expiry,
               (SELECT value FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2) ORDER BY earned, id LIMIT 1) AS next_value
             FROM customers c JOIN businesses b ON b.id = c.business WHERE c.card_hash = ?1 AND c.archived IS NULL AND b.archived IS NULL`,
          )
          .bind(await sha256(secret), new Date().toISOString())
          .first<{ id: string; loan_key: string | null; pet_key: string | null; booking_on: number; booking_key: string | null; vet_on: number; loan_ext_days: number; loan_max_ext: number; appt_at: string | null; appt_extra: string | null; referral_stamps: number; join_code: string | null; name: string; stamps: number; target: number; scan_code: string; balance: number; round_total: number; avg_cap: number; next_value: number | null; program: string; cashback_bp: number; cashback_min: number; currency: string; business_id: string; business: string; reward: string; color: string; reward_mode: string; social: string | null; saved: number; next_expiry: string | null }>()
      : null;
  if (!row) return <CardView card={null} secret={secret} googleWallet={false} appleWallet={false} isIOS={false} />;
  const design = await liveDesign(db, { id: row.business_id, name: row.business, reward: row.reward, color: row.color });
  const rewards = row.saved + (row.reward_mode === "block" && row.stamps >= row.target ? 1 : 0);
  // Google Wallet does not run on iPhone, so the Google button is shown only to non-iOS devices.
  const ua = (await headers()).get("user-agent") ?? "";
  // iPads ask for desktop sites and say "Macintosh": Safari on a Mac UA is an Apple device too (Mac Safari also adds passes).
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/i.test(ua));
  const googleWallet = !isIOS && walletConfig(env) !== null;
  // Apple Wallet on iPhone and iPad, once the pass signing key is set.
  const appleWallet = isIOS && appleConfig(env) !== null;
  // "Bring a friend": the customer's own invite link, when the business turned it on (stamp cards).
  let invite: { stamps: number; link: string } | null = null;
  if (row.referral_stamps > 0 && row.program === "stamps" && row.join_code) {
    const code = await refCode(db, row.id);
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "perkly.shop"}`;
    if (code) invite = { stamps: row.referral_stamps, link: `${origin}/join/${row.join_code}?ref=${code}` };
  }
  // The vet's pet file (when Perkly switched it on): each animal, its next vaccine or treatment and appointment.
  const pets = row.vet_on ? await petsOf(db, row.business_id, row.id) : [];
  const petKey = pets.length ? await ensurePetKey(db, row.id) : null;
  return (
    <CardView
      card={{ name: row.name, stamps: row.stamps, target: row.target, scan_code: row.scan_code, design, rewards, nextExpiry: row.next_expiry, business: row.business, links: socialLinks(parseSocial(row.social)),
        cashback: row.program === "cashback" || (row.program === "appointments" && row.appt_extra === "cashback") ? { balance: row.balance, bp: row.cashback_bp, min: row.cashback_min, currency: row.currency === "USD" ? "USD" : "ILS" } : null,
        // The six simpler cards: one line, in the card's language.
        face: isSimple(row.program) ? await simpleFaceFor(db, row.id, cardLang(design)) : null,
        library: row.program === "library"
          ? { key: row.loan_key, loans: await openLoans(db, row.id), extDays: row.loan_ext_days, maxExt: row.loan_max_ext }
          : null,
        appointment: row.program === "appointments" ? { at: upcoming(row.appt_at), extra: (row.appt_extra ?? "none") as "none" | "stamps" | "points" | "cashback" } : null,
        average: row.program === "average" ? { roundTotal: row.round_total, cap: row.avg_cap ?? 0, ready: row.next_value, currency: row.currency === "USD" ? "USD" : "ILS" } : null,
        // Online booking (when switched on): the booking page, and the next appointment on cards that don't show it already.
        booking: row.booking_on && row.booking_key ? { path: `/book/${row.booking_key}`, next: row.program === "appointments" ? null : upcoming(row.appt_at) } : null,
        vet: row.vet_on && pets.length ? {
          path: `/p/${petKey}`,
          pets: pets.map((p) => {
            const due = p.care.filter((c) => c.next).sort((a, b) => a.next!.localeCompare(b.next!))[0];
            return {
              name: p.name, species: p.species,
              care: due ? { name: due.name, next: due.next! } : null,
              appt: upcoming(p.appt_at) ? { at: p.appt_at!, kind: p.appt_kind ?? "visit" } : null,
            };
          }),
        } : null }}
      secret={secret}
      googleWallet={googleWallet}
      appleWallet={appleWallet}
      isIOS={isIOS}
      invite={invite}
    />
  );
}
