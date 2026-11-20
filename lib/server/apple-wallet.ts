// Apple Wallet store cards for customers: the pass content, its images, and the per-pass token the
// iPhone uses to fetch updates from the web service (app/api/wallet/apple-ws).
import { passAverage, passBalance } from "./balance-pass";
import { progressStrip } from "./progress-strip";
import { env } from "cloudflare:workers";
import { appleStampPicture, cardLang, noticeText, textsFor, walletStampPicture, type Lang, type Texts } from "../design";
import { buildPkpass, rgb, type Bytes } from "./apple-pass";
import { PASS_ICONS } from "./apple-pass-icons";
import { businessPlaces, liveDesign } from "./designs";
import { fillNearText, nearTemplate, stampEmoji } from "../near-text";
import { israelNow } from "../birthday";
import { passToken, type AppleConfig } from "./apple-token";

export { appleConfig, passToken, validToken, type AppleConfig } from "./apple-token";

const LABELS: Record<Lang, { stamps: string; reward: string; customer: string; ready: string; readyChanged: string; offer: string; changed: string; about: string; balance: string; balanceChanged: string; round: string; roundChanged: string; worth: string; worthReady: string; news: string }> = {
  he: { stamps: "חותמות", reward: "ההטבה", customer: "שם", ready: "הטבות מוכנות", readyChanged: "הטבות מוכנות: %@", offer: "מבצע", changed: "חותמות: %@", about: "כרטיס נאמנות דיגיטלי של Perkly. מציגים את הקוד בקופה.", balance: "יתרה", balanceChanged: "היתרה: %@", round: "קניות בסבב", roundChanged: "קניות בסבב: %@", worth: "שווי עכשיו", worthReady: "הטבה מוכנה", news: "הודעה מהעסק" },
  ar: { stamps: "الأختام", reward: "المكافأة", customer: "الاسم", ready: "مكافآت جاهزة", readyChanged: "مكافآت جاهزة: %@", offer: "عرض", changed: "الأختام: %@", about: "بطاقة ولاء رقمية من Perkly. اعرضوا الرمز عند الصندوق.", balance: "الرصيد", balanceChanged: "الرصيد: %@", round: "مشتريات الجولة", roundChanged: "مشتريات الجولة: %@", worth: "القيمة الآن", worthReady: "مكافأة جاهزة", news: "رسالة من المحل" },
  en: { stamps: "Stamps", reward: "Reward", customer: "Name", ready: "Rewards ready", readyChanged: "Rewards ready: %@", offer: "Offer", changed: "Stamps: %@", about: "A Perkly digital loyalty card. Show the code at the counter.", balance: "Balance", balanceChanged: "Balance: %@", round: "Purchases this round", roundChanged: "Purchases this round: %@", worth: "Worth now", worthReady: "Reward ready", news: "Message" },
  ru: { stamps: "Штампы", reward: "Награда", customer: "Имя", ready: "Готовые награды", readyChanged: "Готовые награды: %@", offer: "Акция", changed: "Штампы: %@", about: "Цифровая карта лояльности Perkly. Покажите код на кассе.", balance: "Баланс", balanceChanged: "Баланс: %@", round: "Покупки в цикле", roundChanged: "Покупки в цикле: %@", worth: "Стоимость сейчас", worthReady: "Награда готова", news: "Сообщение" },
  de: { stamps: "Stempel", reward: "Prämie", customer: "Name", ready: "Prämien bereit", readyChanged: "Prämien bereit: %@", offer: "Angebot", changed: "Stempel: %@", about: "Eine digitale Treuekarte von Perkly. Zeigen Sie den Code an der Kasse.", balance: "Guthaben", balanceChanged: "Guthaben: %@", round: "Einkäufe dieser Runde", roundChanged: "Einkäufe: %@", worth: "Aktueller Wert", worthReady: "Prämie bereit", news: "Nachricht" },
  fr: { stamps: "Tampons", reward: "Récompense", customer: "Nom", ready: "Récompenses prêtes", readyChanged: "Récompenses prêtes : %@", offer: "Offre", changed: "Tampons : %@", about: "Une carte de fidélité numérique Perkly. Montrez le code en caisse.", balance: "Solde", balanceChanged: "Solde : %@", round: "Achats de ce cycle", roundChanged: "Achats : %@", worth: "Valeur actuelle", worthReady: "Récompense prête", news: "Message" },
};

/** The line on the iPhone's lock screen near a branch: what is waiting for the customer there. */
const NEAR: Record<Lang, { reward: (b: string, r: string) => string; stamps: (b: string, n: number, r: string) => string; balance: (b: string, v: string) => string; round: (b: string, d: number, t: number) => string }> = {
  he: { reward: (b, r) => `${b} קרוב! מחכה לך: ${r}`, stamps: (b, n, r) => `${b} קרוב! עוד ${n} ${n === 1 ? "חותמת" : "חותמות"} ל${r}`, balance: (b, v) => `${b} קרוב. היתרה שלך: ${v}`, round: (b, d, t) => `${b} קרוב. ${d}/${t} קניות בסבב` },
  ar: { reward: (b, r) => `${b} قريب! بانتظارك: ${r}`, stamps: (b, n, r) => `${b} قريب! باقي ${n} للحصول على ${r}`, balance: (b, v) => `${b} قريب. رصيدك: ${v}`, round: (b, d, t) => `${b} قريب. ${d}/${t} مشتريات في الجولة` },
  en: { reward: (b, r) => `${b} is nearby! Waiting for you: ${r}`, stamps: (b, n, r) => `${b} is nearby! ${n} more for ${r}`, balance: (b, v) => `${b} is nearby. Your balance: ${v}`, round: (b, d, t) => `${b} is nearby. ${d}/${t} purchases this round` },
  ru: { reward: (b, r) => `${b} рядом! Вас ждёт: ${r}`, stamps: (b, n, r) => `${b} рядом! Ещё ${n} до: ${r}`, balance: (b, v) => `${b} рядом. Ваш баланс: ${v}`, round: (b, d, t) => `${b} рядом. ${d}/${t} покупок в цикле` },
  de: { reward: (b, r) => `${b} ist in der Nähe! Für Sie bereit: ${r}`, stamps: (b, n, r) => `${b} ist in der Nähe! Noch ${n} bis: ${r}`, balance: (b, v) => `${b} ist in der Nähe. Ihr Guthaben: ${v}`, round: (b, d, t) => `${b} ist in der Nähe. ${d}/${t} Einkäufe` },
  fr: { reward: (b, r) => `${b} est tout près ! Vous attend : ${r}`, stamps: (b, n, r) => `${b} est tout près ! Encore ${n} pour : ${r}`, balance: (b, v) => `${b} est tout près. Votre solde : ${v}`, round: (b, d, t) => `${b} est tout près. ${d}/${t} achats` },
};

type CustomerRow = {
  id: string; business: string; name: string; stamps: number; target: number; scan_code: string; created: string;
  business_name: string; reward: string; color: string; rewards: number; balance: number; program: string; currency: string;
  round_total: number; avg_cap: number; ready_value: number | null; missyou_at?: string | null; last_event?: string | null; near_text?: string | null; near_text_evening?: string | null; near_morning_from?: number | null; near_evening_from?: number | null; news_text?: string | null; news_at?: string | null;
};

/** The customer behind a pass serial (the customer id), or null when it was removed. */
export async function customerForPass(db: D1Database, serial: string): Promise<CustomerRow | null> {
  return db
    .prepare(
      `SELECT c.id, c.business, c.name, c.stamps, c.target, c.scan_code, c.created, c.balance, c.round_total, c.missyou_at, (SELECT MAX(e.created) FROM events e WHERE e.customer = c.id) AS last_event, b.program, b.currency, b.avg_cap, b.near_text, b.near_text_evening, b.near_morning_from, b.near_evening_from, b.news_text, b.news_at, b.name AS business_name, b.reward, b.color,
         (SELECT value FROM rewards r WHERE r.customer = c.id AND r.redeemed IS NULL AND (r.expires IS NULL OR r.expires > ?2) ORDER BY earned, id LIMIT 1) AS ready_value,
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
         UNION ALL SELECT MAX(located) FROM branches WHERE business = ?2
         UNION ALL SELECT near_updated FROM businesses WHERE id = ?2
         UNION ALL SELECT missyou_at FROM customers WHERE id = ?1
         UNION ALL SELECT news_at FROM businesses WHERE id = ?2
         UNION ALL SELECT ?3 UNION ALL SELECT ?4)`,
    )
    .bind(customer.id, customer.business, customer.created, PASS_FORMAT)
    .first<{ t: string | null }>();
  return row?.t ?? customer.created;
}

/** When the pass itself last changed shape (say, the business's logo as the icon): iPhones fetch it again after a push. */
const PASS_FORMAT = "2026-11-20T00:00:00.000Z";

/** Wallet picture sizes (pixels, @3x). The strip sits under the logo row; a store card shows it at 375×144 points. */
const SPEC = {
  strip2: { width: 1125, height: 432, fit: "cover" },
  logo: { width: 480, height: 150, fit: "scale-down" },
  // The square icon iOS shows next to the pass's notifications and on the lock screen: the logo on white.
  icon: { width: 114, height: 114, fit: "pad", background: "#FFFFFF" },
  // An icon uploaded for notifications is already square: fill the whole square.
  notify: { width: 114, height: 114, fit: "cover" },
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
        .transform({ width: spec.width, height: spec.height, fit: spec.fit, ...("background" in spec ? { background: spec.background } : {}) })
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
  // The icon on the pass's notifications: the business's logo, or Perkly's when it has none (or it can't be converted).
  const icon = (design.notifyIcon ? await passImage(db, c.business, design.notifyIcon, "notify") : null)
    ?? await passImage(db, c.business, design.logo ?? design.walletLogo, "icon");
  for (const [name, b64] of Object.entries(PASS_ICONS)) files[name] = icon ?? b64bytes(b64);
  // The wallet version of the logo (white background removed, trimmed) when the editor made one.
  const logo = await passImage(db, c.business, design.walletLogo ?? design.logo, "logo");
  if (logo) {
    files["logo.png"] = logo;
    files["logo@2x.png"] = logo;
    files["logo@3x.png"] = logo;
  }
  // The strip under the logo: the stamp grid for this many stamps (made by the editor when publishing).
  // Cards published before it existed: the Google Wallet stamp banner, the wallet banner or the background image.
  // The balance card has no stamp grid: its strip is the wallet banner or the background image.
  const balance = passBalance(c, c.balance);
  // The average card: the purchases this round over a progress bar, and what the free purchase is worth.
  const average = passAverage(c, c, c.ready_value);
  const stampCard = balance === undefined && average === undefined;
  const grid = stampCard ? appleStampPicture(design, c.stamps, c.target) : null;
  const strip = average
    ? await progressStrip({ bg: design.colors.bg, bg2: design.look.bg2, fg: design.colors.fg, fill: design.colors.stamp, done: Math.min(c.stamps, c.target), target: c.target, rtl: lang === "he" || lang === "ar" })
    : await passImage(db, c.business, grid ?? (stampCard ? walletStampPicture(design, c.stamps, c.target) : null) ?? design.walletHero ?? design.hero, "strip2");
  if (strip) {
    files["strip@2x.png"] = strip;
    files["strip@3x.png"] = strip;
  }
  const stamps = { key: "stamps", label: L.stamps, value: `${Math.min(c.stamps, c.target)}/${c.target}`, changeMessage: L.changed };
  const ready = { key: "ready", label: L.ready, value: c.rewards, changeMessage: L.readyChanged, textAlignment: "PKTextAlignmentRight" };
  const name = { key: "customer", label: L.customer, value: c.name.slice(0, 40), textAlignment: "PKTextAlignmentRight" };
  // Near a branch, the iPhone shows the card on the lock screen with what is waiting for the customer there.
  const N = NEAR[lang] ?? NEAR.en;
  const missing = average ? Math.max(0, c.target - Math.min(c.stamps, c.target)) : balance === undefined ? Math.max(0, c.target - c.stamps) : null;
  // The owner's line, or their evening line in the evening (the daily job sends the card again when it switches).
  const template = nearTemplate(c, israelNow().hour);
  const own = template ? fillNearText(template, { missing, reward, business: title, balance: balance ?? null }) : "";
  // The automatic line ends with an emoji: 🎁 when a reward is waiting, else the business's stamp (☕, 🍕, ✂️…).
  const emoji = stampEmoji(design.stamp?.icon);
  const nearText = own || (average
    ? average.ready ? `${N.reward(title, reward)} 🎁` : `${N.round(title, Math.min(c.stamps, c.target), c.target)} ${emoji}`
    : balance !== undefined ? `${N.balance(title, balance)} 💰`
    : c.rewards > 0 ? `${N.reward(title, reward)} 🎁`
    : `${N.stamps(title, Math.max(1, c.target - c.stamps), reward)} ${emoji}`);
  // At most 120 characters, cut between whole characters so an emoji is never split.
  const line = [...nearText].length > 120 ? [...nearText].slice(0, 119).join("") + "…" : nearText;
  const locations = (await businessPlaces(db, c.business)).map((p) => ({ latitude: p.lat, longitude: p.lng, relevantText: line }));
  // A message from the last 30 days, with the customer's name filled in.
  const news = c.news_text && c.news_at && Date.now() - Date.parse(c.news_at) < 30 * 86_400_000
    ? noticeText({ ...text, title, reward } as Texts, lang, { kind: "special", name: c.name, text: c.news_text })
    : "";
  // "We miss you": sent by the daily job to a customer who hasn't visited for a while; shown for a week, and the
  // iPhone notifies when it appears. A visit after it (an event newer than missyou_at) makes it go away.
  const missYou = c.missyou_at && Date.now() - Date.parse(c.missyou_at) < 7 * 86_400_000 && design.walletMissYou && !(c.last_event && c.last_event > c.missyou_at)
    ? noticeText({ ...text, title, reward } as Texts, lang, { kind: "missyou", name: c.name })
    : "";
  const pass = {
    ...(locations.length ? { locations } : {}),
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: c.id,
    authenticationToken: await passToken(config, c.id),
    webServiceURL: `${origin}/api/wallet/apple-ws`,
    organizationName: title,
    description: `${title} · ${reward}`.slice(0, 120),
    ...(logo || !design.showTitle ? {} : { logoText: title }),
    foregroundColor: rgb(design.colors.fg),
    labelColor: rgb(design.colors.fg),
    backgroundColor: rgb(design.colors.bg),
    sharingProhibited: true,
    barcodes: [{ format: "PKBarcodeFormatQR", message: "perkly:" + c.scan_code, messageEncoding: "iso-8859-1", altText: "Powered by Perkly" }],
    storeCard: {
      // Logo and the customer's name on top, the stamps as a picture, then the stamp count and the rewards ready.
      headerFields: average
        ? [{ key: "worth", label: average.ready ? L.worthReady : L.worth, value: average.worth ?? "—", textAlignment: "PKTextAlignmentRight" }]
        : design.showCustomerName ? [name] : [],
      primaryFields: average ? [{ key: "round", label: L.round, value: `${Math.min(c.stamps, c.target)} / ${c.target}`, changeMessage: L.roundChanged }] : [],
      secondaryFields: average
        ? [...(design.showCustomerName ? [{ ...name, textAlignment: "PKTextAlignmentNatural" }] : []), { key: "rewardFront", label: L.reward, value: reward, textAlignment: "PKTextAlignmentRight" }]
        : balance === undefined ? [stamps, ready] : [{ key: "balance", label: L.balance, value: balance, changeMessage: L.balanceChanged }],
      ...(strip ? {} : { auxiliaryFields: [{ key: "reward", label: L.reward, value: reward }] }),
      backFields: [
        { key: "rewardBack", label: L.reward, value: reward },
        // The latest message to customers: when it changes, the iPhone shows it as a notification (changeMessage).
        ...(news ? [{ key: "news", label: L.news, value: news, changeMessage: "%@" }] : []),
        ...(missYou ? [{ key: "missyou", label: L.news, value: missYou, changeMessage: "%@" }] : []),
        ...(text.promo ? [{ key: "offer", label: L.offer, value: text.promo.slice(0, 200) }] : []),
        { key: "about", label: "Perkly", value: L.about },
      ],
    },
  };
  return buildPkpass(pass, files, config.signer);
}

export const PKPASS_TYPE = "application/vnd.apple.pkpass";
