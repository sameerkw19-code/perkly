// Per-business parts of a Google Wallet pass. Kept free of imports so tests can load it directly.

/**
 * What each business shows on its pass. Logo and background color come from the shared class,
 * so per business we add: its name and reward, its background image as the banner, and "Powered by Perkly".
 */
export type PassLook = { title: string; reward: string; heroUrl: string | null };

export function lookFields(look: PassLook) {
  return {
    ...(look.heroUrl
      ? { heroImage: { sourceUri: { uri: look.heroUrl }, contentDescription: { defaultValue: { language: "en-US", value: look.title } } } }
      : {}),
    textModulesData: [{ id: "business", header: look.title, body: look.reward }],
    linksModuleData: { uris: [{ id: "perkly", uri: "https://perkly.shop", description: "Powered by Perkly" }] },
  };
}
