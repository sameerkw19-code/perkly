"use client";
import { useCallback, useState } from "react";

/** Muted, looping video that starts playing on its own (sets `muted` as a property, which autoplay needs). */
export function AutoVideo(props: React.VideoHTMLAttributes<HTMLVideoElement>) {
  const ref = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    el.muted = true;
    el.playsInline = true;
    el.play().catch(() => {});
  }, []);
  return <video {...props} ref={ref} muted autoPlay loop playsInline />;
}

const CUP = "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1";
const TARGET = 10;

function CafeLogo({ size }: { size: number }) {
  return (
    <svg role="img" aria-label="הלוגו של קפה אייקון" width={size} height={size} viewBox="0 0 48 48" style={{ flex: "none" }}>
      <rect width="48" height="48" rx="14" fill="#F3EEFF" />
      <circle cx="24" cy="25" r="17" fill="#8F72E8" />
      <path d="M15 23h16v5.5a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z" fill="#FFFFFF" />
      <path d="M31 25h1.6a3 3 0 0 1 0 6H31" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13 38h20" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M23 21c0-3.5 2.5-5.5 2.5-11" fill="none" stroke="#3E2A8C" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="26.6" cy="10.6" rx="1.7" ry="1.2" fill="#FFD6F3" transform="rotate(-30 26.6 10.6)" />
      <ellipse cx="24.2" cy="12.4" rx="1.7" ry="1.2" fill="#FFD6F3" transform="rotate(30 24.2 12.4)" />
      <ellipse cx="26.2" cy="14.6" rx="1.7" ry="1.2" fill="#FFD6F3" transform="rotate(-30 26.2 14.6)" />
      <ellipse cx="23.6" cy="16.6" rx="1.7" ry="1.2" fill="#FFD6F3" transform="rotate(30 23.6 16.6)" />
    </svg>
  );
}

const btn: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  border: 0,
  borderRadius: 14,
  background: "#17132B",
  color: "#FFFFFF",
  fontFamily: "'Heebo', sans-serif",
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

/** Hero phone with a tappable stamp demo. */
export function DemoPhone() {
  const [count, setCount] = useState(7);
  const [toast, setToast] = useState(false);
  const full = count >= TARGET;
  const remaining = TARGET - count;

  return (
    <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, position: "relative", padding: "10px 0" }}>
      <div aria-hidden="true" style={{ position: "absolute", width: 360, height: 360, maxWidth: "100%", borderRadius: "50%", background: "#EEE9FF", top: "46%", left: "50%", transform: "translate(-50%, -50%)" }} />
      <div style={{ position: "relative", width: 300, height: 600, borderRadius: 46, background: "#17132B", padding: 12, boxSizing: "border-box", boxShadow: "0 30px 60px rgba(23,19,43,0.28)" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 36, background: "#F6F3FF", overflow: "hidden", display: "flex", flexDirection: "column", padding: "34px 16px 18px", boxSizing: "border-box", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'Rubik', sans-serif", fontWeight: 700, fontSize: 15 }}>הכרטיס שלי</span>
            <span style={{ fontSize: 12, color: "#5E5873" }}>perkly.shop</span>
          </div>
          <div style={{ background: "#6A4DE3", borderRadius: 22, padding: "18px 16px", color: "#FFFFFF", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CafeLogo size={40} />
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span style={{ fontFamily: "'Rubik', sans-serif", fontWeight: 700, fontSize: 17 }}>קפה אייקון</span>
                <span style={{ fontSize: 13, color: "#F1EDFF" }}>הקפה העשירי עלינו</span>
              </div>
            </div>
            <div role="img" aria-label={`כרטיס נאמנות לדוגמה: ${count} מתוך ${TARGET} חותמות`} style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
              {Array.from({ length: TARGET }, (_, i) =>
                i < count ? (
                  <span key={i} style={{ aspectRatio: "1", borderRadius: "50%", background: "#FFC24B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B2A00" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={CUP} /></svg>
                  </span>
                ) : (
                  <span key={i} style={{ aspectRatio: "1", borderRadius: "50%", border: "2px dashed rgba(255,255,255,0.6)", boxSizing: "border-box" }} />
                ),
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{count} מתוך {TARGET}</span>
              <span style={{ color: "#F1EDFF" }}>{full ? "המתנה מוכנה!" : remaining === 1 ? "עוד חותמת אחת למתנה" : `עוד ${remaining} למתנה`}</span>
            </div>
          </div>
          {full ? (
            <div role="status" style={{ background: "#FFC24B", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "#2B1F00" }}>
              <span style={{ fontFamily: "'Rubik', sans-serif", fontWeight: 800, fontSize: 18 }}>המתנה מוכנה!</span>
              <span style={{ fontSize: 13, textAlign: "center" }}>ככה לקוח מרגיש כשהוא חוזר אליכם.</span>
              <button type="button" style={btn} onClick={() => { setCount(0); setToast(false); }}>מימוש והתחלה מחדש</button>
            </div>
          ) : (
            <div style={{ background: "#FFFFFF", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, border: "1px solid #E8E3F7" }}>
              <span style={{ fontSize: 13, color: "#4A4462", fontWeight: 500, textAlign: "center" }}>כך העובד מוסיף חותמת. נסו בעצמכם:</span>
              <button type="button" style={btn} onClick={() => { setCount((c) => Math.min(TARGET, c + 1)); setToast(true); }}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFC24B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                הוסיפו חותמת
              </button>
            </div>
          )}
        </div>
      </div>
      {toast && !full ? (
        <div role="status" style={{ position: "absolute", top: 92, right: "calc(50% + 104px)", background: "#FFFFFF", borderRadius: 14, padding: "10px 14px", boxShadow: "0 12px 28px rgba(23,19,43,0.14)", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
          <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#E3F7EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1F9D6B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          חותמת נוספה
        </div>
      ) : null}
    </div>
  );
}
