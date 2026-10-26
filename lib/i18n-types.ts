/** Languages of the Perkly site, menus and owner dashboard. */
export type SiteLang = "he" | "ar" | "en";

// Card languages live in design.ts (the shared card model, loaded by tests without a bundler).
export { CARD_LANGS, CARD_LANG_NAME, CARD_LOCALE, isRtl, type Lang } from "./design";
