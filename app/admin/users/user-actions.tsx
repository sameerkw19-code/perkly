"use client";
import { useState } from "react";
import { post } from "../../../lib/api";

/** Row actions for one user. Platform admins (and yourself) cannot be blocked from here. */
export function UserActions({ user, name, blocked, protectedUser, sessions }: { user: string; name: string; blocked: boolean; protectedUser: boolean; sessions: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");

  async function resetLink() {
    if (!confirm(`ליצור קישור איפוס סיסמה ל-${name}? הקישור תקף ל-24 שעות ומבטל קישורים קודמים.`)) return;
    setBusy(true);
    setErr("");
    const r = await post<{ url: string }>("/api/admin/users", { action: "reset_link", user });
    setBusy(false);
    if (!r.ok) { setErr(r.code === "user_blocked" ? "המשתמש חסום" : "נכשל"); return; }
    setLink(r.data.url);
  }

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr("");
    const r = await post("/api/admin/users", { action, user, ...extra });
    setBusy(false);
    if (!r.ok) { setErr("נכשל"); return; }
    window.location.reload();
  }

  return (
    <div className="row-actions">
      {blocked ? (
        <button className="btn soft small" disabled={busy} onClick={() => confirm(`לבטל את החסימה של ${name}?`) && run("unblock")}>ביטול חסימה</button>
      ) : !protectedUser ? (
        <button className="btn soft small danger" disabled={busy} onClick={() => {
          const reason = prompt(`סיבת החסימה של ${name} (נשמרת ביומן):`)?.trim();
          if (reason) run("block", { reason });
        }}>חסימה</button>
      ) : null}
      {sessions > 0 && !blocked && (
        <button className="btn soft small" disabled={busy} onClick={() => confirm(`לנתק את ${name} מכל המכשירים?`) && run("signout")}>ניתוק</button>
      )}
      {!blocked && <button className="btn soft small" disabled={busy} onClick={resetLink}>קישור איפוס</button>}
      {link && (
        <span className="admin-reset-link">
          <input readOnly value={link} dir="ltr" onFocus={(e) => e.currentTarget.select()} aria-label="קישור איפוס" />
          <button className="btn primary small" onClick={() => navigator.clipboard?.writeText(link)}>העתקה</button>
          <small className="form-hint">שלח למשתמש בוואטסאפ או במייל. מוצג פעם אחת.</small>
        </span>
      )}
      {err && <small className="form-error">{err}</small>}
    </div>
  );
}
