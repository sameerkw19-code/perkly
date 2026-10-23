// Small pieces of the landing page that hold business details.

/** WhatsApp for visitors who need a sign-up code. */
const WHATSAPP_INTL = "972526028291";
const WHATSAPP_DISPLAY = "052-602-8291";

export function WhatsAppLine({ style }: { style?: React.CSSProperties }) {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_INTL}?text=${encodeURIComponent("היי, אשמח לקוד הצטרפות ל־Perkly")}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...style, color: "#FFFFFF", textDecoration: "underline", textUnderlineOffset: 3, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      צריכים קוד הצטרפות? כתבו לנו בוואטסאפ: <span dir="ltr" style={{ marginInlineStart: 6 }}>{WHATSAPP_DISPLAY}</span>
    </a>
  );
}

type Quote = { text: string; name: string; business: string; city: string };

/** Real quotes from pilot businesses. The section stays hidden while this list is empty. */
const QUOTES: Quote[] = [];

const AVATAR = ["#EEE9FF", "#FFF1D1", "#DDF4EC"];

export function Testimonials() {
  if (QUOTES.length === 0) return null;
  return (
    <section aria-labelledby="proof-title" style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(64px, 8vw, 104px) clamp(16px, 4vw, 32px)", display: "flex", flexDirection: "column", gap: 36 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "center", alignItems: "center" }}>
        <span style={{ color: "#5B3FD6", fontWeight: 700, fontSize: 15 }}>מהשטח</span>
        <h2 id="proof-title" style={{ margin: 0, fontFamily: "'Rubik', sans-serif", fontWeight: 800, fontSize: "clamp(30px, 4vw, 46px)", lineHeight: 1.15 }}>מה אומרים בעלי העסקים</h2>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        {QUOTES.map((q, i) => (
          <figure key={i} style={{ margin: 0, flex: "1 1 300px", background: "#FFFFFF", border: "1px solid #E8E3F7", borderRadius: 22, padding: 26, display: "flex", flexDirection: "column", gap: 18 }}>
            <blockquote style={{ margin: 0, fontSize: 18, lineHeight: 1.55 }}>&ldquo;{q.text}&rdquo;</blockquote>
            <figcaption style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: AVATAR[i % AVATAR.length], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#4A2FC4" }}>{q.name.slice(0, 1)}</span>
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                <span style={{ fontWeight: 700 }}>{q.name}</span>
                <span style={{ fontSize: 14, color: "#5E5873" }}>{q.business}, {q.city}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
