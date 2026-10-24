"use client";
import { useState } from "react";
import { post } from "../../../lib/api";

/** Row actions for one user. Platform admins (and yourself) cannot be blocked from here. */
export function UserActions({ user, name, blocked, protectedUser, sessions }: { user: string; name: string; blocked: boolean; protectedUser: boolean; sessions: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
      {err && <small className="form-error">{err}</small>}
    </div>
  );
}
