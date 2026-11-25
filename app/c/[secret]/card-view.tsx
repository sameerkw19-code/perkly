"use client";
import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { useLang, translate } from "../../../lib/i18n";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { averageReward, formatMoney, pctLabel } from "../../../lib/cashback.ts";
import { formatAppt } from "../../../lib/appointment";
import { QrImage } from "../../../components/qr";

import { cardLang, noticeText, textsFor, type Design } from "../../../lib/design";
import { CARD_LANG_NAME, CARD_LOCALE, isRtl, type Lang } from "../../../lib/i18n-types";
import { SOCIAL_COLOR, type SocialKey } from "../../../lib/social";
import { SocialIcon } from "../../../lib/social-icon";
import { Brand } from "../../../components/brand";

type Card = { name: string; stamps: number; target: number; scan_code: string; design: Design; rewards: number; nextExpiry: string | null; business: string; links: { key: SocialKey; label: string; url: string }[];
  /** The balance card: balance and minimum in minor units, basis points back. */
  cashback?: { balance: number; bp: number; min: number; currency: "ILS" | "USD" } | null;
  /** The appointments card: the next appointment (ISO), or null. */
  appointment?: { at: string | null; extra?: "none" | "stamps" | "points" | "cashback" } | null;
  /** The "average" card: this round's total and the value of the next reward (minor units). */
  average?: { roundTotal: number; cap?: number; ready: number | null; currency: "ILS" | "USD" } | null };

export default function CardView({ card, secret, googleWallet, appleWallet = false, isIOS, invite = null }: { card: Card | null; secret: string; googleWallet: boolean; appleWallet?: boolean; isIOS: boolean; invite?: { stamps: number; link: string } | null }) {
  // The page's own chrome follows the visitor's site language; the card follows its business's languages.
  const { lang: siteLang, dir: siteDir } = useLang();
  const [picked, setPicked] = useState<Lang | null>(null);
  const lang: Lang = card ? cardLang(card.design, picked ?? siteLang) : "he";
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const dir = card ? (isRtl(lang) ? "rtl" : "ltr") : siteDir;
  const langs = card?.design.langs ?? [];
  // The card keeps working without a connection (public/sw.js keeps the last copy on the phone).
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/c/" }).catch(() => {});
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  // Right after joining (?welcome=1): the business's welcome message, when it turned welcomes on.
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after hydration (the server can't see it)
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
          {offline && <p className="card-offline" role="status">{t("cardOffline")}</p>}
          {welcomeText && <p className="card-welcome" role="status">{welcomeText}</p>}
          <LoyaltyCard
            design={card.design}
            lang={lang}
            stamps={card.stamps}
            target={card.target}
            customerName={card.name}
            rewards={card.rewards}
            balance={card.cashback ? {
              text: formatMoney(card.cashback.balance, card.cashback.currency, lang), pct: pctLabel(card.cashback.bp),
              min: card.cashback.min > 0 ? formatMoney(card.cashback.min, card.cashback.currency, lang) : undefined,
            } : undefined}
            appointment={card.appointment ? { text: card.appointment.at ? formatAppt(card.appointment.at, lang) : null, extra: card.appointment.extra } : undefined}
            average={card.average ? {
              soFar: card.stamps > 0 ? formatMoney(averageReward(card.average.roundTotal, card.stamps, card.average.cap ?? 0), card.average.currency, lang) : undefined,
              ready: card.average.ready != null ? formatMoney(card.average.ready, card.average.currency, lang) : undefined,
            } : undefined}
            t={t}
            qr={<QrImage text={"perkly:" + card.scan_code} size={336} label={t("showQr")} />}
          />
          {!card.cashback && (!card.appointment || card.appointment.extra === "stamps" || card.appointment.extra === "points") && card.rewards > 0 && (
            <div className="ready-banner" role="status">
              {t("earned")}
              {card.rewards > 1 && <> · {t("rewardsAvail", { n: card.rewards })}</>}
              {card.nextExpiry && <small className="ready-expiry">{t("expiresOnShort", { d: new Date(card.nextExpiry).toLocaleDateString(CARD_LOCALE[lang]) })}</small>}
            </div>
          )}
          <div className="qr-note">
            <p>{t("showQr")}</p>
            {!card.appointment && <small className="form-hint">{t("qrNote")}</small>}
          </div>
          {invite && <InviteFriend invite={invite} business={card.business} t={t} />}
          {/* The business's own page (a landing page, a menu, online orders) as a button with its own words. */}
          {card.links.filter((l) => l.key === "link").map((l) => (
            <a key="own-link" className="btn primary wide card-own-link" href={l.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} />{l.label}
            </a>
          ))}
          {card.links.some((l) => l.key !== "link") && (
            <section className="panel social-panel" aria-label={t("socialFollow")}>
              <p><strong>{t("socialFollow")}</strong> · {card.business}</p>
              <div className="social-row">
                {card.links.filter((l) => l.key !== "link").map((l) => (
                  <a key={l.key} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.key === "website" ? t("socialWebsite") : l.label} title={l.key === "website" ? t("socialWebsite") : l.label}>
                    <SocialIcon name={l.key} size={22} color={SOCIAL_COLOR[l.key]} />
                  </a>
                ))}
              </div>
            </section>
          )}
          <button className="btn soft wide" onClick={() => window.location.reload()}><RefreshCw size={16} />{t("refresh")}</button>
          {appleWallet ? (
            <a className="btn wide apple-wallet-btn" href={`/api/wallet/apple/${encodeURIComponent(secret)}`}>
              <Wallet size={16} />{t("walletAddApple")}
            </a>
          ) : googleWallet ? (
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

/** "Bring a friend": the customer's invite link, to share, send on WhatsApp or copy. */
function InviteFriend({ invite, business, t }: { invite: { stamps: number; link: string }; business: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  const [copied, setCopied] = useState(false);
  const message = t("friendMessage", { b: business, n: invite.stamps, link: invite.link });
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ text: message }); return; }
    } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  };
  return (
    <section className="panel invite-panel" aria-labelledby="invite-title">
      <h2 id="invite-title">🎁 {t("friendTitle")}</h2>
      <p>{t("friendText", { n: invite.stamps })}</p>
      <div className="invite-actions">
        <button type="button" className="btn primary" onClick={share}>{t("friendShare")}</button>
        <a className="btn soft" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <button type="button" className="btn soft" onClick={async () => {
          try { await navigator.clipboard.writeText(invite.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
        }}>{copied ? t("friendCopied") : t("friendCopy")}</button>
      </div>
    </section>
  );
}
