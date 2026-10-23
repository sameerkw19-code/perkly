import { notFound, redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { getD1 } from "../../db";
import { isPlatformAdmin } from "../../lib/server/auth";
import { currentUser } from "../../lib/server/page-session";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

// Platform admin (read-only for now): businesses and their size. Access is set by
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
  return (
    <main dir="ltr" style={{ maxWidth: 900 }}>
      <h1>Perkly platform</h1>
      <p className="muted">Read-only overview. {rows.results.length} businesses.</p>
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
