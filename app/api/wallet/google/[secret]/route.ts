import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db";
import { sha256 } from "../../../../../lib/server/crypto";
import { fail } from "../../../../../lib/server/http";
import { saveUrl, walletConfig } from "../../../../../lib/server/google-wallet";

export const dynamic = "force-dynamic";

// GET /api/wallet/google/<card secret> → redirects to Google's "Add to Google Wallet" page.
// Returns 404 until the Google Wallet key and issuer id are configured.
export async function GET(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const config = walletConfig(env);
  if (!config) return fail("not_found", 404, "Google Wallet is not configured");

  const { secret } = await params;
  if (secret.length > 100) return fail("unknown_card", 404, "Card not found");

  const db = getD1();
  const row = await db
    .prepare(
      `SELECT c.id AS customer_id, c.business AS business_id, c.stamps, c.target, c.scan_code
       FROM customers c WHERE c.card_hash = ?1 AND c.archived IS NULL`,
    )
    .bind(await sha256(secret))
    .first<{ customer_id: string; business_id: string; stamps: number; target: number; scan_code: string }>();
  if (!row) return fail("unknown_card", 404, "Card not found");

  // One shared class for now. Per-business classes (own colours and logo) come with the Google approval.
  const url = await saveUrl(
    config,
    { customerId: row.customer_id, businessId: row.business_id, stamps: row.stamps, target: row.target, scanCode: row.scan_code },
    "perkly_loyalty",
    new URL(request.url).origin,
  );
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}
