"use client";

import { useState } from "react";
import { post } from "../../lib/api";

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function subscribe(businessId: string) {
    setError("");
    setBusy(businessId);
    const result = await post<{ url: string }>("/api/billing/checkout", { business: businessId });
    if (result.ok) {
      window.location.assign(result.data.url);
      return;
    }
    setBusy(null);
    setError(result.code === "billing_off" ? "התשלום עדיין לא הופעל. נודיע כשייפתח." : "לא הצלחנו לפתוח את דף התשלום. נסה שוב.");
  }

  return (
    <main className="card" style={{ maxWidth: 560, margin: "32px auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>מנוי ותשלום</h1>
      <p style={{ marginBottom: 16 }}>{PRICE_TEXT}</p>
      {!configured && <p style={{ marginBottom: 16 }}>התשלום עדיין בהכנה.</p>}
      {businesses.length === 0 && <p>אין לך עסקים שאתה בעלים שלהם.</p>}
      {businesses.map((b) => {
        const label = STATUS_LABEL[b.status] ?? b.status;
        const canSubscribe = configured && !["active", "trialing"].includes(b.status);
        return (
          <section key={b.id} style={{ borderTop: "1px solid #e5e5e5", padding: "16px 0" }}>
            <strong>{b.name}</strong>
            <div style={{ margin: "6px 0" }}>סטטוס: {label}</div>
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
