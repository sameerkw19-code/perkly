// Per-business parts of a Google Wallet pass. Kept free of imports so tests can load it directly.

/**
 * What each business shows on its pass. Logo and background color come from the shared class,
 * so per business we add: its name and reward, its background image as the banner, and "Powered by Perkly".
 */
export type PassLook = {
  title: string;
  reward: string;
  /** Optional message shown as a second text block on the pass (card language only). */
  promo?: string;
  heroUrl: string | null;
  /** Google language tag of the first card language, and the same texts in the other languages the business picked. */
  language?: string;
  translations?: { language: string; title: string; reward: string; promo?: string }[];
  /** The business's own class look, when its logo can be used (see passLook). */
  classLook?: ClassLook | null;
};

export function lookFields(look: PassLook) {
  const tr = look.translations ?? [];
  const lang = look.language ?? "en-US";
  // The optional message in the other languages the business wrote it in (an empty one is skipped).
  const trPromo = tr.filter((x) => x.promo);
  const promoLocalized = trPromo.length
    ? { localizedBody: { defaultValue: { language: lang, value: look.promo ?? "" }, translatedValues: trPromo.map((x) => ({ language: x.language, value: x.promo! })) } }
    : {};
  // Phones in another language show the business's text in that language; others show the first one.
  const localized = tr.length
    ? {
        localizedHeader: { defaultValue: { language: lang, value: look.title }, translatedValues: tr.map((x) => ({ language: x.language, value: x.title })) },
        localizedBody: { defaultValue: { language: lang, value: look.reward }, translatedValues: tr.map((x) => ({ language: x.language, value: x.reward })) },
      }
    : {};
  return {
    ...(look.heroUrl
      ? { heroImage: { sourceUri: { uri: look.heroUrl }, contentDescription: { defaultValue: { language: "en-US", value: look.title } } } }
      : {}),
    textModulesData: [
      { id: "business", header: look.title, body: look.reward, ...localized },
      ...(look.promo ? [{ id: "promo", body: look.promo, ...promoLocalized }] : []),
    ],
    linksModuleData: { uris: [{ id: "perkly", uri: "https://perkly.shop", description: "Powered by Perkly" }] },
  };
}

/** What a business's own Google Wallet class shows: name, background color and logo. */
export type ClassLook = { name: string; color: string; logoUrl: string };

/**
 * The body of a business's own loyalty class. Google approves it on its own when reviewStatus is underReview.
 * programLogo is required by Google, so a business without a PNG or JPEG logo gets no class (see google-wallet.ts).
 */
export function classBody(id: string, look: ClassLook) {
  return {
    id,
    issuerName: "Perkly",
    programName: look.name.slice(0, 60),
    hexBackgroundColor: /^#[0-9a-fA-F]{6}$/.test(look.color) ? look.color.toUpperCase() : "#1E1B2E",
    programLogo: {
      sourceUri: { uri: look.logoUrl },
      contentDescription: { defaultValue: { language: "en-US", value: look.name.slice(0, 60) } },
    },
    reviewStatus: "underReview",
  };
}
