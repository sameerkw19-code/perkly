import { AdminHeader } from "../../admin-header";
import { notFound } from "next/navigation";
import { getD1 } from "../../../../db";
import { liveDesign } from "../../../../lib/server/designs";
import { STATUS_LABEL, adminStatus, requireAdminPage, shortDate, shortDateTime } from "../../../../lib/server/admin";
import { AdminActions, AdminCardPreview, KitSentButton } from "./admin-actions";
import { env } from "cloudflare:workers";
import { planOf } from "../../../../lib/server/billing";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · ניהול עסק" };

const KIND_LABEL: Record<string, string> = { stamp: "חותמת", redeem: "מימוש הטבה", adjust: "תיקון ידני" };
const ROLE_LABEL: Record<string, string> = { owner: "בעלים", staff: "עובד" };
const ACTION_LABEL: Record<string, string> = {
  suspend: "השהיה", unsuspend: "החזרה לפעילות", grant_comp: "גישה חינם", clear_comp: "ביטול גישה חינם",
  update_business: "עריכת פרטים", transfer_owner: "העברת בעלות", archive: "ארכוב", restore: "שחזור", export: "ייצוא נתונים",
};

// One business, for support. Shows team, subscription, activity counts and the live card.
// Customer names and phone numbers are not shown.
export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (id.length > 64) notFound();
  const db = getD1();
  const now = new Date();
  const nowIso = now.toISOString();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const b = await db
    .prepare(
      `SELECT b.id, b.name, b.reward, b.target, b.color, b.created, b.reward_mode, b.suspended, b.suspend_reason, b.comp_until, b.archived, b.kit_due, b.kit_sent,
         s.status, s.plan, s.current_period_end, s.external_subscription, s.updated AS sub_updated, u.email AS owner_email
       FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id LEFT JOIN users u ON u.id = b.owner WHERE b.id = ?`,
    )
    .bind(id)
    .first<{
      id: string; name: string; reward: string; target: number; color: string; created: string; reward_mode: string;
      suspended: string | null; suspend_reason: string | null; comp_until: string | null; archived: string | null; owner_email: string | null;
      status: string | null; current_period_end: string | null; external_subscription: string | null; sub_updated: string | null;
      plan: string | null; kit_due: string | null; kit_sent: string | null;
    }>();
  if (!b) notFound();

  const [team, counts, recent, log, design] = await Promise.all([
    db.prepare(
      `SELECT u.email, u.name, m.role, m.created, m.revoked, br.name AS branch
       FROM memberships m JOIN users u ON u.id = m.user LEFT JOIN branches br ON br.id = m.branch
       WHERE m.business = ? ORDER BY m.revoked IS NOT NULL, m.role = 'staff', m.created`,
    ).bind(id).all<{ email: string; name: string; role: string; created: string; revoked: string | null; branch: string | null }>(),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND archived IS NULL) AS customers,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND created >= ?2) AS customers30,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND source = 'self' AND archived IS NULL) AS selfJoined,
         (SELECT COUNT(*) FROM events WHERE business = ?1 AND kind = 'stamp' AND created >= ?2) AS stamps30,
         (SELECT COUNT(*) FROM events WHERE business = ?1 AND kind = 'redeem' AND created >= ?2) AS redeems30,
         (SELECT MAX(version) FROM card_designs WHERE business = ?1) AS published`,
    ).bind(id, since30).first<{ customers: number; customers30: number; selfJoined: number; stamps30: number; redeems30: number; published: number | null }>(),
    db.prepare(
      `SELECT e.kind, e.delta, e.created, e.actor_role, br.name AS branch
       FROM events e LEFT JOIN branches br ON br.id = e.branch
       WHERE e.business = ? ORDER BY e.created DESC LIMIT 15`,
    ).bind(id).all<{ kind: string; delta: number; created: string; actor_role: string | null; branch: string | null }>(),
    db.prepare("SELECT admin, action, detail, created FROM admin_log WHERE business = ? ORDER BY created DESC LIMIT 20")
      .bind(id).all<{ admin: string; action: string; detail: string | null; created: string }>(),
    liveDesign(db, { id: b.id, name: b.name, reward: b.reward, color: b.color }),
  ]);

  const st = adminStatus(b, nowIso);
  const c = counts!;

  return (
    <div className="admin" dir="rtl">
      <AdminHeader active="/admin" />
      <main id="main" tabIndex={-1}>
        <div className="page-head">
          <div>
            <h1>{b.name}</h1>
            <p className="muted">נוצר {shortDate(b.created)} · {b.target} חותמות להטבה · {b.reward}</p>
          </div>
          <span className={"admin-chip st-" + st}>{STATUS_LABEL[st]}</span>
        </div>

        {b.archived && <p className="admin-alert">בארכיון מאז {shortDateTime(b.archived)}. הבעלים והצוות לא רואים את העסק.</p>}
        {b.suspended && (
          <p className="admin-alert">מושהה מאז {shortDateTime(b.suspended)}. סיבה: {b.suspend_reason}</p>
        )}

        <section className="stats admin-stats">
          <div className="stat"><span className="stat-label">לקוחות פעילים</span><strong>{c.customers}</strong><small>{c.customers30} הצטרפו ב־30 יום (כולל שהוסרו) · {c.selfJoined} הצטרפו לבד</small></div>
          <div className="stat"><span className="stat-label">חותמות ב־30 יום</span><strong>{c.stamps30}</strong><small>{c.redeems30} הטבות מומשו</small></div>
          <div className="stat"><span className="stat-label">צוות</span><strong>{team.results.filter((m) => !m.revoked).length}</strong><small>חברים פעילים</small></div>
          <div className="stat"><span className="stat-label">עיצוב</span><strong>{c.published ? `v${c.published}` : "—"}</strong><small>{c.published ? "גרסה מפורסמת" : "עיצוב ברירת מחדל"}</small></div>
        </section>

        <div className="admin-grid">
          <section className="panel">
            <h2>פעולות</h2>
            <AdminActions business={b.id} suspended={!!b.suspended} compUntil={b.comp_until} biz={{ id: b.id, name: b.name, reward: b.reward, target: b.target, archived: b.archived, ownerEmail: b.owner_email, paying: b.status === "active" || b.status === "trialing" }} />
          </section>

          <section className="panel">
            <h2>מנוי</h2>
            <dl className="admin-dl">
              <dt>סטטוס ב-Polar</dt><dd>{b.status ?? "אין מנוי"}</dd>
              <dt>מסלול</dt><dd>{b.status ? (planOf(b.plan, env) === "yearly" ? "שנתי (ערכת קופה כלולה)" : "חודשי") : "—"}</dd>
              <dt>ערכת קופה</dt><dd>{b.kit_sent ? `נשלחה ${shortDate(b.kit_sent)}` : b.kit_due ? <>מגיעה מאז {shortDate(b.kit_due)} <KitSentButton business={b.id} /></> : "—"}</dd>
              <dt>סוף תקופה</dt><dd>{shortDate(b.current_period_end)}</dd>
              <dt>מזהה מנוי</dt><dd dir="ltr"><code>{b.external_subscription ?? "—"}</code></dd>
              <dt>עדכון אחרון</dt><dd>{shortDateTime(b.sub_updated)}</dd>
              <dt>גישה חינם</dt><dd>{b.comp_until && b.comp_until > nowIso ? (b.comp_until.startsWith("9999") ? "ללא הגבלת זמן" : `עד ${shortDate(b.comp_until)}`) : "לא"}</dd>
            </dl>
          </section>

          <section className="panel">
            <h2>הכרטיס החי</h2>
            <AdminCardPreview design={design} target={b.target} />
          </section>

          <section className="panel">
            <h2>צוות</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>שם</th><th>מייל</th><th>תפקיד</th><th>סניף</th><th>הצטרף</th></tr></thead>
                <tbody>
                  {team.results.map((m, i) => (
                    <tr key={i} className={m.revoked ? "muted" : ""}>
                      <td>{m.name}{m.revoked ? " (הוסר)" : ""}</td>
                      <td dir="ltr" className="admin-email">{m.email}</td>
                      <td>{ROLE_LABEL[m.role] ?? m.role}</td>
                      <td>{m.branch ?? "—"}</td>
                      <td>{shortDate(m.created)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>פעילות אחרונה</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>פעולה</th><th>שינוי</th><th>מי</th><th>סניף</th><th>זמן</th></tr></thead>
                <tbody>
                  {recent.results.map((e, i) => (
                    <tr key={i}>
                      <td>{KIND_LABEL[e.kind] ?? e.kind}</td>
                      <td dir="ltr">{e.delta > 0 ? `+${e.delta}` : e.delta}</td>
                      <td>{e.actor_role ? ROLE_LABEL[e.actor_role] ?? e.actor_role : "—"}</td>
                      <td>{e.branch ?? "—"}</td>
                      <td>{shortDateTime(e.created)}</td>
                    </tr>
                  ))}
                  {!recent.results.length && <tr><td colSpan={5} className="muted">אין פעילות עדיין.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>יומן פעולות מנהל</h2>
            <ul className="admin-log">
              {log.results.map((l, i) => (
                <li key={i}>
                  <b>{ACTION_LABEL[l.action] ?? l.action}</b>
                  {l.detail && <span> · {l.detail}</span>}
                  <small className="muted"> · {l.admin} · {shortDateTime(l.created)}</small>
                </li>
              ))}
              {!log.results.length && <li className="muted">אין פעולות מנהל על העסק הזה.</li>}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
