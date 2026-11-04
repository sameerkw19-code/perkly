import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db";
import { memberPass, type MemberRow } from "../../../../../lib/server/club";
import { sha256 } from "../../../../../lib/server/crypto";
import { ensureBusinessClass, memberSaveUrl, walletConfig } from "../../../../../lib/server/google-wallet";
import { clientIp, fail } from "../../../../../lib/server/http";
import { allow } from "../../../../../lib/server/rate-limit";
import { getSettings } from "../../../../../lib/server/settings";

export const dynamic = "force-dynamic";

// GET /api/wallet/club/<card secret> → redirects to Google's "Add to Google Wallet" page.
// Returns 404 until the Google Wallet key and issuer id are configured.
export async function GET(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const config = walletConfig(env);
  if (!config) return fail("not_found", 404, "Google Wallet is not configured");

  const { secret } = await params;
  if (secret.length > 100) return fail("unknown_card", 404, "Card not found");

  const db = getD1();
  // Each visit calls Google's API, so repeated visits are capped per network and per card.
  const okIp = await allow(db, `gwallet-ip:${clientIp(request)}`, 30, 600);
  if (!okIp || !(await allow(db, `gwallet-card:${(await sha256(secret)).slice(0, 32)}`, 10, 600))) {
    return fail("rate_limited", 429, "Too many attempts. Try again in a few minutes.");
  }
  const row = await db
    .prepare(
      `SELECT m.*, b.name AS club, b.color, b.club_logo, a.mime AS logo_mime
       FROM club_members m JOIN businesses b ON b.id = m.business LEFT JOIN assets a ON a.id = b.club_logo
       WHERE m.card_hash = ? AND m.archived IS NULL AND b.archived IS NULL AND b.product = 'club'`,
    )
    .bind(await sha256(secret))
    .first<MemberRow & { club: string; color: string; club_logo: string | null; logo_mime: string | null }>();
  if (!row) return fail("unknown_card", 404, "Card not found");
  // From now on, changes the club makes are sent to Google (see lib/server/club.ts).
  if (!(await getSettings(db)).maintenance) {
    await db.prepare("UPDATE club_members SET google_wallet = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
  }
  const origin = new URL(request.url).origin;
  // The club's own class (name, color, logo) when it has a PNG/JPEG logo; otherwise the shared class.
  const look = row.club_logo && (row.logo_mime === "image/png" || row.logo_mime === "image/jpeg")
    ? { name: row.club, color: row.color, logoUrl: `${origin}/api/asset/${row.club_logo}` }
    : null;
  const classId = await ensureBusinessClass(config, row.business, look);
  const url = await memberSaveUrl(classId ? { ...config, classId } : config, row.id, memberPass(row, row.club), origin);
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}
