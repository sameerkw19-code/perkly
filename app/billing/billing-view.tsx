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

export default function BillingView({ businesses }: { businesses: BillingBusiness[] }) {
  return (
    <main className="card" style={{ maxWidth: 560, margin: "32px auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>מנוי ותשלום</h1>
      <p style={{ marginBottom: 16 }}>{PRICE_TEXT}</p>
      <p style={{ marginBottom: 16 }}>התשלום עדיין בהכנה.</p>
      {businesses.length === 0 && <p>אין לך עסקים שאתה בעלים שלהם.</p>}
      {businesses.map((b) => (
        <section key={b.id} style={{ borderTop: "1px solid #e5e5e5", padding: "16px 0" }}>
          <strong>{b.name}</strong>
          <div style={{ margin: "6px 0" }}>סטטוס: {STATUS_LABEL[b.status] ?? b.status}</div>
          {b.periodEnd && <div style={{ fontSize: 14 }}>החיוב הבא: {new Date(b.periodEnd).toLocaleDateString("he-IL")}</div>}
        </section>
      ))}
    </main>
  );
}
