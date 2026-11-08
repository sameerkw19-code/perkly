"use client";

import { useEffect, useState } from "react";
import { QrImage } from "../../components/qr";
import { assetUrl, cardLang, isRtl, textsFor, type Design } from "../../lib/design";
import { translate, useLang } from "../../lib/i18n";

// The page around the sign follows the site language; the sign itself follows the card.
const UI = {
  he: { failed: "לא הצלחנו לטעון את העסק.", loading: "טוען…", ownersOnly: "השלט זמין לבעלי העסק בלבד.", noCode: "קוד ההצטרפות לא פעיל כרגע.", back: "← חזרה ללוח הבקרה", backShort: "חזרה ללוח הבקרה", size: "גודל", a4: "שלט A4", sticker: "מדבקה 10×10 ס״מ", print: "הדפסה" },
  en: { failed: "We couldn't load the business.", loading: "Loading…", ownersOnly: "The sign is for business owners only.", noCode: "The join code is not active right now.", back: "← Back to dashboard", backShort: "Back to dashboard", size: "Size", a4: "A4 sign", sticker: "10×10 cm sticker", print: "Print" },
};

type Data = { business: { id: string; name: string; target: number; join_code: string | null } | null; role: string | null; design?: Design };
type Size = "a4" | "sticker";

/** A sign to print and put by the till: scan the QR to join the card. In the card's first language and colors. */
export default function PosterView() {
  const [data, setData] = useState<Data | null>(null);
  const [size, setSize] = useState<Size>("a4");
  const [failed, setFailed] = useState(false);
  const { lang: siteLang } = useLang();
  const ui = UI[siteLang === "en" ? "en" : "he"];

  useEffect(() => {
    const b = new URLSearchParams(window.location.search).get("b") ?? "";
    fetch(`/api/loyalty?business=${encodeURIComponent(b)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : Promise.reject(new Error("load"))))
      .then((d: Data) => setData(d))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <main className="poster-msg">{ui.failed} <a href="/">{ui.backShort}</a></main>;
  if (!data) return <main className="poster-msg">{ui.loading}</main>;
  const b = data.business;
  if (!b || data.role !== "owner" || !data.design) return <main className="poster-msg">{ui.ownersOnly} <a href="/">{ui.backShort}</a></main>;
  if (!b.join_code) return <main className="poster-msg">{ui.noCode} <a href="/">{ui.backShort}</a></main>;

  const d = data.design;
  const lang = cardLang(d);
  const text = textsFor(d, lang);
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const url = `${window.location.origin}/join/${b.join_code}`;
  const logo = d.logo ? assetUrl(d.logo) : null;
  const colors = { background: d.colors.bg, color: d.colors.fg };

  return (
    <div className="poster-page">
      <div className="poster-tools no-print" dir={siteLang === "en" ? "ltr" : "rtl"}>
        <a href="/">{ui.back}</a>
        <div className="seg" role="group" aria-label={ui.size}>
          <button type="button" aria-pressed={size === "a4"} onClick={() => setSize("a4")}>{ui.a4}</button>
          <button type="button" aria-pressed={size === "sticker"} onClick={() => setSize("sticker")}>{ui.sticker}</button>
        </div>
        <button type="button" className="btn primary" onClick={() => window.print()}>{ui.print}</button>
      </div>

      {size === "a4" ? (
        <article className="poster a4" style={colors} dir={isRtl(lang) ? "rtl" : "ltr"} lang={lang}>
          {logo ? <img className="poster-logo" src={logo} alt={text.title} /> : <h1 className="poster-name">{text.title}</h1>}
          <h2 className="poster-head">{t("posterHead")}</h2>
          <p className="poster-sub">{t("posterSub", { n: b.target, reward: text.reward })}</p>
          <div className="poster-qr"><QrImage text={url} size={720} label={t("posterScan")} /></div>
          <ol className="poster-steps">
            <li>{t("posterStep1")}</li>
            <li>{t("posterStep2")}</li>
            <li>{t("posterStep3")}</li>
          </ol>
          <p className="poster-note">{t("posterNoApp")}</p>
          <p className="poster-by">Powered by Perkly</p>
        </article>
      ) : (
        <article className="poster sticker" style={colors} dir={isRtl(lang) ? "rtl" : "ltr"} lang={lang}>
          {logo ? <img className="poster-logo" src={logo} alt={text.title} /> : <h1 className="poster-name">{text.title}</h1>}
          <div className="poster-qr"><QrImage text={url} size={480} label={t("posterScan")} /></div>
          <p className="poster-scan">{t("posterScan")}</p>
        </article>
      )}
    </div>
  );
}
