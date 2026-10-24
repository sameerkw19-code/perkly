"use client";
import { RefreshCw, Wallet } from "lucide-react";
import { useLang } from "../../../lib/i18n";
import { LangSwitch } from "../../../components/lang-switch";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { QrImage } from "../../../components/qr";

import type { Design } from "../../../lib/design";
import { SOCIAL_COLOR, type SocialKey } from "../../../lib/social";
import { SocialIcon } from "../../../lib/social-icon";

type Card = { name: string; stamps: number; target: number; scan_code: string; design: Design; rewards: number; nextExpiry: string | null; business: string; links: { key: SocialKey; label: string; url: string }[] };

export default function CardView({ card }: { card: Card | null }) {
  const { lang, setLang, t, dir } = useLang();
  return (
    <div className="card-page" dir={dir}>
      <div className="auth-top">
        <span className="brand">perkly<span>.</span></span>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>
      {!card ? (
        <div className="auth-card panel"><h1>{t("cardNotFound")}</h1></div>
      ) : (
        <div className="card-stack">
          <LoyaltyCard design={card.design} lang={lang} stamps={card.stamps} target={card.target} customerName={card.name} rewards={card.rewards} t={t} />
          {card.rewards > 0 && (
            <div className="ready-banner" role="status">
              {t("earned")}
              {card.rewards > 1 && <> · {t("rewardsAvail", { n: card.rewards })}</>}
              {card.nextExpiry && <small className="ready-expiry">{t("expiresOnShort", { d: new Date(card.nextExpiry).toLocaleDateString(lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB") })}</small>}
            </div>
          )}
          <div className="panel qr-panel">
            <QrImage text={"perkly:" + card.scan_code} size={210} label={t("showQr")} />
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
          <p className="wallet-note"><Wallet size={15} />{t("walletHint")}</p>
          <p className="form-hint center">{t("saveLinkHint")}</p>
        </div>
      )}
    </div>
  );
}
