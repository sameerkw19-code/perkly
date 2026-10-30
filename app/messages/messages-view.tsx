"use client";

import { useEffect, useMemo, useState } from "react";

type Recipient = { id: string; name: string; phone: string; masked: string; birthday: string | null; inDays: number | null; awayDays: number | null };
type Audience = "all" | "birthdays" | "away";

import { messageFor } from "../../lib/sms-text";

type Info = { businessName: string; canSend: boolean; smsConnected: boolean; used: number; limit: number };

/** A starting message for each audience; the owner can change it. */
const DEFAULT_TEXT: Record<Audience, string> = {
  all: "היי {name}, מחכים לך אצלנו. תודה שאתה לקוח שלנו!",
  birthdays: "מזל טוב {name}! לכבוד יום ההולדת מחכה לך אצלנו הפתעה. נשמח לראות אותך!",
  away: "היי {name}, מתגעגעים אליך! כבר זמן מה לא ראינו אותך. קפוץ אלינו, הכרטיס שלך מחכה.",
};

export default function MessagesView() {
  const [audience, setAudience] = useState<Audience>("birthdays");
  const [days, setDays] = useState(7);
  const [text, setText] = useState(DEFAULT_TEXT.birthdays);

  // Opened from the customer list ("away" filter): start with that audience.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBusiness(params.get("b") ?? "");
    const q = params.get("audience");
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
  const [info, setInfo] = useState<Info | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // Which business (?b=…); without it the server uses the owner's first business.
  const [business, setBusiness] = useState("");

  useEffect(() => {
    let alive = true;
    setRecipients(null);
    setError("");
    fetch(`/api/messages?audience=${audience}&days=${days}&business=${encodeURIComponent(business)}`, { credentials: "same-origin" })
      .then(async (r) => {
        const data: any = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) return setError(data.message || "לא הצלחנו לטעון את הרשימה");
        setRecipients(data.recipients as Recipient[]);
        setInfo({ businessName: data.businessName, canSend: data.canSend, smsConnected: data.smsConnected, used: data.used, limit: data.limit });
      })
      .catch(() => alive && setError("בעיית רשת, נסה שוב"));
    return () => { alive = false; };
  }, [audience, days, business]);

  const preview = useMemo(() => (info ? messageFor(info.businessName, text, recipients?.[0]?.name ?? "דנה") : ""), [text, recipients, info]);

  /** Sends to the list (rebuilt by the server), or one test message to the owner's phone. */
  async function send(test: boolean) {
    if (!recipients) return;
    if (!test && !window.confirm(`לשלוח הודעה ל-${recipients.length} לקוחות? אי אפשר לבטל אחרי השליחה.`)) return;
    setBusy(true);
    setStatus("");
    const r = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ business, audience, days, text, ...(test ? { testPhone } : {}) }),
    }).catch(() => null);
    const data: any = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r) return setStatus("בעיית רשת, נסה שוב.");
    if (r.ok) {
      setStatus(test ? "הודעת הבדיקה נשלחה." : `נשלח ל-${data.sent} לקוחות${data.failed ? `, ${data.failed} לא נשלחו` : ""}.`);
      if (!test && info) setInfo({ ...info, used: info.used + (data.sent ?? 0) });
      return;
    }
    setStatus(
      data.code === "sms_limit" ? `עברת את מכסת ההודעות החודשית. נשארו ${data.left} הודעות החודש.`
      : data.code === "bad_phone" ? "מספר הטלפון לבדיקה לא תקין."
      : data.code === "rate_limited" ? "יותר מדי שליחות. נסה שוב בעוד שעה."
      : data.code === "paid_feature" ? "שליחת הודעות זמינה במנוי."
      : data.code === "sms_off" ? "שירות השליחה עדיין לא מחובר."
      : "השליחה נכשלה. נסה שוב מאוחר יותר.",
    );
  }

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
        <small>השתמש ב-{"{name}"} לשם הלקוח. שם העסק מתווסף בתחילת ההודעה, וקישור הסרה בסופה. {text.length}/300</small>
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
          <button type="button" disabled={busy || !info?.canSend || !recipients?.length || !text.trim()} onClick={() => send(false)}>
            {busy ? "שולח…" : `שליחה ל-${recipients?.length ?? 0} לקוחות`}
          </button>
        </div>
        {info && !info.smsConnected && <small style={{ display: "block", marginTop: 6 }}>שירות השליחה עדיין לא מחובר.</small>}
        {info && info.smsConnected && !info.canSend && <small style={{ display: "block", marginTop: 6 }}>שליחת הודעות זמינה במנוי.</small>}
        {info?.canSend && <small style={{ display: "block", marginTop: 6 }}>נשלחו החודש {info.used} מתוך {info.limit} הודעות.</small>}
      </section>

      <section aria-labelledby="tst" style={{ marginTop: 16 }}>
        <h2 id="tst">שליחת בדיקה</h2>
        <p style={{ opacity: 0.8, margin: "4px 0" }}>שולח את ההודעה רק לטלפון שתכתוב כאן, כדי לראות איך היא נראית.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="tel" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} aria-label="טלפון לבדיקה" style={{ flex: 1, padding: 8 }} />
          <button type="button" disabled={busy || !info?.canSend || !testPhone.trim() || !text.trim()} onClick={() => send(true)}>שליחת בדיקה</button>
        </div>
        {status && <p role="status" style={{ marginTop: 10 }}>{status}</p>}
      </section>
    </main>
  );
}
