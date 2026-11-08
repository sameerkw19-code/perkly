"use client";
import { LANGS, LANG_LABEL, type SiteLang } from "../lib/i18n";
import { useRegion } from "./region-context";

export function LangSwitch({ lang, setLang }: { lang: SiteLang; setLang: (l: SiteLang) => void }) {
  // Abroad the site is English only: nothing to switch.
  if (useRegion().intl) return null;
  return (
    <select className="lang-select" aria-label="Language / שפה / اللغة" value={lang} onChange={(e) => setLang(e.target.value as SiteLang)}>
      {LANGS.map((l) => (
        <option key={l} value={l}>{LANG_LABEL[l]}</option>
      ))}
    </select>
  );
}
