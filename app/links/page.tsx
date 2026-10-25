/* eslint-disable @next/next/no-html-link-for-pages -- plain links keep this page a static, script-free list (like the landing page). */
import { PERKLY_SOCIAL, PERKLY_WHATSAPP_TEXT } from "../../lib/perkly-social";
import { SOCIAL_COLOR, socialLinks } from "../../lib/social";
import { SocialIcon } from "../../lib/social-icon";

export const metadata = {
  title: "Perkly | קישורים",
  description: "כרטיסיית מועדון דיגיטלית לעסקים. פותחים כרטיס, מחתימים בסריקה, הלקוחות חוזרים.",
  openGraph: { title: "Perkly", description: "כרטיס קטן. קשר גדול.", url: "https://perkly.shop/links" },
};

// Link-in-bio page for Instagram / TikTok. Social accounts come from lib/perkly-social.ts.

const LABEL: Record<string, string> = {
  instagram: "אינסטגרם",
  tiktok: "טיקטוק",
  facebook: "פייסבוק",
  whatsapp: "דברו איתנו בוואטסאפ",
  website: "האתר",
  waze: "ניווט",
};

const page: React.CSSProperties = {
  minHeight: "100dvh", background: "radial-gradient(120% 60% at 50% 0%, #EEE9FF 0%, #FAF8FF 60%)", color: "#17132B",
  fontFamily: "'Heebo', system-ui, sans-serif", display: "flex", justifyContent: "center", padding: "48px 16px 32px", boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14, minHeight: 60, padding: "0 18px", borderRadius: 18, textDecoration: "none",
  fontWeight: 700, fontSize: 17, boxSizing: "border-box", width: "100%",
};
const light: React.CSSProperties = { ...btn, background: "#FFFFFF", color: "#17132B", border: "1px solid #E8E3F7", boxShadow: "0 1px 2px rgba(23,19,43,0.04)" };
const iconBox: React.CSSProperties = { width: 36, height: 36, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" };

function Arrow() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginInlineStart: "auto", opacity: 0.45 }}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export default function LinksPage() {
  const social = socialLinks(PERKLY_SOCIAL, PERKLY_WHATSAPP_TEXT);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800&family=Heebo:wght@400;500;700&display=swap" precedence="default" />
      <style href="perkly-links" precedence="default">{".pl-btn{transition:transform .15s ease, box-shadow .15s ease}.pl-btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(23,19,43,.10)}.pl-btn:focus-visible{outline:3px solid #7558E8;outline-offset:3px}@media (prefers-reduced-motion: reduce){.pl-btn{transition:none}.pl-btn:hover{transform:none}}"}</style>
      <main dir="rtl" style={{ ...page, maxWidth: "none", margin: 0 }}>
        <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <header style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <span style={{ width: 84, height: 84, borderRadius: 26, background: "#7558E8", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 14px 30px rgba(117,88,232,0.35)" }}>
              <svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
              </svg>
            </span>
            <h1 style={{ margin: 0, fontFamily: "'Rubik', sans-serif", fontWeight: 800, fontSize: 34, letterSpacing: "-0.5px", lineHeight: 1.1 }}>Perkly</h1>
            <p style={{ margin: 0, fontSize: 17, color: "#3D3657", lineHeight: 1.5 }}>
              כרטיסיית מועדון דיגיטלית לעסקים קטנים.<br />מחתימים בסריקה, והלקוחות חוזרים.
            </p>
          </header>

          <nav aria-label="קישורים" style={{ width: "100%", height: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <a className="pl-btn" href="/start" style={{ ...btn, background: "#17132B", color: "#FFFFFF", justifyContent: "center", fontSize: 18 }}>
              פתחו כרטיס לעסק שלכם
            </a>
            <a className="pl-btn" href="/#how" style={light}>
              <span style={{ ...iconBox, background: "#EEE9FF", color: "#5B3FD6" }}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.8-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" /></svg>
              </span>
              איך זה עובד
              <Arrow />
            </a>
            <a className="pl-btn" href="/#pricing" style={light}>
              <span style={{ ...iconBox, background: "#FFF1D1", color: "#9A6400", fontWeight: 800, fontSize: 17 }}>₪</span>
              מחיר
              <Arrow />
            </a>
            {social.map((l) => (
              <a key={l.key} className="pl-btn" href={l.url} target="_blank" rel="noopener noreferrer" style={light}>
                <span style={{ ...iconBox, background: "#F4F2FA" }}><SocialIcon name={l.key} size={20} color={SOCIAL_COLOR[l.key]} /></span>
                {LABEL[l.key] ?? l.label}
                <Arrow />
              </a>
            ))}
          </nav>

          <footer style={{ fontSize: 14, color: "#5E5873", display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, alignItems: "center", margin: 0 }}>
            <a href="/" style={{ color: "#5E5873" }}>perkly.shop</a>
            <span aria-hidden="true">·</span>
            <span>כרטיס קטן. קשר גדול.</span>
          </footer>
        </div>
      </main>
    </>
  );
}
