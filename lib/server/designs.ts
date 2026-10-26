import { assetIds, defaultDesign, sanitizeDesign, textsFor, type AssetMeta, type Design } from "../design";

type BusinessLike = { id: string; name: string; reward: string; color: string };

export async function publishedDesign(db: D1Database, businessId: string): Promise<{ design: Design; version: number; published: string } | null> {
  const row = await db
    .prepare("SELECT data, version, published FROM card_designs WHERE business = ? ORDER BY version DESC LIMIT 1")
    .bind(businessId)
    .first<{ data: string; version: number; published: string }>();
  if (!row) return null;
  const design = sanitizeDesign(JSON.parse(row.data));
  return design ? { design, version: row.version, published: row.published } : null;
}

/** What customers see: the latest published design, or a default built from the business settings. */
export async function liveDesign(db: D1Database, business: BusinessLike): Promise<Design> {
  return (await publishedDesign(db, business.id))?.design ?? defaultDesign(business);
}

export async function assetMeta(db: D1Database, businessId: string, ids: string[]): Promise<AssetMeta[]> {
  if (!ids.length) return [];
  const rows = await db
    .prepare(`SELECT id, width, height FROM assets WHERE business = ? AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(businessId, ...ids)
    .all<AssetMeta>();
  return rows.results;
}

/** True when every image in the design belongs to this business. */
export async function ownsAssets(db: D1Database, businessId: string, design: Design): Promise<boolean> {
  const ids = [...new Set(assetIds(design))];
  return (await assetMeta(db, businessId, ids)).length === ids.length;
}

/**
 * The business's look on its Google Wallet pass: name, reward and banner image.
 * Google Wallet doesn't take WebP, so only a JPEG or PNG background image becomes the banner.
 */
export async function passLook(db: D1Database, business: BusinessLike, origin: string) {
  const design = await liveDesign(db, business);
  const text = textsFor(design, "he");
  let heroUrl: string | null = null;
  // The wallet banner if the business made one, otherwise its background image.
  const banner = design.walletHero ?? design.hero;
  if (banner) {
    const row = await db.prepare("SELECT mime FROM assets WHERE id = ? AND business = ?").bind(banner, business.id).first<{ mime: string }>();
    if (row && (row.mime === "image/jpeg" || row.mime === "image/png")) heroUrl = `${origin}/api/asset/${banner}`;
  }
  return { title: (text.title || business.name).slice(0, 60), reward: (text.reward || business.reward).slice(0, 120), heroUrl };
}
