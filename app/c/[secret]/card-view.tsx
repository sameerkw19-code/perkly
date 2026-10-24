"use client";
import { RefreshCw, Wallet } from "lucide-react";
import { useLang } from "../../../lib/i18n";
import { LangSwitch } from "../../../components/lang-switch";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { QrImage } from "../../../components/qr";

import type { Design } from "../../../lib/design";

type Card = { name: string; stamps: number; target: number; scan_code: string; design: Design; rewards: number; nextExpiry: string | null };

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
          <button className="btn soft wide" onClick={() => window.location.reload()}><RefreshCw size={16} />{t("refresh")}</button>
          {googleWallet ? (
            <a className="btn primary wide" href={`/api/wallet/google/${encodeURIComponent(secret)}`} target="_blank" rel="noreferrer">
              <Wallet size={16} />{t("walletAddGoogle")}
            </a>
          ) : (
            <p className="wallet-note"><Wallet size={15} />{isIOS ? t("walletHintIOS") : t("walletHint")}</p>
          )}
          <p className="form-hint center">{t("saveLinkHint")}</p>
        </div>
      )}
    </div>
  );
}
