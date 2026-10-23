"use client";

import { useState } from "react";

export type BillingBusiness = { id: string; name: string; status: string; periodEnd: string | null };

const STATUS_LABEL: Record<string, string> = {
  none: "לא הופעל",
  trialing: "תקופת ניסיון",
  active: "פעיל",
  past_due: "תשלום נכשל",
  unpaid: "לא שולם",
  canceled: "בוטל",
  incomplete: "לא הושלם",
};

const PRICE_TEXT = "99 ₪ לחודש, בלי דמי הקמה";

export default function BillingView({ businesses, configured }: { businesses: BillingBusiness[]; configured: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

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
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>מנוי ותשלום</h1>
      <p style={{ marginBottom: 16 }}>{PRICE_TEXT}</p>
      {!configured && <p style={{ marginBottom: 16 }}>התשלום עדיין בהכנה.</p>}
      {businesses.length === 0 && <p>אין לך עסקים שאתה בעלים שלהם.</p>}
      {businesses.map((b) => {
        const canSubscribe = configured && !["active", "trialing"].includes(b.status);
        return (
          <section key={b.id} style={{ borderTop: "1px solid #e5e5e5", padding: "16px 0" }}>
            <strong>{b.name}</strong>
            <div style={{ margin: "6px 0" }}>סטטוס: {STATUS_LABEL[b.status] ?? b.status}</div>
            {b.periodEnd && <div style={{ fontSize: 14, marginBottom: 6 }}>החיוב הבא: {new Date(b.periodEnd).toLocaleDateString("he-IL")}</div>}
            {canSubscribe && (
              <button className="btn soft" disabled={busy === b.id} onClick={() => subscribe(b.id)}>
                {busy === b.id ? "פותח דף תשלום..." : "הירשם"}
              </button>
            )}
          </section>
        );
      })}
      {error && <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>{error}</p>}
    </main>
  );
}
