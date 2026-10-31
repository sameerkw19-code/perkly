"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { useLang, translate } from "../../../lib/i18n";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { QrImage } from "../../../components/qr";

import { cardLang, noticeText, textsFor, type Design } from "../../../lib/design";
import { CARD_LANG_NAME, CARD_LOCALE, isRtl, type Lang } from "../../../lib/i18n-types";
import { SOCIAL_COLOR, type SocialKey } from "../../../lib/social";
import { SocialIcon } from "../../../lib/social-icon";
import { Brand } from "../../../components/brand";

type Card = { name: string; stamps: number; target: number; scan_code: string; design: Design; rewards: number; nextExpiry: string | null; business: string; links: { key: SocialKey; label: string; url: string }[] };

export default function CardView({ card, secret, googleWallet, isIOS }: { card: Card | null; secret: string; googleWallet: boolean; isIOS: boolean }) {
  // The page's own chrome follows the visitor's site language; the card follows its business's languages.
  const { lang: siteLang, dir: siteDir } = useLang();
  const [picked, setPicked] = useState<Lang | null>(null);
  const lang: Lang = card ? cardLang(card.design, picked ?? siteLang) : "he";
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const dir = card ? (isRtl(lang) ? "rtl" : "ltr") : siteDir;
  const langs = card?.design.langs ?? [];
  // Right after joining (?welcome=1): the business's welcome message, when it turned welcomes on.
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") !== "1") return;
    setWelcome(true);
    url.searchParams.delete("welcome");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  const welcomeText = card && welcome && card.design.walletWelcome
    ? (() => {
        const tx = textsFor(card.design, lang);
        return noticeText({ ...tx, title: tx.title || card.business }, lang, { kind: "welcome", name: card.name });
      })()
    : "";
  return (
    <div className="card-page" dir={dir} lang={lang}>
      <header className="auth-top">
        <Brand />
        {langs.length > 1 ? (
          <div className="seg card-langs" role="group" aria-label="Language">
            {langs.map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setPicked(l)}>{CARD_LANG_NAME[l]}</button>
            ))}
          </div>
        ) : null}
      </header>
      <main id="main" className="page-main">
        {card && <h1 className="sr-only">{card.business}</h1>}
      {!card ? (
        <div className="auth-card panel"><h1>{t("cardNotFound")}</h1></div>
      ) : (
        <div className="card-stack">
          {welcomeText && <p className="card-welcome" role="status">{welcomeText}</p>}
          <LoyaltyCard
            design={card.design}
            lang={lang}
            stamps={card.stamps}
            target={card.target}
            customerName={card.name}
            rewards={card.rewards}
            t={t}
            qr={<QrImage text={"perkly:" + card.scan_code} size={336} label={t("showQr")} />}
          />
          {card.rewards > 0 && (
            <div className="ready-banner" role="status">
              {t("earned")}
              {card.rewards > 1 && <> · {t("rewardsAvail", { n: card.rewards })}</>}
              {card.nextExpiry && <small className="ready-expiry">{t("expiresOnShort", { d: new Date(card.nextExpiry).toLocaleDateString(CARD_LOCALE[lang]) })}</small>}
            </div>
          )}
          <div className="qr-note">
            <p>{t("showQr")}</p>
            <small className="form-hint">{t("qrNote")}</small>
          </div>
          {card.links.length > 0 && (
            <section className="panel social-panel" aria-label={t("socialFollow")}>
              <p><strong>{t("socialFollow")}</strong> · {card.business}</p>
              <div className="social-row">
                {card.links.map((l) => (
                  <a key={l.key} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.key === "website" ? t("socialWebsite") : l.label} title={l.key === "website" ? t("socialWebsite") : l.label}>
                    <SocialIcon name={l.key} size={22} color={SOCIAL_COLOR[l.key]} />
                  </a>
                ))}
              </div>
            </section>
          )}
          <button className="btn soft wide" onClick={() => window.location.reload()}><RefreshCw size={16} />{t("refresh")}</button>
          {googleWallet ? (
            <a className="btn primary wide" href={`/api/wallet/google/${encodeURIComponent(secret)}`} target="_blank" rel="noreferrer">
              <Wallet size={16} />{t("walletAddGoogle")}
            </a>
          ) : (
            <p className="wallet-note"><Wallet size={15} />{isIOS ? t("walletHintIOS") : t("walletHint")}</p>
          )}
          <p className="form-hint center">{t("saveLinkHint")}</p>
          <p className="form-hint center legal-links"><a href="/privacy">{t("privacyLink")}</a></p>
        </div>
      )}
      </main>
    </div>
  );
}
