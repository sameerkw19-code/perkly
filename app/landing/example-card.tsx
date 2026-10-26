"use client";
// The real customer card (components/loyalty-card) filled with example businesses, so the marketing
// pages show exactly what customers get.
import { useEffect, useRef } from "react";
import { LoyaltyCard } from "../../components/loyalty-card";
import { darken, defaultLook, onColor, type Design, type PresetIcon } from "../../lib/design";
import { translate } from "../../lib/i18n";
import type { ExampleKey, Lang } from "./content";
import { THEMES } from "./visuals";

const ICON: Record<ExampleKey, PresetIcon> = { cafe: "coffee", barber: "scissors", pizza: "pizza", icecream: "icecream", studio: "sparkle", bakery: "croissant" };
const SUB: Record<Lang, string> = { he: "כרטיס נאמנות", ar: "بطاقة ولاء", en: "Loyalty card" };
const GIFT: Record<Lang, string> = { he: "מתנה", ar: "مجاناً", en: "FREE" };
const CUSTOMER: Record<Lang, string> = { he: "נועה", ar: "نور", en: "Noa" };

export function exampleDesign(k: ExampleKey, lang: Lang, name: string, rewardLine: string): Design {
  const th = THEMES[k];
  // Light cards get a gentle gradient, dark ones a deeper one.
  const light = onColor(th.bg) !== "#FFFFFF";
  const texts = { title: name, subtitle: SUB[lang], reward: rewardLine, gift: GIFT[lang] };
  return {
    v: 1,
    layout: "gradient",
    colors: { bg: th.bg, fg: th.fg, stamp: th.stamp },
    stamp: { icon: ICON[k], image: null },
    logo: null,
    hero: null,
    walletHero: null,
    langs: [lang],
    texts: { he: texts, ar: texts, en: texts, ru: texts, de: texts, fr: texts },
    showCustomerName: true,
    look: { ...defaultLook(th.bg), bg2: light ? darken(th.bg, 0.1) : darken(th.bg, 0.32) },
  };
}

/**
 * `size`: "sm" shrinks the card for the hero scene, "lg" uses the full card width.
 * `pressKey` changes each time a stamp is added in the demo; the newest stamp then pops.
 */
export function ExampleCard({ k, lang, name, rewardLine, target, filled, size = "lg", pressKey, showName = true }: {
  k: ExampleKey; lang: Lang; name: string; rewardLine: string; target: number; filled: number;
  size?: "sm" | "lg"; pressKey?: number; showName?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pressKey || !ref.current) return;
    const stamp = ref.current.querySelectorAll(".pcard-stamp")[filled - 1];
    if (!stamp) return;
    stamp.classList.remove("is-pressed");
    void (stamp as HTMLElement).offsetWidth;
    stamp.classList.add("is-pressed");
  }, [pressKey, filled]);
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return (
    <div ref={ref} className={`lp-pcard lp-pcard-${size}`}>
      <LoyaltyCard design={exampleDesign(k, lang, name, rewardLine)} lang={lang} stamps={filled} target={target} customerName={showName ? CUSTOMER[lang] : null} t={t} />
    </div>
  );
}
