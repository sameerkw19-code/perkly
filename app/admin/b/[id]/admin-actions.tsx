"use client";
import { useState } from "react";
import { post } from "../../../../lib/api";
import { LoyaltyCard } from "../../../../components/loyalty-card";
import { useLang } from "../../../../lib/i18n";
import type { Design } from "../../../../lib/design";

/** Suspend / unsuspend and free-access controls for one business. Reloads the page after each change. */
export function AdminActions({ business, suspended, compUntil }: { business: string; suspended: boolean; compUntil: string | null }) {
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
      setError(r.code === "reason_required" ? "צריך לכתוב סיבה להשהיה." : "הפעולה נכשלה. נסה שוב.");
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
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

/** The business's live card, as customers see it (without a QR). */
export function AdminCardPreview({ design, target }: { design: Design; target: number }) {
  const { lang, t } = useLang();
  return <LoyaltyCard design={design} lang={lang} stamps={Math.min(3, target)} target={target} customerName={t("sampleCustomer")} t={t} />;
}
