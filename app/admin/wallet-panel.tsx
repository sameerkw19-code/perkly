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

type Apple = { configured: boolean; passTypeId?: string; keyMatches?: boolean; certExpires?: string | null; certSoon?: boolean; certFrom?: "secret" | "code"; error?: string; pushReady?: boolean };
type State = { configured?: boolean; status?: string; error?: string; classes?: string[]; apple?: Apple };

const day = (iso: string) => new Date(iso).toLocaleDateString("he-IL");

/** Apple Wallet for all businesses: one signing key and certificate. A mismatch breaks every pass. */
function AppleStatus({ apple }: { apple?: Apple }) {
  if (!apple) return null;
  const soon = !!apple.certSoon;
  const ok = apple.configured && apple.keyMatches && !soon;
  return (
    <>
      <h2 style={{ marginTop: 20 }}>Apple Wallet</h2>
      {!apple.configured ? (
        <p className="form-hint">לא מוגדר: חסר הסוד APPLE_PASS_KEY ב־Cloudflare, ולכן כפתור Apple לא מופיע באייפון.</p>
      ) : (
        <>
          <div className="admin-row" style={{ marginTop: 12 }}>
            <span className={"admin-chip st-" + (ok ? "active" : "suspended")}>
              {!apple.keyMatches ? "תקלה: המפתח לא מתאים לתעודה" : soon ? "התעודה פגה בקרוב" : "תקין: כרטיסי Apple נחתמים כמו שצריך"}
            </span>
            <span className={"admin-chip st-" + (apple.pushReady ? "active" : "none")}>{apple.pushReady ? "עדכון אוטומטי פעיל" : "בלי עדכון אוטומטי"}</span>
          </div>
          {!apple.keyMatches && (
            <p className="form-hint">
              כל כרטיס Apple נכשל באייפון, בכל העסקים. צריך להחליף ב־Cloudflare את הסוד APPLE_PASS_KEY במפתח הפרטי של התעודה
              {apple.certFrom === "secret" ? " שבסוד APPLE_PASS_CERT" : " הנוכחית"} (אותו מפתח ששמור בסוד APPLE_PASS_KEY ב־GitHub).
            </p>
          )}
          {apple.error && <p className="form-hint" dir="ltr">{apple.error}</p>}
          <p className="form-hint">
            {apple.certExpires ? `התעודה בתוקף עד ${day(apple.certExpires)}. ` : ""}
            {apple.pushReady ? "" : "בלי עדכון אוטומטי הכרטיס באייפון מתעדכן רק כשהלקוח מושך אותו למטה."}
          </p>
        </>
      )}
    </>
  );
}

/** Google Wallet class status, and the button that submits it for Google's review. Then the Apple Wallet check. */
export function WalletPanel() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/admin/wallet", { credentials: "same-origin" });
    setState((await r.json().catch(() => ({ status: "error" }))) as State);
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
      <h2>ארנקים: Google Wallet</h2>
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
      {state?.classes && <p className="form-hint" dir="ltr">Classes at Google: {state.classes.length ? state.classes.join(", ") : "none"}</p>}
      {msg && <p className="form-hint">{msg}</p>}
      {state && <AppleStatus apple={state.apple} />}
    </section>
  );
}
