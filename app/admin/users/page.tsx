import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { isPlatformAdmin } from "../../../lib/server/auth";
import { requireAdminPage, shortDate, shortDateTime } from "../../../lib/server/admin";
import { AdminHeader } from "../admin-header";
import { UserActions } from "./user-actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · משתמשים" };

type Row = {
  id: string; email: string; name: string; created: string; blocked: string | null;
  businesses: string | null; last_login: string | null; active_sessions: number;
};

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

// Everyone with an account: business owners and staff. Customers have no accounts and are not listed.
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdminPage();
  const params = await searchParams;
  const q = one(params.q).trim().slice(0, 80);
  const onlyBlocked = one(params.blocked) === "1";
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const now = new Date().toISOString();
  const db = getD1();
  const rows = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created, u.blocked,
         (SELECT GROUP_CONCAT(b.name || ' · ' || CASE m.role WHEN 'owner' THEN 'בעלים' ELSE 'עובד' END, ' | ')
            FROM memberships m JOIN businesses b ON b.id = m.business WHERE m.user = u.id AND m.revoked IS NULL AND b.archived IS NULL) AS businesses,
         (SELECT MAX(created) FROM sessions s WHERE s.user = u.id) AS last_login,
         (SELECT COUNT(*) FROM sessions s WHERE s.user = u.id AND s.expires > ?1) AS active_sessions
       FROM users u
       WHERE (?2 = '' OR u.email LIKE ?3 ESCAPE '\\' OR u.name LIKE ?3 ESCAPE '\\') AND (?4 = 0 OR u.blocked IS NOT NULL)
       ORDER BY u.created DESC LIMIT 500`,
    )
    .bind(now, q, like, onlyBlocked ? 1 : 0)
    .all<Row>();

  return (
    <div className="admin" dir="rtl">
      <AdminHeader active="/admin/users" />
      <main id="main" tabIndex={-1}>
        <h1>משתמשים</h1>
        <p className="muted">בעלי עסקים ועובדים. ללקוחות אין חשבון ולכן הם לא מופיעים כאן.</p>
        <section className="panel">
          <form className="admin-tools" method="get">
            <input name="q" defaultValue={q} placeholder="חיפוש לפי שם או מייל" aria-label="חיפוש" />
            <label className="check"><input type="checkbox" name="blocked" value="1" defaultChecked={onlyBlocked} /><span>רק חסומים</span></label>
            <button className="btn primary small">הצג</button>
            {(q || onlyBlocked) && <a className="btn soft small" href="?">ניקוי</a>}
          </form>
          <p className="form-hint">{rows.results.length} משתמשים</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>שם</th><th>מייל</th><th>עסקים</th><th>כניסה אחרונה</th><th>נרשם</th><th>סטטוס</th><th>פעולות</th></tr></thead>
              <tbody>
                {rows.results.map((u) => {
                  const admin = isPlatformAdmin(u, env);
                  return (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong></td>
                      <td dir="ltr" className="admin-email">{u.email}</td>
                      <td className="admin-wrap">{u.businesses ?? "—"}</td>
                      <td>{shortDateTime(u.last_login)}{u.active_sessions ? ` · ${u.active_sessions} מחוברים` : ""}</td>
                      <td>{shortDate(u.created)}</td>
                      <td>
                        {u.blocked ? <span className="admin-chip small st-suspended">חסום</span>
                          : admin ? <span className="admin-chip small st-comp">מנהל מערכת</span>
                          : <span className="admin-chip small st-active">פעיל</span>}
                      </td>
                      <td><UserActions user={u.id} name={u.name} blocked={!!u.blocked} protectedUser={admin || u.id === me.id} sessions={u.active_sessions} /></td>
                    </tr>
                  );
                })}
                {!rows.results.length && <tr><td colSpan={7} className="muted">אין משתמשים מתאימים.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
