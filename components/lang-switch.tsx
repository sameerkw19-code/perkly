"use client";
import { LANGS, LANG_LABEL, type Lang } from "../lib/i18n";

export function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <select className="lang-select" aria-label="Language / שפה / اللغة" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
      {LANGS.map((l) => (
        <option key={l} value={l}>{LANG_LABEL[l]}</option>
      ))}
    </select>
  );
}
