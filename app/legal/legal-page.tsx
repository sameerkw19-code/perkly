/* eslint-disable @next/next/no-html-link-for-pages -- plain links on purpose: client-side navigation breaks on this server */
// Shared frame for the legal pages. These are DRAFTS until a lawyer reviews them.
import "../landing/landing.css";
import { waLink, WHATSAPP_DISPLAY } from "../landing/content";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="lp lg" lang="he" dir="rtl">
      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <a href="/" className="lp-home-link lg-home">Perkly</a>
          <a href="/" className="lp-login">חזרה לדף הבית</a>
        </div>
      </header>
      <main className="lp-main lp-wrap lg-main">
        <p className="lg-draft" role="note">
          <strong>טיוטה לבדיקה.</strong> המסמך עדיין לא נבדק על ידי עורך דין ואינו מאושר משפטית. פרטים בסוגריים מרובעים ממתינים להשלמה.
        </p>
        <h1 className="lp-h2">{title}</h1>
        <p className="lp-muted lg-updated">עדכון אחרון: {updated}</p>
        <div className="lg-body">{children}</div>
        <p className="lg-contact">
          לשאלות: <a href={waLink("היי, יש לי שאלה לגבי המסמכים באתר Perkly")} target="_blank" rel="noopener noreferrer">וואטסאפ <bdi className="lp-num">{WHATSAPP_DISPLAY}</bdi></a>
        </p>
      </main>
    </div>
  );
}
