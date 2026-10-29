import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db";
import { sha256 } from "../../../../../lib/server/crypto";
import { fail } from "../../../../../lib/server/http";
import { getSettings } from "../../../../../lib/server/settings";
import { ensureBusinessClass, saveUrl, walletConfig } from "../../../../../lib/server/google-wallet";
import { passLook } from "../../../../../lib/server/designs";

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
      `SELECT c.id AS customer_id, c.business AS business_id, c.stamps, c.target, c.scan_code,
         (SELECT COUNT(*) FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2))
           + (CASE WHEN b.reward_mode = 'block' AND c.stamps >= c.target THEN 1 ELSE 0 END) AS rewards
       FROM customers c JOIN businesses b ON b.id = c.business WHERE c.card_hash = ?1 AND c.archived IS NULL AND b.archived IS NULL`,
    )
    .bind(await sha256(secret), new Date().toISOString())
    .first<{ customer_id: string; business_id: string; stamps: number; target: number; scan_code: string; rewards: number }>();
  if (!row) return fail("unknown_card", 404, "Card not found");
  // From now on, stamps for this customer are pushed to Google (see lib/server/wallet-sync.ts).
  if (!(await getSettings(db)).maintenance) {
    await db.prepare("UPDATE customers SET google_wallet = ? WHERE id = ?").bind(new Date().toISOString(), row.customer_id).run();
  }

  // One shared class for now (GOOGLE_WALLET_CLASS_ID): Perkly's logo and color. Each pass adds the
  // business's name, reward and banner image. Per-business classes can come later.
  const origin = new URL(request.url).origin;
  const business = await db.prepare("SELECT id, name, reward, color FROM businesses WHERE id = ?").bind(row.business_id)
    .first<{ id: string; name: string; reward: string; color: string }>();
  const look = business ? await passLook(db, business, origin, { stamps: row.stamps, target: row.target }).catch(() => undefined) : undefined;
  // The business's own class (name, color, logo) when it has a PNG/JPEG logo; otherwise the shared class.
  const classId = await ensureBusinessClass(config, row.business_id, look?.classLook ?? null);
  const url = await saveUrl(
    classId ? { ...config, classId } : config,
    { customerId: row.customer_id, businessId: row.business_id, stamps: row.stamps, target: row.target, scanCode: row.scan_code, rewards: row.rewards, look },
    origin,
  );
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}
