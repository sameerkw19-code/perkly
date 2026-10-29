"use client";

import { useEffect, useState } from "react";

export type BillingBusiness = { id: string; name: string; status: string; periodEnd: string | null; compUntil?: string | null };

const FOREVER_YEAR = "9999";

const STATUS_LABEL: Record<string, string> = {
  none: "לא הופעל",
  trialing: "תקופת ניסיון",
  active: "פעיל",
  past_due: "תשלום נכשל",
  unpaid: "לא שולם",
  canceled: "בוטל",
  incomplete: "לא הושלם",
};

const PRICE_TEXT = "99 ₪ לחודש, בלי דמי הקמה. למנוי חדש 14 ימי ניסיון חינם.";

export default function BillingView({ businesses, configured }: { businesses: BillingBusiness[]; configured: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [returned, setReturned] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // Returning from Polar with ?ok=1: the webhook may land a few seconds later, so retry the page a few times.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ok") !== "1") return;
    setReturned(true);
    const active = businesses.some((b) => ["active", "trialing"].includes(b.status));
    if (active) return;
    const attempt = Number(sessionStorage.getItem("billing-attempts") ?? "0");
    if (attempt >= 5) return;
    setWaiting(true);
    sessionStorage.setItem("billing-attempts", String(attempt + 1));
    const timer = setTimeout(() => window.location.reload(), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function subscribe(businessId: string) {
    setError("");
    setBusy(businessId);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: businessId }),
      });
      const data = (await response.json().catch(() => null)) as { url?: string } | null;
      if (response.ok && data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError("לא הצלחנו לפתוח את דף התשלום. נסה שוב.");
    } catch {
      setError("לא הצלחנו לפתוח את דף התשלום. נסה שוב.");
    }
    setBusy(null);
  }

  return (
    <main className="card" style={{ maxWidth: 560, margin: "32px auto", padding: 24 }}>
      <a href="/" style={{ fontSize: 14, display: "inline-block", marginBottom: 12 }}>← חזרה ללוח הבקרה</a>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>מנוי ותשלום</h1>
      <p style={{ marginBottom: 16 }}>{PRICE_TEXT}</p>
      {returned && <p role="status" style={{ marginBottom: 16 }}>{waiting ? "התשלום התקבל. מעדכנים את סטטוס המנוי..." : "התשלום התקבל. אם הסטטוס עדיין לא עודכן, רענן את העמוד או פנה לתמיכה."}</p>}
      {!configured && <p style={{ marginBottom: 16 }}>התשלומים עדיין לא מופעלים. נסה שוב מאוחר יותר, או פנה אלינו ב-support@perkly.shop.</p>}
      {businesses.length === 0 && <p>אין לך עסקים שאתה בעלים שלהם.</p>}
      {businesses.map((b) => {
        const canSubscribe = configured && !["active", "trialing"].includes(b.status);
        // Free access without an end date (given by an admin): nothing to pay.
        const forever = !!b.compUntil?.startsWith(FOREVER_YEAR);
        return (
          <section key={b.id} style={{ borderTop: "1px solid #e5e5e5", padding: "16px 0" }}>
            <strong>{b.name}</strong>
            <div style={{ margin: "6px 0" }}>סטטוס: {STATUS_LABEL[b.status] ?? b.status}</div>
            {b.periodEnd && <div style={{ fontSize: 14, marginBottom: 6 }}>החיוב הבא: {new Date(b.periodEnd).toLocaleDateString("he-IL")}</div>}
            {b.compUntil && (
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                גישה ללא מנוי: {b.compUntil.startsWith(FOREVER_YEAR) ? "ללא הגבלת זמן" : `עד ${new Date(b.compUntil).toLocaleDateString("he-IL")}`}
              </div>
            )}
            {canSubscribe && !forever && (
              <button className="btn soft" disabled={busy === b.id} onClick={() => subscribe(b.id)}>
                {busy === b.id ? "פותח דף תשלום..." : "הפעל מנוי"}
              </button>
            )}
          </section>
        );
      })}
      {error && <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>{error}</p>}
    </main>
  );
}
