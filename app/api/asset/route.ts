import { getD1 } from "../../../db";
import { getUser, isPlatformAdmin } from "../../../lib/server/auth";
import { env } from "cloudflare:workers";
import { businessAccess, hasPaidDesign } from "../../../lib/server/billing";
import { getSettings } from "../../../lib/server/settings";
import { fail, json, sameOrigin } from "../../../lib/server/http";
import { imageInfo } from "../../../lib/server/image";
import { allow } from "../../../lib/server/rate-limit";
import { publishedDesign } from "../../../lib/server/designs";

export const dynamic = "force-dynamic";

const MAX_BYTES = 800_000; // The editor shrinks images before upload; this is a safety cap.
// wallet_logo: the logo prepared for Apple and Google Wallet by the editor when publishing.
const KINDS = new Set(["logo", "hero", "stamp", "wallet", "wallet_logo"]);

// Upload one image (raw bytes in the body). Owner only. SVG is not accepted.
export async function POST(request: Request) {
  // A declared size over the cap is refused before anything is read into memory.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 4096) return fail("too_large", 413, "Image is too large");
  const bytes = new Uint8Array(await request.arrayBuffer()); // read first, always
  if (!sameOrigin(request)) return fail("bad_origin", 403);
  const db = getD1();
  const user = await getUser(db, request.headers.get("cookie"));
  if (!user) return fail("signin", 401);
  const url = new URL(request.url);
  const business = url.searchParams.get("business");
  const kind = url.searchParams.get("kind") ?? "";
  // Images for the card are uploaded by Perkly (a platform admin) only, for any business.
  if (!isPlatformAdmin(user, env)) return fail("admin_only", 403, "Managed by Perkly");
  if (!business || !(await db.prepare("SELECT 1 FROM businesses WHERE id = ? AND archived IS NULL").bind(business).first())) return fail("not_found", 404);
  if ((await getSettings(db)).maintenance) return fail("maintenance", 503, "Maintenance");
  const access = await businessAccess(db, business!);
  if (!access.ok && access.code === "business_suspended") return fail(access.code, 402, "Business is suspended");
  // Logo, background image and stamp image are part of the subscription.
  if (!hasPaidDesign(access)) return fail("paid_feature", 402, "Available with a subscription");
  if (!KINDS.has(kind)) return fail("bad_request", 400);
  if (!bytes.length || bytes.length > MAX_BYTES) return fail("image_too_big", 413);
  if (!(await allow(db, `upload:${user.id}`, 60, 3600))) return fail("rate_limited", 429);
  const info = imageInfo(bytes);
  if (!info || info.width < 1 || info.height < 1 || info.width > 6000 || info.height > 6000) return fail("image_type", 415);

  const id = crypto.randomUUID();
  // Wallet logos are remade on every publish: drop older ones the published card no longer uses
  // (kept for a day, so a publish in progress never loses the ones it just made).
  if (kind === "wallet_logo") {
    const live = (await publishedDesign(db, business!))?.design;
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    await db
      .prepare("DELETE FROM assets WHERE business = ? AND kind = 'wallet_logo' AND created < ? AND id NOT IN (?, ?)")
      .bind(business, dayAgo, live?.walletLogo ?? "", live?.googleLogo ?? "")
      .run();
  }
  await db
    .prepare("INSERT INTO assets(id, business, kind, mime, width, height, bytes, data, created, created_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, business, kind, info.mime, info.width, info.height, bytes.length, bytes, new Date().toISOString(), user.id)
    .run();
  return json({ id, width: info.width, height: info.height });
}
