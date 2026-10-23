// Card design: shared by the editor (browser) and the server (validation before save/publish).
// A design only changes how a card looks. It never touches stamps, targets or eligibility.

import type { Lang } from "./i18n-types";

export const STAMP_ICONS = [
  "coffee", "pizza", "burger", "icecream", "mojito", "beer", "shot", "cocktail", "sandwich",
  "croissant", "cake", "utensils", "scissors", "bag", "sparkle", "heart", "star",
] as const;
export type PresetIcon = (typeof STAMP_ICONS)[number];
export type StampIcon = PresetIcon | "logo" | "image";
export type Layout = "gradient" | "solid" | "photo";
export type Texts = { title: string; subtitle: string; reward: string; gift: string };

export type Design = {
  v: 1;
  layout: Layout;
  colors: { bg: string; fg: string; stamp: string };
  stamp: { icon: StampIcon; image: string | null };
  logo: string | null;
  hero: string | null;
  texts: Record<Lang, Texts>;
  showCustomerName: boolean;
};

export const LIMITS = { title: 40, subtitle: 40, reward: 80, gift: 14 };
export const WALLET_LIMITS = { title: 24, reward: 36 };
export const IMAGE_MIN = { logo: 660, hero: 1032, stamp: 120 };

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

const HEX = /^#[0-9a-fA-F]{6}$/;
const ASSET_ID = /^[0-9a-f-]{36}$/;

export function defaultDesign(b: { name: string; reward: string; color: string }): Design {
  const gift = { he: "מתנה", ar: "مجاناً", en: "FREE" };
  const sub = { he: "כרטיס נאמנות", ar: "بطاقة ولاء", en: "Loyalty card" };
  const t = (l: Lang): Texts => ({ title: b.name.slice(0, LIMITS.title), subtitle: sub[l], reward: b.reward.slice(0, LIMITS.reward), gift: gift[l] });
  return {
    v: 1,
    layout: "gradient",
    colors: { bg: HEX.test(b.color) ? b.color : "#1E1B2E", fg: "#FFFFFF", stamp: "#D9F493" },
    stamp: { icon: "coffee", image: null },
    logo: null,
    hero: null,
    texts: { he: t("he"), ar: t("ar"), en: t("en") },
    showCustomerName: true,
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
  for (const l of ["he", "ar", "en"] as Lang[]) {
    const t = d.texts?.[l] ?? {};
    texts[l] = {
      title: cleanText(t.title, LIMITS.title),
      subtitle: cleanText(t.subtitle, LIMITS.subtitle),
      reward: cleanText(t.reward, LIMITS.reward),
      gift: cleanText(t.gift, LIMITS.gift),
    };
  }
  return {
    v: 1,
    layout: ["gradient", "solid", "photo"].includes(d.layout) ? d.layout : "gradient",
    colors: { bg: colors.bg.toUpperCase(), fg: colors.fg.toUpperCase(), stamp: colors.stamp.toUpperCase() },
    stamp: { icon, image: asset(d.stamp?.image) },
    logo: asset(d.logo),
    hero: asset(d.hero),
    texts,
    showCustomerName: d.showCustomerName !== false,
  };
}

export function assetIds(d: Design): string[] {
  return [d.logo, d.hero, d.stamp.image].filter((x): x is string => !!x);
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
  const text = contrast(d.colors.fg, d.colors.bg);
  out.push({ level: text >= 4.5 ? "ok" : text >= 3 ? "warn" : "bad", key: text >= 4.5 ? "chkTextOk" : text >= 3 ? "chkTextWarn" : "chkTextBad", vars: { r: text.toFixed(1) } });
  const stamp = contrast(d.colors.stamp, d.colors.bg);
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
  if (d.stamp.icon === "logo" && !d.logo) out.push({ level: "bad", key: "chkStampLogoMissing" });
  if (d.stamp.icon === "image") {
    const img = meta(d.stamp.image);
    if (!img) out.push({ level: "bad", key: "chkStampImageMissing" });
    else if (Math.min(img.width, img.height) < IMAGE_MIN.stamp) out.push({ level: "warn", key: "chkStampImageSmall" });
  }

  const langs: Lang[] = ["he", "ar", "en"];
  const missing = langs.filter((l) => !d.texts[l].title || !d.texts[l].reward);
  if (missing.length) for (const l of missing) out.push({ level: "bad", key: "chkMissingText", vars: { l } });
  else out.push({ level: "ok", key: "chkAllLangs" });
  if (langs.some((l) => d.texts[l].title.length > WALLET_LIMITS.title || d.texts[l].reward.length > WALLET_LIMITS.reward)) {
    out.push({ level: "warn", key: "chkLongForWallet" });
  }
  return out;
}

export function textsFor(d: Design, lang: Lang): Texts {
  const pick = (k: keyof Texts) => d.texts[lang][k] || d.texts.he[k] || d.texts.en[k] || d.texts.ar[k];
  return { title: pick("title"), subtitle: pick("subtitle"), reward: pick("reward"), gift: pick("gift") };
}

export function assetUrl(id: string | null): string | null {
  return id ? `/api/asset/${id}` : null;
}
