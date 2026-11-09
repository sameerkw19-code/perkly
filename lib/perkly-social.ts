import type { Social } from "./social";

export type SocialLang = "he" | "ar" | "en";

/** Perkly's WhatsApp, the same in every language. */
export const PERKLY_WHATSAPP = "+972526028291";

/**
 * Perkly's own accounts, one set per language (Hebrew, Arabic, English).
 * Shown in the landing-page footer of that language and on its links page:
 *   he → perkly.shop/links · ar → perkly.shop/ar/links · en → perkly.shop/en/links
 * Fill in a value to make it appear; leave it out to hide it.
 *   instagram / tiktok: the username without @
 *   facebook: the page name from facebook.com/<name>, or "profile.php?id=<number>"
 */
export const PERKLY_SOCIAL: Record<SocialLang, Social> = {
  he: {
    whatsapp: PERKLY_WHATSAPP,
    instagram: "perkly.shop",
    // tiktok: "perkly.shop",
    facebook: "profile.php?id=61595994232539",
  },
  ar: {
    whatsapp: PERKLY_WHATSAPP,
    // instagram: "perkly.ar",
    // tiktok: "perkly.ar",
    // facebook: "perkly.ar",
  },
  en: {
    whatsapp: PERKLY_WHATSAPP,
    // instagram: "getperkly",
    // tiktok: "getperkly",
    // facebook: "getperkly",
  },
};

/** Each language's links page (the address for the bio of that language's accounts). */
export const LINKS_PATH: Record<SocialLang, string> = { he: "/links", ar: "/ar/links", en: "/en/links" };

export const PERKLY_WHATSAPP_TEXT: Record<SocialLang, string> = {
  he: "היי, אשמח לשמוע על Perkly",
  ar: "مرحباً، أود أن أعرف المزيد عن Perkly",
  en: "Hi, I'd like to hear about Perkly",
};
