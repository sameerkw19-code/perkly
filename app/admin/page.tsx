import { notFound, redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { getD1 } from "../../db";
import { isPlatformAdmin } from "../../lib/server/auth";
import { currentUser } from "../../lib/server/page-session";
import { formatPhone } from "../../lib/phone";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

// Platform admin (read-only for now): pilot requests, businesses and their size. Access is set by
// PLATFORM_ADMIN_EMAILS in wrangler.jsonc. Customer details are deliberately not shown here.
export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user, env.PLATFORM_ADMIN_EMAILS)) notFound();
  const rows = await getD1()
    .prepare(
      `SELECT b.name, b.created,
         (SELECT COUNT(*) FROM customers c WHERE c.business = b.id) AS customers,
         (SELECT COUNT(*) FROM memberships m WHERE m.business = b.id AND m.revoked IS NULL) AS members,
         (SELECT MAX(created) FROM events e WHERE e.business = b.id) AS last_activity
       FROM businesses b ORDER BY b.created DESC LIMIT 500`,
    )
    .all<{ name: string; created: string; customers: number; members: number; last_activity: string | null }>();
  const leads = await getD1()
    .prepare("SELECT created, business, contact, phone, email, kind, city, kit, note, lang, consent_marketing FROM leads ORDER BY created DESC LIMIT 200")
    .all<{ created: string; business: string; contact: string; phone: string; email: string | null; kind: string | null; city: string | null; kit: number; note: string | null; lang: string; consent_marketing: number }>();
  return (
    <main dir="ltr" style={{ maxWidth: 900 }}>
      <h1>Perkly platform</h1>
      <p className="muted">Read-only overview. {rows.results.length} businesses, {leads.results.length} pilot requests.</p>
      <h2 style={{ margin: "24px 0 12px" }}>Pilot requests</h2>
      <div className="panel table-wrap" style={{ marginBottom: 28 }}>
        {leads.results.length === 0 ? (
          <p className="muted">No requests yet.</p>
        ) : (
          <table>
            <thead><tr><th>Received</th><th>Business</th><th>Contact</th><th>Phone</th><th>Email</th><th>Type / city</th><th>Kit</th><th>Lang</th><th>Marketing OK</th><th>Note</th></tr></thead>
            <tbody>
              {leads.results.map((l, i) => (
                <tr key={i}>
                  <td>{l.created.slice(0, 16).replace("T", " ")}</td>
                  <td><strong dir="auto">{l.business}</strong></td>
                  <td dir="auto">{l.contact}</td>
                  <td><a href={`https://wa.me/${l.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer" dir="ltr">{formatPhone(l.phone)}</a></td>
                  <td dir="ltr">{l.email ?? "—"}</td>
                  <td dir="auto">{[l.kind, l.city].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{l.kit ? "Yes" : "—"}</td>
                  <td>{l.lang}</td>
                  <td>{l.consent_marketing ? "Yes" : "No"}</td>
                  <td dir="auto" style={{ whiteSpace: "normal", minWidth: 180 }}>{l.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <h2 style={{ margin: "0 0 12px" }}>Businesses</h2>
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>Business</th><th>Created</th><th>Customers</th><th>Team</th><th>Last activity</th></tr></thead>
          <tbody>
            {rows.results.map((r, i) => (
              <tr key={i}><td><strong>{r.name}</strong></td><td>{r.created.slice(0, 10)}</td><td>{r.customers}</td><td>{r.members}</td><td>{r.last_activity?.slice(0, 16).replace("T", " ") ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
