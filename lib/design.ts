// Card design: shared by the editor (browser) and the server (validation before save/publish).
// A design only changes how a card looks. It never touches stamps, targets or eligibility.

/**
 * Languages a loyalty card can be shown in. The business picks its own list (Design.langs).
 * A language the business did not pick never appears on its card, editor or pass.
 */
export const CARD_LANGS = ["he", "ar", "en", "ru", "de", "fr"] as const;
export type Lang = (typeof CARD_LANGS)[number];

/**
 * Card languages offered in the editor for now. Arabic, Russian, German and French are kept in the code
 * and come back by adding them here. A language that is already on a card stays selectable until it is switched off.
 */
export const OFFERED_CARD_LANGS: Lang[] = ["he", "en"];

/** Right-to-left card languages. */
export function isRtl(l: Lang): boolean {
  return l === "he" || l === "ar";
}

/** Each card language written in its own script, for pickers. */
export const CARD_LANG_NAME: Record<Lang, string> = {
  he: "עברית", ar: "العربية", en: "English", ru: "Русский", de: "Deutsch", fr: "Français",
};

/** BCP-47 locale for dates on a card in this language. */
export const CARD_LOCALE: Record<Lang, string> = {
  he: "he-IL", ar: "ar", en: "en-GB", ru: "ru-RU", de: "de-DE", fr: "fr-FR",
};


export const STAMP_ICONS = [
  "coffee", "pizza", "burger", "icecream", "mojito", "beer", "shot", "cocktail", "sandwich",
  "croissant", "cake", "utensils", "scissors", "bag", "sparkle", "heart", "star",
] as const;
export type PresetIcon = (typeof STAMP_ICONS)[number];
export type StampIcon = PresetIcon | "logo" | "image";
export type Layout = "gradient" | "solid" | "photo";
export type Texts = { title: string; subtitle: string; reward: string; gift: string; promo: string };

/** Fonts a business can pick. All are free Google Fonts; "system" needs no download. */
export const FONTS = {
  system: { family: "Arial, 'Helvetica Neue', sans-serif", google: null, label: "Arial" },
  rubik: { family: "'Rubik', Arial, sans-serif", google: "Rubik:wght@400;500;700", label: "Rubik" },
  heebo: { family: "'Heebo', Arial, sans-serif", google: "Heebo:wght@400;500;700", label: "Heebo" },
  assistant: { family: "'Assistant', Arial, sans-serif", google: "Assistant:wght@400;600;800", label: "Assistant" },
  varela: { family: "'Varela Round', Arial, sans-serif", google: "Varela+Round", label: "Varela Round" },
  secular: { family: "'Secular One', Arial, sans-serif", google: "Secular+One", label: "Secular One" },
  frank: { family: "'Frank Ruhl Libre', Georgia, serif", google: "Frank+Ruhl+Libre:wght@400;500;700", label: "Frank Ruhl" },
  amatic: { family: "'Amatic SC', Arial, sans-serif", google: "Amatic+SC:wght@400;700", label: "Amatic" },
  cairo: { family: "'Cairo', Arial, sans-serif", google: "Cairo:wght@400;600;700", label: "Cairo" },
} as const;
export type FontId = keyof typeof FONTS;
export const GRADIENT_DIRS = ["down", "diag", "side", "radial"] as const;
export type GradientDir = (typeof GRADIENT_DIRS)[number];
export type Size = "s" | "m" | "l";

/** Free-form look settings. Changing them never affects stamps or rewards. */
export type CardLook = {
  /** Second gradient color. */
  bg2: string;
  dir: GradientDir;
  /** How strongly the background color covers a photo background, 0–90 (%). */
  overlay: number;
  font: FontId;
  text: Size;
  stamps: Size;
  /** "classic": the usual look. "bright": filled stamps bright, empty ones dark (a subscription feature). */
  stampStyle: "classic" | "bright";
  /** Logo height on the web card, 60–200 (% of the normal size). */
  logoSize: number;
  /** "none": the logo as it is; "circle" / "square": on a white badge (good for logos with a white background). */
  logoFrame: LogoFrame;
  /** Show the card name next to the logo. */
  logoName: boolean;
};
export const LOGO_FRAMES = ["none", "circle", "square"] as const;
export type LogoFrame = (typeof LOGO_FRAMES)[number];

export function fontHref(font: FontId): string | null {
  const g = FONTS[font]?.google;
  return g ? `https://fonts.googleapis.com/css2?family=${g}&display=swap` : null;
}

/** Which scripts each font draws. Arial (system) has both Hebrew and Arabic on phones and computers. */
export const FONT_SCRIPTS: Record<FontId, { he: boolean; ar: boolean; cyr: boolean }> = {
  system: { he: true, ar: true, cyr: true }, rubik: { he: true, ar: true, cyr: true }, heebo: { he: true, ar: false, cyr: false },
  assistant: { he: true, ar: false, cyr: false }, varela: { he: true, ar: false, cyr: false }, secular: { he: true, ar: false, cyr: false },
  frank: { he: true, ar: false, cyr: false }, amatic: { he: true, ar: false, cyr: false }, cairo: { he: false, ar: true, cyr: false },
};

/**
 * A font for the card text in this language. If the chosen font has no Hebrew or no Arabic,
 * a matching font is added after it (Rubik for Hebrew, Cairo for Arabic), so letters never fall
 * back to a random system font and the card keeps a designed look in right-to-left languages.
 */
export function cardFont(font: FontId, lang: Lang): { family: string; extra: FontId | null } {
  const f = FONTS[font] ?? FONTS.system;
  const scripts = FONT_SCRIPTS[font] ?? FONT_SCRIPTS.system;
  const extra: FontId | null =
    lang === "ar" && !scripts.ar ? "cairo" : lang === "he" && !scripts.he ? "rubik" : lang === "ru" && !scripts.cyr ? "rubik" : null;
  if (!extra) return { family: f.family, extra: null };
  const [first, ...rest] = f.family.split(",");
  return { family: [first, FONTS[extra].family.split(",")[0], ...rest].join(",").replace(/,\s*/g, ", "), extra };
}

export type Design = {
  v: 1;
  layout: Layout;
  colors: { bg: string; fg: string; stamp: string };
  stamp: { icon: StampIcon; image: string | null };
  logo: string | null;
  hero: string | null;
  /** Wallet banner (Google Wallet hero image, Apple strip later). Falls back to the background image. */
  walletHero: string | null;
  /** Languages the card is shown in, in card order. Set by the business; a language not listed never appears. */
  langs: Lang[];
  texts: Record<Lang, Texts>;
  showCustomerName: boolean;
  look: CardLook;
};

export const LIMITS = { title: 40, subtitle: 40, reward: 80, gift: 14, promo: 60 };
export const WALLET_LIMITS = { title: 24, reward: 36 };
export const IMAGE_MIN = { logo: 660, hero: 1032, stamp: 120, wallet: 1032 };

export const PALETTES: Record<string, { bg: string; fg: string; stamp: string }> = {
  charcoal: { bg: "#1E1B2E", fg: "#FFFFFF", stamp: "#D9F493" },
  noir: { bg: "#000000", fg: "#FFFFFF", stamp: "#F5F5F5" },
  espresso: { bg: "#3A2A22", fg: "#F6EEE6", stamp: "#E8B66B" },
  night: { bg: "#14213D", fg: "#FFFFFF", stamp: "#FCA311" },
  tomato: { bg: "#8E1B12", fg: "#FFF4E6", stamp: "#FFC94A" },
  sage: { bg: "#E6EEE4", fg: "#1F3A2E", stamp: "#2F6B4F" },
  blush: { bg: "#FFE6EE", fg: "#4E1028", stamp: "#C2255C" },
  paper: { bg: "#FFFFFF", fg: "#1C1A29", stamp: "#7558E8" },
};

/** Ready-made gradients: background, second color, text, stamp. */
export const GRADIENTS: Record<string, { bg: string; bg2: string; fg: string; stamp: string }> = {
  forest: { bg: "#0E8A4F", bg2: "#043F2B", fg: "#FFFFFF", stamp: "#F4BF34" },
  ocean: { bg: "#1E5BD8", bg2: "#0B1F4D", fg: "#FFFFFF", stamp: "#7FE3FF" },
  sunset: { bg: "#FF7A59", bg2: "#B3264B", fg: "#FFFFFF", stamp: "#FFE08A" },
  berry: { bg: "#8E2DE2", bg2: "#3A0CA3", fg: "#FFFFFF", stamp: "#F9C6FF" },
  coffee: { bg: "#8A5A3C", bg2: "#2B1A12", fg: "#FFF4E8", stamp: "#E8B66B" },
  gold: { bg: "#2A2A2A", bg2: "#0D0D0D", fg: "#F5E6C4", stamp: "#D4A84B" },
  mint: { bg: "#D4FC79", bg2: "#96E6A1", fg: "#16351F", stamp: "#1F6B3A" },
  peach: { bg: "#FFE3D1", bg2: "#FFB6A3", fg: "#4A1E12", stamp: "#C2410C" },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Mixes a color toward black (amount 0..1). Used for a default second gradient color. */
export function darken(hex: string, amount = 0.35): string {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - amount)));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function defaultLook(bg: string): CardLook {
  return { bg2: darken(HEX.test(bg) ? bg : "#1E1B2E"), dir: "diag", overlay: 55, font: "system", text: "m", stamps: "m", stampStyle: "classic", logoSize: 100, logoFrame: "none", logoName: false };
}
const ASSET_ID = /^[0-9a-f-]{36}$/;

const GIFT: Record<Lang, string> = { he: "מתנה", ar: "مجاناً", en: "FREE", ru: "Подарок", de: "GRATIS", fr: "OFFERT" };
const SUB: Record<Lang, string> = {
  he: "כרטיס נאמנות", ar: "بطاقة ولاء", en: "Loyalty card", ru: "Карта лояльности", de: "Treuekarte", fr: "Carte de fidélité",
};

/**
 * Card languages in card order, without duplicates, and only the ones offered for now (OFFERED_CARD_LANGS).
 * A missing list means an older design: Hebrew, Arabic and English, which then leaves Hebrew and English.
 * Other languages stay in the stored texts and come back when they are offered again.
 */
export function sanitizeLangs(input: unknown): Lang[] {
  const picked = input === undefined || input === null ? ["he", "ar", "en"] : Array.isArray(input) ? input : [];
  const langs = CARD_LANGS.filter((l) => picked.includes(l) && OFFERED_CARD_LANGS.includes(l));
  return langs.length ? langs : ["he"];
}

/** The language a card is shown in: the wanted one if the business picked it, otherwise its first language. */
export function cardLang(d: Design, wanted?: string | null): Lang {
  const langs: Lang[] = d.langs?.length ? d.langs : ["he"];
  return langs.find((l) => l === wanted) ?? langs[0];
}

export function defaultDesign(b: { name: string; reward: string; color: string }): Design {
  const t = (l: Lang): Texts => ({ title: b.name.slice(0, LIMITS.title), subtitle: SUB[l], reward: b.reward.slice(0, LIMITS.reward), gift: GIFT[l], promo: "" });
  return {
    v: 1,
    layout: "gradient",
    colors: { bg: HEX.test(b.color) ? b.color : "#1E1B2E", fg: "#FFFFFF", stamp: "#D9F493" },
    stamp: { icon: "coffee", image: null },
    logo: null,
    hero: null,
    walletHero: null,
    langs: ["he"],
    texts: Object.fromEntries(CARD_LANGS.map((l) => [l, t(l)])) as Record<Lang, Texts>,
    showCustomerName: true,
    look: defaultLook(HEX.test(b.color) ? b.color : "#1E1B2E"),
  };
}

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
}

/** Strict server-side cleanup. Returns null if the shape is wrong. Asset ownership is checked separately. */
export function sanitizeDesign(input: unknown): Design | null {
  if (!input || typeof input !== "object") return null;
  const d = input as any;
  const colors = d.colors ?? {};
  if (![colors.bg, colors.fg, colors.stamp].every((c) => typeof c === "string" && HEX.test(c))) return null;
  const icon = d.stamp?.icon;
  if (!(STAMP_ICONS as readonly string[]).includes(icon) && icon !== "logo" && icon !== "image") return null;
  const asset = (v: unknown) => (typeof v === "string" && ASSET_ID.test(v) ? v : null);
  const texts = {} as Record<Lang, Texts>;
  for (const l of CARD_LANGS) {
    const t = d.texts?.[l] ?? {};
    texts[l] = {
      title: cleanText(t.title, LIMITS.title),
      subtitle: cleanText(t.subtitle, LIMITS.subtitle),
      reward: cleanText(t.reward, LIMITS.reward),
      gift: cleanText(t.gift, LIMITS.gift),
      promo: cleanText(t.promo, LIMITS.promo),
    };
  }
  return {
    v: 1,
    layout: ["gradient", "solid", "photo"].includes(d.layout) ? d.layout : "gradient",
    colors: { bg: colors.bg.toUpperCase(), fg: colors.fg.toUpperCase(), stamp: colors.stamp.toUpperCase() },
    stamp: { icon, image: asset(d.stamp?.image) },
    logo: asset(d.logo),
    hero: asset(d.hero),
    walletHero: asset(d.walletHero),
    langs: sanitizeLangs(d.langs),
    texts,
    showCustomerName: d.showCustomerName !== false,
    look: sanitizeLook(d.look, colors.bg.toUpperCase()),
  };
}

/** Older designs have no look: fill defaults. Unknown values fall back, never fail. */
function sanitizeLook(input: unknown, bg: string): CardLook {
  const base = defaultLook(bg);
  if (!input || typeof input !== "object") return base;
  const l = input as any;
  const size = (v: unknown, fb: Size): Size => (v === "s" || v === "m" || v === "l" ? v : fb);
  const overlay = Number(l.overlay);
  const logoSize = Number(l.logoSize);
  return {
    bg2: typeof l.bg2 === "string" && HEX.test(l.bg2) ? l.bg2.toUpperCase() : base.bg2,
    dir: (GRADIENT_DIRS as readonly string[]).includes(l.dir) ? l.dir : base.dir,
    overlay: Number.isFinite(overlay) ? Math.max(0, Math.min(90, Math.round(overlay / 5) * 5)) : base.overlay,
    font: typeof l.font === "string" && Object.prototype.hasOwnProperty.call(FONTS, l.font) ? (l.font as FontId) : base.font,
    text: size(l.text, base.text),
    stamps: size(l.stamps, base.stamps),
    stampStyle: l.stampStyle === "bright" ? "bright" : "classic",
    logoSize: Number.isFinite(logoSize) ? Math.max(60, Math.min(200, Math.round(logoSize / 10) * 10)) : base.logoSize,
    logoFrame: (LOGO_FRAMES as readonly string[]).includes(l.logoFrame) ? l.logoFrame : base.logoFrame,
    logoName: l.logoName === true,
  };
}

export function assetIds(d: Design): string[] {
  return [d.logo, d.hero, d.walletHero, d.stamp.image].filter((x): x is string => !!x);
}

// ---- Readability checks (WCAG contrast) ----
function rgb(hex: string) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Black or white, whichever reads better on the given color. */
export function onColor(hex: string): string {
  return contrast(hex, "#111111") >= contrast(hex, "#FFFFFF") ? "#111111" : "#FFFFFF";
}

export type Check = { level: "ok" | "warn" | "bad" | "info"; key: string; vars?: Record<string, string | number> };
export type AssetMeta = { id: string; width: number; height: number };

/** Checks shown in the editor. The server refuses to publish while any check is "bad". */
export function designChecks(d: Design, assets: AssetMeta[]): Check[] {
  const out: Check[] = [];
  // With a gradient the text sits on both colors, so the weaker one counts.
  const backs = d.layout === "gradient" ? [d.colors.bg, d.look.bg2] : [d.colors.bg];
  const text = Math.min(...backs.map((b) => contrast(d.colors.fg, b)));
  out.push({ level: text >= 4.5 ? "ok" : text >= 3 ? "warn" : "bad", key: text >= 4.5 ? "chkTextOk" : text >= 3 ? "chkTextWarn" : "chkTextBad", vars: { r: text.toFixed(1) } });
  const stamp = Math.min(...backs.map((b) => contrast(d.colors.stamp, b)));
  out.push({ level: stamp >= 3 ? "ok" : stamp >= 1.6 ? "warn" : "bad", key: stamp >= 3 ? "chkStampOk" : "chkStampWarn", vars: { r: stamp.toFixed(1) } });

  const meta = (id: string | null) => (id ? assets.find((a) => a.id === id) : undefined);
  const logo = meta(d.logo);
  if (!d.logo) out.push({ level: "info", key: "chkNoLogo" });
  else if (!logo) out.push({ level: "bad", key: "chkMissingImage" });
  else {
    if (Math.min(logo.width, logo.height) < IMAGE_MIN.logo) out.push({ level: "warn", key: "chkLogoSmall", vars: { w: logo.width, h: logo.height } });
    if (Math.abs(logo.width - logo.height) > logo.width * 0.05) out.push({ level: "warn", key: "chkLogoSquare" });
    if (Math.min(logo.width, logo.height) >= IMAGE_MIN.logo && Math.abs(logo.width - logo.height) <= logo.width * 0.05) out.push({ level: "ok", key: "chkLogoOk" });
  }
  const hero = meta(d.hero);
  if (d.hero && !hero) out.push({ level: "bad", key: "chkMissingImage" });
  else if (hero) out.push(hero.width < IMAGE_MIN.hero ? { level: "warn", key: "chkHeroSmall", vars: { w: hero.width } } : { level: "ok", key: "chkHeroOk" });
  if (d.layout === "photo" && !d.hero) out.push({ level: "bad", key: "chkPhotoNeedsImage" });
  const wallet = meta(d.walletHero);
  if (d.walletHero && !wallet) out.push({ level: "bad", key: "chkMissingImage" });
  else if (wallet && wallet.width < IMAGE_MIN.wallet) out.push({ level: "warn", key: "chkWalletSmall", vars: { w: wallet.width } });
  if (d.stamp.icon === "logo" && !d.logo) out.push({ level: "bad", key: "chkStampLogoMissing" });
  if (d.stamp.icon === "image") {
    const img = meta(d.stamp.image);
    if (!img) out.push({ level: "bad", key: "chkStampImageMissing" });
    else if (Math.min(img.width, img.height) < IMAGE_MIN.stamp) out.push({ level: "warn", key: "chkStampImageSmall" });
  }

  // Only the languages the business picked are checked. Other languages are not shown anywhere.
  const langs = d.langs;
  const missing = langs.filter((l) => !d.texts[l].title || !d.texts[l].reward);
  if (missing.length) for (const l of missing) out.push({ level: "bad", key: "chkMissingText", vars: { l } });
  else out.push({ level: "ok", key: "chkAllLangs" });
  if (langs.some((l) => d.texts[l].title.length > WALLET_LIMITS.title || d.texts[l].reward.length > WALLET_LIMITS.reward)) {
    out.push({ level: "warn", key: "chkLongForWallet" });
  }
  // Texts in other languages that are still the Hebrew ones: customers who read that language see Hebrew.
  const HEBREW = /[\u0590-\u05FF]/;
  for (const l of langs.filter((x) => x !== "he")) {
    if (HEBREW.test(d.texts[l].reward) || HEBREW.test(d.texts[l].subtitle) || HEBREW.test(d.texts[l].gift)) out.push({ level: "warn", key: "chkNotTranslated", vars: { l } });
  }
  if (d.layout !== "solid" || d.look.font !== "system") out.push({ level: "info", key: "chkWalletLook" });
  return out;
}

export function textsFor(d: Design, lang: Lang): Texts {
  const l = cardLang(d, lang);
  const pick = (k: keyof Texts) => d.texts[l][k] || d.texts[d.langs[0]][k] || d.texts[d.langs[0]].title;
  // The optional message has no fallback: a language left empty shows nothing rather than another language.
  return { title: pick("title"), subtitle: pick("subtitle"), reward: pick("reward"), gift: pick("gift"), promo: d.texts[l].promo ?? "" };
}

export function assetUrl(id: string | null): string | null {
  return id ? `/api/asset/${id}` : null;
}
