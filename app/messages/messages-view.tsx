"use client";

import { useEffect, useMemo, useState } from "react";

type Recipient = { id: string; name: string; phone: string; masked: string; birthday: string | null; inDays: number | null; awayDays: number | null };
type Audience = "all" | "birthdays" | "away";

// The sending service is not connected yet. Once the PULSEEM link is set, the send button uses it.
const PULSEEM_SEND_URL: string | null = null;

/** A starting message for each audience; the owner can change it. */
const DEFAULT_TEXT: Record<Audience, string> = {
  all: "היי {name}, מחכים לך אצלנו. תודה שאתה לקוח שלנו!",
  birthdays: "מזל טוב {name}! לכבוד יום ההולדת מחכה לך אצלנו הפתעה. נשמח לראות אותך!",
  away: "היי {name}, מתגעגעים אליך! כבר זמן מה לא ראינו אותך. קפוץ אלינו, הכרטיס שלך מחכה.",
};

/** Fills {name} for one recipient. Names only come from the customers the owner already has. */
export function fillTemplate(text: string, name: string): string {
  return text.replace(/\{name\}/g, name);
}

export default function MessagesView() {
  const [audience, setAudience] = useState<Audience>("birthdays");
  const [days, setDays] = useState(7);
  const [text, setText] = useState(DEFAULT_TEXT.birthdays);

  // Opened from the customer list ("away" filter): start with that audience.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("audience");
    if (q === "away" || q === "all" || q === "birthdays") pick(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Changes the audience; an untouched starting message changes with it. */
  function pick(next: Audience) {
    setText((cur) => (Object.values(DEFAULT_TEXT).includes(cur) ? DEFAULT_TEXT[next] : cur));
    setAudience(next);
  }
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setRecipients(null);
    setError("");
    fetch(`/api/messages?audience=${audience}&days=${days}`, { credentials: "same-origin" })
      .then(async (r) => {
        const data: any = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) return setError(data.message || "לא הצלחנו לטעון את הרשימה");
        setRecipients(data.recipients as Recipient[]);
      })
      .catch(() => alive && setError("בעיית רשת, נסה שוב"));
    return () => { alive = false; };
  }, [audience, days]);

  const preview = useMemo(() => (recipients && recipients[0] ? fillTemplate(text, recipients[0].name) : ""), [text, recipients]);

  async function copyNumbers() {
    if (!recipients) return;
    await navigator.clipboard.writeText(recipients.map((r) => r.phone).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main dir="rtl" style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>הודעות SMS ללקוחות</h1>
      <p style={{ opacity: 0.8 }}>רק לקוחות שאישרו לקבל הודעות שיווקיות נכללים ברשימה.</p>

      <section aria-labelledby="aud">
        <h2 id="aud">למי לשלוח</h2>
        <label><input type="radio" name="aud" checked={audience === "birthdays"} onChange={() => pick("birthdays")} /> ימי הולדת בקרוב</label>{" "}
        <label><input type="radio" name="aud" checked={audience === "away"} onChange={() => pick("away")} /> לא ביקרו 30+ יום</label>{" "}
        <label><input type="radio" name="aud" checked={audience === "all"} onChange={() => pick("all")} /> כל הלקוחות שאישרו</label>
        {audience === "birthdays" && (
          <div style={{ marginTop: 8 }}>
            <label>
              ב-
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 3, 7, 14].map((d) => <option key={d} value={d}>{d} ימים הקרובים</option>)}
              </select>
            </label>
          </div>
        )}
      </section>

      <section aria-labelledby="txt" style={{ marginTop: 16 }}>
        <h2 id="txt">תוכן ההודעה</h2>
        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} rows={4} style={{ width: "100%", font: "inherit", padding: 8 }} aria-label="תוכן ההודעה" />
        <small>השתמש ב-{"{name}"} לשם הלקוח. {text.length}/300</small>
        {preview && <p style={{ marginTop: 8 }}><strong>תצוגה מקדימה:</strong> {preview}</p>}
      </section>

      <section aria-labelledby="rcp" style={{ marginTop: 16 }}>
        <h2 id="rcp">נמענים {recipients ? `(${recipients.length})` : ""}</h2>
        {error && <p role="alert" style={{ color: "#b00020" }}>{error}</p>}
        {!recipients && !error && <p>טוען…</p>}
        {recipients && recipients.length === 0 && <p>אין לקוחות מתאימים כרגע.</p>}
        {recipients && recipients.length > 0 && (
          <ul style={{ paddingInlineStart: 18 }}>
            {recipients.map((r) => (
              <li key={r.id}>
                {r.name} · <span dir="ltr">{r.masked}</span>
                {r.inDays !== null && <> · {r.inDays === 0 ? "היום" : `בעוד ${r.inDays} ימים`}</>}
                {r.awayDays !== null && <> · לא ביקר {r.awayDays} ימים</>}
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button type="button" onClick={copyNumbers} disabled={!recipients || recipients.length === 0}>
            {copied ? "הועתק" : "העתק רשימת מספרים"}
          </button>
          <button type="button" disabled={!PULSEEM_SEND_URL || !recipients?.length} title={PULSEEM_SEND_URL ? "" : "שירות השליחה עדיין לא מחובר"}>
            שליחה
          </button>
        </div>
        {!PULSEEM_SEND_URL && <small style={{ display: "block", marginTop: 6 }}>שליחה אוטומטית תופעל אחרי חיבור שירות השליחה.</small>}
      </section>
    </main>
  );
}
