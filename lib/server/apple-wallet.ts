// Apple Wallet store cards for customers: the pass content, its images, and the per-pass token the
// iPhone uses to fetch updates from the web service (app/api/wallet/apple-ws).
import { cardLang, textsFor, type Lang } from "../design";
import { buildPkpass, rgb, type Bytes } from "./apple-pass";
import { PASS_ICONS } from "./apple-pass-icons";
import { liveDesign } from "./designs";
import { passToken, type AppleConfig } from "./apple-token";

export { appleConfig, passToken, validToken, type AppleConfig } from "./apple-token";

const LABELS: Record<Lang, { stamps: string; reward: string; customer: string; ready: string; offer: string; changed: string; about: string }> = {
  he: { stamps: "חותמות", reward: "ההטבה", customer: "שם", ready: "הטבות מוכנות", offer: "מבצע", changed: "חותמות: %@", about: "כרטיס נאמנות דיגיטלי של Perkly. מציגים את הקוד בקופה." },
  ar: { stamps: "الأختام", reward: "المكافأة", customer: "الاسم", ready: "مكافآت جاهزة", offer: "عرض", changed: "الأختام: %@", about: "بطاقة ولاء رقمية من Perkly. اعرضوا الرمز عند الصندوق." },
  en: { stamps: "Stamps", reward: "Reward", customer: "Name", ready: "Rewards ready", offer: "Offer", changed: "Stamps: %@", about: "A Perkly digital loyalty card. Show the code at the counter." },
  ru: { stamps: "Штампы", reward: "Награда", customer: "Имя", ready: "Готовые награды", offer: "Акция", changed: "Штампы: %@", about: "Цифровая карта лояльности Perkly. Покажите код на кассе." },
  de: { stamps: "Stempel", reward: "Prämie", customer: "Name", ready: "Prämien bereit", offer: "Angebot", changed: "Stempel: %@", about: "Eine digitale Treuekarte von Perkly. Zeigen Sie den Code an der Kasse." },
  fr: { stamps: "Tampons", reward: "Récompense", customer: "Nom", ready: "Récompenses prêtes", offer: "Offre", changed: "Tampons : %@", about: "Une carte de fidélité numérique Perkly. Montrez le code en caisse." },
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

async function pngAsset(db: D1Database, business: string, id: string | null | undefined): Promise<Bytes | null> {
  if (!id) return null;
  const row = await db.prepare("SELECT mime, data FROM assets WHERE id = ? AND business = ?").bind(id, business).first<{ mime: string; data: ArrayBuffer }>();
  // Wallet passes take PNG images only.
  return row && row.mime === "image/png" ? new Uint8Array(row.data) : null;
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
  const logo = await pngAsset(db, c.business, design.logo);
  if (logo) {
    files["logo.png"] = logo;
    files["logo@2x.png"] = logo;
  }
  const strip = await pngAsset(db, c.business, design.walletHero ?? design.hero);
  if (strip) {
    files["strip.png"] = strip;
    files["strip@2x.png"] = strip;
  }
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
    barcodes: [{ format: "PKBarcodeFormatQR", message: "perkly:" + c.scan_code, messageEncoding: "iso-8859-1" }],
    storeCard: {
      headerFields: c.rewards > 0 ? [{ key: "ready", label: L.ready, value: c.rewards }] : [],
      primaryFields: [{ key: "stamps", label: L.stamps, value: `${c.stamps}/${c.target}`, changeMessage: L.changed }],
      secondaryFields: [{ key: "reward", label: L.reward, value: reward }],
      auxiliaryFields: [{ key: "customer", label: L.customer, value: c.name.slice(0, 40) }],
      backFields: [
        ...(text.promo ? [{ key: "offer", label: L.offer, value: text.promo.slice(0, 200) }] : []),
        { key: "about", label: "Perkly", value: L.about },
      ],
    },
  };
  return buildPkpass(pass, files, config.signer);
}

export const PKPASS_TYPE = "application/vnd.apple.pkpass";
