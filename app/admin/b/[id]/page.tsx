import { AdminHeader } from "../../admin-header";
import { notFound } from "next/navigation";
import { getD1 } from "../../../../db";
import { liveDesign } from "../../../../lib/server/designs";
import { STATUS_LABEL, adminStatus, requireAdminPage, shortDate, shortDateTime } from "../../../../lib/server/admin";
import { AdminActions, ExportBusiness, PolarSync, PaymentLink, PosKeys, AdminCardPreview, ApplePushTest, GoogleSyncTest, KitSentButton, OwnerDesignSwitch } from "./admin-actions";
import { pctLabel } from "../../../../lib/cashback";
import { env } from "cloudflare:workers";
import { planOf } from "../../../../lib/server/billing";
import { isPlatformAdmin } from "../../../../lib/server/auth";
import { formatPhone } from "../../../../lib/phone";
import { mailReady } from "../../../../lib/server/mailer";
import { BuildSteps } from "./build-steps";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · ניהול עסק" };

const KIND_LABEL: Record<string, string> = {
  stamp: "חותמת", redeem: "מימוש הטבה", adjust: "תיקון ידני",
  earn: "קנייה (צבירה)", spend: "שימוש ביתרה", balance_adjust: "תיקון יתרה",
};
const ACTOR_LABEL: Record<string, string> = { owner: "בעלים", staff: "עובד", pos: "קופה" };
const ROLE_LABEL: Record<string, string> = { owner: "בעלים", staff: "עובד" };
const ACTION_LABEL: Record<string, string> = {
  suspend: "השהיה", unsuspend: "החזרה לפעילות", grant_comp: "גישה חינם", clear_comp: "ביטול גישה חינם",
  update_business: "עריכת פרטים", owner_link: "קישור לבעל העסק", owner_invite: "הזמנה לבעל העסק", staff_invite: "הזמנת עובד", transfer_owner: "העברת בעלות", archive: "סגירה (ארכוב)", restore: "שחזור", export: "ייצוא",
  import: "ייבוא מאתר אחר", reset_data: "איפוס נתונים", kit_sent: "ערכת קופה נשלחה", owner_designs: "עיצוב על ידי בעל העסק",
  pos_key_create: "מפתח קופה נוצר", pos_key_revoke: "מפתח קופה בוטל", pos_only: "שינוי רק דרך הקופה",
  polar_sync: "סנכרון מ־Polar", polar_link: "חיבור מנוי מ־Polar", polar_unlink: "ניתוק מנוי", delete_business: "מחיקה לצמיתות",
};
const POLAR_LABEL: Record<string, string> = {
  active: "פעיל (משלם)", trialing: "בניסיון", past_due: "תשלום נכשל", unpaid: "לא שולם", canceled: "בוטל", incomplete: "לא הושלם", none: "אין מנוי",
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
      `SELECT b.id, b.owner, b.name, b.reward, b.target, b.color, b.created, b.reward_mode, b.suspended, b.suspend_reason, b.comp_until, b.archived, b.kit_due, b.kit_sent, b.owner_designs, b.currency, b.pos_only, b.program, b.near_text, b.cashback_bp, b.cashback_min,
         s.status, s.plan, s.current_period_end, s.external_subscription, s.updated AS sub_updated, u.email AS owner_email, u.phone AS owner_phone
       FROM businesses b LEFT JOIN subscriptions s ON s.business = b.id LEFT JOIN users u ON u.id = b.owner WHERE b.id = ?`,
    )
    .bind(id)
    .first<{
      id: string; name: string; reward: string; target: number; color: string; created: string; reward_mode: string;
      owner: string; suspended: string | null; suspend_reason: string | null; comp_until: string | null; archived: string | null; owner_email: string | null; owner_phone: string | null;
      status: string | null; current_period_end: string | null; external_subscription: string | null; sub_updated: string | null;
      plan: string | null; kit_due: string | null; kit_sent: string | null; owner_designs: number; currency: string; pos_only: number; program: string; near_text: string | null; cashback_bp: number; cashback_min: number;
    }>();
  if (!b) notFound();

  const [team, counts, recent, log, design, posKeys, branchList] = await Promise.all([
    db.prepare(
      `SELECT m.user, u.email, u.name, m.role, m.created, m.revoked, br.name AS branch
       FROM memberships m JOIN users u ON u.id = m.user LEFT JOIN branches br ON br.id = m.branch
       WHERE m.business = ? ORDER BY m.revoked IS NOT NULL, m.role = 'staff', m.created`,
    ).bind(id).all<{ user: string; email: string; name: string; role: string; created: string; revoked: string | null; branch: string | null }>(),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND archived IS NULL) AS customers,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND created >= ?2) AS customers30,
         (SELECT COUNT(*) FROM customers WHERE business = ?1 AND source = 'self' AND archived IS NULL) AS selfJoined,
         (SELECT COUNT(*) FROM events WHERE business = ?1 AND kind IN ('stamp', 'earn', 'visit') AND created >= ?2) AS stamps30,
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
    // Cashier connection keys (only their names and use; the keys themselves are never stored).
    db.prepare(
      `SELECT k.id, k.label, k.created, k.last_used, br.name AS branch FROM pos_keys k LEFT JOIN branches br ON br.id = k.branch
       WHERE k.business = ? AND k.revoked IS NULL ORDER BY k.created`,
    ).bind(id).all<{ id: string; label: string; created: string; last_used: string | null; branch: string | null }>(),
    db.prepare("SELECT id, name, lat IS NOT NULL AS placed FROM branches WHERE business = ? AND archived IS NULL ORDER BY created").bind(id).all<{ id: string; name: string; placed: number }>(),
  ]);
  // Invites still waiting to be opened: the owner's and the workers'.
  const invites = await db
    .prepare("SELECT id, role, label, email, expires FROM invites WHERE business = ? AND used IS NULL AND revoked IS NULL AND expires > ? ORDER BY created")
    .bind(id, nowIso)
    .all<{ id: string; role: string; label: string | null; email: string | null; expires: string }>();

  const st = adminStatus(b, nowIso);
  // Built by Perkly and not handed over yet: the business is still under an admin's account.
  const withPerkly = !!b.owner_email && isPlatformAdmin({ id: b.owner, email: b.owner_email, name: "" }, env);
  const c = counts!;

  const live = b.status === "active" || b.status === "trialing";
  const biz = { id: b.id, name: b.name, reward: b.reward, target: b.target, program: b.program, archived: b.archived, ownerEmail: b.owner_email, paying: live };
  const compForever = !!b.comp_until?.startsWith("9999");
  const compActive = !!b.comp_until && b.comp_until > nowIso;
  const ownerInvite = [...invites.results].reverse().find((i) => i.role === "owner") ?? null;
  const build = {
    id: b.id, name: b.name,
    details: b.program === "library" ? `${b.reward} · כרטיס ספרייה` : b.program === "appointments" ? `${b.reward} · כרטיס תורים` : b.program === "cashback" ? `${b.reward} · כרטיס יתרה (${pctLabel(b.cashback_bp)})` : `${b.reward} · ${b.target} ${b.program === "average" ? "קניות בסבב" : "חותמות להטבה"}`,
    designVersion: c.published,
    // A logo, or any design published after the starting one.
    designDone: !!design.logo || (c.published ?? 0) >= 2,
    branches: branchList.results.map(({ id, name }) => ({ id, name })),
    placed: branchList.results.filter((x) => x.placed).length,
    nearText: b.near_text ?? null,
    withPerkly,
    ownerEmail: b.owner_email,
    ownerInvite: ownerInvite ? { email: ownerInvite.email, expires: ownerInvite.expires } : null,
    staff: team.results.filter((m) => m.role === "staff" && !m.revoked).map((m) => ({ user: m.user, name: m.name, email: m.email, branch: m.branch })),
    staffInvites: invites.results.filter((i) => i.role === "staff").map((i) => ({ id: i.id, name: i.label, email: i.email, expires: i.expires })),
    mail: mailReady(env),
  };
  const dash = (hash = "") => `/?business=${encodeURIComponent(b.id)}&from=admin${hash}`;
  const access = compActive ? (compForever ? "גישה חינם ללא הגבלת זמן" : `גישה חינם עד ${shortDate(b.comp_until)}`) : live ? "מנוי פעיל" : "בלי גישה חינם ובלי מנוי";

  return (
    <div className="admin" dir="rtl">
      <AdminHeader active="/admin" />
      <main id="main" tabIndex={-1}>
        <p className="admin-crumbs"><a href="/admin">← כל העסקים</a></p>
        <div className="page-head">
          <div>
            <h1>{b.name} <span className={"admin-chip st-" + (b.archived ? "none" : st)}>{b.archived ? "סגור" : STATUS_LABEL[st]}</span></h1>
            <p className="muted">
              <span dir="ltr">{b.owner_email ?? "—"}</span>{b.owner_phone && !withPerkly ? <> · <bdi dir="ltr">{formatPhone(b.owner_phone)}</bdi></> : null}
              {" · "}נוצר {shortDate(b.created)} · {b.program === "library" ? "כרטיס ספרייה" : b.program === "appointments" ? "כרטיס תורים" : b.program === "cashback" ? `כרטיס יתרה (${pctLabel(b.cashback_bp)})` : `${b.target} ${b.program === "average" ? "קניות בסבב" : "חותמות להטבה"}`} · {b.reward}
            </p>
          </div>
          {!b.archived && (
            <div className="head-actions">
              <a className="btn soft" href={dash()}>לוח העסק</a>
              <a className="btn soft" href={dash("#station")}>עמדת עובד</a>
            </div>
          )}
        </div>
        {!b.archived && <BuildSteps data={build} />}

        {b.archived && <p className="admin-alert">העסק סגור (בארכיון) מאז {shortDateTime(b.archived)}. הבעלים והצוות לא רואים אותו. אפשר לשחזר אותו בתחתית הדף.</p>}
        {b.suspended && <p className="admin-alert">מושהה מאז {shortDateTime(b.suspended)}. סיבה: {b.suspend_reason}</p>}

        <section className="stats admin-stats">
          <div className="stat"><span className="stat-label">לקוחות פעילים</span><strong>{c.customers}</strong><small>{c.customers30} הצטרפו ב־30 יום · {c.selfJoined} לבד</small></div>
          <div className="stat"><span className="stat-label">חותמות ב־30 יום</span><strong>{c.stamps30}</strong><small>{c.redeems30} הטבות מומשו</small></div>
          <div className="stat"><span className="stat-label">גישה</span><strong className="admin-stat-text">{STATUS_LABEL[st]}</strong><small>{access}</small></div>
          <div className="stat"><span className="stat-label">עיצוב</span><strong>{c.published ? `v${c.published}` : "—"}</strong><small>{b.owner_designs ? "בעל העסק מעצב" : "רק Perkly מעצבת"}</small></div>
        </section>

        <div className="admin-layout">
          <div className="admin-col">
            <section className="panel">
              <h2>מנוי ותשלום</h2>
              <dl className="admin-dl">
                <dt>סטטוס ב־Polar</dt><dd>{POLAR_LABEL[b.status ?? "none"] ?? b.status}</dd>
                <dt>מסלול</dt><dd>{b.status ? (planOf(b.plan, env) === "yearly" ? "שנתי (ערכת קופה כלולה)" : "חודשי") : "—"}</dd>
                <dt>סוף תקופה</dt><dd>{shortDate(b.current_period_end)}</dd>
                <dt>גישה חינם</dt><dd>{compActive ? (compForever ? "ללא הגבלת זמן" : `עד ${shortDate(b.comp_until)}`) : "לא"}</dd>
                {(b.kit_due || b.kit_sent) && <><dt>ערכת קופה</dt><dd>{b.kit_sent ? `נשלחה ${shortDate(b.kit_sent)}` : <>מגיעה מאז {shortDate(b.kit_due)} <KitSentButton business={b.id} /></>}</dd></>}
              </dl>
              {!b.archived && (withPerkly
                ? <p className="form-hint">קישור התשלום יופיע כאן אחרי המסירה לבעל העסק (שלב 5).</p>
                : !live && <PaymentLink business={b.id} name={b.name} shekels={b.currency !== "USD"} defaultPhone={b.owner_phone ? formatPhone(b.owner_phone) : ""} />)}
              {!b.archived && <AdminActions business={b.id} suspended={!!b.suspended} compUntil={b.comp_until} biz={biz} parts={["comp"]} />}
              <details className="admin-more">
                <summary>Polar: מזהה מנוי, סנכרון וחיבור מנוי קיים</summary>
                <dl className="admin-dl">
                  <dt>מזהה מנוי</dt><dd dir="ltr"><code>{b.external_subscription ?? "—"}</code></dd>
                  <dt>עדכון אחרון</dt><dd>{shortDateTime(b.sub_updated)}</dd>
                </dl>
                <PolarSync business={b.id} />
              </details>
            </section>

            <section className="panel">
              <h2>פרטים, בעלות וצוות</h2>
              {!b.archived && (
                <details className="admin-more">
                  <summary>עריכה מהירה של הפרטים והעברת בעלות לחשבון קיים</summary>
                  <AdminActions business={b.id} suspended={!!b.suspended} compUntil={b.comp_until} biz={biz} parts={["details", "owner"]} />
                </details>
              )}
              <h3 className="admin-h3">כל הצוות (כולל מי שהוסר)</h3>
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
              <h2>פעילות</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>פעולה</th><th>שינוי</th><th>מי</th><th>סניף</th><th>זמן</th></tr></thead>
                  <tbody>
                    {recent.results.map((e, i) => (
                      <tr key={i}>
                        <td>{KIND_LABEL[e.kind] ?? e.kind}</td>
                        <td dir="ltr">{e.delta > 0 ? `+${e.delta}` : e.delta}</td>
                        <td>{e.actor_role ? ACTOR_LABEL[e.actor_role] ?? e.actor_role : "—"}</td>
                        <td>{e.branch ?? "—"}</td>
                        <td>{shortDateTime(e.created)}</td>
                      </tr>
                    ))}
                    {!recent.results.length && <tr><td colSpan={5} className="muted">אין פעילות עדיין.</td></tr>}
                  </tbody>
                </table>
              </div>
              <details className="admin-more">
                <summary>יומן פעולות מנהל ({log.results.length})</summary>
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
              </details>
            </section>
          </div>

          <aside className="admin-col">
            <section className="panel">
              <h2>הכרטיס החי</h2>
              <AdminCardPreview design={design} target={b.target} program={b.program} cashback={{ bp: b.cashback_bp, min: b.cashback_min, currency: b.currency }} />
              <OwnerDesignSwitch business={b.id} on={!!b.owner_designs} />
              <p className="form-hint">כשהמתג פעיל, בעל העסק מעצב את הכרטיס בעצמו (רק את העיצוב).</p>
            </section>

            <section className="panel">
              <h2>ארנקים</h2>
              <dl className="admin-dl">
                <dt>Apple Wallet</dt><dd><ApplePushTest business={b.id} /></dd>
                <dt>Google Wallet</dt><dd><GoogleSyncTest business={b.id} /></dd>
              </dl>
            </section>

            <section className="panel">
              <h2>חיבור לקופה</h2>
              <PosKeys business={b.id} keys={posKeys.results} branches={branchList.results} posOnly={!!b.pos_only} />
            </section>
          </aside>
        </div>

        <details className="panel admin-danger">
          <summary>
            <h2>פעולות רגישות</h2>
            <span className="muted">{b.archived ? "שחזור, ייצוא ומחיקה לצמיתות" : "השהיה, סגירה, ייצוא, העברה לאתר אחר ואיפוס נתונים"}</span>
          </summary>
          <AdminActions business={b.id} suspended={!!b.suspended} compUntil={b.comp_until} biz={biz} parts={b.archived ? ["archive", "delete"] : ["suspend", "archive", "reset"]} />
          {!b.archived && <p className="form-hint">מחיקה לצמיתות מופיעה כאן אחרי שסוגרים את העסק.</p>}
          {!b.archived && <ExportBusiness business={b.id} name={b.name} />}
        </details>
      </main>
    </div>
  );
}
