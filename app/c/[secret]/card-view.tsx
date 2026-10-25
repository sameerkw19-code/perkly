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

export default function CardView({ card, secret, googleWallet, isIOS }: { card: Card | null; secret: string; googleWallet: boolean; isIOS: boolean }) {
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
              {card.nextExpiry && <small className="ready-expiry">{t("expiresOnShort", { d: new Date(card.nextExpiry).toLocaleDateString(lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB") })}</small>}
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
    </div>
  );
}
