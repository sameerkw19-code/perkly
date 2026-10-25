"use client";
import { useState } from "react";
import { post } from "../../../../lib/api";
import { LoyaltyCard } from "../../../../components/loyalty-card";
import { useLang } from "../../../../lib/i18n";
import type { Design } from "../../../../lib/design";

/** Suspend / unsuspend and free-access controls for one business. Reloads the page after each change. */
type Biz = { id: string; name: string; reward: string; target: number; archived: string | null; ownerEmail: string | null; paying: boolean };

export function AdminActions({ business, suspended, compUntil, biz }: { business: string; suspended: boolean; compUntil: string | null; biz: Biz }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(30);
  const compActive = !!compUntil && compUntil > new Date().toISOString();

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
        : "הפעולה נכשלה. נסה שוב.",
      );
      return;
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
          {compActive
            ? `פעילה עד ${new Date(compUntil!).toLocaleDateString("he-IL")}. הארכה מתווספת לתאריך הזה.`
            : "נותן לעסק גישה מלאה בלי מנוי, למשך מספר ימים."}
        </p>
        <div className="admin-row">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="מספר ימים">
            {[7, 14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} ימים</option>)}
          </select>
          <button className="btn primary small" disabled={busy} onClick={() => run("grant_comp", { days })}>{compActive ? "הארכה" : "מתן גישה"}</button>
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
              const warn = biz.paying ? "\n\nשים לב: לעסק יש מנוי פעיל ב-Polar, והוא ימשיך להיות מחויב. בטל את המנוי ב-Polar בנפרד." : "";
              if (reason && confirm("לארכב את העסק? הבעלים והצוות לא יראו אותו, וההצטרפות תיסגר. הנתונים נשמרים ואפשר לשחזר." + warn)) run("archive", { reason });
            }}>ארכוב עסק</button>
          )}
        </div>
        <small className="form-hint">בייצוא, מספרי הטלפון של הלקוחות מוסתרים חוץ מ-4 הספרות האחרונות. כל ייצוא נרשם ביומן.</small>
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
