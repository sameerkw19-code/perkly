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

/** What a club member's pass shows. Dates are ready to display. */
export type MemberPass = {
  club: string;
  memberNo: number;
  name: string;
  plan: string | null;
  /** The last valid day as shown, for example 31/12/2026. */
  validUntil: string;
  /** When the pass stops being valid, as an ISO time. Google moves it to expired passes by itself. */
  endsAt: string;
  active: boolean;
  /** The club removed this member. */
  removed: boolean;
};

function phoneLabel(en: string, he: string, ar: string) {
  return { defaultValue: { language: "en-US", value: en }, translatedValues: [{ language: "he", value: he }, { language: "iw", value: he }, { language: "ar", value: ar }] };
}

/** The Google Wallet fields of a member pass. Used when saving and when the club changes something. No barcode: the card is only shown. */
export function memberFields(m: MemberPass) {
  return {
    state: m.removed ? "INACTIVE" : m.active ? "ACTIVE" : "EXPIRED",
    accountId: String(m.memberNo),
    accountName: m.name.slice(0, 80),
    validTimeInterval: { end: { date: m.endsAt } },
    // The shared class shows Perkly's name, so the club's name is always on the pass itself.
    textModulesData: [{ id: "club", header: m.club.slice(0, 60), body: m.name.slice(0, 80) }],
    loyaltyPoints: { label: "Valid until", localizedLabel: phoneLabel("Valid until", "בתוקף עד", "ساري حتى"), balance: { string: m.validUntil } },
    ...(m.plan ? { secondaryLoyaltyPoints: { label: "Plan", localizedLabel: phoneLabel("Plan", "מסלול", "الباقة"), balance: { string: m.plan.slice(0, 40) } } } : {}),
    linksModuleData: { uris: [{ id: "perkly", uri: "https://perkly.shop/clubs", description: "Powered by Perkly" }] },
  };
}
