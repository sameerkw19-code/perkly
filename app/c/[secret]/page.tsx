import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getD1 } from "../../../db";
import { sha256 } from "../../../lib/server/crypto";
import { liveDesign } from "../../../lib/server/designs";
import { walletConfig } from "../../../lib/server/google-wallet";
import CardView from "./card-view";

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
export default async function CardPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const db = getD1();
  const row =
    secret.length <= 100
      ? await db
          .prepare(
            `SELECT c.name, c.stamps, c.target, c.scan_code, b.id AS business_id, b.name AS business, b.reward, b.color, b.reward_mode,
               (SELECT COUNT(*) FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2)) AS saved,
               (SELECT MIN(expires) FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2)) AS next_expiry
             FROM customers c JOIN businesses b ON b.id = c.business WHERE c.card_hash = ?1 AND c.archived IS NULL`,
          )
          .bind(await sha256(secret), new Date().toISOString())
          .first<{ name: string; stamps: number; target: number; scan_code: string; business_id: string; business: string; reward: string; color: string; reward_mode: string; saved: number; next_expiry: string | null }>()
      : null;
  if (!row) return <CardView card={null} secret={secret} googleWallet={false} isIOS={false} />;
  const design = await liveDesign(db, { id: row.business_id, name: row.business, reward: row.reward, color: row.color });
  const rewards = row.saved + (row.reward_mode === "block" && row.stamps >= row.target ? 1 : 0);
  // Google Wallet does not run on iPhone, so the Google button is shown only to non-iOS devices.
  const ua = (await headers()).get("user-agent") ?? "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const googleWallet = !isIOS && walletConfig(env) !== null;
  return (
    <CardView
      card={{ name: row.name, stamps: row.stamps, target: row.target, scan_code: row.scan_code, design, rewards, nextExpiry: row.next_expiry }}
      secret={secret}
      googleWallet={googleWallet}
      isIOS={isIOS}
    />
  );
}
