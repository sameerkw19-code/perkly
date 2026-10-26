// Per-business parts of a Google Wallet pass. Kept free of imports so tests can load it directly.

/**
 * What each business shows on its pass. Logo and background color come from the shared class,
 * so per business we add: its name and reward, its background image as the banner, and "Powered by Perkly".
 */
export type PassLook = {
  title: string;
  reward: string;
  heroUrl: string | null;
  /** Google language tag of the first card language, and the same texts in the other languages the business picked. */
  language?: string;
  translations?: { language: string; title: string; reward: string }[];
};

export function lookFields(look: PassLook) {
  const tr = look.translations ?? [];
  const lang = look.language ?? "en-US";
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
    textModulesData: [{ id: "business", header: look.title, body: look.reward, ...localized }],
    linksModuleData: { uris: [{ id: "perkly", uri: "https://perkly.shop", description: "Powered by Perkly" }] },
  };
}
