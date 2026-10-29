"use client";

import { useState } from "react";
import { post } from "../../lib/api";

export default function AccountView() {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function savePhone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    const result = await post("/api/auth", { action: "set_phone", phone });
    setBusy(false);
    setStatus(result.ok ? "הטלפון נשמר. קוד אימות יישלח אליו בכניסה הבאה." : "לא הצלחנו לשמור את המספר. בדוק שהוא נכון.");
  }

  async function signOutEverywhere() {
    if (!window.confirm("להתנתק מכל המכשירים? תצטרך להתחבר מחדש בכל מקום.")) return;
    setBusy(true);
    await post("/api/auth", { action: "logout_everywhere" });
    window.location.href = "/login";
  }

  return (
    <main dir="rtl" style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
      <h1>אבטחת החשבון</h1>

      <section aria-labelledby="ph" style={{ marginTop: 16 }}>
        <h2 id="ph">טלפון לקוד אימות</h2>
        <p style={{ opacity: 0.8 }}>בכניסה תשלח אליו הודעה עם קוד חד-פעמי.</p>
        <form onSubmit={savePhone} style={{ display: "flex", gap: 8 }}>
          <input
            type="tel"
            dir="ltr"
            inputMode="tel"
            placeholder="05X-XXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            aria-label="מספר טלפון"
            style={{ flex: 1, padding: 8 }}
          />
          <button type="submit" disabled={busy || !phone}>שמירה</button>
        </form>
      </section>

      <section aria-labelledby="out" style={{ marginTop: 24 }}>
        <h2 id="out">התנתקות מכל המכשירים</h2>
        <p style={{ opacity: 0.8 }}>אם איבדת טלפון או מכשיר, זה מסיים את כל הכניסות לחשבון.</p>
        <button type="button" onClick={signOutEverywhere} disabled={busy}>התנתק מכל המכשירים</button>
      </section>

      {status && <p role="status" style={{ marginTop: 16 }}>{status}</p>}
    </main>
  );
}
