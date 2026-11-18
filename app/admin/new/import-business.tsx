"use client";
import { useState } from "react";

/** Imports a business exported from another Perkly site (staging): it opens here under Perkly, ready to hand over. */
export default function ImportBusiness() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>ייבוא עסק מקובץ</h2>
      <p className="muted">עסק שבנית באתר הבדיקה: מורידים אותו שם בדף העסק, בכפתור ייצוא העסק לקובץ, ומעלים את הקובץ כאן. ההגדרות, העיצוב, התמונות והסניפים עוברים. העסק נפתח תחת Perkly עם תקופת הקמה, ומשם שולחים לבעל העסק קישור מסירה.</p>
      <label className="btn soft" style={{ display: "inline-flex", cursor: busy ? "wait" : "pointer" }}>
        {busy ? "מייבא..." : "בחירת קובץ"}
        <input type="file" accept="application/json,.json" hidden disabled={busy} onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!file) return;
          setBusy(true); setError("");
          try {
            const r = await fetch("/api/admin/transfer", { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() });
            const data = (await r.json().catch(() => null)) as { id?: string; code?: string } | null;
            if (r.ok && data?.id) { window.location.href = `/admin/b/${data.id}`; return; }
            setError(r.status === 413 ? "הקובץ גדול מדי." : data?.code === "bad_file" ? "זה לא קובץ עסק של Perkly." : "הייבוא נכשל. בדקו את הקובץ ונסו שוב.");
          } catch {
            setError("הייבוא נכשל. נסו שוב.");
          }
          setBusy(false);
        }} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
