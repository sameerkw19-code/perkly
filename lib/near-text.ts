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
  return out.replace(/\s{2,}/g, " ").trim().slice(0, NEAR_TEXT_MAX);
}
