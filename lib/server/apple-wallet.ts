// Apple Wallet store cards for customers: the pass content, its images, and the per-pass token the
// iPhone uses to fetch updates from the web service (app/api/wallet/apple-ws).
import { env } from "cloudflare:workers";
import { appleStampPicture, cardLang, textsFor, walletStampPicture, type Lang } from "../design";
import { buildPkpass, rgb, type Bytes } from "./apple-pass";
import { PASS_ICONS } from "./apple-pass-icons";
import { liveDesign } from "./designs";
import { passToken, type AppleConfig } from "./apple-token";

export { appleConfig, passToken, validToken, type AppleConfig } from "./apple-token";

const LABELS: Record<Lang, { stamps: string; reward: string; customer: string; ready: string; readyChanged: string; offer: string; changed: string; about: string }> = {
  he: { stamps: "חותמות", reward: "ההטבה", customer: "שם", ready: "הטבות מוכנות", readyChanged: "הטבות מוכנות: %@", offer: "מבצע", changed: "חותמות: %@", about: "כרטיס נאמנות דיגיטלי של Perkly. מציגים את הקוד בקופה." },
  ar: { stamps: "الأختام", reward: "المكافأة", customer: "الاسم", ready: "مكافآت جاهزة", readyChanged: "مكافآت جاهزة: %@", offer: "عرض", changed: "الأختام: %@", about: "بطاقة ولاء رقمية من Perkly. اعرضوا الرمز عند الصندوق." },
  en: { stamps: "Stamps", reward: "Reward", customer: "Name", ready: "Rewards ready", readyChanged: "Rewards ready: %@", offer: "Offer", changed: "Stamps: %@", about: "A Perkly digital loyalty card. Show the code at the counter." },
  ru: { stamps: "Штампы", reward: "Награда", customer: "Имя", ready: "Готовые награды", readyChanged: "Готовые награды: %@", offer: "Акция", changed: "Штампы: %@", about: "Цифровая карта лояльности Perkly. Покажите код на кассе." },
  de: { stamps: "Stempel", reward: "Prämie", customer: "Name", ready: "Prämien bereit", readyChanged: "Prämien bereit: %@", offer: "Angebot", changed: "Stempel: %@", about: "Eine digitale Treuekarte von Perkly. Zeigen Sie den Code an der Kasse." },
  fr: { stamps: "Tampons", reward: "Récompense", customer: "Nom", ready: "Récompenses prêtes", readyChanged: "Récompenses prêtes : %@", offer: "Offre", changed: "Tampons : %@", about: "Une carte de fidélité numérique Perkly. Montrez le code en caisse." },
};

type CustomerRow = {
  id: string; business: string; name: string; stamps: number; target: number; scan_code: string; created: string;
  business_name: string; reward: string; color: string; rewards: number;
};

/** The customer behind a pass serial (the customer id), or null when it was removed. */
export async function customerForPass(db: D1Database, serial: string): Promise<CustomerRow | null> {
  return db
    .prepare(
      `SELECT c.id, c.business, c.name, c.stamps, c.target, c.scan_code, c.created, b.name AS business_name, b.reward, b.color,
         (SELECT COUNT(*) FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2))
           + (CASE WHEN b.reward_mode = 'block' AND c.stamps >= c.target THEN 1 ELSE 0 END) AS rewards
       FROM customers c JOIN businesses b ON b.id = c.business WHERE c.id = ?1 AND c.archived IS NULL AND b.archived IS NULL`,
    )
    .bind(serial, new Date().toISOString())
    .first<CustomerRow>();
}

/** When the pass last changed: the customer's latest stamp or redemption, or the business's latest card design. */
export async function passUpdated(db: D1Database, customer: { id: string; business: string; created: string }): Promise<string> {
  const row = await db
    .prepare(
      `SELECT MAX(t) AS t FROM (
         SELECT MAX(created) AS t FROM events WHERE customer = ?1
         UNION ALL SELECT MAX(published) FROM card_designs WHERE business = ?2
         UNION ALL SELECT ?3)`,
    )
    .bind(customer.id, customer.business, customer.created)
    .first<{ t: string | null }>();
  return row?.t ?? customer.created;
}

/** Wallet picture sizes (pixels, @3x). The strip sits under the logo row; a store card shows it at 375×144 points. */
const SPEC = {
  strip2: { width: 1125, height: 432, fit: "cover" },
  logo: { width: 480, height: 150, fit: "scale-down" },
} as const;

type ImageKind = keyof typeof SPEC;

/**
 * A business picture as PNG at the Wallet size (Wallet takes PNG only, and uploads are JPEG or WebP).
 * Converted once with Cloudflare Images and kept in apple_images; asset ids never change, so the copy stays valid.
 * Without the IMAGES binding (or if converting fails) only a picture that already is PNG is used.
 */
async function passImage(db: D1Database, business: string, id: string | null | undefined, kind: ImageKind): Promise<Bytes | null> {
  if (!id) return null;
  const cached = await db.prepare("SELECT data FROM apple_images WHERE source = ? AND kind = ?").bind(id, kind).first<{ data: ArrayBuffer }>();
  if (cached) return new Uint8Array(cached.data);
  const row = await db.prepare("SELECT mime, data FROM assets WHERE id = ? AND business = ?").bind(id, business).first<{ mime: string; data: ArrayBuffer }>();
  if (!row) return null;
  const original = new Uint8Array(row.data);
  const images = (env as unknown as { IMAGES?: ImagesBinding }).IMAGES;
  if (images) {
    try {
      const spec = SPEC[kind];
      const out = await images
        .input(new Blob([original]).stream())
        .transform({ width: spec.width, height: spec.height, fit: spec.fit })
        .output({ format: "image/png" });
      const png = new Uint8Array(await out.response().arrayBuffer());
      if (png.length > 8 && png[0] === 0x89 && png[1] === 0x50) {
        await db
          .prepare("INSERT OR REPLACE INTO apple_images(source, kind, data, created) VALUES(?, ?, ?, ?)")
          .bind(id, kind, png, new Date().toISOString())
          .run();
        return png;
      }
    } catch (e) {
      console.log("apple wallet image error", String(e).slice(0, 200));
    }
  }
  return row.mime === "image/png" ? original : null;
}

const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The signed .pkpass for one customer, in the business's design and first card language. */
export async function customerPass(db: D1Database, config: AppleConfig, c: CustomerRow, origin: string): Promise<Bytes> {
  const design = await liveDesign(db, { id: c.business, name: c.business_name, reward: c.reward, color: c.color });
  const lang = cardLang(design);
  const text = textsFor(design, lang);
  const L = LABELS[lang] ?? LABELS.en;
  const title = (text.title || c.business_name).slice(0, 60);
  const reward = (text.reward || c.reward).slice(0, 120);
  const files: Record<string, Bytes> = {};
  for (const [name, b64] of Object.entries(PASS_ICONS)) files[name] = b64bytes(b64);
  // The wallet version of the logo (white background removed, trimmed) when the editor made one.
  const logo = await passImage(db, c.business, design.walletLogo ?? design.logo, "logo");
  if (logo) {
    files["logo.png"] = logo;
    files["logo@2x.png"] = logo;
    files["logo@3x.png"] = logo;
  }
  // The strip under the logo: the stamp grid for this many stamps (made by the editor when publishing).
  // Cards published before it existed: the Google Wallet stamp banner, the wallet banner or the background image.
  const grid = appleStampPicture(design, c.stamps, c.target);
  const strip = await passImage(db, c.business, grid ?? walletStampPicture(design, c.stamps, c.target) ?? design.walletHero ?? design.hero, "strip2");
  if (strip) {
    files["strip@2x.png"] = strip;
    files["strip@3x.png"] = strip;
  }
  const stamps = { key: "stamps", label: L.stamps, value: `${Math.min(c.stamps, c.target)}/${c.target}`, changeMessage: L.changed };
  const ready = { key: "ready", label: L.ready, value: c.rewards, changeMessage: L.readyChanged, textAlignment: "PKTextAlignmentRight" };
  const name = { key: "customer", label: L.customer, value: c.name.slice(0, 40), textAlignment: "PKTextAlignmentRight" };
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: c.id,
    authenticationToken: await passToken(config, c.id),
    webServiceURL: `${origin}/api/wallet/apple-ws`,
    organizationName: title,
    description: `${title} · ${reward}`.slice(0, 120),
    ...(logo ? {} : { logoText: title }),
    foregroundColor: rgb(design.colors.fg),
    labelColor: rgb(design.colors.fg),
    backgroundColor: rgb(design.colors.bg),
    sharingProhibited: true,
    barcodes: [{ format: "PKBarcodeFormatQR", message: "perkly:" + c.scan_code, messageEncoding: "iso-8859-1", altText: "Powered by Perkly" }],
    storeCard: {
      // Logo and the customer's name on top, the stamps as a picture, then the stamp count and the rewards ready.
      headerFields: design.showCustomerName ? [name] : [],
      primaryFields: [],
      secondaryFields: [stamps, ready],
      ...(strip ? {} : { auxiliaryFields: [{ key: "reward", label: L.reward, value: reward }] }),
      backFields: [
        { key: "rewardBack", label: L.reward, value: reward },
        ...(text.promo ? [{ key: "offer", label: L.offer, value: text.promo.slice(0, 200) }] : []),
        { key: "about", label: "Perkly", value: L.about },
      ],
    },
  };
  return buildPkpass(pass, files, config.signer);
}

export const PKPASS_TYPE = "application/vnd.apple.pkpass";
