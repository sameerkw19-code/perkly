"use client";
import { useState } from "react";
import { post } from "../../../../lib/api";
import { normalizePhone } from "../../../../lib/phone";
import { LAUNCH } from "../../../../lib/pricing";
import { LoyaltyCard } from "../../../../components/loyalty-card";
import { useLang } from "../../../../lib/i18n";
import type { Design } from "../../../../lib/design";

/** Sends an Apple Wallet update push to every iPhone that saved this business's card, and shows Apple's answers. */
export function ApplePushTest({ business }: { business: string }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");
  return (
    <span>
      <button className="btn soft small" disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await post<{ ready: boolean; devices: number; results: { token: string; status: number; reason?: string }[] }>("/api/admin", { action: "apple_push_test", business });
        setBusy(false);
        if (!r.ok || !r.data) return setOut("הבדיקה נכשלה.");
        const d = r.data;
        if (!d.ready) return setOut(`שליחה ל-Apple עוד לא מחוברת. מכשירים רשומים: ${d.devices}.`);
        if (!d.devices) return setOut("אין עדיין אייפון שנרשם לעדכונים של כרטיס בעסק הזה.");
        const ok = d.results.filter((x) => x.status === 200).length;
        setOut(`נשלחו ${ok} מתוך ${d.results.length}.` + (ok < d.results.length ? ` שגיאה: ${d.results.find((x) => x.status !== 200)?.status} ${d.results.find((x) => x.status !== 200)?.reason ?? ""}` : ""));
      }}>{busy ? "שולח..." : "בדיקת עדכון Apple Wallet"}</button>
      {out && <small className="muted" style={{ marginInlineStart: 8 }} role="status">{out}</small>}
    </span>
  );
}

/** Sends the current stamps to the business's Google Wallet passes now and shows Google's answer. */
export function GoogleSyncTest({ business }: { business: string }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");
  return (
    <span>
      <button className="btn soft small" disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await post<{ ready: boolean; saved: number; results: { name: string; stamps: string; result: string; status: number; text: string }[] }>("/api/admin", { action: "google_sync_test", business });
        setBusy(false);
        if (!r.ok || !r.data) return setOut("הבדיקה נכשלה.");
        const d = r.data;
        if (!d.ready) return setOut("Google Wallet לא מחובר בשרת.");
        if (!d.saved) return setOut("אף לקוח בעסק הזה לא שמר עדיין כרטיס ב-Google Wallet.");
        setOut(d.results.map((x) => `${x.name} ${x.stamps}: ${x.result === "updated" ? "עודכן" : x.result === "not_saved" ? "הכרטיס כבר לא שמור ב-Google" : `נכשל (${x.status}) ${x.text}`}`).join(" · "));
      }}>{busy ? "שולח..." : "בדיקת עדכון Google Wallet"}</button>
      {out && <small className="muted" style={{ marginInlineStart: 8, overflowWrap: "anywhere" }} role="status">{out}</small>}
    </span>
  );
}

/** Yearly plan: marks the included counter kit as shipped. */
export function KitSentButton({ business }: { business: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn soft small" disabled={busy} onClick={async () => {
      if (!confirm("לסמן שערכת הקופה נשלחה?")) return;
      setBusy(true);
      const r = await post("/api/admin", { action: "kit_sent", business });
      setBusy(false);
      if (r.ok) window.location.reload();
      else window.alert("הפעולה נכשלה. נסה שוב.");
    }}>נשלחה</button>
  );
}

/** Whether the business owner may edit their own card design (Perkly designs by default). */
export function OwnerDesignSwitch({ business, on }: { business: string; on: boolean }) {
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(on);
  return (
    <label className="check">
      <input type="checkbox" checked={value} disabled={busy} onChange={async (e) => {
        const next = e.target.checked;
        setBusy(true);
        const r = await post("/api/admin", { action: "owner_designs", business, on: next });
        setBusy(false);
        if (r.ok) setValue(next);
        else window.alert("הפעולה נכשלה. נסה שוב.");
      }} />
      <span>בעל העסק יכול לערוך את העיצוב בעצמו</span>
    </label>
  );
}

/** Suspend / unsuspend and free-access controls for one business. Reloads the page after each change. */
type Biz = { id: string; name: string; reward: string; target: number; archived: string | null; ownerEmail: string | null; paying: boolean };

export function AdminActions({ business, suspended, compUntil, biz }: { business: string; suspended: boolean; compUntil: string | null; biz: Biz }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(30);
  const compActive = !!compUntil && compUntil > new Date().toISOString();
  const compForever = !!compUntil?.startsWith("9999");

  async function run(action: string, extra: Record<string, unknown> = {}, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError("");
    const r = await post("/api/admin", { action, business, ...extra });
    setBusy(false);
    if (!r.ok) {
      setError(
        r.code === "reason_required" ? "צריך לכתוב סיבה."
        : r.code === "user_not_found" ? "אין משתמש עם המייל הזה. הוא צריך להירשם קודם."
        : r.code === "user_blocked" ? "המשתמש הזה חסום."
        : r.code === "already_owner" ? "הוא כבר הבעלים."
        : r.code === "bad_details" ? "פרטים לא תקינים (מספר חותמות 2–30)."
        : r.code === "confirm_mismatch" ? "השם שהוקלד לא תואם את שם העסק. לא נמחק כלום."
        : r.code === "bad_login" ? "הסיסמה שגויה. לא נמחק כלום."
        : r.code === "rate_limited" ? "יותר מדי ניסיונות. נסה שוב בעוד שעה."
        : "הפעולה נכשלה. נסה שוב.",
      );
      return;
    }
    if (r.data?.billing === "not_stopped") {
      window.alert("העסק אורכב, אבל לא הצלחנו לעצור את המנוי ב-Polar. בטל אותו ידנית ב-Polar כדי שהבעלים לא יחויב שוב.");
    }
    window.location.reload();
  }

  return (
    <div className="admin-actions">
      <div className="admin-action">
        <h3>השהיית עסק</h3>
        {suspended ? (
          <>
            <p className="muted">העסק מושהה: אין חותמות, לקוחות חדשים או שינויי הגדרות. מימוש הטבות שנצברו עדיין אפשרי, והלקוחות רואים את הכרטיס.</p>
            <button className="btn primary small" disabled={busy} onClick={() => run("unsuspend", {}, "להחזיר את העסק לפעילות?")}>החזרה לפעילות</button>
          </>
        ) : (
          <>
            <p className="muted">חוסם חותמות, הרשמת לקוחות ושינויי הגדרות ועיצוב. מימוש הטבות שנצברו נשאר אפשרי.</p>
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="סיבה (חובה, נשמרת ביומן)" aria-label="סיבת השהיה" />
            <button className="btn soft small danger" disabled={busy || !reason.trim()} onClick={() => run("suspend", { reason }, "להשהות את העסק?")}>השהיה</button>
          </>
        )}
      </div>

      <div className="admin-action">
        <h3>גישה חינם</h3>
        <p className="muted">
          {compForever
            ? "פעילה ללא הגבלת זמן, עד שתבטל אותה."
            : compActive
              ? `פעילה עד ${new Date(compUntil!).toLocaleDateString("he-IL")}. הארכה מתווספת לתאריך הזה.`
              : "נותן לעסק גישה מלאה בלי מנוי, למספר ימים או ללא הגבלת זמן. רק מנהל יכול לתת אותה."}
        </p>
        <div className="admin-row">
          {!compForever && (
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="מספר ימים">
            {[7, 14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} ימים</option>)}
          </select>
          )}
          {!compForever && <button className="btn primary small" disabled={busy} onClick={() => run("grant_comp", { days })}>{compActive ? "הארכה" : "מתן גישה"}</button>}
          {!compForever && <button className="btn soft small" disabled={busy} onClick={() => run("grant_comp", { forever: true }, "לתת לעסק גישה חינם ללא הגבלת זמן?")}>ללא הגבלת זמן</button>}
          {compActive && <button className="btn soft small" disabled={busy} onClick={() => run("clear_comp", {}, "לבטל את הגישה החינמית?")}>ביטול</button>}
        </div>
      </div>
      <div className="admin-action">
        <h3>פרטי העסק</h3>
        <form className="admin-edit" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run("update_business", { name: f.get("name"), reward: f.get("reward"), target: Number(f.get("target")) }, "לשמור את השינויים בפרטי העסק?");
        }}>
          <label>שם<input name="name" defaultValue={biz.name} maxLength={80} required /></label>
          <label>הטבה<input name="reward" defaultValue={biz.reward} maxLength={160} required /></label>
          <label>חותמות להטבה<input name="target" type="number" min={2} max={30} defaultValue={biz.target} required /></label>
          <button className="btn soft small" disabled={busy}>שמירה</button>
        </form>
        <small className="form-hint">מספר חותמות חדש חל על כרטיסים חדשים, ועל קיימים מהסבב הבא.</small>
      </div>

      <div className="admin-action">
        <h3>העברת בעלות</h3>
        <p className="muted">בעלים נוכחי: <span dir="ltr">{biz.ownerEmail ?? "—"}</span>. הבעלים הקודם יישאר בצוות כעובד.</p>
        <form className="admin-row" onSubmit={(e) => {
          e.preventDefault();
          const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
          if (email) run("transfer_owner", { email }, `להעביר את הבעלות על העסק ל-${email}?`);
        }}>
          <input name="email" type="email" dir="ltr" placeholder="מייל של משתמש קיים" required />
          <button className="btn soft small" disabled={busy}>העברה</button>
        </form>
      </div>

      <div className="admin-action">
        <h3>ייצוא וארכוב</h3>
        <div className="admin-row">
          <a className="btn soft small" href={`/api/admin/export?business=${encodeURIComponent(business)}`}>ייצוא נתונים (JSON)</a>
          {biz.archived ? (
            <button className="btn primary small" disabled={busy} onClick={() => run("restore", {}, "לשחזר את העסק? הבעלים והצוות יראו אותו שוב.")}>שחזור מהארכיון</button>
          ) : (
            <button className="btn soft small danger" disabled={busy} onClick={() => {
              const reason = prompt("סיבת הארכוב (נשמרת ביומן):")?.trim();
              const warn = biz.paying ? "\n\nלעסק יש מנוי פעיל ב-Polar: החידוש שלו ייעצר, והמנוי יסתיים בסוף התקופה ששולמה." : "";
              if (reason && confirm("לארכב את העסק? הבעלים והצוות לא יראו אותו, וההצטרפות תיסגר. הנתונים נשמרים ואפשר לשחזר." + warn)) run("archive", { reason });
            }}>ארכוב עסק</button>
          )}
        </div>
        <small className="form-hint">בייצוא, מספרי הטלפון של הלקוחות מוסתרים חוץ מ-4 הספרות האחרונות. כל ייצוא נרשם ביומן.</small>
      </div>
      <div className="admin-action">
        <h3>איפוס נתונים</h3>
        <p className="muted">מוחק לצמיתות את כל הלקוחות, היסטוריית החותמות, ההטבות וההודעות ליום מיוחד. העיצוב, הלוגו, הצוות, המנוי וקישור ההצטרפות נשארים. כרטיסים ששמורים בארנקים יפסיקו להתעדכן. אי אפשר לבטל.</p>
        <form className="admin-edit" autoComplete="off" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const typed = String(f.get("confirm") ?? "").trim();
          if (typed !== biz.name) { setError("השם שהוקלד לא תואם את שם העסק. לא נמחק כלום."); return; }
          run("reset_data", { confirm: typed, password: String(f.get("password") ?? "") }, `למחוק לצמיתות את כל הלקוחות וההיסטוריה של "${biz.name}"?`);
        }}>
          <label>הקלד את שם העסק: <strong>{biz.name}</strong><input name="confirm" required maxLength={80} autoComplete="off" /></label>
          <label>הסיסמה שלך<input name="password" type="password" required maxLength={200} autoComplete="current-password" dir="ltr" /></label>
          <button className="btn soft small danger" disabled={busy}>איפוס נתונים</button>
        </form>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

/** The business's live card, as customers see it (without a QR). */
export function AdminCardPreview({ design, target }: { design: Design; target: number }) {
  const { lang, t } = useLang();
  return <LoyaltyCard design={design} lang={lang} stamps={Math.min(3, target)} target={target} customerName={t("sampleCustomer")} t={t} />;
}

/**
 * When the card is ready: sends the owner a link to their payment page (sign-in, then the subscription step).
 * Opens WhatsApp with a ready message, to the number typed here or to a chat the admin picks.
 */
export function PaymentLink({ business, name, shekels }: { business: string; name: string; shekels: boolean }) {
  const [phone, setPhone] = useState("");
  const [withCode, setWithCode] = useState(shekels);
  const [copied, setCopied] = useState(false);
  const link = `https://perkly.shop/login?next=/start?b=${business}`;
  const message = shekels
    ? [
        `שלום! הכרטיס של ${name} ב־Perkly מוכן 🎉`,
        "כדי להמשיך בלי הפסקה, מפעילים את המנוי כאן (14 ימים ראשונים חינם, אפשר לבטל בכל רגע):",
        link,
        ...(withCode ? [`בדף התשלום מקלידים את קוד ההשקה ${LAUNCH.code} ומשלמים ${LAUNCH.price} ₪ לחודש.`] : []),
      ].join("\n")
    : [`Hi! Your ${name} card on Perkly is ready 🎉`, "To keep going without a break, start your subscription here (the first 14 days are free, cancel any time):", link].join("\n");
  const intl = normalizePhone(phone)?.slice(1) ?? "";
  const bad = phone.trim() !== "" && !intl;
  return (
    <div className="admin-action payment-link">
      <h3>שליחת קישור תשלום</h3>
      <p className="muted">כשהעיצוב מוכן: הודעה לבעל העסק עם קישור לדף התשלום. בלי מספר, וואטסאפ ייתן לבחור למי לשלוח.</p>
      <div className="admin-row">
        <input type="tel" dir="ltr" placeholder="טלפון של בעל העסק (לא חובה)" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="טלפון של בעל העסק" aria-invalid={bad} />
        <a className={`btn primary small${bad ? " is-disabled" : ""}`} aria-disabled={bad} target="_blank" rel="noopener noreferrer"
          href={bad ? undefined : `https://wa.me/${intl}?text=${encodeURIComponent(message)}`}>שליחה בוואטסאפ</a>
        <button type="button" className="btn soft small" onClick={async () => {
          try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
        }}>{copied ? "הועתק ✓" : "העתקת ההודעה"}</button>
      </div>
      {bad && <small className="form-error" role="alert">מספר הטלפון לא תקין.</small>}
      {shekels && (
        <label className="admin-check"><input type="checkbox" checked={withCode} onChange={(e) => setWithCode(e.target.checked)} /> לצרף את קוד ההשקה ({LAUNCH.code}, {LAUNCH.price} ₪)</label>
      )}
      <details><summary className="muted">תצוגת ההודעה</summary><pre className="payment-preview" dir={shekels ? "rtl" : "ltr"}>{message}</pre></details>
    </div>
  );
}
