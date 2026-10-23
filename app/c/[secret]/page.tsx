import { getD1 } from "../../../db";
import { sha256 } from "../../../lib/server/crypto";
import CardView from "./card-view";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer", robots: { index: false } };

// Public customer card. The secret in the link opens this view only:
// it cannot add stamps, and the phone number is never shown.
export default async function CardPage({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const row =
    secret.length <= 100
      ? await getD1()
          .prepare(
            `SELECT c.name, c.stamps, c.target, c.scan_code, b.name AS business, b.reward, b.color
             FROM customers c JOIN businesses b ON b.id = c.business WHERE c.card_hash = ?`,
          )
          .bind(await sha256(secret))
          .first<{ name: string; stamps: number; target: number; scan_code: string; business: string; reward: string; color: string }>()
      : null;
  return <CardView card={row} />;
}
