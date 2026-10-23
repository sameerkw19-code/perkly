"use client";
import Link from "next/link";
import { useState } from "react";

// DEMO payment flow. No card details can be typed (the fields are locked), nothing is
// charged and nothing is sent to the server. Replace step 2 with the Tranzila hosted page
// once the terminal is set up.

const MONTHLY = 99;
const KIT = 99;

const C = { ink: "#17132B", purple: "#7558E8", purpleDeep: "#5B3FD6", lav: "#F1EDFC", muted: "#4A4462", line: "#E1DAF5", yellow: "#FFC24B" };
const DISPLAY = "'Rubik', sans-serif";

type Details = { business: string; owner: string; phone: string; email: string; street: string; city: string };
const EMPTY: Details = { business: "", owner: "", phone: "", email: "", street: "", city: "" };

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, fontSize: 14, fontWeight: 700, color: C.ink };
const input: React.CSSProperties = { height: 50, borderRadius: 12, border: `1.5px solid ${C.line}`, padding: "0 14px", fontSize: 16, fontFamily: "inherit", background: "#FFFFFF", color: C.ink, fontWeight: 400, width: "100%", boxSizing: "border-box" };
const primary: React.CSSProperties = { minHeight: 56, border: 0, borderRadius: 14, background: C.purple, color: "#FFFFFF", fontFamily: "inherit", fontWeight: 700, fontSize: 18, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 10px 24px rgba(117,88,232,0.3)" };

function Check({ color = "#1F9D6B" }: { color?: string }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ["פרטי העסק", "תשלום", "סיום"];
  return (
    <ol aria-label="שלבי ההצטרפות" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 10, flexWrap: "wrap" }}>
      {items.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "current" : "next";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: state === "next" ? "#6B6488" : C.ink }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, background: state === "done" ? "#1F9D6B" : state === "current" ? C.ink : "#E8E3F7", color: state === "next" ? C.muted : "#FFFFFF" }}>
              {state === "done" ? <Check color="#FFFFFF" /> : n}
            </span>
            {label}
            {n < 3 ? <span aria-hidden="true" style={{ width: 24, height: 2, background: "#DCD5F2", borderRadius: 2 }} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ kit }: { kit: boolean }) {
  const total = MONTHLY + (kit ? KIT : 0);
  return (
    <aside aria-label="סיכום הזמנה" style={{ flex: "1 1 300px", minWidth: 0, background: "#FFFFFF", border: `1px solid ${C.line}`, borderRadius: 24, padding: 26, display: "flex", flexDirection: "column", gap: 16, alignSelf: "flex-start" }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20 }}>Perkly לעסק</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 15, color: C.muted }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check />חשבון לעסק ועיצוב הכרטיס, בלי דמי הקמה</span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check />כרטיס ב־Apple Wallet וב־Google Wallet</span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Check />החודש הראשון של השירות</span>
      </div>
      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}><span>מנוי חודשי</span><span>{MONTHLY} ₪</span></div>
        {kit ? <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}><span>ערכת קופה (חד־פעמי)</span><span>{KIT} ₪</span></div> : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontWeight: 700 }}>לתשלום היום</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>{total} ₪</span>
        </div>
        <span style={{ fontSize: 14, color: C.muted }}>מהחודש הבא: {MONTHLY} ₪ לחודש</span>
      </div>
    </aside>
  );
}

export default function SignupFlow() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [d, setD] = useState<Details>(EMPTY);
  const [paying, setPaying] = useState(false);
  const [kit, setKit] = useState(false);
  const total = MONTHLY + (kit ? KIT : 0);
  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });

  function next(e: React.FormEvent) {
    e.preventDefault();
    setStep(2);
    window.scrollTo({ top: 0 });
  }

  function pay() {
    setPaying(true);
    window.setTimeout(() => {
      setPaying(false);
      setStep(3);
      window.scrollTo({ top: 0 });
    }, 1200);
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#FAF8FF", color: C.ink, fontFamily: "'Heebo', system-ui, sans-serif", lineHeight: 1.6 }}>
      <div role="note" style={{ background: C.yellow, color: "#2B1F00", textAlign: "center", padding: "10px 16px", fontWeight: 700, fontSize: 14 }}>
        מצב הדגמה: לא מתבצע חיוב ולא נשמרים פרטים
      </div>
      <header style={{ borderBottom: "1px solid #E8E3F7", background: "#FFFFFF" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "14px clamp(16px, 4vw, 32px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: C.ink, textDecoration: "none" }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: C.purple, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
            </span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22 }}>Perkly</span>
          </Link>
          <a href="/login" style={{ fontWeight: 700, color: C.ink, minHeight: 44, display: "flex", alignItems: "center" }}>כבר יש לי חשבון</a>
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "clamp(28px, 5vw, 56px) clamp(16px, 4vw, 32px) 64px", display: "flex", flexDirection: "column", gap: 28 }}>
        <Steps step={step} />

        {step === 1 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
            <form onSubmit={next} style={{ flex: "999 1 420px", minWidth: 0, background: "#FFFFFF", border: `1px solid ${C.line}`, borderRadius: 24, padding: "clamp(20px, 4vw, 32px)", display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 800, fontSize: "clamp(26px, 3.4vw, 34px)", lineHeight: 1.2 }}>פותחים כרטיס לעסק</h1>
                <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 16 }}>הפרטים משמשים להקמת החשבון לעסק.</p>
              </div>
              <label style={field}>שם העסק<input style={input} required value={d.business} onChange={set("business")} autoComplete="organization" /></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                <label style={{ ...field, flex: "1 1 200px" }}>שם מלא<input style={input} required value={d.owner} onChange={set("owner")} autoComplete="name" /></label>
                <label style={{ ...field, flex: "1 1 200px" }}>טלפון<input dir="ltr" style={{ ...input, direction: "ltr", textAlign: "right" }} required type="tel" inputMode="tel" value={d.phone} onChange={set("phone")} autoComplete="tel" /></label>
              </div>
              <label style={field}>אימייל<input dir="ltr" style={{ ...input, direction: "ltr", textAlign: "right" }} required type="email" value={d.email} onChange={set("email")} autoComplete="email" /></label>
              <label style={{ display: "flex", gap: 12, alignItems: "flex-start", background: C.lav, borderRadius: 16, padding: 16, cursor: "pointer" }}>
                <input type="checkbox" checked={kit} onChange={(e) => setKit(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2, accentColor: C.purple, flex: "none" }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>הוסיפו ערכת קופה: {KIT} ₪ חד־פעמי</span>
                  <span style={{ fontSize: 14, color: C.muted }}>2 פוסטרים וסטנד לדלפק עם הלוגו שלכם וקוד ה־QR של העסק. לא חובה.</span>
                </span>
              </label>
              {kit ? (
                <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                <legend style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, marginBottom: 10 }}>לאן לשלוח את הערכה?</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  <label style={{ ...field, flex: "2 1 220px" }}>רחוב ומספר<input style={input} required value={d.street} onChange={set("street")} autoComplete="street-address" /></label>
                  <label style={{ ...field, flex: "1 1 140px" }}>עיר<input style={input} required value={d.city} onChange={set("city")} autoComplete="address-level2" /></label>
                </div>
              </fieldset>
              ) : null}
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15, color: C.muted }}>
                <input type="checkbox" required style={{ width: 20, height: 20, marginTop: 3, accentColor: C.purple, flex: "none" }} />
                קראתי ואני מאשר/ת את תנאי השימוש
              </label>
              <button type="submit" style={primary}>המשך לתשלום</button>
            </form>
            <Summary kit={kit} />
          </div>
        ) : null}

        {step === 2 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
            <div style={{ flex: "999 1 420px", minWidth: 0, background: "#FFFFFF", border: `1px solid ${C.line}`, borderRadius: 24, padding: "clamp(20px, 4vw, 32px)", display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 800, fontSize: "clamp(26px, 3.4vw, 34px)", lineHeight: 1.2 }}>תשלום מאובטח</h1>
                <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 16 }}>התשלום יתבצע בדף המאובטח של Tranzila. בהדגמה השדות נעולים, ואין צורך להקליד פרטי אשראי.</p>
              </div>
              <div style={{ background: C.lav, borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={field}>מספר כרטיס<input dir="ltr" style={{ ...input, direction: "ltr", textAlign: "right", background: "#F6F3FF" }} disabled value="4580 •••• •••• 1234" readOnly /></label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  <label style={{ ...field, flex: "1 1 120px" }}>תוקף<input dir="ltr" style={{ ...input, direction: "ltr", textAlign: "right", background: "#F6F3FF" }} disabled value="12/29" readOnly /></label>
                  <label style={{ ...field, flex: "1 1 120px" }}>CVV<input dir="ltr" style={{ ...input, direction: "ltr", textAlign: "right", background: "#F6F3FF" }} disabled value="•••" readOnly /></label>
                  <label style={{ ...field, flex: "1 1 160px" }}>תעודת זהות<input dir="ltr" style={{ ...input, direction: "ltr", textAlign: "right", background: "#F6F3FF" }} disabled value="•••••••••" readOnly /></label>
                </div>
              </div>
              <span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: C.muted }}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F9D6B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                פרטי האשראי לא נשמרים אצלנו. מהחודש הבא החיוב של {MONTHLY} ₪ מתבצע אוטומטית.
              </span>
              <button type="button" onClick={pay} disabled={paying} style={{ ...primary, opacity: paying ? 0.7 : 1 }}>
                {paying ? "מעבד תשלום…" : `תשלום ${total} ₪ (הדגמה)`}
              </button>
              <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: 0, color: C.purpleDeep, fontWeight: 700, fontSize: 15, cursor: "pointer", minHeight: 44, fontFamily: "inherit" }}>חזרה לפרטי העסק</button>
            </div>
            <Summary kit={kit} />
          </div>
        ) : null}

        {step === 3 ? (
          <div role="status" style={{ background: "#FFFFFF", border: `1px solid ${C.line}`, borderRadius: 28, padding: "clamp(24px, 5vw, 44px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", maxWidth: 620, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
            <span style={{ width: 76, height: 76, borderRadius: "50%", background: "#E3F7EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1F9D6B" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
            <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 800, fontSize: "clamp(26px, 3.6vw, 36px)", lineHeight: 1.2 }}>התשלום התקבל. ברוכים הבאים ל־Perkly!</h1>
            <p style={{ margin: 0, color: C.muted, fontSize: 17 }}>
              {d.business ? `${d.business}, ` : ""}{kit ? `ערכת הקופה תישלח אל ${d.street}, ${d.city}. ` : ""}עכשיו נשאר רק לפתוח חשבון ולעצב את הכרטיס.
            </p>
            <a href="/login?signup=1" style={{ ...primary, textDecoration: "none", maxWidth: 360 }}>ממשיכים ליצירת החשבון</a>
            <span style={{ fontSize: 13, color: "#6B6488" }}>זו הדגמה: לא בוצע חיוב ולא נשמרו פרטים.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
