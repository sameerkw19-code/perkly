// The business's own line on the iPhone lock screen near a branch, with the customer's numbers filled in.
// Tags, in English or in the dashboard's language: {missing}/{חסר}/{باقي} = stamps (or purchases) left to the reward,
// {reward}/{הטבה}/{الهدية}, {business}/{עסק}/{المصلحة}, {balance}/{יתרה}/{الرصيد} (balance cards).

export const NEAR_TEXT_MAX = 120;

export type NearTag = "missing" | "reward" | "business" | "balance";

/** The tag as the owner sees and types it, by dashboard language (he, ar, en). */
export const NEAR_TAG_NAMES: Record<NearTag, [string, string, string]> = {
  missing: ["חסר", "باقي", "missing"],
  reward: ["הטבה", "الهدية", "reward"],
  business: ["עסק", "المصلحة", "business"],
  balance: ["יתרה", "الرصيد", "balance"],
};

export function fillNearText(template: string, v: { missing?: number | null; reward: string; business: string; balance?: string | null }): string {
  const value: Record<NearTag, string> = { missing: v.missing != null ? String(v.missing) : "", reward: v.reward, business: v.business, balance: v.balance ?? "" };
  let out = template;
  for (const tag of Object.keys(NEAR_TAG_NAMES) as NearTag[]) {
    for (const name of NEAR_TAG_NAMES[tag]) out = out.split(`{${name}}`).join(value[tag]);
  }
  // Cut between whole characters, so an emoji at the end is never split in half.
  return [...out.replace(/\s{2,}/g, " ").trim()].slice(0, NEAR_TEXT_MAX).join("");
}

/** The emoji for the business's stamp, for the automatic line (the stamp the card shows; ⭐ when unknown). */
const STAMP_EMOJI: Record<string, string> = {
  coffee: "☕", bean: "☕", coffeebean: "☕", tea: "🍵", beer: "🍺", cocktail: "🍸", mojito: "🍹", tropical: "🍹", shot: "🥃",
  bubbletea: "🧋", cup: "🥤", wine: "🍷", pizza: "🍕", burger: "🍔", sandwich: "🥪", taco: "🌮", fries: "🍟", sushi: "🍣",
  hotdog: "🌭", plate: "🍽️", utensils: "🍽️", falafel: "🧆", croissant: "🥐", cake: "🍰", shortcake: "🍰", donut: "🍩",
  icecream: "🍦", cookie: "🍪", cupcake: "🧁", bagel: "🥯", scissors: "✂️", barber: "💈", nails: "💅", lipstick: "💄",
  sparkle: "✨", sparkles: "✨", bouquet: "💐", bag: "🛍️", bags: "🛍️", gift: "🎁", star: "⭐", glowstar: "🌟",
  heart: "❤️", crown: "👑", gem: "💎", paws: "🐾",
};

export function stampEmoji(icon: string | null | undefined): string {
  const name = (icon ?? "").replace(/^3d-/, "");
  return STAMP_EMOJI[name] ?? "⭐";
}

export type NearPhase = "morning" | "evening";

/** Morning from `morningFrom` until `eveningFrom`, evening the rest of the day (hours 0–23, Israel time). */
export function nearPhase(hour: number, morningFrom = 6, eveningFrom = 16): NearPhase {
  return hour >= morningFrom && hour < eveningFrom ? "morning" : "evening";
}

/** The owner's line for this hour: the evening line in the evening when there is one, else the main line (empty = automatic). */
export function nearTemplate(
  b: { near_text?: string | null; near_text_evening?: string | null; near_morning_from?: number | null; near_evening_from?: number | null },
  hour: number,
): string {
  const evening = b.near_text_evening?.trim();
  if (evening && nearPhase(hour, b.near_morning_from ?? 6, b.near_evening_from ?? 16) === "evening") return evening;
  return b.near_text?.trim() ?? "";
}
