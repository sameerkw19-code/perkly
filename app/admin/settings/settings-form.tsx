"use client";
import { useState } from "react";
import { post } from "../../../lib/api";
import type { Settings } from "../../../lib/server/settings";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const [saved, setSaved] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  async function save() {
    const changed: Partial<Settings> = {};
    for (const k of Object.keys(s) as (keyof Settings)[]) if (s[k] !== saved[k]) (changed as Record<string, unknown>)[k] = s[k];
    if (changed.maintenance === true && !confirm("להפעיל מצב תחזוקה? כל העסקים לא יוכלו להוסיף חותמות עד שתכבה אותו.")) return;
    if (changed.signupsOpen === false && !confirm("לסגור פתיחת עסקים חדשים?")) return;
    setBusy(true);
    setMsg("");
    const r = await post<{ settings: Settings }>("/api/admin/settings", { settings: changed });
    setBusy(false);
    if (!r.ok) { setMsg("השמירה נכשלה. בדוק את הערכים ונסה שוב."); return; }
    setS(r.data.settings);
    setSaved(r.data.settings);
    setMsg("נשמר.");
  }

  return (
    <div className="admin-form">
      <div>
        <h3>הרשמה</h3>
        <label className="check">
          <input type="checkbox" checked={s.signupsOpen} onChange={(e) => set("signupsOpen", e.target.checked)} />
          <span>פתיחת עסקים חדשים פתוחה<br /><small className="form-hint">כשסגור: אי אפשר לפתוח חשבון בעלים או עסק חדש. הזמנות עובדים לעסקים קיימים ממשיכות לעבוד.</small></span>
        </label>
      </div>

      <div>
        <h3>מנוי ותקופת ניסיון</h3>
        <label className="check">
          <input type="checkbox" checked={s.requireSubscription} onChange={(e) => set("requireSubscription", e.target.checked)} />
          <span>עסק חדש צריך מנוי אחרי תקופת ניסיון<br /><small className="form-hint">חל רק על עסקים שייפתחו מעכשיו. עסקים קיימים לא מושפעים. כשכבוי: עסק חדש עובד ללא הגבלה.</small></span>
        </label>
        <label>ימי ניסיון
          <input type="number" min={0} max={365} value={s.trialDays} disabled={!s.requireSubscription}
            onChange={(e) => set("trialDays", Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))))} />
          <small className="form-hint">0 = צריך מנוי מהיום הראשון.</small>
        </label>
      </div>

      <div>
        <h3>הודעה לכל העסקים</h3>
        <textarea maxLength={300} value={s.announcement} placeholder="למשל: ביום שישי תהיה עבודת תחזוקה בין 22:00 ל-23:00"
          onChange={(e) => set("announcement", e.target.value)} />
        <small className="form-hint">מופיעה בראש הדשבורד של כל בעל עסק ועובד. ריק = בלי הודעה.</small>
      </div>

      <div>
        <h3>מצב תחזוקה</h3>
        <label className="check">
          <input type="checkbox" checked={s.maintenance} onChange={(e) => set("maintenance", e.target.checked)} />
          <span>להפעיל מצב תחזוקה<br /><small className="form-hint">אף עסק לא יכול להוסיף חותמות, לקוחות או לשנות הגדרות. כרטיסי הלקוחות נשארים גלויים. אתה (מנהל) ממשיך לעבוד כרגיל.</small></span>
        </label>
        <textarea maxLength={300} value={s.maintenanceMessage} placeholder="הודעה אופציונלית שתוצג במקום ברירת המחדל"
          onChange={(e) => set("maintenanceMessage", e.target.value)} />
      </div>

      <div className="form-actions">
        <button className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? "שומר…" : "שמירה"}</button>
        {dirty && <button className="btn soft" disabled={busy} onClick={() => setS(saved)}>ביטול שינויים</button>}
      </div>
      {msg && <p className="form-hint" role="status">{msg}</p>}
    </div>
  );
}
