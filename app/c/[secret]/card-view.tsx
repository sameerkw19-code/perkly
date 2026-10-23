"use client";
import { RefreshCw, Wallet } from "lucide-react";
import { useLang } from "../../../lib/i18n";
import { LangSwitch } from "../../../components/lang-switch";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { QrImage } from "../../../components/qr";

import type { Design } from "../../../lib/design";

type Card = { name: string; stamps: number; target: number; scan_code: string; design: Design };

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
          <LoyaltyCard design={card.design} lang={lang} stamps={card.stamps} target={card.target} customerName={card.name} t={t} />
          {card.stamps >= card.target && <div className="ready-banner" role="status">{t("earned")}</div>}
          <div className="panel qr-panel">
            <QrImage text={"perkly:" + card.scan_code} size={210} label={t("showQr")} />
            <p>{t("showQr")}</p>
            <small className="form-hint">{t("qrNote")}</small>
          </div>
          <button className="btn soft wide" onClick={() => window.location.reload()}><RefreshCw size={16} />{t("refresh")}</button>
          <p className="wallet-note"><Wallet size={15} />{t("walletHint")}</p>
          <p className="form-hint center">{t("saveLinkHint")}</p>
        </div>
      )}
    </div>
  );
}
