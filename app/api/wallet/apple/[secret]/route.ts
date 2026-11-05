import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db";
import { sha256 } from "../../../../../lib/server/crypto";
import { clientIp, fail } from "../../../../../lib/server/http";
import { allow } from "../../../../../lib/server/rate-limit";
import { appleConfig, customerForPass, customerPass, PKPASS_TYPE } from "../../../../../lib/server/apple-wallet";

export const dynamic = "force-dynamic";

// GET /api/wallet/apple/<card secret> → the customer's Apple Wallet pass (.pkpass). On an iPhone,
// Safari shows "Add to Apple Wallet" right away. 404 until the APPLE_PASS_KEY secret is set.
export async function GET(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const config = appleConfig(env);
  if (!config) return fail("not_found", 404, "Apple Wallet is not configured");
  const { secret } = await params;
  if (secret.length > 100) return fail("unknown_card", 404, "Card not found");
  const db = getD1();
  const hash = await sha256(secret);
  if (!(await allow(db, `awallet-ip:${clientIp(request)}`, 30, 600)) || !(await allow(db, `awallet-card:${hash.slice(0, 32)}`, 10, 600))) {
    return fail("rate_limited", 429, "Too many attempts. Try again in a few minutes.");
  }
  const id = await db.prepare("SELECT id FROM customers WHERE card_hash = ? AND archived IS NULL").bind(hash).first<{ id: string }>();
  const customer = id ? await customerForPass(db, id.id) : null;
  if (!customer) return fail("unknown_card", 404, "Card not found");
  const pass = await customerPass(db, config, customer, new URL(request.url).origin);
  return new Response(pass, {
    headers: {
      "Content-Type": PKPASS_TYPE,
      "Content-Disposition": `attachment; filename="perkly.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
}
