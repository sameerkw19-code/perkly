import { assetIds, cardLang, defaultDesign, sanitizeDesign, textsFor, type AssetMeta, type Design, type Lang } from "../design";

/** Google Wallet language tags for each card language. */
export const GOOGLE_TAG: Record<Lang, string> = { he: "he", ar: "ar", en: "en-US", ru: "ru", de: "de", fr: "fr" };

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
  const first = cardLang(design);
  const text = textsFor(design, first);
  let heroUrl: string | null = null;
  // The wallet banner if the business made one, otherwise its background image.
  const banner = design.walletHero ?? design.hero;
  if (banner) {
    const row = await db.prepare("SELECT mime FROM assets WHERE id = ? AND business = ?").bind(banner, business.id).first<{ mime: string }>();
    if (row && (row.mime === "image/jpeg" || row.mime === "image/png")) heroUrl = `${origin}/api/asset/${banner}`;
  }
  // The other languages the business picked, for phones that use them.
  const translations = design.langs.filter((l) => l !== first).map((l) => {
    const t = textsFor(design, l);
    return { language: GOOGLE_TAG[l], title: (t.title || business.name).slice(0, 60), reward: (t.reward || business.reward).slice(0, 120) };
  });
  return {
    title: (text.title || business.name).slice(0, 60),
    reward: (text.reward || business.reward).slice(0, 120),
    heroUrl,
    language: GOOGLE_TAG[first],
    translations,
  };
}
