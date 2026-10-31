import { getD1 } from "../../../db";
import { formatPhone } from "../../../lib/phone";
import { requireAdminPage, shortDateTime } from "../../../lib/server/admin";
import { AdminHeader } from "../admin-header";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · פניות" };

const KIND: Record<string, string> = {
  cafe: "בית קפה", barber: "מספרה", food: "מסעדה או פיצרייה", icecream: "גלידרייה", studio: "סטודיו או חדר כושר", bar: "בר", other: "אחר",
};

type Lead = {
  created: string; business: string; contact: string; phone: string; email: string | null; kind: string | null;
  city: string | null; kit: number; note: string | null; lang: string; consent_marketing: number;
};

// Requests from the public "talk to us" form (/contact). These are business contacts, not customers of a business.
export default async function AdminLeadsPage() {
  await requireAdminPage();
  const leads = await getD1()
    .prepare("SELECT created, business, contact, phone, email, kind, city, kit, note, lang, consent_marketing FROM leads ORDER BY created DESC LIMIT 300")
    .all<Lead>();
  const rows = leads.results;
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();

  return (
    <div className="admin" dir="rtl">
      <AdminHeader active="/admin/leads" />
      <main id="main" tabIndex={-1}>
        <h1>פניות "דברו איתנו"</h1>
        <p className="muted">
          {rows.length} פניות מהטופס ב־perkly.shop/contact, {rows.filter((l) => l.created >= week).length} מהן בשבוע האחרון.
          אחרי השיחה, שלחו לעסק את הקישור לפתיחת חשבון: perkly.shop/start.
        </p>
        <div className="panel table-wrap">
          {rows.length === 0 ? (
            <p className="muted">אין פניות עדיין.</p>
          ) : (
            <table>
              <thead>
                <tr><th>התקבלה</th><th>עסק</th><th>איש קשר</th><th>טלפון</th><th>אימייל</th><th>סוג ועיר</th><th>ערכה</th><th>שפה</th><th>דיוור</th><th>הערה</th></tr>
              </thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={i}>
                    <td>{shortDateTime(l.created)}</td>
                    <td><strong dir="auto">{l.business}</strong></td>
                    <td dir="auto">{l.contact}</td>
                    <td><a href={`https://wa.me/${l.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer" dir="ltr">{formatPhone(l.phone)}</a></td>
                    <td dir="ltr">{l.email ?? "—"}</td>
                    <td dir="auto">{[l.kind ? KIND[l.kind] ?? l.kind : null, l.city].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{l.kit ? "כן" : "—"}</td>
                    <td>{l.lang === "ar" ? "ערבית" : l.lang === "en" ? "אנגלית" : "עברית"}</td>
                    <td>{l.consent_marketing ? "מאשר" : "לא"}</td>
                    <td className="admin-wrap" dir="auto">{l.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
