/* eslint-disable @next/next/no-html-link-for-pages -- plain links on purpose: client-side navigation breaks on this server */
// Shared frame for the legal pages (terms, privacy, accessibility).
import "../landing/landing.css";
import { waLink, WHATSAPP_DISPLAY } from "../landing/content";
import { OPERATOR, OPERATOR_LINE, OPERATOR_LINE_EN } from "./operator";
import SiteAnalytics from "../../components/site-analytics";

/** `lang`: Hebrew in Israel, English abroad (the English pages are a translation; see each page). */
export default function LegalPage({ title, updated, children, lang = "he" }: { title: string; updated: string; children: React.ReactNode; lang?: "he" | "en" }) {
  const en = lang === "en";
  return (
    <div className="lp lg" lang={lang} dir={en ? "ltr" : "rtl"}>
      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <a href="/" className="lp-home-link lg-home">Perkly</a>
          <a href="/" className="lp-login">{en ? "Back to home" : "חזרה לדף הבית"}</a>
        </div>
      </header>
      <main className="lp-main lp-wrap lg-main">
        <h1 className="lp-h2">{title}</h1>
        <p className="lp-muted lg-updated">{en ? "Last updated" : "עדכון אחרון"}: {updated}</p>
        <div className="lg-body">{children}</div>
        <p className="lg-contact">
          {en ? "Questions" : "לשאלות"}: <a href={`mailto:${OPERATOR.email}`} dir="ltr">{OPERATOR.email}</a> {en ? "or" : "או"} <a href={waLink(en ? "Hi, I have a question about the documents on the Perkly site" : "היי, יש לי שאלה לגבי המסמכים באתר Perkly")} target="_blank" rel="noopener noreferrer">{en ? "WhatsApp" : "וואטסאפ"} <bdi className="lp-num">{WHATSAPP_DISPLAY}</bdi></a>
        </p>
        <p className="lp-muted lg-updated">{en ? `Perkly is operated by ${OPERATOR_LINE_EN}.` : `Perkly מופעלת על ידי ${OPERATOR_LINE}.`}</p>
      </main>
      <SiteAnalytics />
    </div>
  );
}
