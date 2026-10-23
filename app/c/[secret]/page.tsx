import { getD1 } from "../../../db";
import { sha256 } from "../../../lib/server/crypto";
import { liveDesign } from "../../../lib/server/designs";
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
            `SELECT c.name, c.stamps, c.target, c.scan_code, b.id AS business_id, b.name AS business, b.reward, b.color
             FROM customers c JOIN businesses b ON b.id = c.business WHERE c.card_hash = ?`,
          )
          .bind(await sha256(secret))
          .first<{ name: string; stamps: number; target: number; scan_code: string; business_id: string; business: string; reward: string; color: string }>()
      : null;
  if (!row) return <CardView card={null} />;
  const design = await liveDesign(db, { id: row.business_id, name: row.business, reward: row.reward, color: row.color });
  return <CardView card={{ name: row.name, stamps: row.stamps, target: row.target, scan_code: row.scan_code, design }} />;
}
