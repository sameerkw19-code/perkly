// The card a new business starts with: the example look for its type, with the owner's own texts.
// Built on the server when the business is created; after that only Perkly (a platform admin) changes the design.
import { THEMES } from "../app/landing/visuals";
import type { ExampleKey } from "../app/landing/content";
import { darken, defaultDesign, defaultLook, onColor, type Design, type Lang, type PresetIcon } from "./design";

export type Kind = ExampleKey | "other";
export const KINDS: readonly Kind[] = ["cafe", "barber", "pizza", "icecream", "studio", "bakery", "other"];
export const isKind = (v: unknown): v is Kind => typeof v === "string" && (KINDS as readonly string[]).includes(v);

export const KIND_ICON: Record<Kind, PresetIcon> = { cafe: "coffee", barber: "scissors", pizza: "pizza", icecream: "icecream", studio: "sparkle", bakery: "croissant", other: "star" };
export const OTHER_THEME = { bg: "#2F2A4A", fg: "#FFFFFF", stamp: "#D9F493" };

export function startDesign(kind: Kind, name: string, reward: string, lang: Lang): Design {
  const th = kind === "other" ? OTHER_THEME : THEMES[kind];
  const base = defaultDesign({ name: name || "Perkly", reward: reward || "-", color: th.bg }, lang);
  const light = onColor(th.bg) !== "#FFFFFF";
  return {
    ...base,
    colors: { bg: th.bg, fg: th.fg, stamp: th.stamp },
    stamp: { icon: KIND_ICON[kind], image: null },
    look: { ...defaultLook(th.bg), bg2: light ? darken(th.bg, 0.1) : darken(th.bg, 0.32) },
  };
}
