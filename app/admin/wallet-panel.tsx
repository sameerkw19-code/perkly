"use client";
import { useEffect, useState } from "react";
import { post } from "../../lib/api";

const LABEL: Record<string, string> = {
  draft: "טיוטה: רק משתמשי חשבון המנפיק יכולים לשמור כרטיסים",
  underReview: "בבדיקה אצל גוגל",
  approved: "מאושר: כל לקוח יכול לשמור כרטיס",
  rejected: "נדחה: צריך לתקן ולשלוח שוב",
  missing: "הכיתה לא נמצאה אצל גוגל",
  unknown: "סטטוס לא מוכר",
  error: "שגיאה בבדיקת הסטטוס",
};

/** Google Wallet class status, and the button that submits it for Google's review. */
export function WalletPanel() {
  const [state, setState] = useState<{ configured?: boolean; status?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/admin/wallet", { credentials: "same-origin" });
    setState((await r.json().catch(() => ({ status: "error" }))) as { configured?: boolean; status?: string; error?: string });
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!confirm("לשלוח את כיתת הכרטיסים לבדיקה של גוגל? זו בקשה רשמית בשם העסק.")) return;
    setBusy(true);
    setMsg("");
    const r = await post("/api/admin/wallet", { action: "submit_review" });
    setBusy(false);
    if (!r.ok) { setMsg("השליחה נכשלה. נסה שוב או בדוק בקונסולה של Google Pay."); return; }
    setMsg("נשלח לבדיקה.");
    load();
  }

  const status = state?.status;
  return (
    <section className="panel">
      <h2>Google Wallet</h2>
      {!state ? <p className="muted">בודק…</p> : state.configured === false ? (
        <p className="muted">Google Wallet לא מוגדר בשרת.</p>
      ) : (
        <div className="admin-row" style={{ marginTop: 12 }}>
          <span className={"admin-chip st-" + (status === "approved" ? "active" : status === "underReview" ? "trialing" : status === "rejected" || status === "error" ? "suspended" : "none")}>
            {LABEL[status ?? "unknown"] ?? status}
          </span>
          {(status === "draft" || status === "rejected") && (
            <button className="btn primary small" disabled={busy} onClick={submit}>{busy ? "שולח…" : "שליחה לבדיקה של גוגל"}</button>
          )}
        </div>
      )}
      {msg && <p className="form-hint">{msg}</p>}
    </section>
  );
}
