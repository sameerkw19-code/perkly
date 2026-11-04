import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getD1 } from "../../../db";
import { sha256 } from "../../../lib/server/crypto";
import { walletConfig } from "../../../lib/server/google-wallet";
import MemberCard from "./member-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Perkly", referrer: "no-referrer", robots: { index: false } };

// Public member card. The secret in the link opens this view only, and the phone number is never shown.
export default async function MemberPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const row = secret.length <= 100
    ? await getD1()
        .prepare(
          `SELECT m.member_no, m.name, m.plan, m.valid_until, b.name AS club, b.color, b.club_logo
           FROM club_members m JOIN businesses b ON b.id = m.business
           WHERE m.card_hash = ? AND m.archived IS NULL AND b.archived IS NULL AND b.product = 'club'`,
        )
        .bind(await sha256(secret))
        .first<{ member_no: number; name: string; plan: string | null; valid_until: string; club: string; color: string; club_logo: string | null }>()
    : null;
  if (!row) return <MemberCard card={null} secret={secret} googleWallet={false} isIOS={false} />;
  const isIOS = /iPhone|iPad|iPod/i.test((await headers()).get("user-agent") ?? "");
  return (
    <MemberCard
      card={{ memberNo: row.member_no, name: row.name, plan: row.plan, validUntil: row.valid_until, club: row.club, color: row.color, logo: row.club_logo }}
      secret={secret}
      googleWallet={!isIOS && walletConfig(env) !== null}
      isIOS={isIOS}
    />
  );
}
